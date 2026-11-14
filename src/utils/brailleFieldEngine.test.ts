import test from 'node:test';
import assert from 'node:assert/strict';
import { createHorizonAnimator, renderBrailleHorizon } from './brailleFieldEngine';

test('renderBrailleHorizon renders exact dimensions with soft top fade and Braille wave geometry', () => {
  const frame = renderBrailleHorizon({
    cols: 80,
    rows: 14,
    time: 1.2,
    energy: 0.35,
    pointerX: 0.25,
    pointerY: -0.2,
    bands: new Array(12).fill(0.4),
  });

  assert.equal(frame.lines.length, 14);
  for (const line of frame.lines) {
    assert.equal(line.length, 80);
  }
  assert.equal(frame.cells.length, 80 * 14);
  assert.ok(
    frame.lines.some((l) => /[\u2800-\u28FF]/.test(l)),
    'Expected Unicode braille dots in bottom horizon'
  );

  // Top row must fade cleanly to dark/empty so there is no hard edge
  let topLit = 0;
  for (let c = 0; c < frame.cols; c++) {
    if (frame.lines[0][c] !== ' ') topLit++;
  }
  assert.equal(topLit, 0, 'Expected top row of horizon to fade cleanly into background');
});

test('renderBrailleHorizon responds to cursor pointerX and voice energy', () => {
  const calm = renderBrailleHorizon({
    cols: 60,
    rows: 12,
    time: 0.5,
    energy: 0.05,
    pointerX: -0.8,
    pointerY: 0,
  });
  const active = renderBrailleHorizon({
    cols: 60,
    rows: 12,
    time: 0.5,
    energy: 0.85,
    pointerX: 0.8,
    pointerY: -0.5,
    bands: new Array(12).fill(0.9),
  });
  assert.notEqual(
    calm.lines.join('\n'),
    active.lines.join('\n'),
    'Expected Braille horizon waves to react to cursor position and audio energy'
  );
});

test('createHorizonAnimator smoothly damps step transients across energy, pointer, and bands', () => {
  const anim = createHorizonAnimator();
  const s0 = anim.step({ energy: 0.05, pointerX: 0, pointerY: 0, bands: new Array(12).fill(0.05) }, 1 / 30);
  const s1 = anim.step({ energy: 0.95, pointerX: 0.9, pointerY: -0.5, bands: new Array(12).fill(0.95) }, 1 / 30);
  assert.ok(s1.energy > s0.energy && s1.energy < 0.45, `Expected damped energy ramp, got ${s1.energy}`);
  assert.ok(s1.pointerX > 0 && s1.pointerX < 0.5, `Expected damped pointer shift, got ${s1.pointerX}`);
  assert.ok(s1.bands[0] > 0.05 && s1.bands[0] < 0.6, `Expected damped band attack, got ${s1.bands[0]}`);
});
