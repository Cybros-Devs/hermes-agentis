import type { BackgroundTask } from '../types/hermes';

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
  label: 'Working' | 'Queued' | 'Paused' | 'Done';
  pulseState: 'thinking' | 'live' | 'idle';
  tone: 'amber' | 'emerald' | 'slate';
}

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

export function getTaskStatusDisplay(task: BackgroundTask): TaskStatusDisplay {
  if (task.status === 'running') {
    if (task.rawStatus === 'queued') {
      return { label: 'Queued', pulseState: 'thinking', tone: 'amber' };
    }
    return { label: 'Working', pulseState: 'thinking', tone: 'amber' };
  }
  if (task.status === 'paused') {
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
    if (task.status === 'completed') {
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
      if (idx === activeIdx) return { text: s.text, state: 'active' };
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

/**
 * Strictly scopes tasks to the given thread/channel category and orders them
 * with active running tasks first, followed by paused, then completed.
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
  const completed = scoped.filter((t) => t.status === 'completed').sort(byRecency);

  return {
    running,
    paused,
    completed,
    all: [...running, ...paused, ...completed],
  };
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
