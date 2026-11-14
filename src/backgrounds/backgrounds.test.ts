import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PRESETS,
  DEFAULT_PRESET_ID,
  MAX_AMBIENT_SPEED_PX_PER_SEC,
  MAX_LUMINANCE_PULSE_PCT,
  getPresetById,
} from './presets';
import {
  BLUR_RANGE,
  DEFAULT_BACKGROUND_SETTINGS,
  OPACITY_RANGE,
  clampBlurPx,
  clampOpacity,
  inferMediaTypeFromSrc,
  isValidCustomMediaSrc,
  parseSavedBackgroundSettings,
} from './persistence';

test('preset registry ships exactly 7 ambient presets within motion & luminance budgets', () => {
  assert.equal(DEFAULT_PRESETS.length, 7);

  const ids = new Set<string>();
  for (const preset of DEFAULT_PRESETS) {
    assert.ok(!ids.has(preset.id), `duplicate preset id: ${preset.id}`);
    ids.add(preset.id);
    assert.ok(preset.name.length > 0);
    assert.ok(preset.staticBackground.length > 10, `${preset.id} must provide a static frame`);
    assert.ok(
      preset.maxSpeedPxPerSec <= MAX_AMBIENT_SPEED_PX_PER_SEC,
      `${preset.id} exceeds 40px/s drift budget`
    );
    assert.ok(
      preset.maxLuminancePulsePct <= MAX_LUMINANCE_PULSE_PCT,
      `${preset.id} exceeds 10% luminance pulse budget`
    );
  }

  assert.ok(getPresetById(DEFAULT_PRESET_ID));
});

test('opacity and blur clamps enforce safe contrast-preserving bounds', () => {
  assert.equal(clampOpacity(-1), OPACITY_RANGE.min);
  assert.equal(clampOpacity(5), OPACITY_RANGE.max);
  assert.equal(clampOpacity(Number.NaN), OPACITY_RANGE.defaultValue);
  assert.equal(clampOpacity(0.5), 0.5);

  assert.equal(clampBlurPx(-10), BLUR_RANGE.min);
  assert.equal(clampBlurPx(100), BLUR_RANGE.max);
  assert.equal(clampBlurPx(undefined), BLUR_RANGE.defaultValue);
  assert.equal(clampBlurPx(16.4), 16);
});

test('custom media validation accepts image/video URLs and rejects unsafe schemes', () => {
  assert.equal(isValidCustomMediaSrc('https://example.com/loop.mp4'), true);
  assert.equal(isValidCustomMediaSrc('/assets/aistudio/image_db5cb701.png'), true);
  assert.equal(isValidCustomMediaSrc('data:image/png;base64,AAAA'), true);
  assert.equal(isValidCustomMediaSrc('data:video/mp4;base64,AAAA'), true);

  assert.equal(isValidCustomMediaSrc('javascript:alert(1)'), false);
  assert.equal(isValidCustomMediaSrc(''), false);

  assert.equal(inferMediaTypeFromSrc('https://cdn.example.com/bg.webm?v=1'), 'video');
  assert.equal(inferMediaTypeFromSrc('data:video/mp4;base64,AAAA'), 'video');
  assert.equal(inferMediaTypeFromSrc('https://cdn.example.com/bg.png'), 'image');
});

test('parseSavedBackgroundSettings restores valid state and falls back cleanly on corrupt or unknown state', () => {
  assert.deepEqual(parseSavedBackgroundSettings(null), DEFAULT_BACKGROUND_SETTINGS);
  assert.deepEqual(parseSavedBackgroundSettings('{not-json'), DEFAULT_BACKGROUND_SETTINGS);

  const fallbackUnknown = parseSavedBackgroundSettings(
    JSON.stringify({ activeId: 'does-not-exist', opacity: 0.72, blurPx: 18 })
  );
  assert.equal(fallbackUnknown.activeId, DEFAULT_PRESET_ID);
  assert.equal(fallbackUnknown.opacity, 0.72);
  assert.equal(fallbackUnknown.blurPx, 18);

  const restored = parseSavedBackgroundSettings(
    JSON.stringify({
      activeId: 'custom-1',
      opacity: 0.55,
      blurPx: 20,
      customSlots: [
        {
          id: 'custom-1',
          label: 'Matrix Loop',
          mediaType: 'video',
          src: 'https://example.com/loop.mp4',
          createdAt: 1000,
        },
        {
          id: 'bad-slot',
          label: 'Bad',
          mediaType: 'image',
          src: 'javascript:alert(1)',
        },
      ],
    })
  );

  assert.equal(restored.activeId, 'custom-1');
  assert.equal(restored.opacity, 0.55);
  assert.equal(restored.blurPx, 20);
  assert.equal(restored.customSlots.length, 1);
  assert.equal(restored.customSlots[0].mediaType, 'video');
});
