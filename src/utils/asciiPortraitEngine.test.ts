import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPortraitSourceFromRgba,
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
  style: 'floyd',
};

test('renderHalftonePortrait outputs exact dimensions and non-empty monochrome halftone character grid', () => {
  const frame = renderHalftonePortrait(BASE);
  assert.equal(frame.lines.length, BASE.rows);
  for (const line of frame.lines) {
    assert.equal(line.length, BASE.cols);
  }
  const lit = frame.lines.join('').replace(/\s/g, '');
  assert.ok(lit.length > 250, 'Expected shaded halftone portrait glyphs');
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

test('renderHalftonePortrait supports floyd, bayer, and braille dither modes', () => {
  const floyd = renderHalftonePortrait({ ...BASE, style: 'floyd' });
  const bayer = renderHalftonePortrait({ ...BASE, style: 'bayer' });
  const braille = renderHalftonePortrait({ ...BASE, style: 'braille' });

  assert.equal(floyd.lines.length, BASE.rows);
  assert.equal(bayer.lines.length, BASE.rows);
  assert.equal(braille.lines.length, BASE.rows);
  assert.ok(
    braille.lines.some((l) => /[\u2800-\u28FF]/.test(l)),
    'Expected Unicode braille glyphs in braille dither mode'
  );
});

test('buildPortraitSourceFromRgba isolates exterior space from enclosed interior skin and animates mouth/eyes', () => {
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
});
