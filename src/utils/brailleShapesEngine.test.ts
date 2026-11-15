import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRAILLE_SHAPE_CATALOG,
  createBrailleShapeAnimator,
  evaluateShapeSdf,
  renderBrailleShape,
} from './brailleShapesEngine';

test('renderBrailleShape outputs exact dimensions and distinct non-empty silhouettes for all 9 shapes', () => {
  const rendered = BRAILLE_SHAPE_CATALOG.map((meta) => {
    const frame = renderBrailleShape({
      shape: meta.kind,
      cols: 28,
      rows: 14,
      time: 0.2,
      mood: 'happy',
      eyeState: meta.defaultEyeStyle,
    });
    assert.equal(frame.lines.length, 14);
    assert.equal(frame.cells.length, 28 * 14);
    const nonSpace = frame.lines.join('').replace(/ /g, '').length;
    assert.ok(nonSpace > 60, `${meta.kind} should render substantial braille dots (got ${nonSpace})`);
    return { kind: meta.kind, text: frame.lines.join('\n') };
  });

  // Every pair of shapes must be visibly distinct
  for (let i = 0; i < rendered.length; i++) {
    for (let j = i + 1; j < rendered.length; j++) {
      assert.notEqual(
        rendered[i].text,
        rendered[j].text,
        `${rendered[i].kind} and ${rendered[j].kind} must render distinct silhouettes`
      );
    }
  }
});

test('renderBrailleShape is deterministic and responds to eye states and speaking visemes', () => {
  const openA = renderBrailleShape({
    shape: 'clover',
    cols: 28,
    rows: 14,
    time: 0.4,
    mood: 'neutral',
    eyeState: 'open',
    viseme: 'closed',
    isSpeaking: false,
  });
  const openB = renderBrailleShape({
    shape: 'clover',
    cols: 28,
    rows: 14,
    time: 0.4,
    mood: 'neutral',
    eyeState: 'open',
    viseme: 'closed',
    isSpeaking: false,
  });
  assert.equal(openA.lines.join('\n'), openB.lines.join('\n'));

  const blink = renderBrailleShape({
    shape: 'clover',
    cols: 28,
    rows: 14,
    time: 0.4,
    mood: 'neutral',
    eyeState: 'blink',
    viseme: 'closed',
    isSpeaking: false,
  });
  assert.notEqual(openA.lines.join('\n'), blink.lines.join('\n'));

  const speaking = renderBrailleShape({
    shape: 'clover',
    cols: 28,
    rows: 14,
    time: 0.4,
    mood: 'speaking',
    eyeState: 'open',
    viseme: 'wide',
    energy: 0.9,
    isSpeaking: true,
  });
  assert.notEqual(openA.lines.join('\n'), speaking.lines.join('\n'));
});

test('evaluateShapeSdf keeps all 9 anime shapes bounded within [-1, 1] viewport with accurate silhouettes', () => {
  for (const meta of BRAILLE_SHAPE_CATALOG) {
    assert.ok(evaluateShapeSdf(meta.kind, 0, 0) < 0, `${meta.kind} should contain center`);
    for (const [cx, cy] of [
      [-0.96, -0.96],
      [0.96, -0.96],
      [-0.96, 0.96],
      [0.96, 0.96],
    ]) {
      assert.ok(
        evaluateShapeSdf(meta.kind, cx, cy) > 0,
        `${meta.kind} should be clear at corner (${cx}, ${cy})`
      );
    }
  }

  // Twintails ('star') has flared side twintails and top ahoge sprout
  assert.ok(evaluateShapeSdf('star', -0.68, 0.36) < 0, 'twintails left tail should be inside');
  assert.ok(evaluateShapeSdf('star', 0.68, 0.36) < 0, 'twintails right tail should be inside');
  assert.ok(evaluateShapeSdf('star', -0.80, -0.75) > 0, 'twintails upper-left margin should be outside');

  // Mecha ('triangle') has upward cyber fins on temples and center crest
  assert.ok(evaluateShapeSdf('triangle', -0.56, -0.38) < 0, 'mecha left fin should be inside');
  assert.ok(evaluateShapeSdf('triangle', 0.56, -0.38) < 0, 'mecha right fin should be inside');
  assert.ok(evaluateShapeSdf('triangle', 0.85, 0.78) > 0, 'mecha lower-right corner should be outside');
});

test('createBrailleShapeAnimator produces smooth blink curves, drag tilt, drop bounce settle, and secondary hair lag', () => {
  const anim = createBrailleShapeAnimator();
  const states = [];
  for (let i = 0; i < 140; i++) {
    const t = i / 30;
    const isDragging = i >= 15 && i < 35;
    states.push(
      anim.step(
        {
          time: t,
          mood: i >= 45 ? 'speaking' : 'happy',
          eyeStyle: 'open',
          viseme: i >= 45 ? 'wide' : 'closed',
          energy: i >= 45 ? 0.85 : 0.08,
          isSpeaking: i >= 45,
          isThinking: false,
          isDragging,
          dragVelX: isDragging ? 1.2 : 0,
        },
        1 / 30
      )
    );
  }

  const halfBlinks = states.filter((s) => s.blink > 0.15 && s.blink < 0.85).length;
  assert.ok(halfBlinks >= 2, `Expected smooth intermediate blink frames, got ${halfBlinks}`);
  assert.ok(states[25].dragTilt < -0.05, 'Positive dragVelX should tilt head smoothly');
  assert.ok(Math.abs(states[25].hairLag) > 0.005, 'Drag acceleration should excite secondary hairLag');
  assert.ok(states[35].dragLift > states[42].dragLift, 'Drag lift should settle smoothly after release');

  const reduced = createBrailleShapeAnimator().step(
    {
      time: 0.2,
      mood: 'speaking',
      eyeStyle: 'open',
      viseme: 'wide',
      energy: 0.9,
      isSpeaking: true,
      isThinking: false,
      isDragging: true,
      dragVelX: 1.5,
    },
    1 / 30,
    true
  );
  assert.equal(reduced.dragTilt, 0);
  assert.equal(reduced.hairLag, 0);
  assert.equal(reduced.earTwitch, 0);
  assert.equal(reduced.haloFloat, 0);
});

test('createBrailleShapeAnimator drives hoverBoost, earTwitch, and haloFloat on pointer hover', () => {
  const anim = createBrailleShapeAnimator();
  const calm = anim.step(
    {
      time: 0.2,
      mood: 'happy',
      eyeStyle: 'open',
      viseme: 'closed',
      energy: 0.08,
      isSpeaking: false,
      isThinking: false,
      isDragging: false,
      isHovered: false,
    },
    1 / 30
  );
  let hovered = calm;
  for (let i = 1; i <= 10; i++) {
    hovered = anim.step(
      {
        time: 0.2 + i / 30,
        mood: 'happy',
        eyeStyle: 'open',
        viseme: 'closed',
        energy: 0.08,
        isSpeaking: false,
        isThinking: false,
        isDragging: false,
        isHovered: true,
      },
      1 / 30
    );
  }
  assert.ok(hovered.hoverBoost > 0.5, `Expected hoverBoost ramp on hover, got ${hovered.hoverBoost}`);
  assert.ok(Math.abs(hovered.earTwitch) > 0.005, 'Hover entry should trigger subtle earTwitch perk');
  assert.notEqual(hovered.haloFloat, 0, 'Active character should compute haloFloat levitation');
});

import {
  IDLE_ACTION_SLOT_SECONDS,
  IDLE_ANIMATION_SETS,
  IDLE_SET_ORDER,
  evaluateIdleActionStep,
} from './brailleIdleLoops';
import type { BrailleShapeKind } from './brailleShapesEngine';

test('createBrailleShapeAnimator steps through 6 separated idle actions and renders distinct action frames for every set', () => {
  const shapeBySet: Record<(typeof IDLE_SET_ORDER)[number], BrailleShapeKind> = {
    tactician: 'clover',
    celestial: 'trapezoid',
    scholar: 'pebble',
    idol: 'star',
    neko: 'ghost',
    trickster: 'cloud',
  };

  for (const setId of IDLE_SET_ORDER) {
    const shape = shapeBySet[setId];
    const anim = createBrailleShapeAnimator();
    const seenIndices = new Set<number>();

    // Sample once inside each 4.0s action slot
    for (let idx = 0; idx < 6; idx++) {
      const state = anim.step(
        {
          shape,
          time: idx * IDLE_ACTION_SLOT_SECONDS + 1.45,
          mood: 'happy',
          eyeStyle: 'open',
          viseme: 'closed',
          energy: 0.08,
          isSpeaking: false,
          isThinking: false,
          isDragging: false,
        },
        1 / 30
      );
      assert.equal(state.idle.setId, setId);
      assert.equal(state.idle.actionIndex, idx);
      seenIndices.add(state.idle.actionIndex);
    }
    assert.equal(seenIndices.size, 6);

    // Every action within this set must produce a distinct rendered Braille frame
    const renderedActions = new Set<string>();
    for (let idx = 0; idx < 6; idx++) {
      const actionFrame = evaluateIdleActionStep(setId, idx * IDLE_ACTION_SLOT_SECONDS + 1.45);
      const rendered = renderBrailleShape({
        shape,
        cols: 46,
        rows: 26,
        time: 0.4,
        mood: 'happy',
        eyeState: 'open',
        idlePose: actionFrame.pose,
      });
      renderedActions.add(rendered.lines.join('\n'));
    }
    assert.equal(
      renderedActions.size,
      IDLE_ANIMATION_SETS[setId].actions.length,
      `${setId} (${shape}) must render 6 visually distinct Braille frames across its 6 separated actions`
    );
  }
});

test('braille shape blinking reaches full closure dwell and morphs continuously across 0.79->0.82 without snapping', () => {
  const anim = createBrailleShapeAnimator();
  let peakBlink = 0;
  for (let i = 0; i < 160; i++) {
    const st = anim.step(
      {
        shape: 'clover',
        time: i / 30,
        mood: 'happy',
        eyeStyle: 'open',
        viseme: 'closed',
        energy: 0.08,
        isSpeaking: false,
        isThinking: false,
        isDragging: false,
      },
      1 / 30
    );
    peakBlink = Math.max(peakBlink, st.blink);
  }
  assert.ok(peakBlink >= 0.95, `Expected braille shape blink to reach >= 0.95 full closure, got ${peakBlink}`);

  const baseMotion = anim.step(
    {
      shape: 'clover',
      time: 0.2,
      mood: 'neutral',
      eyeStyle: 'open',
      viseme: 'closed',
      energy: 0.08,
      isSpeaking: false,
      isThinking: false,
      isDragging: false,
    },
    1 / 30
  );

  const countDiffs = (a: string, b: string): number => {
    let diff = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] !== b[i]) diff++;
    }
    return diff;
  };

  const renderAtBlink = (b: number, eyeState: 'open' | 'happy' = 'open') =>
    renderBrailleShape({
      shape: 'clover',
      cols: 46,
      rows: 26,
      time: 0.2,
      mood: 'neutral',
      eyeState,
      motion: { ...baseMotion, blink: b, squint: 0 },
    }).lines.join('\n');

  const fOpen = renderAtBlink(0);
  const fMid = renderAtBlink(0.5);
  const f79 = renderAtBlink(0.79);
  const f82 = renderAtBlink(0.82);
  const fClosed = renderAtBlink(1.0);

  assert.notEqual(fOpen, fMid, 'Mid-blink must differ from open');
  assert.notEqual(fMid, fClosed, 'Closed blink must differ from mid-blink');
  const diff79to82 = countDiffs(f79, f82);
  const diffOpenToClosed = countDiffs(fOpen, fClosed);
  assert.ok(
    diff79to82 <= Math.max(14, Math.floor(diffOpenToClosed * 0.32)),
    `Expected smooth continuous morph across 0.79->0.82 without binary snap (diff79to82=${diff79to82}, openToClosed=${diffOpenToClosed})`
  );

  // Happy ^ ^ arc should also morph smoothly into closed blink
  const fHappyOpen = renderAtBlink(0, 'happy');
  const fHappyMid = renderAtBlink(0.35, 'happy');
  const fHappyClosed = renderAtBlink(1.0, 'happy');
  assert.notEqual(fHappyOpen, fHappyMid, 'Happy arc should smoothly transition during blink');
  assert.notEqual(fHappyMid, fHappyClosed, 'Happy arc should reach full closed lash');
});

