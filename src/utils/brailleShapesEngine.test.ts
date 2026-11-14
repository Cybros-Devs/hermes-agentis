import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRAILLE_SHAPE_CATALOG,
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
