import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  CornerDownRight,
  Minus,
  PanelRight,
  PanelRightClose,
  Pause,
  Play,
  SendHorizontal,
  Square,
  Undo2,
  X,
} from 'lucide-react';
import type { BackgroundTask, ChannelId } from '../types/hermes';
import {
  formatElapsedDuration,
  formatTaskOutcomeSnippet,
  getTaskConfirmationLabel,
  getTaskConfirmationState,
  getTaskKindLabel,
  getTaskStatusDisplay,
  isTaskInitiallyExpanded,
  partitionChannelTasks,
  resolveTaskDisplayTitle,
  resolveTaskProgress,
  resolveTaskStepBreakdown,
  summarizeThreadTaskAggregate,
  summarizeThreadTasks,
} from '../utils/taskInsights';
import { AnimatedCollapsible, StatusPulse, getStaggerVars } from './ui';

type TaskFilterTab = 'all' | 'active' | 'done';

interface ThreadTaskWidgetProps {
  activeChannel: ChannelId;
  activeSessionId: string;
  tasks: BackgroundTask[];
  activeIsThinking: boolean;
  workingSeconds: number;
  isOpen: boolean;
  onToggleOpen: () => void;
  onHide: () => void;
  onToggleTaskStatus?: (id: string) => void;
  onConfirmTask?: (id: string) => void;
  onReopenTask?: (id: string) => void;
  onCancelTask?: (id: string) => void;
  onClearCompleted?: (channelId: ChannelId) => void;
  onSteerTask?: (id: string, text: string) => Promise<void> | void;
  onStopSpeaking?: () => void;
  variant?: 'thread-trigger' | 'mobile-trigger' | 'thread-inline' | 'thread-sidebar';
  sidebarMode?: boolean;
}

interface TaskProgressTrackProps {
  pct: number;
  tone: 'amber' | 'emerald' | 'slate' | 'rose';
  isRunning?: boolean;
  isIndeterminate?: boolean;
  stepCount?: number;
  label: string;
  compact?: boolean;
  testId?: string;
}

function TaskProgressTrack({
  pct,
  tone,
  isRunning = false,
  isIndeterminate = false,
  stepCount = 1,
  label,
  compact = false,
  testId,
}: TaskProgressTrackProps) {
  const clampedPct = Math.max(0, Math.min(100, Math.round(pct)));

  const fillStyle =
    tone === 'emerald'
      ? {
          background:
            'linear-gradient(90deg, rgba(var(--ui-accent-rgb), 0.78), var(--ui-accent), var(--ui-accent-soft))',
        }
      : undefined;

  const fillClass =
    tone === 'amber'
      ? isRunning
        ? 'bg-gradient-to-r from-amber-500/80 via-amber-400 to-amber-200'
        : 'bg-amber-300/75'
      : tone === 'rose'
      ? 'bg-gradient-to-r from-rose-500/85 to-rose-400'
      : tone === 'slate'
      ? 'bg-emerald-100/35'
      : '';

  const textTone =
    tone === 'amber' && isRunning
      ? 'text-amber-200'
      : tone === 'emerald'
      ? 'text-[#6EE7B7]'
      : tone === 'rose'
      ? 'text-rose-300'
      : 'text-emerald-100/60';

  const tickPositions =
    !compact && !isIndeterminate && stepCount >= 2 && stepCount <= 12
      ? Array.from({ length: stepCount - 1 }, (_, i) => ((i + 1) / stepCount) * 100)
      : [];

  return (
    <div className="flex items-center gap-2.5">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={isIndeterminate ? undefined : clampedPct}
        data-testid={testId}
        className="relative flex-1 h-1.5 rounded-full bg-white/[0.07] overflow-hidden"
      >
        {isIndeterminate ? (
          <div
            style={fillStyle}
            className={`ui-progress-indeterminate h-full w-full rounded-full ${fillClass}`}
          />
        ) : (
          <div
            className={`ui-progress-fill relative h-full w-full origin-left rounded-full overflow-hidden ${fillClass} ${
              clampedPct === 0 ? 'opacity-0' : ''
            }`}
            style={{
              ...fillStyle,
              transform: `scaleX(${clampedPct / 100})`,
            }}
          >
            {isRunning && clampedPct > 0 && clampedPct < 100 && (
              <div
                aria-hidden="true"
                className="ui-progress-flow absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/35 to-transparent"
              />
            )}
          </div>
        )}

        {tickPositions.map((leftPct, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 w-px bg-[#050C0A]/70"
            style={{ left: `${leftPct}%` }}
          />
        ))}
      </div>

      <span className={`font-mono tabular-nums shrink-0 text-[10.5px] font-medium ${textTone}`}>
        {isIndeterminate ? 'Live' : `${clampedPct}%`}
      </span>
    </div>
  );
}

export function ThreadTaskBanner({
  activeChannel,
  activeSessionId,
  tasks,
  activeIsThinking,
  workingSeconds,
  isOpen,
  onToggleOpen,
  onHide,
  onToggleTaskStatus,
  onConfirmTask,
  onReopenTask,
  onCancelTask,
  onClearCompleted,
  onSteerTask,
  onStopSpeaking,
  variant = 'thread-inline',
  sidebarMode = false,
}: ThreadTaskWidgetProps) {
  const partition = useMemo(
    () => partitionChannelTasks(tasks, activeChannel),
    [tasks, activeChannel]
  );

  const summary = useMemo(
    () => summarizeThreadTasks(partition, activeIsThinking),
    [partition, activeIsThinking]
  );

  const aggregate = useMemo(
    () => summarizeThreadTaskAggregate(partition, activeIsThinking),
    [partition, activeIsThinking]
  );

  const hasRunningTask = partition.running.length > 0;
  const needsConfirmCount = summary.needsConfirmCount;

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const [filterTab, setFilterTab] = useState<TaskFilterTab>('all');
  const [steerTargetId, setSteerTargetId] = useState<string | null>(null);
  const [steerDraft, setSteerDraft] = useState('');
  const [steerPending, setSteerPending] = useState(false);
  const [steerError, setSteerError] = useState<string | null>(null);
  const steerInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setNowMs(Date.now());
    if (!hasRunningTask) return;
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [hasRunningTask, activeChannel]);

  // Reset transient filter / steer states cleanly on channel change.
  useEffect(() => {
    setFilterTab('all');
    setSteerTargetId(null);
    setSteerDraft('');
    setSteerError(null);
    setSteerPending(false);
  }, [activeChannel]);

  useEffect(() => {
    if (steerTargetId) {
      window.setTimeout(() => steerInputRef.current?.focus(), 25);
    }
  }, [steerTargetId]);

  const activeAndPaused = useMemo(
    () => [...partition.running, ...partition.paused],
    [partition.running, partition.paused]
  );

  const totalCount = summary.totalCount;
  const runningLead = partition.running[0];
  const leadTask = runningLead ?? partition.paused[0] ?? partition.completed[0];
  const leadProgress = useMemo(() => (leadTask ? resolveTaskProgress(leadTask) : null), [leadTask]);

  const triggerPulseState: 'thinking' | 'live' | 'idle' =
    hasRunningTask || activeIsThinking
      ? 'thinking'
      : needsConfirmCount > 0
      ? 'live'
      : 'idle';

  const triggerLabel = hasRunningTask
    ? `${partition.running.length} active`
    : activeIsThinking
    ? 'Working'
    : partition.paused.length > 0
    ? `${partition.paused.length} paused`
    : needsConfirmCount > 0
    ? `${needsConfirmCount} to confirm`
    : `${partition.all.length}`;

  if (variant === 'mobile-trigger') {
    const mobileBadge =
      leadProgress && !leadProgress.isIndeterminate && partition.all.length > 0
        ? `${leadProgress.pct}%`
        : String(totalCount);

    return (
      <button
        type="button"
        data-testid="mobile-thread-tasks-toggle"
        aria-expanded={isOpen}
        aria-controls="inline-thread-tasks-panel"
        aria-label={
          isOpen
            ? `Hide tasks for #${activeChannel}`
            : `Show tasks for #${activeChannel} (${totalCount})`
        }
        onClick={onToggleOpen}
        className={`ui-tactile inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-[11px] tabular-nums transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
          isOpen
            ? 'bg-[#34D399]/14 text-[#6EE7B7]'
            : hasRunningTask || activeIsThinking
            ? 'bg-amber-400/10 text-amber-200 hover:bg-amber-400/18'
            : needsConfirmCount > 0
            ? 'bg-[#34D399]/12 text-[#6EE7B7]'
            : 'text-emerald-100/70 hover:text-white hover:bg-white/[0.06]'
        }`}
      >
        <StatusPulse state={triggerPulseState} size="sm" />
        <span className="font-sans font-medium text-[11.5px]">Tasks</span>
        {totalCount > 0 && (
          <span
            className={
              hasRunningTask || activeIsThinking
                ? 'text-amber-300 font-semibold'
                : needsConfirmCount > 0
                ? 'text-[#6EE7B7] font-semibold'
                : 'text-emerald-100/50'
            }
          >
            ({mobileBadge})
          </span>
        )}
        <ChevronDown
          className={`w-3 h-3 opacity-70 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>
    );
  }

  if (variant === 'thread-trigger') {
    const summaryText =
      hasRunningTask || activeIsThinking
        ? `${triggerLabel}${
            leadProgress && !leadProgress.isIndeterminate && partition.all.length > 0
              ? ` · ${leadProgress.pct}%`
              : ''
          }`
        : partition.all.length > 0
        ? String(partition.all.length)
        : '';

    return (
      <button
        type="button"
        data-testid="thread-tasks-toggle"
        aria-expanded={isOpen}
        aria-controls={sidebarMode ? 'thread-tasks-sidebar' : 'inline-thread-tasks-panel'}
        aria-label={
          isOpen
            ? `Hide tasks sidebar for #${activeChannel}`
            : `Show tasks sidebar for #${activeChannel} (${totalCount})`
        }
        onClick={onToggleOpen}
        className={`ui-tactile inline-flex items-center gap-1 text-[11px] transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
          sidebarMode
            ? isOpen
              ? 'text-[#6EE7B7] underline underline-offset-4 decoration-[#34D399]/55'
              : hasRunningTask || activeIsThinking
              ? 'text-amber-200 hover:text-white'
              : 'text-emerald-100/55 hover:text-white'
            : isOpen
            ? 'text-[#6EE7B7]'
            : hasRunningTask || activeIsThinking
            ? 'text-amber-200 hover:text-white'
            : needsConfirmCount > 0
            ? 'text-[#6EE7B7] hover:text-white'
            : 'text-emerald-100/55 hover:text-white'
        }`}
      >
        {sidebarMode && (
          <PanelRight
            className={`w-3 h-3 transition-opacity ${isOpen ? 'opacity-95' : 'opacity-65'}`}
            aria-hidden="true"
          />
        )}
        <span>Tasks</span>
        {summaryText && (
          <span
            className={`font-mono tabular-nums ${
              hasRunningTask || activeIsThinking
                ? 'text-amber-300 font-semibold'
                : needsConfirmCount > 0 && isOpen
                ? 'text-[#6EE7B7] font-semibold'
                : isOpen
                ? 'text-[#6EE7B7]/85'
                : 'text-emerald-100/45'
            }`}
          >
            ({summaryText})
          </span>
        )}
        {!sidebarMode && (
          <ChevronDown
            className={`w-3 h-3 opacity-65 transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        )}
      </button>
    );
  }

  const isSidebar = variant === 'thread-sidebar';
  const liveActiveCount =
    activeAndPaused.length + (activeIsThinking && partition.running.length === 0 ? 1 : 0);
  const showFilterTabs = liveActiveCount > 0 && partition.completed.length > 0;
  const visibleActiveAndPaused = filterTab === 'done' ? [] : activeAndPaused;
  const visibleCompleted = filterTab === 'active' ? [] : partition.completed;
  const showLiveTurnCard =
    filterTab !== 'done' && partition.running.length === 0 && activeIsThinking;

  const submitSteer = async (taskId: string) => {
    const clean = steerDraft.trim();
    if (!clean || !onSteerTask || steerPending) return;
    setSteerPending(true);
    setSteerError(null);
    try {
      await onSteerTask(taskId, clean);
      setSteerDraft('');
      setSteerTargetId(null);
    } catch (err) {
      setSteerError(err instanceof Error ? err.message : 'Unable to send steer note.');
    } finally {
      setSteerPending(false);
    }
  };

  const renderTaskCards = () => (
    <>
      {partition.all.length === 0 && !activeIsThinking ? (
        <div
          data-testid="thread-tasks-empty"
          className={`rounded-xl border border-white/[0.08] bg-white/[0.015] px-3.5 py-3 space-y-2 ${
            isSidebar ? 'text-left' : ''
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12.5px] font-medium text-white/88">
                No tasks yet in #{activeChannel}
              </p>
              <p className="text-[11.5px] text-emerald-100/50 leading-relaxed mt-0.5">
                Tool calls, live turns, and background dispatches inside{' '}
                <span className="font-mono text-emerald-100/65">{activeSessionId}</span> stream
                here automatically.
              </p>
            </div>
            {!isSidebar && (
              <button
                type="button"
                data-testid="thread-tasks-hide"
                aria-label="Hide thread tasks"
                onClick={onHide}
                className="ui-tactile shrink-0 px-2 py-1 rounded-lg text-[11px] text-emerald-100/55 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                Hide
              </button>
            )}
          </div>
          <div className="pt-1.5 border-t border-white/[0.06] flex items-center gap-2 font-mono text-[10.5px] text-emerald-100/40">
            <CornerDownRight className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span>Try asking for a multi-step audit or run /brief</span>
          </div>
        </div>
      ) : (
        <>
          {/* Session Task Rollup Strip + Optional Active/Done Filter */}
          {aggregate.totalTasks > 0 && (
            <div
              data-testid="thread-tasks-rollup"
              className="pb-2.5 border-b border-white/[0.07] space-y-2"
            >
              <div className="flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums">
                <span className="text-emerald-100/55 truncate">
                  {aggregate.activeCount > 0
                    ? `${aggregate.activeCount} running`
                    : aggregate.pausedCount > 0
                    ? `${aggregate.pausedCount} waiting`
                    : `${aggregate.completedCount} settled`}
                  {aggregate.pausedCount > 0 && aggregate.activeCount > 0
                    ? ` · ${aggregate.pausedCount} waiting`
                    : ''}
                  {aggregate.completedCount > 0 && aggregate.activeCount + aggregate.pausedCount > 0
                    ? ` · ${aggregate.completedCount} done`
                    : ''}
                </span>
                <span className="text-emerald-100/75 shrink-0">
                  {aggregate.totalTasks} {aggregate.totalTasks === 1 ? 'task' : 'tasks'}
                </span>
              </div>

              <TaskProgressTrack
                compact
                pct={aggregate.aggregatePct}
                tone={
                  aggregate.activeCount > 0
                    ? 'amber'
                    : aggregate.failedCount > 0 && aggregate.failedCount === aggregate.completedCount
                    ? 'rose'
                    : 'emerald'
                }
                isRunning={aggregate.activeCount > 0}
                isIndeterminate={aggregate.activeCount > 0 && aggregate.aggregatePct === 0}
                label={`Overall progress for #${activeChannel}`}
                testId="thread-tasks-aggregate-progress"
              />

              {showFilterTabs && (
                <div
                  role="tablist"
                  aria-label="Filter thread tasks"
                  className="flex items-center gap-3 pt-0.5 text-[11px]"
                >
                  {(
                    [
                      { id: 'all', label: `All (${aggregate.totalTasks})` },
                      { id: 'active', label: `Active (${liveActiveCount})` },
                      { id: 'done', label: `Done (${partition.completed.length})` },
                    ] as const
                  ).map((tab) => {
                    const active = filterTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setFilterTab(tab.id)}
                        className={`relative pb-1 font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          active
                            ? 'text-white'
                            : 'text-emerald-100/45 hover:text-emerald-100/80'
                        }`}
                      >
                        {tab.label}
                        {active && (
                          <span
                            aria-hidden="true"
                            style={{ backgroundColor: 'var(--ui-accent)' }}
                            className="absolute inset-x-0 bottom-0 h-[1.5px] rounded-full"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Live foreground turn indicator when active without a persisted background task record */}
          {showLiveTurnCard && (
            <div
              data-testid="thread-live-turn-card"
              className="ui-card-enter rounded-xl bg-white/[0.03] border border-amber-400/25 px-3 py-2.5 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums">
                  <StatusPulse state="thinking" size="sm" />
                  <span className="text-amber-200 font-medium">Working</span>
                  <span aria-hidden="true" className="text-emerald-100/25">·</span>
                  <span className="text-emerald-100/60">{workingSeconds}s</span>
                  <span aria-hidden="true" className="text-emerald-100/25">·</span>
                  <span className="text-emerald-100/45">In chat</span>
                </div>
                {onStopSpeaking && (
                  <button
                    type="button"
                    onClick={onStopSpeaking}
                    className="ui-tactile inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.05] border border-white/10 text-[11px] text-emerald-50 hover:bg-white/10 transition-colors cursor-pointer shrink-0"
                  >
                    <Square className="w-2.5 h-2.5 fill-current" />
                    <span>Stop</span>
                  </button>
                )}
              </div>

              <TaskProgressTrack
                compact
                pct={0}
                tone="amber"
                isRunning
                isIndeterminate
                label={`Active turn in ${activeSessionId}`}
                testId="thread-live-turn-progress"
              />
            </div>
          )}

          {/* Running, Queued, Waiting & Paused Tasks */}
          {visibleActiveAndPaused.map((task) => {
            const isRunning = task.status === 'running';
            const expandKey = `${task.id}:${task.createdAtMs ?? 0}`;
            const isExpanded =
              expandedMap[expandKey] ??
              isTaskInitiallyExpanded(task, runningLead?.id, isSidebar);
            const breakdown = resolveTaskStepBreakdown(task);
            const progressInfo = resolveTaskProgress(task);
            const statusDisplay = getTaskStatusDisplay(task);
            const displayTitle = resolveTaskDisplayTitle(task);
            const kindLabel = getTaskKindLabel(task);
            const isLiveStreamingTurn =
              task.background === false ||
              task.id.startsWith('task-turn-') ||
              task.id.startsWith('live-turn-');
            const canPause = Boolean(onToggleTaskStatus) && !isLiveStreamingTurn;
            const canSteer = Boolean(onSteerTask);
            const isSteeringThis = steerTargetId === task.id;
            const elapsed = formatElapsedDuration(task.createdAtMs, nowMs);

            return (
              <div
                key={task.id}
                data-testid={`thread-task-card-${task.id}`}
                data-status={task.status}
                className={`ui-card-enter rounded-xl border transition-colors duration-200 px-3 py-2.5 space-y-2 ${
                  isRunning
                    ? 'bg-white/[0.03] border-amber-300/25 hover:border-amber-300/40'
                    : 'bg-white/[0.02] border-white/[0.09] hover:border-white/[0.16]'
                }`}
              >
                {/* Header Row + Quick Controls */}
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() =>
                      setExpandedMap((prev) => ({
                        ...prev,
                        [expandKey]: !isExpanded,
                      }))
                    }
                    className="flex-1 min-w-0 text-left group cursor-pointer focus:outline-none focus-visible:underline"
                  >
                    <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums whitespace-nowrap min-w-0">
                      <StatusPulse state={statusDisplay.pulseState} size="sm" />
                      <span
                        className={`shrink-0 ${
                          statusDisplay.tone === 'amber'
                            ? 'text-amber-300 font-medium'
                            : statusDisplay.tone === 'emerald'
                            ? 'text-[#6EE7B7] font-medium'
                            : 'text-emerald-100/65'
                        }`}
                      >
                        {statusDisplay.label}
                      </span>
                      <span aria-hidden="true" className="text-emerald-100/25 shrink-0">·</span>
                      <span className="text-white/85 shrink-0">{breakdown.ratioLabel}</span>
                      <span aria-hidden="true" className="text-emerald-100/25 shrink-0">·</span>
                      <span
                        data-testid={`thread-task-elapsed-${task.id}`}
                        className={`shrink-0 ${isRunning ? 'text-amber-200/80' : 'text-emerald-100/50'}`}
                      >
                        {elapsed}
                      </span>
                    </div>

                    <h3
                      title={displayTitle !== task.title ? `Prompt: ${task.title}` : undefined}
                      className="mt-1 text-[13px] font-medium text-white group-hover:text-emerald-50 leading-snug break-words"
                    >
                      {displayTitle}
                    </h3>
                  </button>

                  <div className="flex items-center gap-0.5 shrink-0 -mr-1">
                    {canPause && (
                      <button
                        type="button"
                        onClick={() => onToggleTaskStatus?.(task.id)}
                        aria-label={isRunning ? `Pause ${displayTitle}` : `Resume ${displayTitle}`}
                        title={isRunning ? 'Pause task' : 'Resume task'}
                        className="ui-tactile w-6 h-6 rounded-md text-emerald-100/60 hover:text-white hover:bg-white/[0.07] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                      >
                        {isRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                      </button>
                    )}
                    {canSteer && (
                      <button
                        type="button"
                        data-testid={`thread-task-steer-btn-${task.id}`}
                        onClick={() => {
                          setSteerError(null);
                          setSteerDraft('');
                          setSteerTargetId((prev) => (prev === task.id ? null : task.id));
                        }}
                        aria-expanded={isSteeringThis}
                        aria-label={`Steer ${displayTitle}`}
                        title="Send follow-up steer instruction"
                        className={`ui-tactile w-6 h-6 rounded-md flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                          isSteeringThis
                            ? 'bg-[#34D399]/18 text-[#6EE7B7]'
                            : 'text-emerald-100/50 hover:text-white hover:bg-white/[0.07]'
                        }`}
                      >
                        <CornerDownRight className="w-3 h-3" />
                      </button>
                    )}
                    {onCancelTask && (
                      <button
                        type="button"
                        onClick={() => onCancelTask(task.id)}
                        aria-label={
                          isLiveStreamingTurn ? `Stop ${displayTitle}` : `Cancel ${displayTitle}`
                        }
                        title={isLiveStreamingTurn ? 'Stop active run' : 'Cancel task'}
                        className="ui-tactile w-6 h-6 rounded-md text-emerald-100/45 hover:text-rose-300 hover:bg-white/[0.07] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                      >
                        {isLiveStreamingTurn ? (
                          <Square className="w-2.5 h-2.5 fill-current" />
                        ) : (
                          <X className="w-3 h-3" />
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={isExpanded ? `Collapse ${displayTitle}` : `Expand ${displayTitle}`}
                      aria-expanded={isExpanded}
                      onClick={() =>
                        setExpandedMap((prev) => ({
                          ...prev,
                          [expandKey]: !isExpanded,
                        }))
                      }
                      className="ui-tactile w-6 h-6 rounded-md text-emerald-100/50 hover:text-white hover:bg-white/[0.07] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                    >
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Progress Track + Collapsed Active Step Preview */}
                <div className="space-y-1.5">
                  <TaskProgressTrack
                    pct={progressInfo.pct}
                    tone={statusDisplay.tone}
                    isRunning={isRunning}
                    isIndeterminate={progressInfo.isIndeterminate}
                    stepCount={breakdown.totalCount}
                    label={`${task.title} progress`}
                    testId={`thread-task-progress-${task.id}`}
                  />
                  {!isExpanded && breakdown.activeStepText && (
                    <p className="text-[11.5px] text-emerald-100/65 truncate">
                      {breakdown.activeStepText}
                    </p>
                  )}
                </div>

                {/* Inline Steer Composer */}
                {isSteeringThis && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submitSteer(task.id);
                    }}
                    className="ui-pop-in pt-1 space-y-1.5"
                  >
                    <div className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/35 px-2 py-1 focus-within:border-[#34D399]/65 transition-colors">
                      <label htmlFor={`steer-input-${task.id}`} className="sr-only">
                        Steer instruction for {displayTitle}
                      </label>
                      <input
                        id={`steer-input-${task.id}`}
                        ref={steerInputRef}
                        type="text"
                        value={steerDraft}
                        disabled={steerPending}
                        onChange={(e) => setSteerDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setSteerTargetId(null);
                            setSteerDraft('');
                          }
                        }}
                        placeholder="Redirect or append step…"
                        className="flex-1 min-w-0 bg-transparent text-[11.5px] text-white placeholder:text-emerald-100/40 focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={steerPending || !steerDraft.trim()}
                        aria-label="Send steer instruction"
                        className="ui-tactile w-6 h-6 rounded-md bg-[#34D399] text-[#05140E] hover:bg-[#6EE7B7] disabled:opacity-40 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                      >
                        <SendHorizontal className="w-3 h-3" />
                      </button>
                    </div>
                    {steerError && (
                      <p className="text-[11px] text-rose-300/90 leading-snug">{steerError}</p>
                    )}
                  </form>
                )}

                {/* Expandable Step Timeline */}
                <AnimatedCollapsible open={isExpanded}>
                  <ul
                    className="relative space-y-1.5 pl-0.5 pt-1"
                    aria-label="Task steps"
                  >
                    {breakdown.steps.map((step, stepIdx) => {
                      const isStepActive = step.state === 'active';
                      const isStepDone = step.state === 'done';
                      const isLast = stepIdx === breakdown.steps.length - 1;
                      return (
                        <li
                          key={`${task.id}-step-${stepIdx}`}
                          style={getStaggerVars(stepIdx)}
                          className={`ui-stagger-enter relative flex items-start gap-2 text-[11.5px] leading-snug rounded-lg transition-colors ${
                            isStepActive
                              ? 'bg-amber-400/[0.08] px-2 py-1 -mx-2'
                              : 'py-0.5'
                          }`}
                        >
                          {!isLast && (
                            <span
                              aria-hidden="true"
                              className={`absolute top-3.5 bottom-[-6px] w-px ${
                                isStepActive ? 'left-[13.5px]' : 'left-[5.5px]'
                              } ${isStepDone ? 'bg-[#34D399]/25' : 'bg-white/10'}`}
                            />
                          )}
                          <span
                            aria-hidden="true"
                            className={`relative z-10 mt-0.5 shrink-0 w-3 h-3 rounded-full flex items-center justify-center ${
                              isStepDone
                                ? 'bg-[#34D399]/16 text-[#34D399]'
                                : isStepActive
                                ? 'bg-amber-400/20'
                                : 'bg-white/[0.06]'
                            }`}
                          >
                            {isStepDone ? (
                              <Check className="w-2 h-2 text-[#34D399]" />
                            ) : isStepActive ? (
                              <StatusPulse
                                state={isRunning ? 'thinking' : 'idle'}
                                size="sm"
                              />
                            ) : (
                              <span className="w-1 h-1 rounded-full bg-white/30" />
                            )}
                          </span>
                          <span
                            className={
                              isStepActive
                                ? 'text-white font-medium'
                                : isStepDone
                                ? 'text-emerald-100/70'
                                : 'text-emerald-100/42'
                            }
                          >
                            {step.text}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="pt-1.5 flex items-center justify-between gap-2 font-mono text-[10px] text-emerald-100/40 tabular-nums">
                    <span>{kindLabel}</span>
                    {task.sessionId && <span className="truncate">{task.sessionId}</span>}
                  </div>
                </AnimatedCollapsible>
              </div>
            );
          })}

          {/* Settled History Header & Single-Elevation Divided List */}
          {visibleCompleted.length > 0 && (
            <div className="space-y-2 pt-1">
              <div
                className={`flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-100/40 tabular-nums ${
                  visibleActiveAndPaused.length > 0 || showLiveTurnCard ? 'pt-1' : ''
                }`}
              >
                <span>Settled · {visibleCompleted.length}</span>
                {onClearCompleted && summary.confirmedCount > 0 && (
                  <button
                    type="button"
                    data-testid="thread-tasks-clear-done"
                    onClick={() => onClearCompleted(activeChannel)}
                    className="ui-tactile text-[10px] font-mono uppercase tracking-[0.1em] text-emerald-100/45 hover:text-white transition-colors cursor-pointer"
                  >
                    Clear confirmed
                  </button>
                )}
              </div>

              <div className="rounded-xl border border-white/[0.08] bg-white/[0.015] divide-y divide-white/[0.07] overflow-hidden">
                {visibleCompleted.map((task) => {
                  const breakdown = resolveTaskStepBreakdown(task);
                  const progressInfo = resolveTaskProgress(task);
                  const statusDisplay = getTaskStatusDisplay(task);
                  const confirmState = getTaskConfirmationState(task);
                  const confirmLabel = getTaskConfirmationLabel(task);
                  const displayTitle = resolveTaskDisplayTitle(task);
                  const outcomeSnippet = formatTaskOutcomeSnippet(task);
                  const kindLabel = getTaskKindLabel(task);
                  const expandKey = `${task.id}:${task.createdAtMs ?? 0}`;
                  const runtime = formatElapsedDuration(
                    task.createdAtMs,
                    task.updatedAtMs ?? nowMs
                  );
                  const isExpanded = expandedMap[expandKey] ?? false;
                  const isFailed = task.rawStatus === 'failed';
                  const isCancelled =
                    task.rawStatus === 'cancelled' || task.rawStatus === 'interrupted';

                  return (
                    <div
                      key={task.id}
                      data-testid={`thread-task-card-${task.id}`}
                      data-status={task.rawStatus ?? task.status}
                      data-confirm-state={confirmState}
                      className={`px-3 py-2.5 space-y-2 transition-colors duration-150 ${
                        confirmState === 'needs-confirm'
                          ? 'bg-[#34D399]/[0.03] hover:bg-[#34D399]/[0.045]'
                          : 'hover:bg-white/[0.02]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          onClick={() =>
                            setExpandedMap((prev) => ({ ...prev, [expandKey]: !isExpanded }))
                          }
                          className="flex-1 min-w-0 text-left cursor-pointer focus:outline-none focus-visible:underline"
                        >
                          <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums whitespace-nowrap min-w-0">
                            <StatusPulse state={statusDisplay.pulseState} size="sm" />
                            <span
                              className={`shrink-0 ${
                                statusDisplay.tone === 'rose'
                                  ? 'text-rose-300 font-medium'
                                  : statusDisplay.tone === 'amber'
                                  ? 'text-amber-300 font-medium'
                                  : statusDisplay.tone === 'slate'
                                  ? 'text-emerald-100/55'
                                  : 'text-[#6EE7B7] font-medium'
                              }`}
                            >
                              {statusDisplay.label}
                            </span>
                            <span aria-hidden="true" className="text-emerald-100/25 shrink-0">·</span>
                            <span className="text-emerald-100/70 shrink-0">{breakdown.ratioLabel}</span>
                            <span aria-hidden="true" className="text-emerald-100/25 shrink-0">·</span>
                            <span className="text-emerald-100/45 shrink-0">{runtime}</span>
                          </div>
                          <h3
                            title={
                              displayTitle !== task.title ? `Prompt: ${task.title}` : undefined
                            }
                            className="mt-1 text-[13px] font-medium text-white leading-snug break-words"
                          >
                            {displayTitle}
                          </h3>
                        </button>

                        <button
                          type="button"
                          aria-label={
                            isExpanded ? `Collapse ${displayTitle}` : `Expand ${displayTitle}`
                          }
                          aria-expanded={isExpanded}
                          onClick={() =>
                            setExpandedMap((prev) => ({ ...prev, [expandKey]: !isExpanded }))
                          }
                          className="ui-tactile w-6 h-6 -mr-1 rounded-md text-emerald-100/50 hover:text-white hover:bg-white/[0.06] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                        >
                          <ChevronDown
                            className={`w-3.5 h-3.5 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                      </div>

                      <TaskProgressTrack
                        compact
                        pct={progressInfo.pct}
                        tone={statusDisplay.tone}
                        isRunning={false}
                        stepCount={breakdown.totalCount}
                        label={`${task.title} progress`}
                        testId={`thread-task-progress-${task.id}`}
                      />

                      {!isExpanded && (outcomeSnippet || breakdown.steps.length > 0) && (
                        <p
                          className={`text-[11px] truncate ${
                            isFailed ? 'text-rose-200/80' : 'text-emerald-100/52'
                          }`}
                        >
                          {outcomeSnippet || breakdown.steps[breakdown.steps.length - 1]?.text}
                        </p>
                      )}

                      <AnimatedCollapsible open={isExpanded}>
                        <div className="space-y-2 pt-1">
                          {outcomeSnippet && (
                            <p
                              className={`text-[11.5px] leading-relaxed rounded-lg px-2.5 py-1.5 ${
                                isFailed
                                  ? 'bg-rose-500/[0.08] text-rose-100/90'
                                  : 'bg-white/[0.035] text-emerald-100/78'
                              }`}
                            >
                              {outcomeSnippet}
                            </p>
                          )}

                          <ul
                            className="relative space-y-1.5 pl-0.5"
                            aria-label="Completed task steps"
                          >
                            {breakdown.steps.map((step, i) => {
                              const isLast = i === breakdown.steps.length - 1;
                              const stepDone = step.state === 'done';
                              return (
                                <li
                                  key={`${task.id}-done-step-${i}`}
                                  style={getStaggerVars(i)}
                                  className="ui-stagger-enter relative flex items-start gap-2 text-[11.5px] text-emerald-100/68 leading-snug py-0.5"
                                >
                                  {!isLast && (
                                    <span
                                      aria-hidden="true"
                                      className={`absolute left-[5.5px] top-3.5 bottom-[-6px] w-px ${
                                        stepDone
                                          ? 'bg-[#34D399]/22'
                                          : isFailed
                                          ? 'bg-rose-400/22'
                                          : 'bg-white/10'
                                      }`}
                                    />
                                  )}
                                  <span
                                    aria-hidden="true"
                                    className={`relative z-10 mt-0.5 shrink-0 w-3 h-3 rounded-full flex items-center justify-center ${
                                      stepDone
                                        ? 'bg-[#34D399]/16 text-[#34D399]'
                                        : isFailed
                                        ? 'bg-rose-500/20 text-rose-300'
                                        : 'bg-white/[0.08] text-emerald-100/50'
                                    }`}
                                  >
                                    {stepDone ? (
                                      <Check className="w-2 h-2 text-[#34D399]" />
                                    ) : isFailed ? (
                                      <X className="w-2 h-2 text-rose-300" />
                                    ) : isCancelled ? (
                                      <Minus className="w-2 h-2 text-emerald-100/60" />
                                    ) : (
                                      <span className="w-1 h-1 rounded-full bg-white/30" />
                                    )}
                                  </span>
                                  <span
                                    className={
                                      stepDone
                                        ? 'text-emerald-100/72'
                                        : isFailed
                                        ? 'text-rose-200/85'
                                        : 'text-emerald-100/45'
                                    }
                                  >
                                    {step.text}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                          <div className="pt-1 flex items-center justify-between gap-2 font-mono text-[10px] text-emerald-100/38 tabular-nums">
                            <span>{kindLabel}</span>
                            {task.sessionId && <span className="truncate">{task.sessionId}</span>}
                          </div>
                        </div>
                      </AnimatedCollapsible>

                      {/* Operator Confirmation Row */}
                      {confirmState !== 'open' && (
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                          <span
                            className={`text-[11px] font-mono ${
                              confirmState === 'needs-confirm'
                                ? 'text-amber-200/90'
                                : 'text-[#6EE7B7]'
                            }`}
                          >
                            {confirmLabel}
                          </span>
                          {confirmState === 'needs-confirm' && onConfirmTask && (
                            <button
                              type="button"
                              onClick={() => onConfirmTask(task.id)}
                              className="ui-tactile inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#34D399] text-[#05140E] font-semibold text-[11.5px] hover:bg-[#6EE7B7] transition-colors cursor-pointer whitespace-nowrap"
                            >
                              <Check className="w-3 h-3" />
                              <span>Mark done</span>
                            </button>
                          )}
                          {confirmState === 'confirmed' && onReopenTask && (
                            <button
                              type="button"
                              onClick={() => onReopenTask(task.id)}
                              className="ui-tactile inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/[0.05] border border-white/10 text-[11px] text-emerald-100/75 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                            >
                              <Undo2 className="w-3 h-3" />
                              <span>Undo</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );

  if (isSidebar) {
    if (!isOpen) return null;

    return (
      <aside
        id="thread-tasks-sidebar"
        aria-label={`Tasks for #${activeChannel}`}
        data-testid="thread-tasks-sidebar"
        data-channel={activeChannel}
        className="flex flex-col h-full min-h-0 w-[312px] xl:w-[328px] shrink-0 border-l border-white/[0.06] bg-white/[0.015] ui-drawer-enter"
      >
        <div className="px-3.5 pt-3 pb-2.5 border-b border-white/[0.06] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0 font-mono text-[10px] uppercase tracking-[0.14em] tabular-nums">
            <span className="text-emerald-100/45">Tasks</span>
            {summary.headerBadge && (
              <>
                <span aria-hidden="true" className="text-emerald-100/20">·</span>
                <span
                  className={
                    summary.runningCount > 0
                      ? 'text-amber-300/90'
                      : summary.needsConfirmCount > 0
                      ? 'text-[#6EE7B7]'
                      : 'text-emerald-100/50'
                  }
                >
                  {summary.headerBadge}
                </span>
              </>
            )}
          </div>

          <button
            type="button"
            data-testid="thread-tasks-hide"
            aria-label="Hide tasks sidebar"
            title="Hide tasks sidebar"
            onClick={onHide}
            className="ui-tactile w-7 h-7 -mr-1 rounded-lg text-emerald-100/45 hover:text-white hover:bg-white/[0.06] flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <PanelRightClose className="w-3.5 h-3.5" />
          </button>
        </div>

        <div
          data-testid="thread-task-banner"
          data-channel={activeChannel}
          className="flex-1 min-h-0 overflow-y-auto cyber-scroll px-3 py-3 space-y-2.5"
        >
          {renderTaskCards()}
        </div>
      </aside>
    );
  }

  // Mobile (< lg): compact inline tasks drawer
  if (!isOpen) {
    return null;
  }

  return (
    <section
      id="inline-thread-tasks-panel"
      aria-label={`Tasks for #${activeChannel}`}
      data-testid="thread-task-banner"
      data-channel={activeChannel}
      className="ui-msg-enter w-full space-y-2.5"
    >
      <div className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-100/45 tabular-nums">
        <span>Tasks {summary.headerBadge ? `· ${summary.headerBadge}` : ''}</span>
        <div className="flex items-center gap-2">
          {onClearCompleted && summary.confirmedCount > 0 && (
            <button
              type="button"
              onClick={() => onClearCompleted(activeChannel)}
              className="text-[10px] text-emerald-100/45 hover:text-white transition-colors cursor-pointer"
            >
              Clear confirmed
            </button>
          )}
          <button
            type="button"
            data-testid="thread-tasks-hide"
            aria-label="Hide thread tasks"
            onClick={onHide}
            className="text-[10px] text-emerald-100/55 hover:text-white transition-colors cursor-pointer"
          >
            Hide
          </button>
        </div>
      </div>
      {renderTaskCards()}
    </section>
  );
}
