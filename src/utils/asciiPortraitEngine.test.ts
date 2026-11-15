import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPortraitBankFromSpriteSheet,
  buildPortraitSourceFromRgba,
  createPortraitAnimator,
  evaluateNaturalBlinkCurve,
  renderHalftonePortrait,
  resolveReferencePoseBlend,
  samplePortraitLuminance,
  type PortraitParams,
} from './asciiPortraitEngine';

const BASE: PortraitParams = {
  cols: 54,
  rows: 28,
  time: 1.0,
  mood: 'happy',
  viseme: 'closed',
  eyeState: 'open',
  energy: 0.2,
  isSpeaking: false,
  isListening: true,
  style: 'braille',
};

test('renderHalftonePortrait outputs exact dimensions and non-empty monochrome braille halftone grid', () => {
  const frame = renderHalftonePortrait(BASE);
  assert.equal(frame.lines.length, BASE.rows);
  for (const line of frame.lines) {
    assert.equal(line.length, BASE.cols);
  }
  const lit = frame.lines.join('').replace(/\s/g, '');
  assert.ok(lit.length > 250, 'Expected shaded halftone portrait glyphs');
  assert.ok(
    frame.lines.some((l) => /[\u2800-\u28FF]/.test(l)),
    'Expected Unicode braille glyphs'
  );
});

test('renderHalftonePortrait responds to mouth visemes and eye blinks for live audio lip-sync', () => {
  const closed = renderHalftonePortrait({ ...BASE, viseme: 'closed', isSpeaking: false, energy: 0 });
  const wide = renderHalftonePortrait({ ...BASE, viseme: 'wide', isSpeaking: true, energy: 0.9 });
  assert.notEqual(
    closed.lines.join('\n'),
    wide.lines.join('\n'),
    'Expected visible character difference when mouth opens wide for speech'
  );

  const openEye = samplePortraitLuminance(-0.18, -0.06, { ...BASE, eyeState: 'open' });
  const blinkEye = samplePortraitLuminance(-0.18, -0.06, { ...BASE, eyeState: 'blink' });
  assert.notEqual(openEye, blinkEye, 'Expected eye region luminance to respond to blink state');
});

test('buildPortraitSourceFromRgba isolates exterior space from enclosed interior skin and animates mouth/eyes/head-turns', () => {
  const size = 40;
  const rgba = new Uint8ClampedArray(size * size * 4);
  // Draw an enclosed black-ink ring around interior face region [8..32] x [8..32]
  for (let y = 8; y <= 32; y++) {
    for (let x = 8; x <= 32; x++) {
      const onBorder = x === 8 || x === 32 || y === 8 || y === 32;
      if (onBorder) {
        const idx = (y * size + x) * 4;
        rgba[idx + 3] = 255; // opaque black ink [0,0,0,255]
      }
    }
  }

  const field = buildPortraitSourceFromRgba(rgba, size, size);
  assert.equal(field.baseLum[1 * size + 1], 0, 'Exterior transparent corner must stay dark (0)');
  assert.ok(
    field.baseLum[20 * size + 12] > 0.5,
    'Enclosed transparent face interior should receive luminous studio shading'
  );
  assert.ok(
    field.baseLum[8 * size + 20] > 0.2,
    'Outer black-ink silhouette border should carry subtle rim separation'
  );

  const closedBraille = renderHalftonePortrait({
    ...BASE,
    style: 'braille',
    sourceField: field,
    viseme: 'closed',
    eyeState: 'open',
  });
  const talkingBlinkBraille = renderHalftonePortrait({
    ...BASE,
    style: 'braille',
    sourceField: field,
    viseme: 'wide',
    eyeState: 'blink',
    isSpeaking: true,
    energy: 0.9,
  });

  assert.notEqual(
    closedBraille.lines.join('\n'),
    talkingBlinkBraille.lines.join('\n'),
    'Reference-backed sourceField should animate when mouth viseme and eyeState change'
  );

  // Verify 2.5D headYaw and headPitch turning changes rendered Braille grid distinctly
  const baseMotion = createPortraitAnimator().step(
    {
      time: 0.4,
      mood: 'neutral',
      viseme: 'closed',
      eyeState: 'open',
      energy: 0.1,
      isSpeaking: false,
      isListening: false,
    },
    0.016
  );

  const turnedLeft = renderHalftonePortrait({
    ...BASE,
    sourceField: field,
    motion: { ...baseMotion, headYaw: -0.3, headPitch: -0.14 },
  });
  const turnedRight = renderHalftonePortrait({
    ...BASE,
    sourceField: field,
    motion: { ...baseMotion, headYaw: 0.3, headPitch: 0.14 },
  });
  assert.notEqual(
    turnedLeft.lines.join('\n'),
    turnedRight.lines.join('\n'),
    '2.5D headYaw/headPitch turns must visibly shift rendered portrait perspective'
  );
});

test('createPortraitAnimator smoothly interpolates visemes, blinks, head turns, lookTarget, and hair follow-through', () => {
  const anim = createPortraitAnimator();
  const m1 = anim.step(
    {
      time: 0.0,
      mood: 'neutral',
      viseme: 'closed',
      eyeState: 'open',
      energy: 0.05,
      isSpeaking: false,
      isListening: false,
    },
    0.016
  );
  const m2 = anim.step(
    {
      time: 0.016,
      mood: 'speaking',
      viseme: 'wide',
      eyeState: 'blink',
      energy: 0.95,
      isSpeaking: true,
      isListening: false,
    },
    0.016
  );

  // Smooth spring-damper should not teleport instantly to 1.0 in a single 16ms frame
  assert.ok(m2.blink > m1.blink && m2.blink < 0.9, `Expected smooth blink ramp, got ${m2.blink}`);
  assert.ok(m2.mouthOpen > m1.mouthOpen && m2.mouthOpen < 0.8, `Expected smooth mouth open ramp, got ${m2.mouthOpen}`);

  // Pointer lookTarget steering should pull headYaw, headPitch, and gaze toward cursor
  const lookAnimLeft = createPortraitAnimator();
  const lookAnimRight = createPortraitAnimator();
  let leftState = m1;
  let rightState = m1;
  for (let i = 0; i < 20; i++) {
    leftState = lookAnimLeft.step(
      {
        time: i * 0.016,
        mood: 'neutral',
        viseme: 'closed',
        eyeState: 'open',
        energy: 0.1,
        isSpeaking: false,
        isListening: false,
      },
      0.016,
      false,
      { x: -0.9, y: -0.8 }
    );
    rightState = lookAnimRight.step(
      {
        time: i * 0.016,
        mood: 'neutral',
        viseme: 'closed',
        eyeState: 'open',
        energy: 0.1,
        isSpeaking: false,
        isListening: false,
      },
      0.016,
      false,
      { x: 0.9, y: 0.8 }
    );
  }
  assert.ok(leftState.headYaw < 0 && rightState.headYaw > 0, 'lookTarget x should steer headYaw left/right');
  assert.ok(leftState.headPitch < 0 && rightState.headPitch > 0, 'lookTarget y should steer headPitch up/down');
  assert.ok(leftState.gazeX < rightState.gazeX, 'lookTarget x should steer eye gaze');

  const reduced = createPortraitAnimator().step(
    {
      time: 0.5,
      mood: 'speaking',
      viseme: 'wide',
      eyeState: 'open',
      energy: 0.8,
      isSpeaking: true,
      isListening: false,
    },
    0.016,
    true
  );
  assert.equal(reduced.hairLagX, 0, 'Reduced motion should zero out secondary hair lag');
});

test('4-stage Talking Sequence and 3-stage Blinking Sequence produce distinct reference-backed Braille frames', () => {
  const size = 60;
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let y = 10; y <= 50; y++) {
    for (let x = 10; x <= 50; x++) {
      const onBorder = x === 10 || x === 50 || y === 10 || y === 50;
      if (onBorder) {
        const idx = (y * size + x) * 4;
        rgba[idx + 3] = 255;
      }
    }
  }
  const field = buildPortraitSourceFromRgba(rgba, size, size);

  const talkClosed = renderHalftonePortrait({ ...BASE, sourceField: field, viseme: 'closed', isSpeaking: false, energy: 0 }).lines.join('\n');
  const talkSmall = renderHalftonePortrait({ ...BASE, sourceField: field, viseme: 'small', isSpeaking: true, energy: 0.4 }).lines.join('\n');
  const talkRound = renderHalftonePortrait({ ...BASE, sourceField: field, viseme: 'round', isSpeaking: true, energy: 0.7 }).lines.join('\n');
  const talkWide = renderHalftonePortrait({ ...BASE, sourceField: field, viseme: 'wide', isSpeaking: true, energy: 0.9 }).lines.join('\n');

  assert.notEqual(talkClosed, talkSmall, 'Closed vs slightly open (A/H) must render differently');
  assert.notEqual(talkSmall, talkRound, 'Slightly open (A/H) vs round (O/Oh) must render differently');
  assert.notEqual(talkRound, talkWide, 'Round (O/Oh) vs wide (E/I) must render differently');

  const blinkOpen = renderHalftonePortrait({ ...BASE, sourceField: field, eyeState: 'open' }).lines.join('\n');
  const blinkHalf = renderHalftonePortrait({ ...BASE, sourceField: field, eyeState: 'half' }).lines.join('\n');
  const blinkClosed = renderHalftonePortrait({ ...BASE, sourceField: field, eyeState: 'blink' }).lines.join('\n');

  assert.notEqual(blinkOpen, blinkHalf, 'Natural open vs half-closed eyes must render differently');
  assert.notEqual(blinkHalf, blinkClosed, 'Half-closed vs closed eyes must render differently');
});

test('10-panel talking reference visemes render distinctly and animator damps jaw/teeth/tongue/lip states', () => {
  const size = 96;
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let y = 16; y <= 80; y++) {
    for (let x = 16; x <= 80; x++) {
      if (x === 16 || x === 80 || y === 16 || y === 80) {
        const idx = (y * size + x) * 4;
        rgba[idx + 3] = 255;
      }
    }
  }
  const field = buildPortraitSourceFromRgba(rgba, size, size);

  const specs: Array<{ viseme: PortraitParams['viseme']; energy: number }> = [
    { viseme: 'closed', energy: 0.08 },
    { viseme: 'small', energy: 0.36 },
    { viseme: 'wide', energy: 0.92 },
    { viseme: 'round', energy: 0.72 },
    { viseme: 'round', energy: 0.25 },
    { viseme: 'ee', energy: 0.68 },
    { viseme: 'lth', energy: 0.56 },
    { viseme: 'fv', energy: 0.44 },
    { viseme: 'rest', energy: 0.12 },
    { viseme: 'mbp', energy: 0.22 },
  ];
  const outputs = new Set(
    specs.map((s) =>
      renderHalftonePortrait({
        cols: 92,
        rows: 42,
        time: 0.4,
        mood: 'speaking',
        viseme: s.viseme,
        eyeState: 'open',
        energy: s.energy,
        isSpeaking: s.viseme !== 'closed' && s.viseme !== 'rest',
        isListening: false,
        style: 'braille',
        sourceField: field,
      }).lines.join('\n')
    )
  );
  assert.equal(outputs.size, 10, 'All 10 talking reference panels (including Oh vs Oo) must render uniquely');

  const anim = createPortraitAnimator();
  const sClosed = anim.step(
    { time: 0, mood: 'neutral', viseme: 'closed', eyeState: 'open', energy: 0.05, isSpeaking: false, isListening: false },
    0.016
  );
  const sWide = anim.step(
    { time: 0.1, mood: 'speaking', viseme: 'wide', eyeState: 'open', energy: 0.9, isSpeaking: true, isListening: false },
    0.05
  );
  assert.ok(sWide.jawDrop > sClosed.jawDrop, 'Wide Open (A/Ha) should articulate jawDrop');
  assert.ok(sWide.teethTop > sClosed.teethTop, 'Wide Open (A/Ha) should reveal upper teeth');
  assert.ok(sWide.tongueShow > sClosed.tongueShow, 'Wide Open (A/Ha) should engage floor tongue');

  const sFv = anim.step(
    { time: 0.2, mood: 'speaking', viseme: 'fv', eyeState: 'open', energy: 0.45, isSpeaking: true, isListening: false },
    0.05
  );
  assert.ok(sFv.lipBite > 0.2, 'F/V should engage labiodental lipBite channel');

  const sMbp = anim.step(
    { time: 0.3, mood: 'speaking', viseme: 'mbp', eyeState: 'open', energy: 0.25, isSpeaking: true, isListening: false },
    0.05
  );
  assert.ok(sMbp.lipPress > 0.2, 'M/B/P should engage bilabial lipPress channel');
});

test('createPortraitAnimator prevents 1-frame mouth teleportation and produces fixation saccade dwells', () => {
  const anim = createPortraitAnimator();
  const dt = 1 / 30;
  const mouthOpens: number[] = [];
  const gazeXSeries: number[] = [];

  for (let i = 0; i < 90; i++) {
    const t = i * dt;
    const isSpeaking = i >= 10 && i < 60;
    const st = anim.step(
      {
        time: t,
        mood: isSpeaking ? 'speaking' : 'neutral',
        viseme: isSpeaking ? (i % 4 === 0 ? 'wide' : i % 4 === 1 ? 'ee' : 'round') : 'closed',
        eyeState: 'open',
        energy: isSpeaking ? 0.88 : 0.08,
        isSpeaking,
        isListening: false,
      },
      dt
    );
    mouthOpens.push(st.mouthOpen);
    if (!isSpeaking) gazeXSeries.push(st.gazeX);
  }

  let maxMouthJump = 0;
  for (let i = 1; i < mouthOpens.length; i++) {
    maxMouthJump = Math.max(maxMouthJump, Math.abs(mouthOpens[i] - mouthOpens[i - 1]));
  }
  assert.ok(maxMouthJump < 0.26, `Expected 2nd-order damped mouthOpen without teleport spikes, got ${maxMouthJump}`);
  assert.ok(gazeXSeries.some((g) => Math.abs(g) > 0.05), 'Expected subtle eye saccade motion during idle');
});

test('buildPortraitBankFromSpriteSheet extracts 12 aligned panels, strips corner labels, and renders distinct talking states', () => {
  const w = 160;
  const h = 120;
  const rgba = new Uint8ClampedArray(w * h * 4);
  // Fill pure white sheet background
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = 255;
    rgba[i * 4 + 1] = 255;
    rgba[i * 4 + 2] = 255;
    rgba[i * 4 + 3] = 255;
  }
  // Draw 4x3 gray dividers
  const vDivs = [40, 80, 120];
  const hDivs = [40, 80];
  for (const vx of vDivs) {
    for (let y = 0; y < h; y++) {
      const idx = (y * w + vx) * 4;
      rgba[idx] = 170; rgba[idx + 1] = 170; rgba[idx + 2] = 170;
    }
  }
  for (const hy of hDivs) {
    for (let x = 0; x < w; x++) {
      const idx = (hy * w + x) * 4;
      rgba[idx] = 170; rgba[idx + 1] = 170; rgba[idx + 2] = 170;
    }
  }
  // Populate each of 12 panels with a silhouette circle + panel-specific mouth/eye mark + corner label dot
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const panelIdx = r * 4 + c;
      const x0 = c * 40 + 2;
      const y0 = r * 40 + 2;
      // Corner label ink dot at (x0+3, y0+3) + anti-aliased gray halo ring (lum ~215) inside label box
      for (let dy = 1; dy <= 5; dy++) {
        for (let dx = 1; dx <= 5; dx++) {
          const idx = ((y0 + dy) * w + (x0 + dx)) * 4;
          const isCore = dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4;
          const v = isCore ? 10 : 215;
          rgba[idx] = v; rgba[idx + 1] = v; rgba[idx + 2] = v;
        }
      }
      // Head outline ring centered in panel
      for (let dy = 6; dy <= 32; dy++) {
        for (let dx = 10; dx <= 30; dx++) {
          const dist = Math.hypot(dx - 20, dy - 18);
          const isOutline = Math.abs(dist - 10) < 1.3;
          const isMouthMark = dy >= 22 && dy <= 22 + Math.floor(panelIdx / 3) && Math.abs(dx - 20) <= (panelIdx % 4) + 1;
          if (isOutline || isMouthMark) {
            const idx = ((y0 + dy) * w + (x0 + dx)) * 4;
            rgba[idx] = 0; rgba[idx + 1] = 0; rgba[idx + 2] = 0;
          }
        }
      }
    }
  }

  const bank = buildPortraitBankFromSpriteSheet(rgba, w, h, 80);
  assert.equal(bank.length, 12, 'Expected 12 extracted poses from 4x3 sprite sheet');
  // Exterior corner + anti-aliased label ring of panel 0 should remain transparent/dark (0)
  for (let py = 0; py < 12; py++) {
    for (let px = 0; px < 14; px++) {
      assert.equal(bank[0].baseLum[py * 80 + px], 0, `Expected label/halo pixel (${px},${py}) to be cleared`);
    }
  }

  const anim = createPortraitAnimator();
  const closedMotion = anim.step(
    { time: 0, mood: 'neutral', viseme: 'closed', eyeState: 'open', energy: 0.05, isSpeaking: false, isListening: false },
    0.05
  );
  const wideMotion = anim.step(
    { time: 0.2, mood: 'speaking', viseme: 'wide', eyeState: 'open', energy: 0.92, isSpeaking: true, isListening: false },
    0.06
  );
  const roundMotion = anim.step(
    { time: 0.3, mood: 'speaking', viseme: 'round', eyeState: 'open', energy: 0.72, isSpeaking: true, isListening: false },
    0.06
  );
  const blinkMotion = anim.step(
    { time: 0.4, mood: 'neutral', viseme: 'closed', eyeState: 'blink', energy: 0.05, isSpeaking: false, isListening: false },
    0.06
  );

  const poseClosed = resolveReferencePoseBlend(closedMotion, 'closed', 'neutral', false);
  const poseWide = resolveReferencePoseBlend(wideMotion, 'wide', 'speaking', true);
  const poseRound = resolveReferencePoseBlend(roundMotion, 'round', 'speaking', true);
  const poseBlink = resolveReferencePoseBlend(blinkMotion, 'closed', 'neutral', false);

  assert.equal(poseClosed.mouthIndexA, 0, 'Idle closed should anchor on panel 01 (index 0)');
  assert.ok(poseWide.mouthIndexB === 3 || poseWide.mouthIndexA === 2, 'Wide speech should target open reference panels 03/04');
  assert.equal(poseRound.mouthIndexB, 7, 'Rounded O/Oo should target reference panel 08 (index 7)');
  assert.ok(poseBlink.eyeBlend > 0.2 && (poseBlink.eyeIndex === 5 || poseBlink.eyeIndex === 6 || poseBlink.eyeIndex === 10), 'Blink should blend dedicated blink panels (06/07/11)');

  const frameClosed = renderHalftonePortrait({
    ...BASE,
    spriteBank: bank,
    motion: closedMotion,
    viseme: 'closed',
    isSpeaking: false,
  }).lines.join('\n');

  const frameWide = renderHalftonePortrait({
    ...BASE,
    spriteBank: bank,
    motion: wideMotion,
    viseme: 'wide',
    isSpeaking: true,
    energy: 0.9,
  }).lines.join('\n');

  assert.notEqual(frameClosed, frameWide, 'Expected sprite-bank closed vs speaking frames to differ');
});

test('createPortraitAnimator triggerImpulse adds tactile nod/brow bounce and idle cadence produces natural blinks', () => {
  const anim = createPortraitAnimator();
  const base = anim.step(
    { time: 0.1, mood: 'neutral', viseme: 'closed', eyeState: 'open', energy: 0.08, isSpeaking: false, isListening: false },
    0.016
  );
  anim.triggerImpulse('tap');
  const tapped = anim.step(
    { time: 0.12, mood: 'neutral', viseme: 'closed', eyeState: 'open', energy: 0.08, isSpeaking: false, isListening: false },
    0.02
  );
  assert.ok(tapped.headPitch > base.headPitch + 0.005, 'Tap impulse should excite spring headPitch nod');
  assert.ok(Math.abs(tapped.browLift) > Math.abs(base.browLift), 'Tap impulse should excite browLift');

  const blinkAnim = createPortraitAnimator();
  let sawBlink = false;
  for (let i = 0; i < 200; i++) {
    const s = blinkAnim.step(
      { time: i * 0.03, mood: 'happy', viseme: 'closed', eyeState: 'open', energy: 0.08, isSpeaking: false, isListening: false },
      0.03
    );
    if (s.blink > 0.65) {
      sawBlink = true;
      break;
    }
  }
  assert.ok(sawBlink, 'Expected quasi-periodic idle cadence to produce natural blink over ~6s');
});

test('evaluateNaturalBlinkCurve produces full closed dwell, asymmetric close/open timing, and double-blinks', () => {
  const dt = 0.005;
  const samples: number[] = [];
  for (let i = 0; i <= 3200; i++) {
    samples.push(evaluateNaturalBlinkCurve(i * dt, 0, 4));
  }

  // Must dwell near 1.0 across multiple 5ms samples (closed eyes actually hold)
  const dwellCount = samples.filter((v) => v >= 0.99).length;
  assert.ok(dwellCount >= 12, `Expected >= 12 dwell samples at 5ms step, got ${dwellCount}`);

  // Extract first primary blink segment to verify closing is faster than opening
  const firstStart = samples.findIndex((v) => v > 0.01);
  assert.ok(firstStart >= 0, 'Expected a blink within 16s');
  let peakIdx = firstStart;
  while (peakIdx < samples.length && samples[peakIdx] < 0.99) peakIdx++;
  let dwellEnd = peakIdx;
  while (dwellEnd < samples.length && samples[dwellEnd] >= 0.99) dwellEnd++;
  let closeEnd = dwellEnd;
  while (closeEnd < samples.length && samples[closeEnd] > 0.01) closeEnd++;

  const closeSteps = peakIdx - firstStart;
  const openSteps = closeEnd - dwellEnd;
  assert.ok(
    openSteps > closeSteps * 1.3,
    `Expected asymmetric blink (opening ${openSteps} steps > closing ${closeSteps} steps)`
  );

  // Count distinct blink peaks over 16s (should include at least one double-blink pair)
  let peaks = 0;
  let inBlink = false;
  for (const v of samples) {
    if (!inBlink && v > 0.5) {
      peaks++;
      inBlink = true;
    } else if (inBlink && v < 0.1) {
      inBlink = false;
    }
  }
  assert.ok(peaks >= 4, `Expected multiple natural blinks including double-blink over 16s, got ${peaks}`);
});

test('resolveReferencePoseBlend avoids happy-mood half-lid ghosting and smoothly blends 3-stage blink without 0.64 snap', () => {
  const base = createPortraitAnimator().step(
    { time: 0, mood: 'happy', viseme: 'closed', eyeState: 'open', energy: 0.05, isSpeaking: false, isListening: false },
    0.016
  );

  const restHappy = resolveReferencePoseBlend({ ...base, blink: 0, squint: 0.34 }, 'closed', 'happy', false);
  assert.equal(restHappy.eyeHalfWeight, 0, 'Happy mood at rest must not ghost half-lid panel');
  assert.equal(restHappy.eyeClosedWeight, 0, 'Happy mood at rest must not ghost closed panel');

  const focusedRest = resolveReferencePoseBlend({ ...base, blink: 0, squint: 0.56 }, 'closed', 'focused', false);
  assert.ok(focusedRest.eyeHalfWeight > 0.25, 'Focused mood should retain subtle half-lid squint');

  // Continuity check across blink = 0.2 .. 1.0 (especially around 0.60..0.70)
  const b60 = resolveReferencePoseBlend({ ...base, blink: 0.60, squint: 0 }, 'closed', 'neutral', false);
  const b65 = resolveReferencePoseBlend({ ...base, blink: 0.65, squint: 0 }, 'closed', 'neutral', false);
  const b100 = resolveReferencePoseBlend({ ...base, blink: 1.0, squint: 0 }, 'closed', 'neutral', false);

  const total60 = b60.eyeHalfWeight + b60.eyeClosedWeight;
  const total65 = b65.eyeHalfWeight + b65.eyeClosedWeight;
  assert.ok(
    Math.abs(total65 - total60) < 0.15 && b65.eyeClosedWeight >= b60.eyeClosedWeight,
    `Expected continuous half->closed handoff across 0.60->0.65 (half=${b60.eyeHalfWeight}->${b65.eyeHalfWeight}, closed=${b60.eyeClosedWeight}->${b65.eyeClosedWeight})`
  );
  assert.ok(b100.eyeClosedWeight > 0.95 && b100.eyeHalfWeight < 0.05, 'Full blink should settle cleanly on closed eye panel');
});




