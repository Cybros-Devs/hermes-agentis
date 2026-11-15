import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSlidingIndicatorRect,
  computeStaggerDelayMs,
  shouldShowScrollTopFade,
} from './motionChoreography';

test('computeStaggerDelayMs clamps long lists and respects speedScale + reducedMotion', () => {
  assert.equal(computeStaggerDelayMs(0), 0);
  assert.equal(computeStaggerDelayMs(3, { stepMs: 30, maxDelayMs: 240 }), 90);
  assert.equal(computeStaggerDelayMs(20, { stepMs: 30, maxDelayMs: 240 }), 240);
  assert.equal(computeStaggerDelayMs(4, { stepMs: 30, speedScale: 2 }), 60);
  assert.equal(computeStaggerDelayMs(4, { reducedMotion: true }), 0);
  assert.equal(computeStaggerDelayMs(-3), 0);
});

test('computeSlidingIndicatorRect calculates container-relative geometry accurately', () => {
  assert.equal(computeSlidingIndicatorRect(null, null).ready, false);
  const rect = computeSlidingIndicatorRect(
    { left: 100, top: 40, scrollLeft: 24, scrollTop: 0 },
    { left: 180, top: 44, width: 72, height: 32 }
  );
  assert.deepEqual(rect, {
    x: 104,
    y: 4,
    width: 72,
    height: 32,
    ready: true,
  });
});

test('shouldShowScrollTopFade keeps top messages crisp at scrollTop=0', () => {
  assert.equal(shouldShowScrollTopFade(0), false);
  assert.equal(shouldShowScrollTopFade(8), false);
  assert.equal(shouldShowScrollTopFade(24), true);
  assert.equal(shouldShowScrollTopFade(NaN), false);
});
