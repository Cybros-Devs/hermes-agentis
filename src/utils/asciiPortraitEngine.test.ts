import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPortraitSourceFromRgba,
  createPortraitAnimator,
  renderHalftonePortrait,
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


