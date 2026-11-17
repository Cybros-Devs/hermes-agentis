import { useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  Check,
  Download,
  ExternalLink,
  History,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import {
  parseImportedPreferencesJson,
  summarizePreservedCategories,
  type AppUpdateStatus,
  type PreferenceBackupSummary,
  type UpdateReceipt,
  type UpdateStepResult,
  type UserPreferencesSnapshot,
} from '../utils/settingsSnapshot';

interface UpdateCenterPanelProps {
  snapshot: UserPreferencesSnapshot;
  storageLabel: string;
  lastSyncedAt: number | null;
  updateStatus: AppUpdateStatus | null;
  checkingUpdate: boolean;
  applyingUpdate: boolean;
  updateSteps: UpdateStepResult[];
  updateError: string | null;
  backups: PreferenceBackupSummary[];
  busyBackup: boolean;
  onCheckUpdates: () => void;
  onApplyUpdate: () => void;
  onCreateBackup: () => void;
  onRestoreBackup: (backupId: string) => void;
  onImportSnapshot: (snapshot: UserPreferencesSnapshot) => void;
  onDismissReceipt: () => void;
}

function formatCompactTime(ts: number | null | undefined): string {
  if (!ts || !Number.isFinite(ts)) return 'just now';
  const d = new Date(ts);
  const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (diffSec < 15) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${String(
    d.getHours()
  ).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function ReceiptBanner({
  receipt,
  onDismiss,
}: {
  receipt: UpdateReceipt;
  onDismiss: () => void;
}) {
  return (
    <div
      data-testid="update-preserved-receipt"
      className="rounded-xl border border-white/15 bg-[#14171F] px-3.5 py-3 space-y-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-white/[0.06] border border-white/12 flex items-center justify-center shrink-0 mt-0.5">
            <ShieldCheck className="w-3.5 h-3.5 text-zinc-200" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-white">
              Updated cleanly — themes &amp; settings preserved
            </div>
            <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
              v{receipt.previousVersion} → v{receipt.newVersion}
              {receipt.backupId ? ` · backup ${receipt.backupId}` : ''}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          data-testid="update-receipt-dismiss"
          className="text-[11px] font-mono text-zinc-400 hover:text-white px-2 py-0.5 rounded-md hover:bg-white/[0.06] cursor-pointer shrink-0"
        >
          Dismiss
        </button>
      </div>
      {receipt.preservedCategories.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {receipt.preservedCategories.map((cat) => (
            <span
              key={cat}
              className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10.5px] text-zinc-200"
            >
              <Check className="w-2.5 h-2.5 text-emerald-400" />
              <span>{cat}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function UpdateCenterPanel({
  snapshot,
  storageLabel,
  lastSyncedAt,
  updateStatus,
  checkingUpdate,
  applyingUpdate,
  updateSteps,
  updateError,
  backups,
  busyBackup,
  onCheckUpdates,
  onApplyUpdate,
  onCreateBackup,
  onRestoreBackup,
  onImportSnapshot,
  onDismissReceipt,
}: UpdateCenterPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);

  const preservedCategories = useMemo(
    () => summarizePreservedCategories(snapshot),
    [snapshot]
  );

  const receipt = updateStatus?.pendingReceipt ?? null;
  const currentVersion = updateStatus?.currentVersion || snapshot.appVersion || '0.1.0';
  const hasUpstreamUpdate = Boolean(updateStatus?.updateAvailable);

  const handleExportJson = () => {
    const payload = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voxcell-settings-v${currentVersion}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseImportedPreferencesJson(text);
      if (!parsed) {
        setImportFeedback('Invalid Voxcell settings JSON file.');
        return;
      }
      setImportFeedback(null);
      onImportSnapshot(parsed);
    } catch {
      setImportFeedback('Unable to read the selected backup file.');
    }
  };

  return (
    <div data-testid="update-center-panel" className="space-y-3.5">
      {receipt && <ReceiptBanner receipt={receipt} onDismiss={onDismissReceipt} />}

      {/* Version & Click-to-Update Card */}
      <div className="rounded-xl border border-white/10 bg-[#14171F] p-3.5 space-y-3">
        <div className="flex flex-wrap sm:flex-nowrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-white">App Version</span>
              <span
                data-testid="update-current-version"
                className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/10 text-zinc-200 tabular-nums"
              >
                v{currentVersion}
                {updateStatus?.currentCommit ? ` · ${updateStatus.currentCommit}` : ''}
              </span>
              {hasUpstreamUpdate ? (
                <span className="font-mono text-[10.5px] px-2 py-0.5 rounded-md bg-amber-400/15 border border-amber-400/30 text-amber-200">
                  Update available
                  {updateStatus?.latestVersion ? ` · v${updateStatus.latestVersion}` : ''}
                </span>
              ) : (
                <span className="font-mono text-[10.5px] px-2 py-0.5 rounded-md bg-white/[0.05] border border-white/10 text-zinc-300">
                  {updateStatus ? 'Ready' : 'Checking…'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">
              {updateStatus?.updateMode === 'git-pull'
                ? `Git workspace${updateStatus.branch ? ` (${updateStatus.branch})` : ''} · snapshots themes & settings before pulling and rebuilding`
                : 'Snapshots your active theme, custom wallpapers, layout & workspace settings before applying update'}
            </p>
          </div>

          <button
            type="button"
            data-testid="check-updates-btn"
            disabled={checkingUpdate || applyingUpdate}
            onClick={onCheckUpdates}
            className="ui-tactile inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] px-2.5 py-1.5 text-[11.5px] font-medium text-zinc-200 hover:text-white disabled:opacity-45 cursor-pointer shrink-0 transition-colors"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${checkingUpdate ? 'motion-safe:animate-spin motion-safe-only' : ''}`}
            />
            <span>{checkingUpdate ? 'Checking…' : 'Check updates'}</span>
          </button>
        </div>

        {updateStatus?.releaseTitle && (
          <div className="rounded-lg border border-white/[0.08] bg-[#0D1016] px-3 py-2 text-[11px] flex items-center justify-between gap-2">
            <div className="min-w-0 truncate text-zinc-300">
              <span className="font-mono text-zinc-500 mr-1.5">Upstream:</span>
              <span>{updateStatus.releaseTitle}</span>
              {updateStatus.latestCommit ? (
                <span className="font-mono text-zinc-500 ml-1.5">({updateStatus.latestCommit})</span>
              ) : null}
            </div>
            {updateStatus.releaseUrl && (
              <a
                href={updateStatus.releaseUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono text-[10.5px] text-zinc-300 hover:text-white shrink-0"
              >
                <span>Notes</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        {updateStatus?.dirtyWorktree && (
          <div className="rounded-lg border border-amber-400/25 bg-amber-400/[0.07] px-3 py-2 text-[11px] text-amber-100">
            Local repository has uncommitted changes ({updateStatus.dirtyReason}). Commit or stash
            local edits before pulling via git — your settings backup still works anytime.
          </div>
        )}

        {updateError && (
          <div
            data-testid="update-error-banner"
            className="rounded-lg border border-rose-400/30 bg-rose-500/[0.09] px-3 py-2 text-[11px] text-rose-100"
          >
            {updateError}
          </div>
        )}

        {updateSteps.length > 0 && (
          <ul
            data-testid="update-steps-list"
            className="rounded-lg border border-white/[0.08] bg-[#0D1016] px-3 py-2 space-y-1.5"
          >
            {updateSteps.map((step) => (
              <li key={step.id} className="flex items-start gap-2 text-[11px]">
                <span
                  className={`mt-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 ${
                    step.status === 'failed'
                      ? 'bg-rose-500/20 text-rose-300'
                      : 'bg-emerald-400/15 text-emerald-300'
                  }`}
                >
                  <Check className="w-2.5 h-2.5" />
                </span>
                <div className="min-w-0">
                  <div className="text-zinc-200">{step.label}</div>
                  {step.detail && <div className="text-zinc-500 font-mono text-[10px]">{step.detail}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className="text-[11px] font-mono text-zinc-500">
            {updateStatus?.checkedAt ? `Checked ${formatCompactTime(updateStatus.checkedAt)}` : 'Checking status…'}
          </span>

          <button
            type="button"
            data-testid="apply-update-btn"
            disabled={applyingUpdate || (updateStatus?.dirtyWorktree ?? false)}
            onClick={onApplyUpdate}
            className="ui-accent-btn ui-tactile inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold hover:opacity-90 disabled:opacity-45 cursor-pointer transition-opacity"
          >
            <ArrowDownToLine
              className={`w-3.5 h-3.5 ${applyingUpdate ? 'motion-safe:animate-pulse motion-safe-only' : ''}`}
            />
            <span>
              {applyingUpdate
                ? 'Preserving settings & updating…'
                : hasUpstreamUpdate
                ? 'Update & Preserve Settings'
                : 'Apply Update & Verify Settings'}
            </span>
          </button>
        </div>
      </div>

      {/* Themes & Settings Shield Card */}
      <div className="rounded-xl border border-white/10 bg-[#14171F] p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="w-4 h-4 text-emerald-300 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white">Protected Settings Vault</div>
              <div className="text-[10.5px] font-mono text-zinc-400 truncate">
                {storageLabel} · synced {formatCompactTime(lastSyncedAt)}
              </div>
            </div>
          </div>
          <span className="text-[10.5px] font-mono text-emerald-300 shrink-0">Auto-preserved</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {preservedCategories.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-white/[0.07] bg-[#0D1016] px-2.5 py-2 flex items-start gap-2"
            >
              <Check
                className={`w-3 h-3 mt-0.5 shrink-0 ${
                  item.customized ? 'text-emerald-400' : 'text-zinc-500'
                }`}
              />
              <div className="min-w-0">
                <div className="text-[11.5px] font-medium text-zinc-100">{item.label}</div>
                <div className="text-[10.5px] font-mono text-zinc-400 truncate">{item.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Restore Points & Portable Backup */}
      <div className="rounded-xl border border-white/10 bg-[#14171F] p-3.5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <History className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-xs font-semibold text-white">Restore Points &amp; Portable Backup</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              data-testid="create-backup-btn"
              disabled={busyBackup || applyingUpdate}
              onClick={onCreateBackup}
              className="ui-tactile inline-flex items-center gap-1 rounded-lg border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] px-2.5 py-1 text-[11px] text-zinc-200 hover:text-white disabled:opacity-45 cursor-pointer"
            >
              <span>Save backup</span>
            </button>
            <button
              type="button"
              data-testid="export-settings-btn"
              onClick={handleExportJson}
              className="ui-tactile inline-flex items-center gap-1 rounded-lg border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] px-2.5 py-1 text-[11px] text-zinc-200 hover:text-white cursor-pointer"
            >
              <Download className="w-3 h-3" />
              <span>Export</span>
            </button>
            <button
              type="button"
              data-testid="import-settings-btn"
              onClick={() => fileInputRef.current?.click()}
              className="ui-tactile inline-flex items-center gap-1 rounded-lg border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] px-2.5 py-1 text-[11px] text-zinc-200 hover:text-white cursor-pointer"
            >
              <Upload className="w-3 h-3" />
              <span>Import</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              aria-label="Import settings backup JSON"
              onChange={(e) => void handleImportFile(e)}
              className="hidden"
            />
          </div>
        </div>

        {importFeedback && (
          <p className="text-[11px] text-rose-300">{importFeedback}</p>
        )}

        {backups.length === 0 ? (
          <p className="text-[11px] text-zinc-500">
            Pre-update restore points are saved automatically whenever you update or click Save backup.
          </p>
        ) : (
          <div
            data-testid="backups-list"
            className="rounded-lg border border-white/[0.07] bg-[#0D1016] divide-y divide-white/[0.06] overflow-hidden"
          >
            {backups.slice(0, 6).map((b) => (
              <div
                key={b.id}
                className="px-3 py-2 flex items-center justify-between gap-2 text-[11px]"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    aria-hidden="true"
                    className="w-2.5 h-2.5 rounded-sm border border-white/20 shrink-0"
                    style={{ backgroundColor: b.accentHex }}
                  />
                  <div className="min-w-0">
                    <div className="text-zinc-200 truncate">
                      <span className="font-medium capitalize">{b.accentPreset}</span>
                      <span className="text-zinc-500 mx-1.5">·</span>
                      <span className="font-mono text-zinc-400">{b.backgroundId}</span>
                      {b.customSlotCount > 0 && (
                        <span className="text-zinc-500 ml-1">
                          (+{b.customSlotCount} custom)
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[10px] text-zinc-500 truncate">
                      {b.reason} · v{b.appVersion} · {formatCompactTime(b.createdAt)}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  data-testid={`restore-backup-${b.id}`}
                  disabled={busyBackup || applyingUpdate}
                  onClick={() => onRestoreBackup(b.id)}
                  className="ui-tactile inline-flex items-center gap-1 rounded-md border border-white/12 bg-white/[0.05] hover:bg-white/[0.12] px-2 py-1 text-[10.5px] font-medium text-zinc-200 hover:text-white disabled:opacity-45 cursor-pointer shrink-0"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  <span>Restore</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
