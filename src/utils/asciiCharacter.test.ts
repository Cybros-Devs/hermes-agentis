import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASCII_WIDTH,
  amplitudeToViseme,
  renderNousGirlAscii,
  resolveEyeState,
} from './asciiCharacter';

test('renderNousGirlAscii produces fixed-width lines for all moods and visemes', () => {
  const frameA = renderNousGirlAscii({
    mood: 'speaking',
    viseme: 'wide',
    eyeState: 'open',
    energy: 0.8,
    tick: 12,
  });
  const frameB = renderNousGirlAscii({
    mood: 'happy',
    viseme: 'closed',
    eyeState: 'blink',
    energy: 0,
    tick: 61,
  });

  assert.equal(frameA.length, frameB.length);
  assert.ok(frameA.length >= 16);
  for (const line of frameA) {
    assert.equal(line.length, ASCII_WIDTH);
  }
  for (const line of frameB) {
    assert.equal(line.length, ASCII_WIDTH);
  }
});

test('amplitudeToViseme maps silence and speaking energy to distinct mouth shapes', () => {
  assert.equal(amplitudeToViseme(0, 'neutral', 1, false), 'closed');
  assert.equal(amplitudeToViseme(0, 'happy', 1, false), 'smile');
  assert.equal(amplitudeToViseme(0.01, 'speaking', 4, true), 'small');
  assert.equal(amplitudeToViseme(0.85, 'speaking', 2, true), 'wide');
});

test('resolveEyeState triggers natural periodic blinks and mood overrides', () => {
  assert.equal(resolveEyeState('neutral', 61, false), 'blink');
  assert.equal(resolveEyeState('happy', 10, false), 'happy');
  assert.equal(resolveEyeState('alert', 10, false), 'wide');
  assert.equal(resolveEyeState('neutral', 10, false), 'open');
});
