import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  PanelRight,
  PanelRightClose,
  Pause,
  Play,
  Square,
  Undo2,
  X,
} from 'lucide-react';
import type { BackgroundTask, ChannelId } from '../types/hermes';
import {
  formatElapsedDuration,
  getTaskConfirmationLabel,
  getTaskConfirmationState,
  getTaskStatusDisplay,
  isTaskInitiallyExpanded,
  partitionChannelTasks,
  resolveTaskDisplayTitle,
  resolveTaskProgress,
  resolveTaskStepBreakdown,
  summarizeThreadTasks,
} from '../utils/taskInsights';
import { AnimatedCollapsible, StatusPulse, getStaggerVars } from './ui';

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
  const fillGradient =
    tone === 'amber'
      ? isRunning
        ? 'bg-gradient-to-r from-amber-500/80 via-amber-400 to-amber-300'
        : 'bg-amber-300/75'
      : tone === 'emerald'
      ? 'bg-gradient-to-r from-[#10B981]/80 via-[#34D399] to-[#6EE7B7]'
      : tone === 'rose'
      ? 'bg-gradient-to-r from-rose-500/80 to-rose-400'
      : 'bg-emerald-100/35';

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
            className={`ui-progress-indeterminate h-full w-full rounded-full ${fillGradient}`}
          />
        ) : (
          <div
            className={`ui-progress-fill relative h-full w-full origin-left rounded-full overflow-hidden ${fillGradient} ${
              clampedPct === 0 ? 'opacity-0' : ''
            }`}
            style={{
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
            className="pointer-events-none absolute inset-y-0 w-px bg-[#050C0A]/65"
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

  const hasRunningTask = partition.running.length > 0;
  const needsConfirmCount = summary.needsConfirmCount;

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setNowMs(Date.now());
    if (!hasRunningTask) return;
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [hasRunningTask, activeChannel]);

  const activeAndPaused = useMemo(
    () => [...partition.running, ...partition.paused],
    [partition.running, partition.paused]
  );

  const totalCount = summary.totalCount;
  const runningLead = partition.running[0];
  const leadTask = runningLead ?? partition.paused[0] ?? partition.completed[0];
  const leadProgress = useMemo(() => (leadTask ? resolveTaskProgress(leadTask) : null), [leadTask]);
  const runningElapsed = runningLead
    ? formatElapsedDuration(runningLead.createdAtMs, nowMs, false)
    : activeIsThinking
    ? `${workingSeconds}s`
    : '';

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

  const renderTaskCards = () => (
    <>
      {partition.all.length === 0 && !activeIsThinking ? (
        <div
          data-testid="thread-tasks-empty"
          className={`rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-3 flex items-start justify-between gap-3 ${
            isSidebar ? 'text-left' : ''
          }`}
        >
          <div className="min-w-0">
            <p className="text-[12.5px] font-medium text-white/85">
              No active tasks in #{activeChannel}
            </p>
            <p className="text-[11.5px] text-emerald-100/45 leading-relaxed mt-0.5">
              Dispatched runs and multi-step tool work in {activeSessionId} appear here.
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
      ) : (
        <>
          {/* Live foreground turn indicator when active without a persisted background task record */}
          {partition.running.length === 0 && activeIsThinking && (
            <div
              data-testid="thread-live-turn-card"
              className="ui-card-enter rounded-xl bg-white/[0.025] border border-amber-400/20 px-3.5 py-2.5 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px]">
                  <StatusPulse state="thinking" size="sm" />
                  <span className="text-amber-200 font-medium">Working</span>
                  <span aria-hidden="true" className="text-emerald-100/25">·</span>
                  <span className="font-mono text-emerald-100/60 tabular-nums">
                    {workingSeconds}s
                  </span>
                </div>
                {onStopSpeaking && (
                  <button
                    type="button"
                    onClick={onStopSpeaking}
                    className="ui-tactile inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/[0.05] border border-white/10 text-[11px] text-emerald-50 hover:bg-white/10 transition-colors cursor-pointer"
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
          {activeAndPaused.map((task) => {
            const isRunning = task.status === 'running';
            const expandKey = `${task.id}:${task.createdAtMs ?? 0}`;
            const isExpanded =
              expandedMap[expandKey] ??
              isTaskInitiallyExpanded(task, runningLead?.id, isSidebar);
            const breakdown = resolveTaskStepBreakdown(task);
            const progressInfo = resolveTaskProgress(task);
            const statusDisplay = getTaskStatusDisplay(task);
            const displayTitle = resolveTaskDisplayTitle(task);
            const isLiveStreamingTurn =
              task.background === false ||
              task.id.startsWith('task-turn-') ||
              task.id.startsWith('live-turn-');
            const canPause = Boolean(onToggleTaskStatus) && !isLiveStreamingTurn;
            const elapsed = formatElapsedDuration(task.createdAtMs, nowMs);

            return (
              <div
                key={task.id}
                data-testid={`thread-task-card-${task.id}`}
                data-status={task.status}
                className={`ui-card-enter rounded-xl border transition-colors duration-200 px-3 py-2.5 space-y-2 ${
                  isRunning
                    ? 'bg-white/[0.03] border-amber-300/22 hover:border-amber-300/35'
                    : 'bg-white/[0.02] border-white/10 hover:border-white/18'
                }`}
              >
                {/* Single Clean Header Row + Subtle Controls */}
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
                    className="flex-1 min-w-0 text-left group cursor-pointer focus:outline-none"
                  >
                    <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums whitespace-nowrap min-w-0 overflow-hidden">
                      <StatusPulse state={statusDisplay.pulseState} size="sm" />
                      <span
                        className={
                          statusDisplay.tone === 'amber'
                            ? 'text-amber-300 font-medium'
                            : statusDisplay.tone === 'emerald'
                            ? 'text-[#6EE7B7] font-medium'
                            : 'text-emerald-100/65'
                        }
                      >
                        {statusDisplay.label}
                      </span>
                      <span aria-hidden="true" className="text-emerald-100/25">·</span>
                      <span className="text-white/80">{breakdown.ratioLabel}</span>
                      <span aria-hidden="true" className="text-emerald-100/25">·</span>
                      <span
                        data-testid={`thread-task-elapsed-${task.id}`}
                        className={`truncate ${
                          isRunning ? 'text-amber-200/80' : 'text-emerald-100/50'
                        }`}
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
                        className="ui-tactile w-6 h-6 rounded-md text-emerald-100/60 hover:text-white hover:bg-white/[0.06] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                      >
                        {isRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                      </button>
                    )}
                    {onCancelTask && (
                      <button
                        type="button"
                        onClick={() => onCancelTask(task.id)}
                        aria-label={isLiveStreamingTurn ? `Stop ${displayTitle}` : `Cancel ${displayTitle}`}
                        title={isLiveStreamingTurn ? 'Stop active run' : 'Cancel task'}
                        className="ui-tactile w-6 h-6 rounded-md text-emerald-100/45 hover:text-rose-300 hover:bg-white/[0.06] flex items-center justify-center transition-colors cursor-pointer shrink-0"
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
                      className="ui-tactile w-6 h-6 rounded-md text-emerald-100/50 hover:text-white hover:bg-white/[0.06] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                    >
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Progress Track + Single-Line Current Step Preview */}
                <div className="space-y-1.5">
                  <TaskProgressTrack
                    compact
                    pct={progressInfo.pct}
                    tone={statusDisplay.tone}
                    isRunning={isRunning}
                    isIndeterminate={progressInfo.isIndeterminate}
                    stepCount={breakdown.totalCount}
                    label={`${task.title} progress`}
                    testId={`thread-task-progress-${task.id}`}
                  />
                  {!isExpanded && breakdown.activeStepText && (
                    <p className="text-[11.5px] text-emerald-100/60 truncate">
                      {breakdown.activeStepText}
                    </p>
                  )}
                </div>

                {/* Expandable Step Checklist */}
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
                              ? 'bg-amber-400/[0.07] px-2 py-1 -mx-2'
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
                                ? 'text-emerald-100/65'
                                : 'text-emerald-100/40'
                            }
                          >
                            {step.text}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </AnimatedCollapsible>
              </div>
            );
          })}

          {isSidebar && partition.completed.length > 0 && (
            <div
              className={`flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-100/35 tabular-nums ${
                activeAndPaused.length > 0
                  ? 'pt-2 pb-0.5 border-t border-white/[0.06]'
                  : 'pb-0.5'
              }`}
            >
              <span>Completed · {partition.completed.length}</span>
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
          )}

          {/* Completed / Finished Tasks with Operator Confirmation */}
          {partition.completed.map((task) => {
            const breakdown = resolveTaskStepBreakdown(task);
            const progressInfo = resolveTaskProgress(task);
            const statusDisplay = getTaskStatusDisplay(task);
            const confirmState = getTaskConfirmationState(task);
            const confirmLabel = getTaskConfirmationLabel(task);
            const displayTitle = resolveTaskDisplayTitle(task);
            const expandKey = `${task.id}:${task.createdAtMs ?? 0}`;
            const runtime = formatElapsedDuration(
              task.createdAtMs,
              task.updatedAtMs ?? nowMs
            );
            const isExpanded = expandedMap[expandKey] ?? false;

            return (
              <div
                key={task.id}
                data-testid={`thread-task-card-${task.id}`}
                data-status={task.rawStatus ?? task.status}
                data-confirm-state={confirmState}
                className={`ui-card-enter rounded-xl border transition-colors duration-200 px-3 py-2.5 space-y-2 ${
                  confirmState === 'needs-confirm'
                    ? 'bg-white/[0.025] border-[#34D399]/28 hover:border-[#34D399]/45'
                    : 'bg-white/[0.02] border-white/10 hover:border-white/18'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() =>
                      setExpandedMap((prev) => ({ ...prev, [expandKey]: !isExpanded }))
                    }
                    className="flex-1 min-w-0 text-left cursor-pointer focus:outline-none"
                  >
                    <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums whitespace-nowrap">
                      <StatusPulse state={statusDisplay.pulseState} size="sm" />
                      <span
                        className={
                          statusDisplay.tone === 'rose'
                            ? 'text-rose-300 font-medium'
                            : statusDisplay.tone === 'slate'
                            ? 'text-emerald-100/55'
                            : 'text-[#6EE7B7] font-medium'
                        }
                      >
                        {statusDisplay.label}
                      </span>
                      <span aria-hidden="true" className="text-emerald-100/25">·</span>
                      <span className="text-emerald-100/70">{breakdown.ratioLabel}</span>
                      <span aria-hidden="true" className="text-emerald-100/25">·</span>
                      <span className="text-emerald-100/45">{runtime}</span>
                    </div>
                    <h3
                      title={displayTitle !== task.title ? `Prompt: ${task.title}` : undefined}
                      className="mt-1 text-[13px] font-medium text-white leading-snug break-words"
                    >
                      {displayTitle}
                    </h3>
                  </button>

                  <button
                    type="button"
                    aria-label={isExpanded ? `Collapse ${displayTitle}` : `Expand ${displayTitle}`}
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

                {!isExpanded && breakdown.steps.length > 0 && (
                  <p
                    className={`text-[11px] truncate ${
                      statusDisplay.tone === 'rose'
                        ? 'text-rose-200/75'
                        : 'text-emerald-100/50'
                    }`}
                  >
                    {breakdown.steps[breakdown.steps.length - 1]?.text}
                  </p>
                )}

                <AnimatedCollapsible open={isExpanded}>
                  <ul className="relative space-y-1.5 pl-0.5 pt-1" aria-label="Completed task steps">
                    {breakdown.steps.map((step, i) => {
                      const isLast = i === breakdown.steps.length - 1;
                      return (
                        <li
                          key={`${task.id}-done-step-${i}`}
                          style={getStaggerVars(i)}
                          className="ui-stagger-enter relative flex items-start gap-2 text-[11.5px] text-emerald-100/65 leading-snug py-0.5"
                        >
                          {!isLast && (
                            <span
                              aria-hidden="true"
                              className="absolute left-[5.5px] top-3.5 bottom-[-6px] w-px bg-[#34D399]/20"
                            />
                          )}
                          <span
                            aria-hidden="true"
                            className="relative z-10 mt-0.5 shrink-0 w-3 h-3 rounded-full bg-[#34D399]/16 flex items-center justify-center"
                          >
                            <Check className="w-2 h-2 text-[#34D399]" />
                          </span>
                          <span>{step.text}</span>
                        </li>
                      );
                    })}
                  </ul>
                </AnimatedCollapsible>

                {/* Agent Done vs Operator Confirmed review bar */}
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
        className="flex flex-col h-full min-h-0 w-[284px] xl:w-[308px] shrink-0 border-l border-white/[0.06] bg-white/[0.015] ui-drawer-enter"
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

  // Mobile (< lg): slim header `Tasks` pill toggles drawer cleanly without clogging the chat transcript
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
