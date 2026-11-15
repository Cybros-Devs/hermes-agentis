import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Check,
  ChevronDown,
  EyeOff,
  ListTodo,
  Pause,
  Play,
  Send,
  Square,
  Undo2,
  X,
} from 'lucide-react';
import type { BackgroundTask, ChannelId } from '../types/hermes';
import {
  formatElapsedDuration,
  formatStartClock,
  getTaskConfirmationLabel,
  getTaskConfirmationState,
  getTaskKindLabel,
  getTaskStatusDisplay,
  partitionChannelTasks,
  resolveTaskStepBreakdown,
} from '../utils/taskInsights';
import { AnimatedCollapsible, StatusPulse } from './ui';

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
  onSteerTask?: (id: string, text: string) => Promise<void> | void;
  onStopSpeaking?: () => void;
  variant?: 'thread-trigger' | 'mobile-trigger' | 'thread-inline';
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
  onSteerTask,
  onStopSpeaking,
  variant = 'thread-inline',
}: ThreadTaskWidgetProps) {
  const partition = useMemo(
    () => partitionChannelTasks(tasks, activeChannel),
    [tasks, activeChannel]
  );

  const hasRunningTask = partition.running.length > 0;
  const needsConfirmCount = useMemo(
    () => partition.completed.filter((t) => getTaskConfirmationState(t) === 'needs-confirm').length,
    [partition.completed]
  );

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const [steerDrafts, setSteerDrafts] = useState<Record<string, string>>({});
  const [steeringId, setSteeringId] = useState<string | null>(null);

  // Tick every 1s while at least one task in the active thread is running.
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

  const totalCount = partition.all.length + (activeIsThinking && !hasRunningTask ? 1 : 0);
  const runningLead = partition.running[0];
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
    ? `${partition.running.length} working`
    : activeIsThinking
    ? `Working · ${workingSeconds}s`
    : partition.paused.length > 0
    ? `${partition.paused.length} waiting`
    : needsConfirmCount > 0
    ? `${needsConfirmCount} to confirm`
    : `${partition.all.length}`;

  if (variant === 'mobile-trigger') {
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
        className={`ui-tactile inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 font-mono text-[11px] tabular-nums transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
          isOpen
            ? 'bg-[#0C2119] border-[#34D399]/45 text-[#6EE7B7]'
            : hasRunningTask || activeIsThinking
            ? 'bg-[#07130F]/95 border-amber-400/35 text-amber-100 hover:border-amber-300/60'
            : needsConfirmCount > 0
            ? 'bg-[#07130F]/95 border-[#34D399]/35 text-emerald-100 hover:border-[#34D399]/55'
            : 'bg-[#07130F]/92 border-white/12 text-emerald-100/75 hover:text-white hover:border-white/25'
        }`}
      >
        <StatusPulse state={triggerPulseState} size="sm" />
        <ListTodo className="w-3.5 h-3.5 opacity-80" aria-hidden="true" />
        <span className="font-sans font-medium text-[11.5px] text-white/95">Tasks</span>
        <span
          className={
            hasRunningTask || activeIsThinking
              ? 'text-amber-300 font-semibold'
              : needsConfirmCount > 0
              ? 'text-[#6EE7B7] font-semibold'
              : 'text-emerald-100/55'
          }
        >
          ({totalCount})
        </span>
        <ChevronDown
          className={`w-3 h-3 text-emerald-100/60 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>
    );
  }

  if (variant === 'thread-trigger') {
    return (
      <button
        type="button"
        data-testid="thread-tasks-toggle"
        aria-expanded={isOpen}
        aria-controls="inline-thread-tasks-panel"
        aria-label={
          isOpen
            ? `Hide tasks for #${activeChannel}`
            : `Show tasks for #${activeChannel} (${totalCount})`
        }
        onClick={onToggleOpen}
        className={`ui-tactile inline-flex items-center gap-1.5 text-[11px] transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
          isOpen
            ? 'text-[#6EE7B7]'
            : hasRunningTask || activeIsThinking
            ? 'text-amber-200 hover:text-white'
            : needsConfirmCount > 0
            ? 'text-[#6EE7B7] hover:text-white'
            : 'text-emerald-100/60 hover:text-white'
        }`}
      >
        <ListTodo className="w-3 h-3 opacity-85" aria-hidden="true" />
        <span className="underline underline-offset-4 decoration-white/20">Tasks</span>
        <span
          className={`font-mono tabular-nums ${
            hasRunningTask || activeIsThinking
              ? 'text-amber-300 font-semibold'
              : needsConfirmCount > 0
              ? 'text-[#6EE7B7] font-semibold'
              : isOpen
              ? 'text-[#6EE7B7]'
              : 'text-emerald-100/50'
          }`}
        >
          ({triggerLabel}
          {runningElapsed && hasRunningTask ? ` · ${runningElapsed}` : ''})
        </span>
        <ChevronDown
          className={`w-3 h-3 opacity-70 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>
    );
  }

  // Inline Thread Timeline Variant — lives natively inside the Thread conversation stream
  const handleSteerSubmit = async (e: FormEvent, taskId: string) => {
    e.preventDefault();
    const text = (steerDrafts[taskId] ?? '').trim();
    if (!text || !onSteerTask) return;
    setSteeringId(taskId);
    try {
      await onSteerTask(taskId, text);
      setSteerDrafts((prev) => ({ ...prev, [taskId]: '' }));
    } finally {
      setSteeringId((prev) => (prev === taskId ? null : prev));
    }
  };

  const leadTask = runningLead ?? partition.paused[0] ?? partition.completed[0];

  // When collapsed: hide empty placeholder completely; collapse non-empty tasks down to a crisp 1-line thread node
  if (!isOpen) {
    if (partition.all.length === 0 && !activeIsThinking) {
      return null;
    }

    return (
      <div
        id="inline-thread-tasks-panel"
        data-testid="thread-task-banner"
        data-channel={activeChannel}
        className="ui-msg-enter max-w-[68ch] py-1"
      >
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={false}
          className="ui-tactile w-full min-h-[36px] flex items-center justify-between gap-3 text-left group cursor-pointer rounded-lg px-1 -mx-1 hover:bg-white/[0.03] transition-colors"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              aria-hidden="true"
              className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                hasRunningTask || activeIsThinking
                  ? 'border-amber-400/50 bg-amber-400/12 text-amber-300'
                  : needsConfirmCount > 0
                  ? 'border-[#34D399]/50 bg-[#34D399]/14 text-[#6EE7B7]'
                  : 'border-white/15 bg-white/[0.05] text-emerald-100/75'
              }`}
            >
              <StatusPulse state={triggerPulseState} size="sm" />
            </span>
            <span className="text-[13.5px] font-medium text-white truncate">
              {leadTask ? leadTask.title : 'Active turn'}
            </span>
            <span className="font-mono text-[11px] tabular-nums text-emerald-100/55 shrink-0 whitespace-nowrap">
              {triggerLabel}
              {runningElapsed && hasRunningTask ? ` · up ${runningElapsed}` : ''}
            </span>
          </div>
          <span className="inline-flex items-center gap-1 text-[11.5px] text-emerald-100/50 group-hover:text-white transition-colors shrink-0">
            <span>Show</span>
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
          </span>
        </button>
      </div>
    );
  }

  return (
    <section
      id="inline-thread-tasks-panel"
      aria-label={`Tasks for #${activeChannel}`}
      data-testid="thread-task-banner"
      data-channel={activeChannel}
      className="ui-msg-enter max-w-[68ch] py-1"
    >
      {/* Native Thread Timeline Header Node (matches ThreadTraceTree rhythm) */}
      <div className="flex items-center justify-between gap-2.5 min-h-[34px]">
        <button
          type="button"
          onClick={onHide}
          aria-expanded={true}
          className="ui-tactile flex-1 min-w-0 flex items-center gap-2.5 text-left group cursor-pointer rounded-lg px-1 -mx-1 py-1 hover:bg-white/[0.03] transition-colors"
        >
          <span
            aria-hidden="true"
            className={`w-6 h-6 rounded-full border flex items-center justify-center text-[11px] font-mono shrink-0 transition-colors ${
              hasRunningTask || activeIsThinking
                ? 'border-amber-400/50 bg-amber-400/12 text-amber-300'
                : partition.paused.length > 0
                ? 'border-amber-300/40 bg-amber-300/10 text-amber-200'
                : needsConfirmCount > 0 || partition.completed.length > 0
                ? 'border-[#34D399]/50 bg-[#34D399]/14 text-[#6EE7B7]'
                : 'border-white/15 bg-white/[0.05] text-emerald-100/75'
            }`}
          >
            {hasRunningTask || activeIsThinking
              ? '⠹'
              : partition.paused.length > 0
              ? '⏸'
              : partition.all.length > 0
              ? '✓'
              : '⠒'}
          </span>

          <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[13.5px] font-medium text-white whitespace-nowrap">
              {partition.all.length === 1 ? 'Thread task' : 'Thread tasks'}
            </span>
            <span aria-hidden="true" className="text-emerald-100/30 text-xs">·</span>
            <span className="font-mono text-[11px] text-[#6EE7B7] whitespace-nowrap">
              #{activeChannel}
            </span>
            <span aria-hidden="true" className="text-emerald-100/30 text-xs">·</span>
            <span
              className={`font-mono text-[11px] tabular-nums whitespace-nowrap ${
                hasRunningTask || activeIsThinking
                  ? 'text-amber-300'
                  : needsConfirmCount > 0
                  ? 'text-[#6EE7B7]'
                  : 'text-emerald-100/50'
              }`}
            >
              {partition.all.length === 0 && !activeIsThinking ? '0 active' : triggerLabel}
              {runningElapsed && hasRunningTask ? ` · up ${runningElapsed}` : ''}
            </span>
          </div>
        </button>

        <button
          type="button"
          data-testid="thread-tasks-hide"
          aria-label="Hide thread tasks"
          onClick={onHide}
          className="ui-tactile inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11.5px] text-emerald-100/55 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer shrink-0 whitespace-nowrap"
        >
          <EyeOff className="w-3 h-3" aria-hidden="true" />
          <span>Hide</span>
        </button>
      </div>

      {/* Vertical Timeline Branch inline inside the Thread stream */}
      <div className="ml-2 sm:ml-3 pl-3 sm:pl-4 border-l border-white/12 mt-1.5 sm:mt-2 space-y-3 sm:space-y-4 pb-1">
        {partition.all.length === 0 && !activeIsThinking ? (
          <div data-testid="thread-tasks-empty" className="py-1.5 space-y-1 max-w-[56ch]">
            <p className="text-[13.5px] font-medium text-white/85">
              No active tasks in #{activeChannel}
            </p>
            <p className="text-[12.5px] text-emerald-100/50 leading-relaxed">
              Background tasks, cron watchers, and long workflows dispatched from{' '}
              <span className="font-mono text-emerald-100/70">{activeSessionId}</span> stream inline here.
            </p>
          </div>
        ) : (
          <>
            {/* Live foreground turn indicator when active without a persisted background task record */}
            {partition.running.length === 0 && activeIsThinking && (
              <div
                data-testid="thread-live-turn-card"
                className="rounded-xl bg-white/[0.03] border border-amber-400/25 px-3.5 py-3 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums">
                    <StatusPulse state="thinking" size="sm" />
                    <span className="text-emerald-100/70">In chat</span>
                    <span aria-hidden="true" className="text-emerald-100/30">·</span>
                    <span className="text-amber-300 font-semibold">Working</span>
                    <span aria-hidden="true" className="text-emerald-100/30">·</span>
                    <span className="text-white/85">up {workingSeconds}s</span>
                  </div>
                  {onStopSpeaking && (
                    <button
                      type="button"
                      onClick={onStopSpeaking}
                      className="ui-tactile inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/12 text-[11px] font-medium text-emerald-50 hover:bg-white/12 transition-colors cursor-pointer"
                    >
                      <Square className="w-2.5 h-2.5 fill-current" />
                      <span>Stop</span>
                    </button>
                  )}
                </div>
                <p className="text-[13px] text-emerald-50/85">
                  Executing active turn in{' '}
                  <span className="font-mono text-[#6EE7B7]">{activeSessionId}</span>
                </p>
              </div>
            )}

            {/* Running, Queued, Waiting & Paused Tasks */}
            {activeAndPaused.map((task, idx) => {
              const isRunning = task.status === 'running';
              const isExpanded = expandedMap[task.id] ?? idx === 0;
              const breakdown = resolveTaskStepBreakdown(task);
              const statusDisplay = getTaskStatusDisplay(task);
              const kindLabel = getTaskKindLabel(task);
              const elapsed = formatElapsedDuration(task.createdAtMs, nowMs);
              const startedClock = formatStartClock(task.createdAtMs) || task.updatedAt;
              const progressPct = Math.max(0, Math.min(100, Math.round(task.progress)));

              return (
                <div
                  key={task.id}
                  data-testid={`thread-task-card-${task.id}`}
                  data-status={task.status}
                  className={`rounded-xl border transition-colors p-3 sm:p-4 space-y-2.5 sm:space-y-3 ${
                    isRunning
                      ? 'bg-white/[0.03] border-white/12'
                      : statusDisplay.tone === 'amber'
                      ? 'bg-white/[0.025] border-white/10'
                      : 'bg-white/[0.02] border-white/10'
                  }`}
                >
                  {/* Top Meta Line + Controls */}
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() =>
                        setExpandedMap((prev) => ({
                          ...prev,
                          [task.id]: !isExpanded,
                        }))
                      }
                      className="flex-1 min-w-0 text-left group cursor-pointer focus:outline-none"
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-mono tabular-nums">
                        <StatusPulse state={statusDisplay.pulseState} size="sm" />
                        <span
                          className={
                            statusDisplay.tone === 'amber'
                              ? 'text-amber-300 font-semibold'
                              : statusDisplay.tone === 'emerald'
                              ? 'text-[#6EE7B7] font-semibold'
                              : 'text-emerald-100/70 font-medium'
                          }
                        >
                          {statusDisplay.label}
                        </span>
                        <span aria-hidden="true" className="text-emerald-100/25">·</span>
                        <span className="text-emerald-100/70">{kindLabel}</span>
                        <span aria-hidden="true" className="text-emerald-100/25">·</span>
                        <span className="text-white/90">{breakdown.ratioLabel}</span>
                        <span aria-hidden="true" className="text-emerald-100/25">·</span>
                        <span
                          data-testid={`thread-task-elapsed-${task.id}`}
                          className={isRunning ? 'text-amber-200/85' : 'text-emerald-100/55'}
                        >
                          {isRunning ? `up ${elapsed}` : `${elapsed} elapsed`}
                        </span>
                      </div>

                      <h3 className="mt-1.5 text-[14.5px] sm:text-[15px] font-medium text-white group-hover:text-emerald-50 leading-snug">
                        {task.title}
                      </h3>

                      {!isExpanded && (
                        <p className="mt-1 text-[12.5px] text-emerald-100/60 truncate">
                          {breakdown.activeStepText}
                        </p>
                      )}
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {onToggleTaskStatus && (
                        <button
                          type="button"
                          onClick={() => onToggleTaskStatus(task.id)}
                          aria-label={isRunning ? `Pause ${task.title}` : `Resume ${task.title}`}
                          title={isRunning ? 'Pause task' : 'Resume task'}
                          className="ui-tactile h-7 px-2.5 rounded-lg bg-white/[0.05] border border-white/10 text-[11px] font-medium text-emerald-100/80 hover:text-white hover:border-white/25 inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                        >
                          {isRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                          <span className="hidden sm:inline">{isRunning ? 'Pause' : 'Resume'}</span>
                        </button>
                      )}
                      {onCancelTask && (
                        <button
                          type="button"
                          onClick={() => onCancelTask(task.id)}
                          aria-label={`Cancel ${task.title}`}
                          title="Cancel task"
                          className="ui-tactile w-7 h-7 rounded-lg bg-white/[0.04] border border-white/10 text-emerald-100/55 hover:text-rose-300 hover:border-rose-400/35 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={isExpanded ? `Collapse ${task.title}` : `Expand ${task.title}`}
                        aria-expanded={isExpanded}
                        onClick={() =>
                          setExpandedMap((prev) => ({
                            ...prev,
                            [task.id]: !isExpanded,
                          }))
                        }
                        className="ui-tactile w-7 h-7 rounded-lg text-emerald-100/55 hover:text-white hover:bg-white/[0.06] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                      >
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform duration-200 ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Slim Hairline Progress Track */}
                  <div className="flex items-center gap-2.5">
                    <div className="flex-1 h-[3px] rounded-full bg-white/[0.08] overflow-hidden">
                      <div
                        className={`h-full w-full origin-left transition-transform duration-300 ease-out ${
                          isRunning
                            ? 'bg-amber-400'
                            : statusDisplay.tone === 'amber'
                            ? 'bg-amber-300/75'
                            : statusDisplay.tone === 'emerald'
                            ? 'bg-[#34D399]'
                            : 'bg-emerald-100/35'
                        }`}
                        style={{ transform: `scaleX(${Math.max(0.03, progressPct / 100)})` }}
                      />
                    </div>
                    <span className="font-mono text-[11px] tabular-nums text-emerald-100/65 shrink-0">
                      {progressPct}%
                    </span>
                  </div>

                  <AnimatedCollapsible open={isExpanded}>
                    <div className="pt-0.5 sm:pt-1 space-y-2.5 sm:space-y-3">
                      <ul
                        className="space-y-1 sm:space-y-1.5"
                        aria-label="Task steps"
                      >
                        {breakdown.steps.map((step, stepIdx) => {
                          const isStepActive = step.state === 'active';
                          const isStepDone = step.state === 'done';
                          return (
                            <li
                              key={`${task.id}-step-${stepIdx}`}
                              className="flex items-start gap-2.5 text-[12.5px] leading-snug"
                            >
                              <span
                                aria-hidden="true"
                                className={`mt-0.5 shrink-0 w-4 h-4 rounded-full flex items-center justify-center ${
                                  isStepDone
                                    ? 'bg-[#34D399]/12 border border-[#34D399]/30'
                                    : isStepActive
                                    ? 'bg-amber-400/15 border border-amber-400/45'
                                    : 'border border-white/12'
                                }`}
                              >
                                {isStepDone ? (
                                  <Check className="w-2.5 h-2.5 text-[#34D399]" />
                                ) : isStepActive ? (
                                  <StatusPulse
                                    state={isRunning ? 'thinking' : 'idle'}
                                    size="sm"
                                  />
                                ) : (
                                  <span className="w-1 h-1 rounded-full bg-white/25" />
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

                      {onSteerTask && (
                        <form
                          onSubmit={(e) => void handleSteerSubmit(e, task.id)}
                          className="flex items-center gap-2 border-t border-white/[0.07] pt-2.5 focus-within:border-[#34D399]/35 transition-colors"
                        >
                          <label htmlFor={`steer-task-inline-${task.id}`} className="sr-only">
                            Steer {task.title}
                          </label>
                          <span aria-hidden="true" className="font-mono text-xs text-[#34D399]/80 shrink-0">
                            &gt;
                          </span>
                          <input
                            id={`steer-task-inline-${task.id}`}
                            type="text"
                            value={steerDrafts[task.id] ?? ''}
                            onChange={(e) =>
                              setSteerDrafts((prev) => ({ ...prev, [task.id]: e.target.value }))
                            }
                            placeholder={`Steer this task in #${activeChannel}…`}
                            className="flex-1 min-w-0 bg-transparent text-[12.5px] text-white placeholder:text-emerald-100/40 focus:outline-none py-0.5"
                          />
                          <button
                            type="submit"
                            disabled={!steerDrafts[task.id]?.trim() || steeringId === task.id}
                            aria-label={`Send instruction to ${task.title}`}
                            className="ui-tactile h-7 px-2.5 rounded-lg bg-[#34D399]/16 border border-[#34D399]/35 text-[#6EE7B7] hover:bg-[#34D399] hover:text-[#05140E] disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center shrink-0"
                          >
                            <Send className="w-3 h-3" />
                          </button>
                        </form>
                      )}

                      <div className="pt-1.5 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] tabular-nums text-emerald-100/45">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {startedClock && <span>started {startedClock}</span>}
                          {startedClock && <span aria-hidden="true">·</span>}
                          <span className={isRunning ? 'text-amber-200/80' : ''}>up {elapsed}</span>
                        </div>
                        {task.sessionId && (
                          <span className="text-emerald-100/55 truncate max-w-[180px]">
                            {task.sessionId}
                          </span>
                        )}
                      </div>
                    </div>
                  </AnimatedCollapsible>
                </div>
              );
            })}

            {/* Completed / Finished Tasks with Operator Confirmation Semantics */}
            {partition.completed.map((task) => {
              const breakdown = resolveTaskStepBreakdown(task);
              const statusDisplay = getTaskStatusDisplay(task);
              const confirmState = getTaskConfirmationState(task);
              const confirmLabel = getTaskConfirmationLabel(task);
              const kindLabel = getTaskKindLabel(task);
              const runtime = formatElapsedDuration(
                task.createdAtMs,
                task.updatedAtMs ?? nowMs
              );
              const isExpanded = expandedMap[task.id] ?? confirmState === 'needs-confirm';

              return (
                <div
                  key={task.id}
                  data-testid={`thread-task-card-${task.id}`}
                  data-status={task.rawStatus ?? task.status}
                  data-confirm-state={confirmState}
                  className={`rounded-xl border transition-colors p-3.5 sm:p-4 space-y-2.5 ${
                    confirmState === 'needs-confirm'
                      ? 'bg-white/[0.03] border-[#34D399]/28'
                      : 'bg-white/[0.02] border-white/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() =>
                        setExpandedMap((prev) => ({ ...prev, [task.id]: !isExpanded }))
                      }
                      className="flex-1 min-w-0 text-left cursor-pointer focus:outline-none"
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-mono tabular-nums">
                        <StatusPulse state={statusDisplay.pulseState} size="sm" />
                        <span
                          className={
                            statusDisplay.tone === 'rose'
                              ? 'text-rose-300 font-semibold'
                              : statusDisplay.tone === 'slate'
                              ? 'text-emerald-100/55'
                              : 'text-[#6EE7B7] font-semibold'
                          }
                        >
                          {statusDisplay.label}
                        </span>
                        <span aria-hidden="true" className="text-emerald-100/25">·</span>
                        <span className="text-emerald-100/70">{kindLabel}</span>
                        <span aria-hidden="true" className="text-emerald-100/25">·</span>
                        <span className="text-emerald-100/60">{breakdown.ratioLabel}</span>
                        <span aria-hidden="true" className="text-emerald-100/25">·</span>
                        <span className="text-emerald-100/50">{runtime}</span>
                      </div>
                      <h3 className="mt-1.5 text-[14.5px] sm:text-[15px] font-medium text-white leading-snug">
                        {task.title}
                      </h3>
                    </button>

                    <button
                      type="button"
                      aria-label={isExpanded ? `Collapse ${task.title}` : `Expand ${task.title}`}
                      aria-expanded={isExpanded}
                      onClick={() =>
                        setExpandedMap((prev) => ({ ...prev, [task.id]: !isExpanded }))
                      }
                      className="ui-tactile w-7 h-7 rounded-lg text-emerald-100/55 hover:text-white hover:bg-white/[0.06] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                    >
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                  </div>

                  {/* Agent Done vs Operator Confirmed review bar */}
                  {confirmState !== 'open' && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.06]">
                      <span
                        className={`text-[11.5px] font-mono ${
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
                          className="ui-tactile inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#34D399] text-[#05140E] font-semibold text-xs hover:bg-[#6EE7B7] transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Mark done</span>
                        </button>
                      )}
                      {confirmState === 'confirmed' && onReopenTask && (
                        <button
                          type="button"
                          onClick={() => onReopenTask(task.id)}
                          className="ui-tactile inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/12 text-[11.5px] text-emerald-100/80 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Undo2 className="w-3 h-3" />
                          <span>Undo</span>
                        </button>
                      )}
                    </div>
                  )}

                  <AnimatedCollapsible open={isExpanded}>
                    <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
                      <ul className="space-y-1.5">
                        {breakdown.steps.map((step, i) => (
                          <li
                            key={`${task.id}-done-step-${i}`}
                            className="flex items-start gap-2.5 text-[12.5px] text-emerald-100/65 leading-snug"
                          >
                            <span
                              aria-hidden="true"
                              className="mt-0.5 shrink-0 w-4 h-4 rounded-full bg-[#34D399]/12 border border-[#34D399]/30 flex items-center justify-center"
                            >
                              <Check className="w-2.5 h-2.5 text-[#34D399]" />
                            </span>
                            <span>{step.text}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </AnimatedCollapsible>
                </div>
              );
            })}
          </>
        )}
      </div>
    </section>
  );
}
