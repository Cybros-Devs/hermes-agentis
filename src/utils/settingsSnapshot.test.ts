import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BACKGROUND_SETTINGS } from '../backgrounds/persistence';
import { DEFAULT_UI_CONFIG, applyUiPatch } from './uiCustomization';
import {
  DEFAULT_WORKSPACE_PREFERENCES,
  compareSemver,
  hasCustomizedPreferences,
  normalizePreferencesSnapshot,
  parseImportedPreferencesJson,
  resolveBootHydrationSource,
  summarizeBackupRecord,
  summarizePreservedCategories,
  type UserPreferencesSnapshot,
} from './settingsSnapshot';

function makeBaseSnapshot(
  overrides: Partial<UserPreferencesSnapshot> = {}
): UserPreferencesSnapshot {
  return {
    schemaVersion: 1,
    capturedAt: 1_700_000_000_000,
    appVersion: '0.1.0',
    reason: 'sync',
    uiConfig: { ...DEFAULT_UI_CONFIG },
    background: { ...DEFAULT_BACKGROUND_SETTINGS, customSlots: [] },
    workspace: { ...DEFAULT_WORKSPACE_PREFERENCES },
    canvas: { sessions: [], pins: [], dismissedIds: [] },
    ...overrides,
  };
}

test('normalizePreferencesSnapshot sanitizes custom themes, uploaded backdrops, and workspace prefs', () => {
  const normalized = normalizePreferencesSnapshot({
    schemaVersion: 1,
    capturedAt: 1_750_000_000_000,
    appVersion: '0.1.0',
    reason: 'pre-update',
    uiConfig: {
      accentPreset: 'violet',
      accentHex: '#a855f7',
      workspaceTitle: 'My Hermes Rig',
      sidebarPosition: 'right',
      panelAlpha: 0.88,
    },
    background: {
      activeId: 'custom-1',
      opacity: 0.52,
      blurPx: 16,
      customSlots: [
        {
          id: 'custom-1',
          label: 'Sunset Coast',
          mediaType: 'image',
          src: 'data:image/png;base64,iVBORw0KGgo=',
          createdAt: 1_750_000_000_000,
        },
        {
          id: 'bad-slot',
          label: 'Bad',
          mediaType: 'image',
          src: 'javascript:alert(1)',
        },
      ],
    },
    workspace: {
      showThinking: false,
      voiceMuted: true,
      mood: 'focused',
      draftProfile: 'agentis',
      onboardingCompleted: true,
    },
    canvas: {
      sessions: [],
      pins: [{ id: 'pin-1', label: 'Ops', kind: 'label', xPct: 40, yPct: 50 }],
      dismissedIds: ['old-chan'],
    },
  });

  assert.ok(normalized);
  assert.equal(normalized.reason, 'pre-update');
  assert.equal(normalized.uiConfig.accentPreset, 'violet');
  assert.equal(normalized.uiConfig.accentHex, '#A855F7');
  assert.equal(normalized.uiConfig.workspaceTitle, 'My Hermes Rig');
  assert.equal(normalized.uiConfig.sidebarPosition, 'right');
  assert.equal(normalized.background.activeId, 'custom-1');
  assert.equal(normalized.background.customSlots.length, 1);
  assert.equal(normalized.background.customSlots[0].label, 'Sunset Coast');
  assert.equal(normalized.workspace.showThinking, false);
  assert.equal(normalized.workspace.voiceMuted, true);
  assert.equal(normalized.workspace.mood, 'focused');
  assert.equal(normalized.workspace.draftProfile, 'agentis');
  assert.equal(normalized.workspace.onboardingCompleted, true);
  assert.equal(normalized.canvas.pins.length, 1);
  assert.deepEqual(normalized.canvas.dismissedIds, ['old-chan']);
});

test('hasCustomizedPreferences distinguishes pristine defaults from user themes and settings', () => {
  const pristine = makeBaseSnapshot();
  assert.equal(hasCustomizedPreferences(pristine), false);

  const themed = makeBaseSnapshot({
    uiConfig: applyUiPatch(DEFAULT_UI_CONFIG, { presetId: 'solaris-amber' }).next,
  });
  assert.equal(hasCustomizedPreferences(themed), true);

  const customBg = makeBaseSnapshot({
    background: {
      ...DEFAULT_BACKGROUND_SETTINGS,
      activeId: 'custom-sunset',
      customSlots: [
        {
          id: 'custom-sunset',
          label: 'Sunset',
          mediaType: 'image',
          src: 'https://example.com/bg.jpg',
          createdAt: 1000,
        },
      ],
    },
  });
  assert.equal(hasCustomizedPreferences(customBg), true);

  const completedTour = makeBaseSnapshot({
    workspace: { ...DEFAULT_WORKSPACE_PREFERENCES, onboardingCompleted: true },
  });
  assert.equal(hasCustomizedPreferences(completedTour), true);
});

test('resolveBootHydrationSource restores vault preferences on fresh or updated origin without clobbering', () => {
  const freshLocal = makeBaseSnapshot({ capturedAt: 0 });
  const customizedVault = makeBaseSnapshot({
    capturedAt: 1_750_000_000_000,
    uiConfig: applyUiPatch(DEFAULT_UI_CONFIG, { presetId: 'cyber-violet' }).next,
    workspace: { ...DEFAULT_WORKSPACE_PREFERENCES, onboardingCompleted: true },
  });

  // Simulates opening after update on new port / cleared browser storage
  assert.equal(resolveBootHydrationSource(freshLocal, customizedVault), 'vault');

  // Pre-update / explicit restore snapshot wins if equal or newer than local
  const olderLocal = makeBaseSnapshot({
    capturedAt: 1_740_000_000_000,
    uiConfig: applyUiPatch(DEFAULT_UI_CONFIG, { accentPreset: 'cyan' }).next,
  });
  const preUpdateVault = makeBaseSnapshot({
    capturedAt: 1_750_000_000_000,
    reason: 'pre-update',
    uiConfig: applyUiPatch(DEFAULT_UI_CONFIG, { presetId: 'cyber-violet' }).next,
  });
  assert.equal(resolveBootHydrationSource(olderLocal, preUpdateVault), 'vault');

  // Live newer local edits stay authoritative over older regular sync
  const newerLocal = makeBaseSnapshot({
    capturedAt: 1_760_000_000_000,
    uiConfig: applyUiPatch(DEFAULT_UI_CONFIG, { presetId: 'solaris-amber' }).next,
  });
  assert.equal(resolveBootHydrationSource(newerLocal, customizedVault), 'local');
});

test('compareSemver orders semantic version strings accurately', () => {
  assert.equal(compareSemver('0.1.0', '0.2.0'), -1);
  assert.equal(compareSemver('v0.1.0', '0.1.1'), -1);
  assert.equal(compareSemver('1.2.3', 'v1.2.3'), 0);
  assert.equal(compareSemver('1.10.0', '1.2.9'), 1);
});

test('summarizePreservedCategories and summarizeBackupRecord surface user customizations clearly', () => {
  const snapshot = makeBaseSnapshot({
    reason: 'pre-update',
    uiConfig: applyUiPatch(DEFAULT_UI_CONFIG, { presetId: 'cyber-violet', sidebarPosition: 'right' }).next,
    background: {
      activeId: 'custom-photo',
      opacity: 0.5,
      blurPx: 8,
      customSlots: [
        {
          id: 'custom-photo',
          label: 'Beach',
          mediaType: 'image',
          src: 'https://example.com/beach.jpg',
          createdAt: 1000,
        },
      ],
    },
    workspace: { ...DEFAULT_WORKSPACE_PREFERENCES, onboardingCompleted: true },
  });

  const categories = summarizePreservedCategories(snapshot);
  assert.equal(categories.length, 5);
  assert.equal(categories.find((c) => c.id === 'theme')?.customized, true);
  assert.equal(categories.find((c) => c.id === 'backdrop')?.customized, true);
  assert.equal(categories.find((c) => c.id === 'layout')?.customized, true);

  const summary = summarizeBackupRecord('backup-1', snapshot);
  assert.equal(summary.accentPreset, 'violet');
  assert.equal(summary.customSlotCount, 1);
  assert.equal(summary.backgroundId, 'custom-photo');
});

test('parseImportedPreferencesJson parses valid JSON backups and rejects malformed payloads', () => {
  assert.equal(parseImportedPreferencesJson('not-json'), null);
  assert.equal(parseImportedPreferencesJson('42'), null);

  const raw = JSON.stringify(
    makeBaseSnapshot({
      uiConfig: applyUiPatch(DEFAULT_UI_CONFIG, { accentHex: '#38BDF8', cornerRadius: 'sharp' }).next,
    })
  );
  const parsed = parseImportedPreferencesJson(raw);
  assert.ok(parsed);
  assert.equal(parsed.reason, 'import');
  assert.equal(parsed.uiConfig.accentHex, '#38BDF8');
  assert.equal(parsed.uiConfig.cornerRadius, 'sharp');
});
