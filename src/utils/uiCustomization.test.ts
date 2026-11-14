import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURATED_UI_PRESETS,
  DEFAULT_UI_CONFIG,
  applyUiPatch,
  normalizeHex,
  parseNaturalUiIntent,
  sanitizeUiPatch,
} from './uiCustomization';

test('normalizeHex and sanitizeUiPatch clamp values and compute safe dark surfaces', () => {
  assert.equal(normalizeHex('34d399'), '#34D399');
  assert.equal(normalizeHex('#f0a'), '#FF00AA');
  assert.equal(normalizeHex('not-a-color'), null);

  const sanitized = sanitizeUiPatch({
    accentHex: '#ff5500',
    surfaceHex: '#FFFFFF', // overly bright surface gets darkened safely
    panelAlpha: 5,
    borderOpacity: -2,
    glowIntensity: 99,
    sidebarWidthPx: 1000,
    fontScale: 0.1,
    portraitScale: 4,
    glassBlurPx: 99,
    backgroundOpacity: 0.01,
  });

  assert.equal(sanitized.accentHex, '#FF5500');
  assert.equal(sanitized.accentPreset, 'custom');
  assert.ok(sanitized.accentSoftHex && sanitized.accentSoftHex.startsWith('#'));
  assert.notEqual(sanitized.surfaceHex, '#FFFFFF');
  assert.equal(sanitized.panelAlpha, 0.95);
  assert.equal(sanitized.borderOpacity, 0.08);
  assert.equal(sanitized.glowIntensity, 2);
  assert.equal(sanitized.sidebarWidthPx, 420);
  assert.equal(sanitized.fontScale, 0.85);
  assert.equal(sanitized.portraitScale, 1.45);
  assert.equal(sanitized.glassBlurPx, 28);
  assert.equal(sanitized.backgroundOpacity, 0.15);
});

test('applyUiPatch applies curated studio themes, individual edits, and resetAll cleanly', () => {
  const { next: violet, sanitized, changedKeys } = applyUiPatch(DEFAULT_UI_CONFIG, {
    presetId: 'cyber-violet',
    sidebarPosition: 'right',
  });

  assert.equal(violet.accentPreset, 'violet');
  assert.equal(violet.accentHex, '#A855F7');
  assert.equal(violet.fontPreset, 'display');
  assert.equal(violet.sidebarPosition, 'right');
  assert.equal(sanitized.backgroundPresetId, 'nebula');
  assert.ok(changedKeys.some((k) => k.startsWith('preset:')));

  const { next: reset } = applyUiPatch(violet, { resetAll: true });
  assert.deepEqual(reset, DEFAULT_UI_CONFIG);
});

test('parseNaturalUiIntent parses multi-element UI requests without false-triggering normal chat', () => {
  // Normal chat must NOT accidentally rewrite UI
  assert.equal(parseNaturalUiIntent('Summarize my morning brief and tasks', DEFAULT_UI_CONFIG), null);
  assert.equal(parseNaturalUiIntent('Approve card-1 for Mail MCP', DEFAULT_UI_CONFIG), null);

  const complex = parseNaturalUiIntent(
    'Make the UI cyberpunk purple with monospace font, sharp corners, move sidebar to the right, set background to braille rain with blur 20, make portrait bigger and pink, and hide the horizon wave',
    DEFAULT_UI_CONFIG
  );
  assert.ok(complex, 'Expected natural-language UI customization intent to parse');
  assert.equal(complex.accentPreset, 'violet');
  assert.equal(complex.fontPreset, 'mono');
  assert.equal(complex.cornerRadius, 'sharp');
  assert.equal(complex.sidebarPosition, 'right');
  assert.equal(complex.backgroundPresetId, 'braille-rain');
  assert.equal(complex.glassBlurPx, 20);
  assert.equal(complex.portraitScale, 1.3);
  assert.equal(complex.portraitTintHex, '#F472B6');
  assert.equal(complex.horizonVisible, false);

  const reset = parseNaturalUiIntent('reset all UI settings back to default', DEFAULT_UI_CONFIG);
  assert.deepEqual(reset, { resetAll: true });

  const customHex = parseNaturalUiIntent('set accent color to #00E5FF and rename brand to > atlas', DEFAULT_UI_CONFIG);
  assert.ok(customHex);
  assert.equal(customHex.accentHex, '#00E5FF');
  assert.equal(customHex.workspaceTitle, '> atlas');
});

test('all curated UI presets have unique ids and valid sanitized configs', () => {
  assert.equal(CURATED_UI_PRESETS.length, 6);
  const ids = new Set<string>();
  for (const preset of CURATED_UI_PRESETS) {
    assert.ok(!ids.has(preset.id), `duplicate preset id: ${preset.id}`);
    ids.add(preset.id);
    const { next } = applyUiPatch(DEFAULT_UI_CONFIG, { presetId: preset.id });
    assert.ok(normalizeHex(next.accentHex));
    assert.ok(normalizeHex(next.surfaceHex));
  }
});
