import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDecodeFrame, getDecodeDurationMs } from './textDecodeEngine';

test('computeDecodeFrame tapers Braille frontier density from full cells to single dots while keeping whitespace', () => {
  const target = 'Hermes system\nonline ready';
  const frame = computeDecodeFrame(target, 0.25, 3, 8);
  assert.equal(frame.done, false);
  assert.ok(frame.settled.length > 0 && frame.settled.length < target.length);
  assert.equal(frame.frontier.length, 8);

  // Leading/trailing whitespace & newlines inside frontier must stay preserved
  for (let i = 0; i < frame.frontier.length; i++) {
    const src = target[frame.settled.length + i];
    if (src === ' ' || src === '\n') {
      assert.equal(frame.frontier[i], src);
    } else {
      assert.ok(/[\u2800-\u28FF]/.test(frame.frontier[i]), `Expected Braille cipher glyph, got ${frame.frontier[i]}`);
    }
  }

  // Last non-whitespace frontier glyph should be lighter dot density than first glyph
  const popCount = (ch: string) => {
    let bits = ch.charCodeAt(0) - 0x2800;
    let c = 0;
    while (bits > 0) {
      c += bits & 1;
      bits >>= 1;
    }
    return c;
  };
  const nonWsGlyphs = [...frame.frontier].filter((ch) => ch !== ' ' && ch !== '\n');
  assert.ok(nonWsGlyphs.length >= 2);
  assert.ok(
    popCount(nonWsGlyphs[0]) > popCount(nonWsGlyphs[nonWsGlyphs.length - 1]),
    `Expected progressive Braille dot-count decay from settled boundary to leading edge (${frame.frontier})`
  );
});

test('computeDecodeFrame settles completely at progress >= 0.999 and bounds decode duration', () => {
  const done = computeDecodeFrame('Ready', 1, 10);
  assert.equal(done.done, true);
  assert.equal(done.settled, 'Ready');
  assert.equal(done.frontier, '');

  assert.equal(getDecodeDurationMs(''), 0);
  assert.ok(getDecodeDurationMs('Hi') >= 320);
  assert.ok(getDecodeDurationMs('A'.repeat(500)) <= 1150);
});
