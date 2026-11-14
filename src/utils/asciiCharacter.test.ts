import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASCII_WIDTH,
  amplitudeToViseme,
  renderNousGirlAscii,
  resolveEyeState,
  textToVisemeTimeline,
} from './asciiCharacter';
import type { MouthViseme } from '../types/hermes';

test('renderNousGirlAscii produces fixed-width lines for all moods and visemes', () => {
  const allVisemes: MouthViseme[] = [
    'closed',
    'rest',
    'smile',
    'mbp',
    'fv',
    'lth',
    'small',
    'mid',
    'round',
    'ee',
    'wide',
  ];
  const renderedMouths = new Set<string>();
  for (const viseme of allVisemes) {
    const frame = renderNousGirlAscii({
      mood: 'speaking',
      viseme,
      eyeState: 'open',
      energy: 0.7,
      tick: 12,
    });
    assert.equal(frame.length, 18);
    for (const line of frame) {
      assert.equal(line.length, ASCII_WIDTH);
    }
    renderedMouths.add(frame[8]);
  }
  assert.equal(renderedMouths.size, allVisemes.length, 'Expected each viseme to render a unique mouth pattern');
});

test('textToVisemeTimeline extracts M/B/P, F/V, L/Th, Ee, O/Oo, and A/Ha sequences', () => {
  const timeline = textToVisemeTimeline('mab fava thol ee');
  assert.ok(timeline.includes('mbp'), 'Expected M/B/P viseme');
  assert.ok(timeline.includes('fv'), 'Expected F/V viseme');
  assert.ok(timeline.includes('lth'), 'Expected L/Th viseme');
  assert.ok(timeline.includes('round'), 'Expected O/Oo viseme');
  assert.ok(timeline.includes('ee'), 'Expected Wide/Ee viseme');
  assert.ok(timeline.includes('wide'), 'Expected Wide Open A/Ha viseme');
  assert.ok(timeline.includes('rest'), 'Expected Natural/Rest pauses at spaces');
});

test('amplitudeToViseme maps silence, energy, spectral bands, and spoken text to distinct mouth shapes', () => {
  assert.equal(amplitudeToViseme(0, 'neutral', 1, false), 'closed');
  assert.equal(amplitudeToViseme(0, 'happy', 1, false), 'smile');
  assert.equal(amplitudeToViseme(0, 'listening', 1, false), 'rest');
  assert.equal(amplitudeToViseme(0.01, 'speaking', 4, true), 'small');
  assert.equal(amplitudeToViseme(0.85, 'speaking', 2, true), 'wide');

  const hit = new Set<MouthViseme>();
  const text = 'Two mcp duet approvals for your morning brief.';
  for (let tick = 1; tick <= 40; tick++) {
    const bands = Array.from({ length: 12 }, (_, idx) =>
      Math.max(0.05, Math.min(1, 0.45 + 0.4 * Math.sin(tick * 0.5 + idx * 0.8)))
    );
    hit.add(amplitudeToViseme(0.5, 'speaking', tick, true, bands, text));
  }
  assert.ok(hit.size >= 6, `Expected diverse phoneme visemes during speech, got ${Array.from(hit).join(', ')}`);
});

test('resolveEyeState triggers natural periodic blinks and mood overrides', () => {
  assert.equal(resolveEyeState('neutral', 61, false), 'blink');
  assert.equal(resolveEyeState('happy', 10, false), 'happy');
  assert.equal(resolveEyeState('alert', 10, false), 'wide');
  assert.equal(resolveEyeState('neutral', 10, false), 'open');
});
