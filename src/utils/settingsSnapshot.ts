import {
  DEFAULT_BACKGROUND_SETTINGS,
  parseSavedBackgroundSettings,
} from '../backgrounds/persistence';
import type { BackgroundSettings } from '../backgrounds/types';
import type { ExpressionMood, HermesTransportMode } from '../types/hermes';
import {
  normalizeCanvasPins,
  normalizeCanvasSessions,
  type CanvasPin,
  type CanvasSession,
} from './canvasSessions';
import {
  DEFAULT_UI_CONFIG,
  applyUiPatch,
  sanitizeUiPatch,
  type UiCustomizationConfig,
} from './uiCustomization';

export type SnapshotReason = 'sync' | 'manual' | 'pre-update' | 'restore' | 'import';

export interface WorkspacePreferences {
  showThinking: boolean;
  voiceMuted: boolean;
  mood: ExpressionMood;
  draftProfile: string;
  transportMode?: HermesTransportMode;
  onboardingCompleted: boolean;
}

export interface CanvasPreferences {
  sessions: CanvasSession[];
  pins: CanvasPin[];
  dismissedIds: string[];
}

export interface UserPreferencesSnapshot {
  schemaVersion: 1;
  snapshotId?: string;
  capturedAt: number;
  appVersion: string;
  sourceOrigin?: string;
  reason?: SnapshotReason;
  uiConfig: UiCustomizationConfig;
  background: BackgroundSettings;
  workspace: WorkspacePreferences;
  canvas: CanvasPreferences;
}

export interface PreferenceBackupSummary {
  id: string;
  createdAt: number;
  reason: SnapshotReason | string;
  appVersion: string;
  accentHex: string;
  accentPreset: string;
  backgroundId: string;
  customSlotCount: number;
  workspaceTitle: string;
}

export interface UpdateStepResult {
  id: string;
  label: string;
  status: 'ok' | 'skipped' | 'failed';
  detail?: string;
}

export interface UpdateReceipt {
  updatedAt: number;
  previousVersion: string;
  newVersion: string;
  previousCommit?: string | null;
  newCommit?: string | null;
  backupId: string;
  mode: 'git-pull' | 'managed-refresh';
  preservedCategories: string[];
}

export interface AppUpdateStatus {
  currentVersion: string;
  currentCommit: string | null;
  branch: string | null;
  latestVersion: string | null;
  latestCommit: string | null;
  updateAvailable: boolean;
  updateMode: 'git-pull' | 'managed-refresh';
  canSelfUpdate: boolean;
  dirtyWorktree: boolean;
  dirtyReason?: string;
  releaseTitle?: string;
  releaseNotes?: string;
  releaseUrl?: string;
  checkedAt: number;
  upstreamError?: string;
  pendingReceipt?: UpdateReceipt | null;
}

export interface PreservedCategorySummary {
  id: 'theme' | 'backdrop' | 'layout' | 'stage' | 'canvas';
  label: string;
  detail: string;
  customized: boolean;
}

export const DEFAULT_WORKSPACE_PREFERENCES: WorkspacePreferences = {
  showThinking: true,
  voiceMuted: false,
  mood: 'happy',
  draftProfile: 'default',
  onboardingCompleted: false,
};

const VALID_MOODS: ReadonlySet<ExpressionMood> = new Set([
  'happy',
  'focused',
  'thinking',
  'neutral',
  'alert',
]);

const VALID_REASONS: ReadonlySet<SnapshotReason> = new Set([
  'sync',
  'manual',
  'pre-update',
  'restore',
  'import',
]);

function normalizeWorkspacePreferences(raw: unknown): WorkspacePreferences {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_WORKSPACE_PREFERENCES };
  }
  const candidate = raw as Partial<WorkspacePreferences>;
  const mood: ExpressionMood =
    typeof candidate.mood === 'string' && VALID_MOODS.has(candidate.mood as ExpressionMood)
      ? (candidate.mood as ExpressionMood)
      : DEFAULT_WORKSPACE_PREFERENCES.mood;
  const draftProfile =
    typeof candidate.draftProfile === 'string' && candidate.draftProfile.trim()
      ? candidate.draftProfile.trim().slice(0, 64)
      : DEFAULT_WORKSPACE_PREFERENCES.draftProfile;
  const transportMode: HermesTransportMode | undefined =
    candidate.transportMode === 'auto' ||
    candidate.transportMode === 'runs' ||
    candidate.transportMode === 'session_stream' ||
    candidate.transportMode === 'chat_completions'
      ? candidate.transportMode
      : undefined;

  return {
    showThinking:
      typeof candidate.showThinking === 'boolean'
        ? candidate.showThinking
        : DEFAULT_WORKSPACE_PREFERENCES.showThinking,
    voiceMuted:
      typeof candidate.voiceMuted === 'boolean'
        ? candidate.voiceMuted
        : DEFAULT_WORKSPACE_PREFERENCES.voiceMuted,
    mood,
    draftProfile,
    ...(transportMode ? { transportMode } : {}),
    onboardingCompleted:
      typeof candidate.onboardingCompleted === 'boolean'
        ? candidate.onboardingCompleted
        : DEFAULT_WORKSPACE_PREFERENCES.onboardingCompleted,
  };
}

export function normalizePreferencesSnapshot(
  raw: unknown,
  fallbackVersion = '0.1.0'
): UserPreferencesSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;

  const rawUi = candidate.uiConfig;
  const sanitizedUi = sanitizeUiPatch(rawUi);
  const { next: uiConfig } = applyUiPatch(DEFAULT_UI_CONFIG, sanitizedUi);

  const background = candidate.background
    ? parseSavedBackgroundSettings(JSON.stringify(candidate.background))
    : { ...DEFAULT_BACKGROUND_SETTINGS, customSlots: [] };

  const workspace = normalizeWorkspacePreferences(candidate.workspace);

  const rawCanvas =
    candidate.canvas && typeof candidate.canvas === 'object'
      ? (candidate.canvas as Record<string, unknown>)
      : {};
  const sessions = Array.isArray(rawCanvas.sessions)
    ? normalizeCanvasSessions(rawCanvas.sessions as Partial<CanvasSession>[])
    : [];
  const pins = Array.isArray(rawCanvas.pins)
    ? normalizeCanvasPins(rawCanvas.pins as Partial<CanvasPin>[])
    : [];
  const dismissedIds = Array.isArray(rawCanvas.dismissedIds)
    ? rawCanvas.dismissedIds
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        .slice(0, 200)
    : [];

  const capturedAt =
    typeof candidate.capturedAt === 'number' && Number.isFinite(candidate.capturedAt)
      ? candidate.capturedAt
      : Date.now();
  const appVersion =
    typeof candidate.appVersion === 'string' && candidate.appVersion.trim()
      ? candidate.appVersion.trim().slice(0, 48)
      : fallbackVersion;
  const sourceOrigin =
    typeof candidate.sourceOrigin === 'string' && candidate.sourceOrigin.trim()
      ? candidate.sourceOrigin.trim().slice(0, 200)
      : undefined;
  const snapshotId =
    typeof candidate.snapshotId === 'string' && candidate.snapshotId.trim()
      ? candidate.snapshotId.trim().slice(0, 96)
      : undefined;
  const reason: SnapshotReason =
    typeof candidate.reason === 'string' && VALID_REASONS.has(candidate.reason as SnapshotReason)
      ? (candidate.reason as SnapshotReason)
      : 'sync';

  return {
    schemaVersion: 1,
    ...(snapshotId ? { snapshotId } : {}),
    capturedAt,
    appVersion,
    ...(sourceOrigin ? { sourceOrigin } : {}),
    reason,
    uiConfig,
    background,
    workspace,
    canvas: {
      sessions,
      pins,
      dismissedIds,
    },
  };
}

export function isUiConfigDefault(config: UiCustomizationConfig): boolean {
  const keys = Object.keys(DEFAULT_UI_CONFIG) as Array<keyof UiCustomizationConfig>;
  return keys.every((k) => config[k] === DEFAULT_UI_CONFIG[k]);
}

export function isBackgroundDefault(bg: BackgroundSettings): boolean {
  return (
    bg.activeId === DEFAULT_BACKGROUND_SETTINGS.activeId &&
    bg.opacity === DEFAULT_BACKGROUND_SETTINGS.opacity &&
    bg.blurPx === DEFAULT_BACKGROUND_SETTINGS.blurPx &&
    bg.customSlots.length === 0
  );
}

export function hasCustomizedPreferences(snapshot: UserPreferencesSnapshot | null | undefined): boolean {
  if (!snapshot) return false;
  if (!isUiConfigDefault(snapshot.uiConfig)) return true;
  if (!isBackgroundDefault(snapshot.background)) return true;
  if (
    snapshot.workspace.showThinking !== DEFAULT_WORKSPACE_PREFERENCES.showThinking ||
    snapshot.workspace.voiceMuted !== DEFAULT_WORKSPACE_PREFERENCES.voiceMuted ||
    snapshot.workspace.mood !== DEFAULT_WORKSPACE_PREFERENCES.mood ||
    snapshot.workspace.draftProfile !== DEFAULT_WORKSPACE_PREFERENCES.draftProfile ||
    snapshot.workspace.onboardingCompleted !== DEFAULT_WORKSPACE_PREFERENCES.onboardingCompleted ||
    Boolean(snapshot.workspace.transportMode && snapshot.workspace.transportMode !== 'auto')
  ) {
    return true;
  }
  if (
    snapshot.canvas.sessions.length > 0 ||
    snapshot.canvas.pins.length > 0 ||
    snapshot.canvas.dismissedIds.length > 0
  ) {
    return true;
  }
  return false;
}

/**
 * Decides whether a booting browser session should hydrate from the server's
 * durable preferences vault instead of keeping (and overwriting with) local defaults.
 *
 * Guarantees that:
 * - Updates switching ports/origins or clearing browser cache auto-restore user themes & settings.
 * - Explicit pre-update snapshots or user-triggered backup restores take precedence over stale local data.
 */
export function resolveBootHydrationSource(
  localSnapshot: UserPreferencesSnapshot,
  vaultSnapshot: UserPreferencesSnapshot | null
): 'vault' | 'local' {
  if (!vaultSnapshot) return 'local';
  const localCustom = hasCustomizedPreferences(localSnapshot);
  const vaultCustom = hasCustomizedPreferences(vaultSnapshot);

  if (!localCustom && vaultCustom) {
    return 'vault';
  }
  if (
    (vaultSnapshot.reason === 'pre-update' || vaultSnapshot.reason === 'restore') &&
    vaultSnapshot.capturedAt >= localSnapshot.capturedAt
  ) {
    return 'vault';
  }
  if (localSnapshot.capturedAt <= 0 && vaultSnapshot.capturedAt > 0) {
    return 'vault';
  }
  return 'local';
}

export function summarizePreservedCategories(
  snapshot: UserPreferencesSnapshot
): PreservedCategorySummary[] {
  const { uiConfig, background, workspace, canvas } = snapshot;

  const themeCustomized =
    uiConfig.accentPreset !== DEFAULT_UI_CONFIG.accentPreset ||
    uiConfig.accentHex !== DEFAULT_UI_CONFIG.accentHex ||
    uiConfig.surfaceHex !== DEFAULT_UI_CONFIG.surfaceHex ||
    uiConfig.panelAlpha !== DEFAULT_UI_CONFIG.panelAlpha ||
    uiConfig.borderOpacity !== DEFAULT_UI_CONFIG.borderOpacity ||
    uiConfig.glowIntensity !== DEFAULT_UI_CONFIG.glowIntensity;

  const bgCustomized = !isBackgroundDefault(background);

  const layoutCustomized =
    uiConfig.sidebarVisible !== DEFAULT_UI_CONFIG.sidebarVisible ||
    uiConfig.sidebarPosition !== DEFAULT_UI_CONFIG.sidebarPosition ||
    uiConfig.sidebarWidthPx !== DEFAULT_UI_CONFIG.sidebarWidthPx ||
    uiConfig.cornerRadius !== DEFAULT_UI_CONFIG.cornerRadius ||
    uiConfig.density !== DEFAULT_UI_CONFIG.density ||
    uiConfig.fontPreset !== DEFAULT_UI_CONFIG.fontPreset ||
    uiConfig.fontScale !== DEFAULT_UI_CONFIG.fontScale ||
    uiConfig.showTopNav !== DEFAULT_UI_CONFIG.showTopNav ||
    uiConfig.composerStyle !== DEFAULT_UI_CONFIG.composerStyle ||
    uiConfig.workspaceTitle !== DEFAULT_UI_CONFIG.workspaceTitle;

  const stageCustomized =
    uiConfig.portraitVisible !== DEFAULT_UI_CONFIG.portraitVisible ||
    uiConfig.portraitScale !== DEFAULT_UI_CONFIG.portraitScale ||
    uiConfig.portraitTintHex !== DEFAULT_UI_CONFIG.portraitTintHex ||
    uiConfig.brailleDotProfile !== DEFAULT_UI_CONFIG.brailleDotProfile ||
    uiConfig.horizonVisible !== DEFAULT_UI_CONFIG.horizonVisible ||
    uiConfig.horizonStyle !== DEFAULT_UI_CONFIG.horizonStyle ||
    uiConfig.reducedMotion !== DEFAULT_UI_CONFIG.reducedMotion ||
    workspace.showThinking !== DEFAULT_WORKSPACE_PREFERENCES.showThinking ||
    workspace.voiceMuted !== DEFAULT_WORKSPACE_PREFERENCES.voiceMuted ||
    workspace.mood !== DEFAULT_WORKSPACE_PREFERENCES.mood;

  return [
    {
      id: 'theme',
      label: 'Theme & Colors',
      detail: `${uiConfig.accentPreset} · ${uiConfig.accentHex} · ${Math.round(uiConfig.panelAlpha * 100)}% glass`,
      customized: themeCustomized,
    },
    {
      id: 'backdrop',
      label: 'Backdrop & Media',
      detail:
        background.customSlots.length > 0
          ? `${background.activeId} · ${background.customSlots.length} custom`
          : `${background.activeId} · ${Math.round(background.opacity * 100)}%`,
      customized: bgCustomized,
    },
    {
      id: 'layout',
      label: 'Layout & Typography',
      detail: `${uiConfig.sidebarPosition} rail · ${uiConfig.density} · ${uiConfig.fontPreset}`,
      customized: layoutCustomized,
    },
    {
      id: 'stage',
      label: 'Stage, Voice & Trace',
      detail: `${uiConfig.brailleDotProfile} braille · ${workspace.showThinking ? 'trace on' : 'clean'} · ${workspace.voiceMuted ? 'muted' : 'audio on'}`,
      customized: stageCustomized,
    },
    {
      id: 'canvas',
      label: 'Canvas & Tour State',
      detail: `${canvas.sessions.length} dots · ${canvas.pins.length} pins · ${workspace.onboardingCompleted ? 'tour done' : 'tour pending'}`,
      customized: canvas.sessions.length > 0 || canvas.pins.length > 0 || workspace.onboardingCompleted,
    },
  ];
}

export function summarizeBackupRecord(
  id: string,
  snapshot: UserPreferencesSnapshot
): PreferenceBackupSummary {
  return {
    id,
    createdAt: snapshot.capturedAt,
    reason: snapshot.reason ?? 'manual',
    appVersion: snapshot.appVersion,
    accentHex: snapshot.uiConfig.accentHex,
    accentPreset: snapshot.uiConfig.accentPreset,
    backgroundId: snapshot.background.activeId,
    customSlotCount: snapshot.background.customSlots.length,
    workspaceTitle: snapshot.uiConfig.workspaceTitle,
  };
}

/**
 * Compares two semantic version strings (e.g. "0.1.0" vs "0.2.0" or "v1.2.3").
 * Returns -1 when current < latest, 0 when equal, 1 when current > latest.
 */
export function compareSemver(currentRaw: string, latestRaw: string): -1 | 0 | 1 {
  const parse = (v: string) =>
    v
      .trim()
      .replace(/^v/i, '')
      .split('-')[0]
      .split('.')
      .slice(0, 3)
      .map((part) => {
        const n = Number.parseInt(part, 10);
        return Number.isFinite(n) && n >= 0 ? n : 0;
      });
  const a = parse(currentRaw);
  const b = parse(latestRaw);
  for (let i = 0; i < 3; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

export function parseImportedPreferencesJson(rawText: string): UserPreferencesSnapshot | null {
  try {
    const parsed = JSON.parse(rawText) as unknown;
    const normalized = normalizePreferencesSnapshot(parsed);
    if (!normalized) return null;
    return {
      ...normalized,
      capturedAt: Date.now(),
      reason: 'import',
    };
  } catch {
    return null;
  }
}
