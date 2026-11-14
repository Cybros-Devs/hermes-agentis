import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDecodeFrame, getDecodeDurationMs } from './textDecodeEngine';

test('computeDecodeFrame reveals settled prefix with Braille cipher frontier and preserves spaces/newlines', () => {
  const target = 'Good morning.\nTwo gates ready.';
  const start = computeDecodeFrame(target, 0, 1);
  assert.equal(start.done, false);
  assert.equal(start.settled, '');
  assert.ok(start.frontier.length > 0);
  assert.match(start.frontier, /[\u2800-\u28FF]/, 'Expected Braille glyphs on decoding frontier');

  const mid = computeDecodeFrame(target, 0.5, 4);
  assert.equal(mid.done, false);
  assert.equal(mid.settled, target.slice(0, Math.floor(target.length * 0.5)));
  // Ensure whitespace in frontier stays whitespace so text layout does not jitter
  const midIdx = Math.floor(target.length * 0.5);
  for (let i = 0; i < mid.frontier.length; i++) {
    const srcChar = target[midIdx + i];
    if (srcChar === ' ' || srcChar === '\n') {
      assert.equal(mid.frontier[i], srcChar);
    }
  }

  const end = computeDecodeFrame(target, 1, 10);
  assert.equal(end.done, true);
  assert.equal(end.settled, target);
  assert.equal(end.frontier, '');
});

test('getDecodeDurationMs scales cleanly within snappy reading bounds', () => {
  assert.equal(getDecodeDurationMs(''), 0);
  assert.ok(getDecodeDurationMs('Hi') >= 320);
  assert.ok(getDecodeDurationMs('A'.repeat(400)) <= 1150);
});
