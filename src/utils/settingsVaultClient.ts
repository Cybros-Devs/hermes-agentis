import {
  loadBackgroundSettings,
  publishBackgroundSettings,
  requestOnboardingDismiss,
} from '../backgrounds/persistence';
import {
  ONBOARDING_STORAGE_KEY,
  loadOnboardingCompleted,
  saveOnboardingCompleted,
} from '../onboarding/trigger';
import type {
  AppUpdateStatus,
  PreferenceBackupSummary,
  UpdateReceipt,
  UpdateStepResult,
  UserPreferencesSnapshot,
} from './settingsSnapshot';
import { normalizePreferencesSnapshot } from './settingsSnapshot';
import { publishUiConfig } from './uiCustomization';

export interface PreferencesVaultResponse {
  ok: boolean;
  vault: UserPreferencesSnapshot | null;
  backups: PreferenceBackupSummary[];
  storageLabel: string;
}

export interface BackupCreateResponse {
  ok: boolean;
  backup: PreferenceBackupSummary;
  backups: PreferenceBackupSummary[];
}

export interface RestoreResponse {
  ok: boolean;
  snapshot: UserPreferencesSnapshot;
  backups: PreferenceBackupSummary[];
}

export interface ApplyUpdateResponse {
  ok: boolean;
  status: AppUpdateStatus;
  receipt?: UpdateReceipt;
  steps: UpdateStepResult[];
  needsReload: boolean;
  restarting: boolean;
  error?: string;
}

export const PREF_META_STORAGE_KEY = 'hermes.preferencesMeta.v1';

export function readPreferencesCapturedAt(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem(PREF_META_STORAGE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { capturedAt?: unknown };
    return typeof parsed.capturedAt === 'number' && Number.isFinite(parsed.capturedAt)
      ? parsed.capturedAt
      : 0;
  } catch {
    return 0;
  }
}

export function writePreferencesCapturedAt(capturedAt: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      PREF_META_STORAGE_KEY,
      JSON.stringify({ capturedAt })
    );
  } catch {
    // ignore storage quota errors
  }
}

export function applySnapshotToBrowserStorage(snapshot: UserPreferencesSnapshot): void {
  publishUiConfig(snapshot.uiConfig);
  publishBackgroundSettings(snapshot.background);

  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      'duet.showInlineTrace',
      snapshot.workspace.showThinking ? '1' : '0'
    );
    if (snapshot.workspace.onboardingCompleted) {
      if (!loadOnboardingCompleted()) {
        saveOnboardingCompleted(false);
      } else {
        const existing = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
        if (!existing) saveOnboardingCompleted(false);
      }
      requestOnboardingDismiss();
    }
    window.localStorage.setItem(
      'duet.canvasSessions.v2',
      JSON.stringify(snapshot.canvas.sessions)
    );
    window.localStorage.setItem(
      'duet.canvasPins.v1',
      JSON.stringify(snapshot.canvas.pins)
    );
    window.localStorage.setItem(
      'duet.dismissedCanvasIds.v1',
      JSON.stringify(snapshot.canvas.dismissedIds)
    );
    writePreferencesCapturedAt(snapshot.capturedAt);
  } catch {
    // ignore storage errors
  }
}

export function collectSnapshotFromBrowser(
  base: Pick<UserPreferencesSnapshot, 'uiConfig' | 'workspace' | 'canvas' | 'appVersion'>,
  reason: UserPreferencesSnapshot['reason'] = 'sync'
): UserPreferencesSnapshot {
  const capturedAt = Date.now();
  return {
    schemaVersion: 1,
    themeEpoch: 'slate-v1',
    capturedAt,
    appVersion: base.appVersion || '0.1.0',
    sourceOrigin: typeof window !== 'undefined' ? window.location.origin : undefined,
    reason,
    uiConfig: base.uiConfig,
    background: loadBackgroundSettings(),
    workspace: base.workspace,
    canvas: base.canvas,
  };
}

export async function fetchPreferencesVault(): Promise<PreferencesVaultResponse | null> {
  try {
    const res = await fetch('/api/preferences');
    if (!res.ok) return null;
    const body = (await res.json()) as {
      ok?: boolean;
      vault?: unknown;
      backups?: PreferenceBackupSummary[];
      storageLabel?: string;
    };
    const vault = body.vault ? normalizePreferencesSnapshot(body.vault) : null;
    return {
      ok: Boolean(body.ok),
      vault,
      backups: Array.isArray(body.backups) ? body.backups : [],
      storageLabel: body.storageLabel || 'Server preferences vault',
    };
  } catch {
    return null;
  }
}

export async function savePreferencesToVault(
  snapshot: UserPreferencesSnapshot
): Promise<{ ok: boolean; vault: UserPreferencesSnapshot | null }> {
  try {
    const res = await fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot }),
    });
    if (!res.ok) return { ok: false, vault: null };
    const body = (await res.json()) as { ok?: boolean; vault?: unknown };
    return {
      ok: Boolean(body.ok),
      vault: body.vault ? normalizePreferencesSnapshot(body.vault) : snapshot,
    };
  } catch {
    return { ok: false, vault: null };
  }
}

export async function createPreferencesBackup(
  snapshot: UserPreferencesSnapshot,
  reason: 'manual' | 'pre-update' = 'manual'
): Promise<BackupCreateResponse | null> {
  try {
    const res = await fetch('/api/preferences/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot, reason }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as BackupCreateResponse;
    return body.ok ? body : null;
  } catch {
    return null;
  }
}

export async function restorePreferencesBackup(
  backupId: string
): Promise<RestoreResponse | null> {
  try {
    const res = await fetch('/api/preferences/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backupId }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      ok?: boolean;
      snapshot?: unknown;
      backups?: PreferenceBackupSummary[];
    };
    const snapshot = body.snapshot ? normalizePreferencesSnapshot(body.snapshot) : null;
    if (!body.ok || !snapshot) return null;
    return {
      ok: true,
      snapshot,
      backups: Array.isArray(body.backups) ? body.backups : [],
    };
  } catch {
    return null;
  }
}

export async function fetchAppUpdateStatus(forceRefresh = false): Promise<AppUpdateStatus | null> {
  try {
    const res = await fetch(
      forceRefresh ? '/api/app/update/status?refresh=1' : '/api/app/update/status'
    );
    if (!res.ok) return null;
    return (await res.json()) as AppUpdateStatus;
  } catch {
    return null;
  }
}

export async function applyAppUpdateWithSnapshot(
  snapshot: UserPreferencesSnapshot
): Promise<ApplyUpdateResponse> {
  const res = await fetch('/api/app/update/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshot }),
  });
  const body = (await res.json().catch(() => null)) as ApplyUpdateResponse | null;
  if (!res.ok || !body) {
    return {
      ok: false,
      status: await fetchAppUpdateStatus(false).then(
        (s) =>
          s ?? {
            currentVersion: snapshot.appVersion,
            currentCommit: null,
            branch: null,
            latestVersion: null,
            latestCommit: null,
            updateAvailable: false,
            updateMode: 'managed-refresh',
            canSelfUpdate: true,
            dirtyWorktree: false,
            checkedAt: Date.now(),
          }
      ),
      steps: [],
      needsReload: false,
      restarting: false,
      error: body?.error || `Update request failed (HTTP ${res.status})`,
    };
  }
  return body;
}

export async function acknowledgeUpdateReceipt(): Promise<void> {
  try {
    await fetch('/api/app/update/ack', { method: 'POST' });
  } catch {
    // ignore
  }
}
