import test from 'node:test';
import assert from 'node:assert/strict';
import { computeThreadScrollPin, isNearBottom } from './threadScroll';

test('isNearBottom accurately detects when viewport is at or near the bottom', () => {
  assert.equal(
    isNearBottom({ scrollTop: 920, scrollHeight: 1400, clientHeight: 400, thresholdPx: 96 }),
    true
  );
  assert.equal(
    isNearBottom({ scrollTop: 500, scrollHeight: 1400, clientHeight: 400, thresholdPx: 96 }),
    false
  );
});

test('computeThreadScrollPin always pins to bottom when visiting a sidebar session', () => {
  const result = computeThreadScrollPin({
    prevScrollTop: 120,
    nextScrollTop: 120,
    scrollHeight: 2400,
    clientHeight: 500,
    isNewVisit: true,
    isProgrammatic: false,
    prevPinned: false,
  });
  assert.deepEqual(result, { pinned: true, away: false });
});

test('computeThreadScrollPin stays pinned when content height grows without upward scroll', () => {
  const result = computeThreadScrollPin({
    prevScrollTop: 900,
    nextScrollTop: 900,
    scrollHeight: 1850,
    clientHeight: 500,
    isNewVisit: false,
    isProgrammatic: false,
    prevPinned: true,
  });
  assert.deepEqual(result, { pinned: true, away: false });
});

test('computeThreadScrollPin unpins only when user intentionally scrolls up', () => {
  const result = computeThreadScrollPin({
    prevScrollTop: 900,
    nextScrollTop: 520,
    scrollHeight: 1850,
    clientHeight: 500,
    isNewVisit: false,
    isProgrammatic: false,
    prevPinned: true,
  });
  assert.deepEqual(result, { pinned: false, away: true });
});

test('computeThreadScrollPin re-pins once user scrolls back near the bottom', () => {
  const result = computeThreadScrollPin({
    prevScrollTop: 520,
    nextScrollTop: 1320,
    scrollHeight: 1850,
    clientHeight: 500,
    isNewVisit: false,
    isProgrammatic: false,
    prevPinned: false,
  });
  assert.deepEqual(result, { pinned: true, away: false });
});

test('computeThreadScrollPin ignores transient clamp jitter without user intent but unpins on far jump', () => {
  const bounce = computeThreadScrollPin({
    prevScrollTop: 1700,
    nextScrollTop: 1580,
    scrollHeight: 2210,
    clientHeight: 520,
    isNewVisit: false,
    isProgrammatic: false,
    prevPinned: true,
    hasUserScrollIntent: false,
  });
  assert.deepEqual(bounce, { pinned: true, away: false });

  const explicitTopJump = computeThreadScrollPin({
    prevScrollTop: 1700,
    nextScrollTop: 40,
    scrollHeight: 2210,
    clientHeight: 520,
    isNewVisit: false,
    isProgrammatic: false,
    prevPinned: true,
    hasUserScrollIntent: false,
  });
  assert.deepEqual(explicitTopJump, { pinned: false, away: true });
});
