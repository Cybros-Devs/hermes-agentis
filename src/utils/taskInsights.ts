import type {
  BackgroundTask,
  HermesAgentSession,
  TaskStepItem,
  TerminalEntry,
} from '../types/hermes';

export interface ResolvedTaskStep {
  text: string;
  state: 'done' | 'active' | 'pending';
}

export interface TaskStepBreakdown {
  steps: ResolvedTaskStep[];
  completedCount: number;
  totalCount: number;
  activeStepText: string;
  ratioLabel: string;
}

export interface ChannelTaskPartition {
  running: BackgroundTask[];
  paused: BackgroundTask[];
  completed: BackgroundTask[];
  all: BackgroundTask[];
}

export interface ChannelTaskSummary {
  channelId: string;
  runningCount: number;
  pausedCount: number;
  completedCount: number;
  isThinking: boolean;
  hasActiveTask: boolean;
  primaryTitle?: string;
  startedAtMs?: number;
}

export interface TaskStatusDisplay {
  label: 'Working' | 'Queued' | 'Waiting' | 'Paused' | 'Done' | 'Failed' | 'Cancelled';
  pulseState: 'thinking' | 'live' | 'idle';
  tone: 'amber' | 'emerald' | 'slate' | 'rose';
}

export type TaskConfirmationState = 'confirmed' | 'needs-confirm' | 'open';

/**
 * Formats an elapsed duration between createdAtMs and nowMs into a compact
 * monospace-friendly string (e.g. "42s", "4m 08s", "1h 07m").
 */
export function formatElapsedDuration(
  createdAtMs: number | undefined,
  nowMs: number,
  showSeconds = true
): string {
  if (!createdAtMs || !Number.isFinite(createdAtMs) || !Number.isFinite(nowMs)) {
    return '0s';
  }
  const totalSeconds = Math.max(0, Math.floor((nowMs - createdAtMs) / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalMinutes < 60) {
    return showSeconds
      ? `${totalMinutes}m ${String(seconds).padStart(2, '0')}s`
      : `${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

/** Formats epoch ms into HH:MM (24-hour clock). */
export function formatStartClock(createdAtMs: number | undefined): string {
  if (!createdAtMs || !Number.isFinite(createdAtMs)) return '';
  const d = new Date(createdAtMs);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function getTaskKindLabel(task: BackgroundTask): string {
  if (task.background === false) return 'In chat';
  return task.kind || 'Background';
}

export function getTaskConfirmationState(task: BackgroundTask): TaskConfirmationState {
  if (task.confirmedAtMs) return 'confirmed';
  if (task.status === 'completed' || task.rawStatus === 'done') {
    if (task.rawStatus === 'failed' || task.rawStatus === 'cancelled') return 'open';
    return 'needs-confirm';
  }
  return 'open';
}

export function getTaskConfirmationLabel(task: BackgroundTask): string {
  const state = getTaskConfirmationState(task);
  if (state === 'confirmed') return 'Confirmed by you';
  if (state === 'needs-confirm') return 'Looks done — confirm';
  return 'Open';
}

export function getTaskStatusDisplay(task: BackgroundTask): TaskStatusDisplay {
  if (task.rawStatus === 'failed') {
    return { label: 'Failed', pulseState: 'idle', tone: 'rose' };
  }
  if (task.rawStatus === 'cancelled') {
    return { label: 'Cancelled', pulseState: 'idle', tone: 'slate' };
  }
  if (task.status === 'running') {
    if (task.rawStatus === 'queued') {
      return { label: 'Queued', pulseState: 'thinking', tone: 'amber' };
    }
    return { label: 'Working', pulseState: 'thinking', tone: 'amber' };
  }
  if (task.status === 'paused') {
    if (task.rawStatus === 'waiting') {
      return { label: 'Waiting', pulseState: 'idle', tone: 'amber' };
    }
    return { label: 'Paused', pulseState: 'idle', tone: 'slate' };
  }
  return { label: 'Done', pulseState: 'live', tone: 'emerald' };
}

/**
 * Builds a structured step checklist and progress ratio from a task's steps,
 * progressLabel (e.g. "0/6"), or fallback lastStep.
 */
export function resolveTaskStepBreakdown(task: BackgroundTask): TaskStepBreakdown {
  const rawSteps = task.steps ?? [];
  if (rawSteps.length > 0) {
    if (task.status === 'completed' && task.rawStatus !== 'failed' && task.rawStatus !== 'cancelled') {
      const steps: ResolvedTaskStep[] = rawSteps.map((s) => ({
        text: s.text,
        state: 'done',
      }));
      return {
        steps,
        completedCount: steps.length,
        totalCount: steps.length,
        activeStepText: task.lastStep || steps[steps.length - 1]?.text || task.title,
        ratioLabel: `${steps.length}/${steps.length}`,
      };
    }

    const explicitActiveIdx = rawSteps.findIndex((s) => s.active && !s.done);
    const firstPendingIdx = rawSteps.findIndex((s) => !s.done);
    const activeIdx = explicitActiveIdx >= 0 ? explicitActiveIdx : firstPendingIdx;

    const steps: ResolvedTaskStep[] = rawSteps.map((s, idx) => {
      if (s.done) return { text: s.text, state: 'done' };
      if (idx === activeIdx && task.rawStatus !== 'cancelled') {
        return { text: s.text, state: 'active' };
      }
      return { text: s.text, state: 'pending' };
    });

    const completedCount = steps.filter((s) => s.state === 'done').length;
    const totalCount = steps.length;
    const activeStepText =
      (activeIdx >= 0 ? steps[activeIdx]?.text : undefined) ||
      task.lastStep ||
      task.title;

    return {
      steps,
      completedCount,
      totalCount,
      activeStepText,
      ratioLabel: `${completedCount}/${totalCount}`,
    };
  }

  const fracMatch = task.progressLabel?.match(/^(\d+)\s*\/\s*(\d+)$/);
  const fallbackText = task.lastStep || task.title;
  const fallbackState: ResolvedTaskStep['state'] =
    task.status === 'completed'
      ? 'done'
      : task.status === 'running'
      ? 'active'
      : 'pending';

  return {
    steps: [{ text: fallbackText, state: fallbackState }],
    completedCount: fracMatch ? Number(fracMatch[1]) : task.status === 'completed' ? 1 : 0,
    totalCount: fracMatch ? Math.max(1, Number(fracMatch[2])) : 1,
    activeStepText: fallbackText,
    ratioLabel: fracMatch ? `${fracMatch[1]}/${fracMatch[2]}` : `${Math.round(task.progress)}%`,
  };
}

export interface TaskProgressInfo {
  pct: number;
  ratioLabel: string;
  isIndeterminate: boolean;
}

/**
 * Computes normalized 0..100 completion percentage, display ratio, and whether
 * a running task has 0% known progress (triggering an indeterminate fluid sweep).
 */
export function resolveTaskProgress(task: BackgroundTask): TaskProgressInfo {
  const breakdown = resolveTaskStepBreakdown(task);

  if (task.status === 'completed' && task.rawStatus !== 'failed' && task.rawStatus !== 'cancelled') {
    return {
      pct: 100,
      ratioLabel: breakdown.ratioLabel,
      isIndeterminate: false,
    };
  }

  let pct = Number.isFinite(task.progress) ? Math.max(0, Math.min(100, Math.round(task.progress))) : 0;
  if (breakdown.totalCount > 1 || (task.steps && task.steps.length > 0)) {
    const stepPct = Math.round((breakdown.completedCount / Math.max(1, breakdown.totalCount)) * 100);
    if (stepPct > 0 || pct === 0) {
      pct = stepPct;
    }
  }

  return {
    pct,
    ratioLabel: breakdown.ratioLabel,
    isIndeterminate: task.status === 'running' && pct === 0,
  };
}

/**
 * Strictly scopes tasks to the given thread/channel category and orders them
 * with active running tasks first, followed by paused/waiting, then completed
 * (unconfirmed "needs-confirm" before confirmed).
 */
export function partitionChannelTasks(
  tasks: BackgroundTask[],
  channelId: string
): ChannelTaskPartition {
  const scoped = tasks.filter((t) => t.channelId === channelId);
  const byRecency = (a: BackgroundTask, b: BackgroundTask) =>
    (b.updatedAtMs ?? b.createdAtMs ?? 0) - (a.updatedAtMs ?? a.createdAtMs ?? 0);

  const running = scoped.filter((t) => t.status === 'running').sort(byRecency);
  const paused = scoped.filter((t) => t.status === 'paused').sort(byRecency);
  const completed = scoped
    .filter((t) => t.status === 'completed')
    .sort((a, b) => {
      const aNeeds = getTaskConfirmationState(a) === 'needs-confirm' ? 0 : 1;
      const bNeeds = getTaskConfirmationState(b) === 'needs-confirm' ? 0 : 1;
      if (aNeeds !== bNeeds) return aNeeds - bNeeds;
      return byRecency(a, b);
    });

  return {
    running,
    paused,
    completed,
    all: [...running, ...paused, ...completed],
  };
}

export interface ThreadTasksSummary {
  totalCount: number;
  runningCount: number;
  pausedCount: number;
  needsConfirmCount: number;
  confirmedCount: number;
  headerBadge: string;
}

/**
 * Computes concise task summary metrics and single-line badge text for the
 * Thread right sidebar header and status-bar toggle.
 */
export function summarizeThreadTasks(
  partition: ChannelTaskPartition,
  activeIsThinking: boolean
): ThreadTasksSummary {
  const hasRunning = partition.running.length > 0;
  const totalCount = partition.all.length + (activeIsThinking && !hasRunning ? 1 : 0);
  const runningCount = partition.running.length + (activeIsThinking && !hasRunning ? 1 : 0);
  const pausedCount = partition.paused.length;
  let needsConfirmCount = 0;
  let confirmedCount = 0;
  for (const t of partition.completed) {
    const cState = getTaskConfirmationState(t);
    if (cState === 'needs-confirm') needsConfirmCount += 1;
    else if (cState === 'confirmed') confirmedCount += 1;
  }

  let headerBadge = '';
  if (runningCount > 0) {
    headerBadge = `${runningCount} active`;
  } else if (pausedCount > 0) {
    headerBadge = `${pausedCount} paused`;
  } else if (needsConfirmCount > 0) {
    headerBadge = `${needsConfirmCount} to confirm`;
  } else if (totalCount > 0) {
    headerBadge = `${totalCount} done`;
  }

  return {
    totalCount,
    runningCount,
    pausedCount,
    needsConfirmCount,
    confirmedCount,
    headerBadge,
  };
}

/**
 * Determines whether a task card should default to expanded when rendered inside
 * the dedicated Thread right sidebar (lead active running task expands cleanly).
 */
export function isTaskInitiallyExpanded(
  task: BackgroundTask,
  leadRunningTaskId: string | undefined,
  inSidebar: boolean
): boolean {
  if (!inSidebar) return false;
  return Boolean(leadRunningTaskId && task.id === leadRunningTaskId && task.status === 'running');
}

/**
 * Computes lightweight per-channel active-task metadata so the sidebar can
 * highlight which threads currently have active work without rendering task rows.
 */
export function summarizeChannelTaskActivity(
  tasks: BackgroundTask[],
  channels: Array<{ id: string }>,
  thinkingByChannel: Record<string, boolean> = {}
): Record<string, ChannelTaskSummary> {
  const map: Record<string, ChannelTaskSummary> = {};

  const ensure = (channelId: string): ChannelTaskSummary => {
    if (!map[channelId]) {
      map[channelId] = {
        channelId,
        runningCount: 0,
        pausedCount: 0,
        completedCount: 0,
        isThinking: Boolean(thinkingByChannel[channelId]),
        hasActiveTask: Boolean(thinkingByChannel[channelId]),
      };
    }
    return map[channelId];
  };

  for (const ch of channels) {
    ensure(ch.id);
  }
  for (const chId of Object.keys(thinkingByChannel)) {
    ensure(chId);
  }

  for (const task of tasks) {
    const entry = ensure(task.channelId);
    if (task.status === 'running') {
      entry.runningCount += 1;
      entry.hasActiveTask = true;
      if (!entry.primaryTitle) {
        entry.primaryTitle = task.title;
      }
      if (
        task.createdAtMs &&
        (entry.startedAtMs === undefined || task.createdAtMs < entry.startedAtMs)
      ) {
        entry.startedAtMs = task.createdAtMs;
      }
    } else if (task.status === 'paused') {
      entry.pausedCount += 1;
    } else {
      entry.completedCount += 1;
    }
  }

  return map;
}

export interface GenericTaskStep {
  text: string;
  done?: boolean;
  active?: boolean;
}

const TERMINAL_TOOL_DONE_STATUSES = new Set([
  'done',
  'completed',
  'complete',
  'finished',
  'finish',
  'success',
  'succeeded',
  'passed',
  'pass',
  'ok',
]);

const TERMINAL_TOOL_ERROR_STATUSES = new Set([
  'error',
  'failed',
  'cancelled',
  'canceled',
  'stopped',
]);

const VAGUE_PROMPT_TITLE_PATTERNS = new Set([
  'go',
  'yes',
  'yep',
  'ok',
  'okay',
  'sure',
  'continue',
  'next',
  'proceed',
  'try again',
  'retry',
  'check',
  'status',
  'what do you suggest',
  'what do you suggest?',
  'what should we do',
  'what should we do?',
  'any thoughts',
  'any thoughts?',
]);

/**
 * Derives a compact, human-readable task title from a user prompt while keeping
 * repository/URL targets legible inside narrow cards.
 */
export function deriveTurnTaskTitle(prompt: string, fallbackLabel?: string): string {
  const normalized = prompt
    .replace(/https?:\/\/(?:www\.)?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) {
    return fallbackLabel?.trim() || 'Active session turn';
  }
  if (normalized.length <= 64) {
    return normalized;
  }
  const clipped = normalized.slice(0, 61);
  const lastSpace = clipped.lastIndexOf(' ');
  const head = lastSpace > 36 ? clipped.slice(0, lastSpace) : clipped;
  return `${head.trimEnd()}…`;
}

/**
 * Resolves a clear display title for task cards: if a task was spawned from a
 * short conversational nudge (e.g. "go", "what do you suggest") and already has
 * descriptive tool steps or a result summary, promotes concise action context.
 */
export function resolveTaskDisplayTitle(task: BackgroundTask): string {
  const raw = (task.title || '').trim();
  if (!raw) return 'Active task';
  const normalizedLower = raw.toLowerCase().replace(/[.!?]+$/, '').trim();
  const isVague =
    VAGUE_PROMPT_TITLE_PATTERNS.has(raw.toLowerCase()) ||
    VAGUE_PROMPT_TITLE_PATTERNS.has(normalizedLower);

  if (!isVague) return raw;

  const candidateStep = (task.steps ?? [])
    .map((s) => s.text.trim())
    .find(
      (txt) =>
        txt.length > 0 &&
        !/^running\s+/i.test(txt) &&
        !isBootstrapOrComposingStep(txt) &&
        !/^completed response$/i.test(txt)
    );

  if (candidateStep) {
    return deriveTurnTaskTitle(candidateStep, raw);
  }
  if (task.lastStep && !/^running\s+/i.test(task.lastStep) && !isBootstrapOrComposingStep(task.lastStep)) {
    return deriveTurnTaskTitle(task.lastStep, raw);
  }
  return raw;
}

function isBootstrapOrComposingStep(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.startsWith('working in ') ||
    lower.startsWith('routing ') ||
    lower === 'composing response'
  );
}

function extractToolNeedleFromText(text: string): string {
  const trimmed = text.trim().toLowerCase();
  if (trimmed.startsWith('running ')) {
    return trimmed.slice('running '.length).split(/[\s:]/)[0] || '';
  }
  const colonIdx = trimmed.indexOf(':');
  if (colonIdx > 0 && colonIdx < 32) {
    return trimmed.slice(0, colonIdx).trim();
  }
  const dashIdx = trimmed.indexOf(' — ');
  if (dashIdx > 0 && dashIdx < 32) {
    return trimmed.slice(0, dashIdx).trim();
  }
  return trimmed.split(/\s+/)[0] || '';
}

/**
 * Updates a task's step checklist and ratio string when a tool-progress event
 * arrives from the Hermes Gateway (`hermes.tool.progress`).
 */
export function applyToolProgressToSteps(
  prevSteps: GenericTaskStep[],
  event: {
    toolName: string;
    label?: string;
    status: string;
    summary?: string;
  }
): { steps: GenericTaskStep[]; progress: string } {
  const normalizedStatus = (event.status || 'running').toLowerCase();
  const isDone = TERMINAL_TOOL_DONE_STATUSES.has(normalizedStatus);
  const isError = TERMINAL_TOOL_ERROR_STATUSES.has(normalizedStatus);
  const stepText = (event.summary || event.label || event.toolName || 'tool').trim();
  const toolNeedle = (event.toolName || '').trim().toLowerCase();
  const isGenericRunningPlaceholder = /^running\s+/i.test(stepText);

  const nextSteps: GenericTaskStep[] = prevSteps.map((s) => ({ ...s }));

  if (!isDone && !isError) {
    // If an earlier open step was merely a generic "Running <tool>" placeholder for this
    // same tool and we now have a concrete detail summary (e.g. "terminal: gh pr checks"),
    // upgrade that open placeholder in-place instead of creating a duplicate step.
    const upgradeIdx =
      !isGenericRunningPlaceholder && toolNeedle
        ? nextSteps.findIndex(
            (s) =>
              !s.done &&
              /^running\s+/i.test(s.text.trim()) &&
              extractToolNeedleFromText(s.text) === toolNeedle
          )
        : -1;

    if (upgradeIdx >= 0) {
      for (let i = 0; i < nextSteps.length; i++) {
        if (i !== upgradeIdx && !nextSteps[i].done && (nextSteps[i].active || isBootstrapOrComposingStep(nextSteps[i].text))) {
          nextSteps[i] = { ...nextSteps[i], done: true, active: false };
        }
      }
      nextSteps[upgradeIdx] = { text: stepText, done: false, active: true };
    } else {
      // New active tool invocation: settle prior active/bootstrap open step first.
      for (let i = 0; i < nextSteps.length; i++) {
        if (!nextSteps[i].done && (nextSteps[i].active || isBootstrapOrComposingStep(nextSteps[i].text))) {
          nextSteps[i] = { ...nextSteps[i], done: true, active: false };
        }
      }
      nextSteps.push({ text: stepText, done: false, active: true });
    }
  } else {
    // Terminal tool completion/failure: close the matching open step if present.
    let matchIdx = -1;
    for (let i = nextSteps.length - 1; i >= 0; i--) {
      if (nextSteps[i].done) continue;
      const lowerText = nextSteps[i].text.toLowerCase();
      if ((toolNeedle && lowerText.includes(toolNeedle)) || nextSteps[i].active) {
        matchIdx = i;
        break;
      }
    }
    if (matchIdx >= 0) {
      const existing = nextSteps[matchIdx];
      const preferNewText =
        !isGenericRunningPlaceholder &&
        (stepText.length > existing.text.length ||
          /^running\s+/i.test(existing.text.trim()));
      nextSteps[matchIdx] = {
        text: preferNewText ? stepText : existing.text,
        done: !isError,
        active: false,
      };
    } else {
      // Avoid appending a redundant generic "Running <tool>" step when finishing
      const last = nextSteps[nextSteps.length - 1];
      if (
        last &&
        !isGenericRunningPlaceholder &&
        /^running\s+/i.test(last.text.trim()) &&
        toolNeedle &&
        extractToolNeedleFromText(last.text) === toolNeedle
      ) {
        nextSteps[nextSteps.length - 1] = {
          text: stepText,
          done: !isError,
          active: false,
        };
      } else {
        nextSteps.push({ text: stepText, done: !isError, active: false });
      }
    }
  }

  const doneCount = nextSteps.filter((s) => s.done).length;
  return {
    steps: nextSteps,
    progress: `${doneCount}/${Math.max(1, nextSteps.length)}`,
  };
}

/**
 * Transitions a task into response-streaming phase once text deltas start arriving.
 */
export function applyStreamingDeltaToSteps(
  prevSteps: GenericTaskStep[]
): { steps: GenericTaskStep[]; progress: string; changed: boolean } {
  const last = prevSteps[prevSteps.length - 1];
  if (last && !last.done && last.active && last.text === 'Composing response') {
    const doneCount = prevSteps.filter((s) => s.done).length;
    return {
      steps: prevSteps,
      progress: `${doneCount}/${Math.max(1, prevSteps.length)}`,
      changed: false,
    };
  }

  const nextSteps: GenericTaskStep[] = prevSteps.map((s) =>
    !s.done ? { ...s, done: true, active: false } : { ...s, active: false }
  );
  nextSteps.push({ text: 'Composing response', done: false, active: true });
  const doneCount = nextSteps.filter((s) => s.done).length;
  return {
    steps: nextSteps,
    progress: `${doneCount}/${nextSteps.length}`,
    changed: true,
  };
}

/**
 * Settles a turn task's steps cleanly when the run finishes, fails, or aborts.
 */
export function finalizeTurnTaskSteps(
  prevSteps: GenericTaskStep[],
  outcome: 'done' | 'failed' | 'cancelled',
  finalLabel?: string
): { steps: GenericTaskStep[]; progress: string } {
  if (outcome === 'done') {
    const nextSteps: GenericTaskStep[] =
      prevSteps.length > 0
        ? prevSteps.map((s) => ({
            text:
              s.text.startsWith('Working in ') && finalLabel
                ? finalLabel
                : s.text,
            done: true,
            active: false,
          }))
        : [{ text: finalLabel || 'Completed response', done: true, active: false }];

    return {
      steps: nextSteps,
      progress: `${nextSteps.length}/${nextSteps.length}`,
    };
  }

  const nextSteps: GenericTaskStep[] = prevSteps.map((s) => ({
    ...s,
    active: false,
  }));
  if (finalLabel && !nextSteps.some((s) => s.text === finalLabel)) {
    nextSteps.push({ text: finalLabel, done: false, active: false });
  }
  const doneCount = nextSteps.filter((s) => s.done).length;
  return {
    steps: nextSteps,
    progress: `${doneCount}/${Math.max(1, nextSteps.length)}`,
  };
}

const ACTIVE_SESSION_STATUSES = new Set(['thinking', 'speaking', 'running']);

/**
 * Returns true if an activity TerminalEntry represents an in-flight tool or step
 * (not yet marked done/error/stopped).
 */
export function isActivityEntryRunning(entry: TerminalEntry): boolean {
  if (entry.role !== 'activity') return false;
  const status = entry.activityStatus?.trim().toLowerCase();
  if (status) {
    if (TERMINAL_TOOL_DONE_STATUSES.has(status) || TERMINAL_TOOL_ERROR_STATUSES.has(status)) {
      return false;
    }
    if (status === 'running' || status === 'queued' || status === 'thinking') {
      return true;
    }
  }
  return /^running\b/i.test(entry.text.trim());
}

/**
 * Inspects a channel's entries to detect whether the latest turn still has
 * active/unsettled tool trace activity (even if an earlier assistant preamble
 * was already emitted or the client rehydrated mid-run).
 */
export function extractTrailingTurnContext(entries: TerminalEntry[]): {
  hasActiveActivity: boolean;
  latestPrompt: string;
  latestPromptAtMs?: number;
  trailingActivities: TerminalEntry[];
  latestActivityBatch: TerminalEntry[];
} {
  let latestPrompt = '';
  let latestPromptAtMs: number | undefined;
  let lastSettledAssistantIdx = -1;
  let lastUserIdx = -1;

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.role === 'user' || e.role === 'command') {
      lastUserIdx = i;
      if (!e.text.trim().startsWith('/')) {
        latestPrompt = e.text.trim();
        latestPromptAtMs = e.createdAtMs;
      }
    } else if (e.role === 'hermes' && !e.streaming) {
      lastSettledAssistantIdx = i;
    }
  }

  const trailingStart = Math.max(lastSettledAssistantIdx + 1, lastUserIdx + 1);
  const trailingActivities = entries
    .slice(trailingStart)
    .filter((e) => e.role === 'activity');

  const hasActiveActivity = trailingActivities.some((e) => isActivityEntryRunning(e));

  // Also capture the most recent contiguous/turn activity batch for channels
  // that ran tools but have no persisted server task record.
  let batchStart = lastUserIdx >= 0 ? lastUserIdx + 1 : 0;
  if (batchStart >= entries.length) batchStart = 0;
  const latestActivityBatch = entries
    .slice(batchStart)
    .filter((e) => e.role === 'activity');

  return {
    hasActiveActivity,
    latestPrompt,
    latestPromptAtMs,
    trailingActivities,
    latestActivityBatch,
  };
}

/**
 * Collapses redundant generic "Running <tool>" placeholder entries when a
 * concrete or completed step for that same tool appears immediately beside it
 * (common when gateways emit separate start + result progress frames).
 */
export function dedupeActivityEntries(activities: TerminalEntry[]): TerminalEntry[] {
  const result: TerminalEntry[] = [];
  for (const entry of activities) {
    const trimmed = entry.text.trim();
    const isGenericRunning = /^running\s+/i.test(trimmed);
    const needle = extractToolNeedleFromText(trimmed);

    if (result.length > 0 && needle) {
      const prev = result[result.length - 1];
      const prevTrimmed = prev.text.trim();
      const prevIsGenericRunning = /^running\s+/i.test(prevTrimmed);
      const prevNeedle = extractToolNeedleFromText(prevTrimmed);

      // Case 1: previous was "Running <tool>" placeholder and current is "<tool>: <detail>" -> upgrade in-place
      if (prevIsGenericRunning && prevNeedle === needle && !isGenericRunning) {
        result[result.length - 1] = entry;
        continue;
      }
      // Case 2: previous was an unsettled "<tool>: <detail>" and trailing generic "Running <tool>" arrived -> skip dupe
      if (
        !prevIsGenericRunning &&
        isGenericRunning &&
        prevNeedle === needle &&
        prev.activityStatus !== 'done'
      ) {
        continue;
      }
    }
    result.push(entry);
  }
  return result;
}

function buildStepsFromActivities(
  activities: TerminalEntry[],
  sessionId: string,
  stillRunning: boolean
): TaskStepItem[] {
  const deduped = dedupeActivityEntries(activities);
  if (deduped.length === 0) {
    return [
      {
        text: `Working in ${sessionId}`,
        done: !stillRunning,
        active: stillRunning,
      },
    ];
  }

  const steps: TaskStepItem[] = [];
  for (let i = 0; i < deduped.length; i++) {
    const entry = deduped[i];
    const isLast = i === deduped.length - 1;
    const running = stillRunning && isLast && (isActivityEntryRunning(entry) || !entry.activityStatus);
    const done = !running;
    steps.push({
      text: entry.text.trim() || 'Tool activity',
      done,
      active: running,
    });
  }
  return steps;
}

/**
 * Ensures every thread/session that is actively thinking, running tools, or
 * carrying unsettled activity traces surfaces a live task in that thread —
 * even on dynamically created Home/Canvas sessions or when connected to a
 * gateway stream that emits activity items without explicit task records.
 */
export function mergeTasksWithSessionActivity(params: {
  tasks: BackgroundTask[];
  entries: TerminalEntry[];
  sessions?: HermesAgentSession[];
  thinkingByChannel?: Record<string, boolean>;
  channels?: Array<{ id: string; name?: string; sessionId?: string; description?: string }>;
  confirmedTaskIds?: ReadonlySet<string>;
}): BackgroundTask[] {
  const {
    tasks,
    entries,
    sessions = [],
    thinkingByChannel = {},
    channels = [],
    confirmedTaskIds,
  } = params;

  const runningChannels = new Set<string>();
  const channelsWithTasks = new Set<string>();
  for (const t of tasks) {
    channelsWithTasks.add(t.channelId);
    if (t.status === 'running') {
      runningChannels.add(t.channelId);
    }
  }

  const entriesByChannel = new Map<string, TerminalEntry[]>();
  for (const e of entries) {
    const list = entriesByChannel.get(e.channelId);
    if (list) list.push(e);
    else entriesByChannel.set(e.channelId, [e]);
  }

  const sessionByChannel = new Map<string, HermesAgentSession>();
  for (const s of sessions) {
    sessionByChannel.set(s.channelId, s);
  }

  const channelMetaMap = new Map<
    string,
    { id: string; name?: string; sessionId?: string; description?: string }
  >();
  for (const c of channels) {
    channelMetaMap.set(c.id, c);
  }

  const candidateChannels = new Set<string>([
    ...Object.keys(thinkingByChannel).filter((k) => Boolean(thinkingByChannel[k])),
    ...sessions
      .filter((s) => ACTIVE_SESSION_STATUSES.has(s.status))
      .map((s) => s.channelId),
    ...entriesByChannel.keys(),
  ]);

  const synthetic: BackgroundTask[] = [];

  for (const channelId of candidateChannels) {
    if (runningChannels.has(channelId)) continue;

    const chEntries = entriesByChannel.get(channelId) ?? [];
    const session = sessionByChannel.get(channelId);
    const meta = channelMetaMap.get(channelId);
    const ctx = extractTrailingTurnContext(chEntries);

    const isSessionBusy = Boolean(
      thinkingByChannel[channelId] ||
        (session && ACTIVE_SESSION_STATUSES.has(session.status)) ||
        ctx.hasActiveActivity
    );

    const sessionId = session?.sessionId || meta?.sessionId || `hermes-${channelId}`;
    const title = deriveTurnTaskTitle(
      ctx.latestPrompt || session?.lastMessage || meta?.description || '',
      `#${meta?.name || channelId}`
    );

    if (isSessionBusy) {
      const sourceActivities =
        ctx.trailingActivities.length > 0 ? ctx.trailingActivities : ctx.latestActivityBatch;
      const steps = buildStepsFromActivities(sourceActivities, sessionId, true);
      const doneCount = steps.filter((s) => s.done).length;
      const pct = Math.round((doneCount / Math.max(1, steps.length)) * 100);
      const activeStep = [...steps].reverse().find((s) => s.active) ?? steps[steps.length - 1];
      const createdAtMs =
        ctx.latestPromptAtMs ??
        sourceActivities[0]?.createdAtMs ??
        session?.updatedAtMs ??
        Date.now();
      const updatedAtMs =
        sourceActivities[sourceActivities.length - 1]?.createdAtMs ??
        session?.updatedAtMs ??
        createdAtMs;

      synthetic.push({
        id: `live-turn-${channelId}`,
        channelId,
        sessionId,
        kind: 'In chat',
        background: false,
        title,
        status: 'running',
        rawStatus: 'running',
        progress: pct,
        progressLabel: `${doneCount}/${steps.length}`,
        lastStep: activeStep?.text || `Working in ${sessionId}`,
        steps,
        createdAtMs,
        updatedAtMs,
        updatedAt: formatStartClock(updatedAtMs) || 'live',
      });
      continue;
    }

    // If a thread has tool activity in its transcript but no server task record at all,
    // surface the completed tool run as a thread task so tool work is never invisible.
    if (!channelsWithTasks.has(channelId) && ctx.latestActivityBatch.length > 0) {
      const steps = buildStepsFromActivities(ctx.latestActivityBatch, sessionId, false);
      const createdAtMs =
        ctx.latestPromptAtMs ?? ctx.latestActivityBatch[0]?.createdAtMs ?? Date.now();
      const updatedAtMs =
        ctx.latestActivityBatch[ctx.latestActivityBatch.length - 1]?.createdAtMs ?? createdAtMs;
      const taskId = `trace-turn-${channelId}`;
      const confirmedAtMs = confirmedTaskIds?.has(taskId) ? updatedAtMs : undefined;

      synthetic.push({
        id: taskId,
        channelId,
        sessionId,
        kind: 'In chat',
        background: false,
        title,
        status: 'completed',
        rawStatus: 'done',
        progress: 100,
        progressLabel: `${steps.length}/${steps.length}`,
        lastStep: steps[steps.length - 1]?.text || 'Completed tool run',
        steps,
        agentDoneAtMs: updatedAtMs,
        confirmedAtMs,
        createdAtMs,
        updatedAtMs,
        updatedAt: formatStartClock(updatedAtMs) || 'done',
      });
    }
  }

  return synthetic.length > 0 ? [...tasks, ...synthetic] : tasks;
}


