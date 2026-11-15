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
  variant?: 'desktop-corner' | 'mobile-trigger' | 'mobile-panel';
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
  variant = 'desktop-corner',
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

  // Esc key closes the thread task panel when open.
  useEffect(() => {
    if (!isOpen || variant === 'mobile-trigger') return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onHide();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onHide, variant]);

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

  const renderTriggerButton = (compactMobile: boolean) => (
    <button
      type="button"
      data-testid={compactMobile ? 'mobile-thread-tasks-toggle' : 'thread-tasks-toggle'}
      aria-expanded={isOpen}
      aria-controls={compactMobile ? 'mobile-thread-tasks-panel' : 'desktop-thread-tasks-panel'}
      aria-label={
        isOpen
          ? `Hide tasks for #${activeChannel}`
          : `Show tasks for #${activeChannel} (${totalCount})`
      }
      onClick={onToggleOpen}
      className={`ui-tactile inline-flex items-center gap-1.5 rounded-xl border font-mono text-[11px] tabular-nums transition-colors cursor-pointer shrink-0 ${
        compactMobile ? 'px-2.5 py-1.5' : 'px-3 py-1.5 backdrop-blur-md shadow-[0_8px_22px_rgba(0,0,0,0.35)]'
      } ${
        isOpen
          ? 'bg-[#34D399]/16 border-[#34D399]/45 text-[#6EE7B7]'
          : hasRunningTask || activeIsThinking
          ? 'bg-[#07130F]/92 border-amber-400/35 text-amber-100 hover:border-amber-300/60'
          : needsConfirmCount > 0
          ? 'bg-[#07130F]/90 border-[#34D399]/30 text-emerald-100 hover:border-[#34D399]/55'
          : 'bg-[#07130F]/82 border-white/12 text-emerald-100/70 hover:text-white hover:border-white/25'
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
        {compactMobile ? `(${totalCount})` : `· ${triggerLabel}`}
      </span>
      {!compactMobile && runningElapsed && hasRunningTask && (
        <>
          <span aria-hidden="true" className="text-emerald-100/30">·</span>
          <span className="text-amber-200/85">up {runningElapsed}</span>
        </>
      )}
      <ChevronDown
        className={`w-3 h-3 text-emerald-100/60 transition-transform duration-200 ${
          isOpen ? 'rotate-180' : ''
        }`}
        aria-hidden="true"
      />
    </button>
  );

  if (variant === 'mobile-trigger') {
    return renderTriggerButton(true);
  }

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

  const renderTaskPanelBody = (panelId: string, testId: string, maxHeightClass: string) => (
    <section
      id={panelId}
      aria-label={`Tasks for #${activeChannel}`}
      data-testid={testId}
      data-channel={activeChannel}
      className="ui-card-enter w-full rounded-2xl bg-[#07130F]/96 backdrop-blur-xl border border-white/14 shadow-[0_20px_52px_rgba(0,0,0,0.72)] overflow-hidden flex flex-col"
    >
      {/* Panel Header with Hide Control */}
      <div className="px-3.5 py-2.5 border-b border-white/10 bg-white/[0.025] flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums">
            <StatusPulse state={triggerPulseState} size="sm" />
            <span className="font-sans text-xs font-semibold text-white">Thread Tasks</span>
            <span aria-hidden="true" className="text-emerald-100/30">·</span>
            <span className="text-[#6EE7B7]">#{activeChannel}</span>
            <span aria-hidden="true" className="text-emerald-100/30">·</span>
            <span className="text-emerald-100/55">{totalCount}</span>
          </div>
        </div>

        <button
          type="button"
          data-testid={variant === 'mobile-panel' ? 'mobile-thread-tasks-hide' : 'thread-tasks-hide'}
          aria-label="Hide thread tasks"
          onClick={onHide}
          className="ui-tactile inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/12 text-[11px] font-medium text-emerald-100/80 hover:text-white hover:border-white/25 transition-colors cursor-pointer shrink-0"
        >
          <EyeOff className="w-3 h-3" aria-hidden="true" />
          <span>Hide</span>
        </button>
      </div>

      {/* Panel Body */}
      <div className={`p-3 space-y-2.5 overflow-y-auto cyber-scroll ${maxHeightClass}`}>
        {partition.all.length === 0 && !activeIsThinking ? (
          <div
            data-testid="thread-tasks-empty"
            className="rounded-xl border border-white/8 bg-white/[0.025] px-3.5 py-4 text-center space-y-1"
          >
            <p className="text-xs font-medium text-white/85">No tasks in #{activeChannel}</p>
            <p className="text-[11px] text-emerald-100/50 leading-relaxed">
              Background tasks and long runs dispatched from {activeSessionId} appear here.
            </p>
          </div>
        ) : (
          <>
            {/* Live foreground turn indicator when active without a background record */}
            {partition.running.length === 0 && activeIsThinking && (
              <div
                data-testid="thread-live-turn-card"
                className="rounded-xl bg-white/[0.04] border border-amber-400/30 px-3 py-2.5 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums">
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
                      className="ui-tactile inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.06] border border-white/12 text-[10.5px] font-medium text-emerald-50 hover:bg-white/12 transition-colors cursor-pointer"
                    >
                      <Square className="w-2.5 h-2.5 fill-current" />
                      <span>Stop</span>
                    </button>
                  )}
                </div>
                <p className="text-[11.5px] text-emerald-50/80">
                  Executing active turn in <span className="font-mono text-[#6EE7B7]">{activeSessionId}</span>
                </p>
              </div>
            )}

            {/* Running, Queued, Waiting & Paused Tasks */}
            {activeAndPaused.map((task, idx) => {
              const isRunning = task.status === 'running';
              const isExpanded = expandedMap[task.id] ?? (idx === 0 && isRunning);
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
                  className={`rounded-xl border transition-colors ${
                    isRunning
                      ? 'bg-white/[0.045] border-amber-400/28'
                      : statusDisplay.tone === 'amber'
                      ? 'bg-white/[0.035] border-amber-300/20'
                      : 'bg-white/[0.03] border-white/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 px-3 pt-2.5 pb-2">
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
                      <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] font-mono tabular-nums">
                        <StatusPulse state={statusDisplay.pulseState} size="sm" />
                        <span className="text-emerald-100/75">{kindLabel}</span>
                        <span aria-hidden="true" className="text-emerald-100/30">·</span>
                        <span
                          className={
                            statusDisplay.tone === 'amber'
                              ? 'text-amber-300 font-semibold'
                              : statusDisplay.tone === 'emerald'
                              ? 'text-[#6EE7B7] font-semibold'
                              : 'text-emerald-100/65 font-medium'
                          }
                        >
                          {statusDisplay.label}
                        </span>
                        <span aria-hidden="true" className="text-emerald-100/30">·</span>
                        <span className="text-white/90">{breakdown.ratioLabel}</span>
                        <span aria-hidden="true" className="text-emerald-100/30">·</span>
                        <span
                          data-testid={`thread-task-elapsed-${task.id}`}
                          className={isRunning ? 'text-amber-200/90' : 'text-emerald-100/55'}
                        >
                          {isRunning ? `up ${elapsed}` : `${elapsed} elapsed`}
                        </span>
                      </div>

                      <h3 className="mt-1 text-[12.5px] font-semibold text-white group-hover:text-emerald-50 leading-snug">
                        {task.title}
                      </h3>

                      {!isExpanded && (
                        <p className="mt-1 text-[11px] text-emerald-100/65 truncate">
                          {breakdown.activeStepText}
                        </p>
                      )}
                    </button>

                    <div className="flex items-center gap-1 shrink-0 pt-0.5">
                      {onToggleTaskStatus && (
                        <button
                          type="button"
                          onClick={() => onToggleTaskStatus(task.id)}
                          aria-label={isRunning ? `Pause ${task.title}` : `Resume ${task.title}`}
                          title={isRunning ? 'Pause task' : 'Resume task'}
                          className="ui-tactile w-6 h-6 rounded-md bg-white/[0.06] border border-white/10 text-emerald-100/75 hover:text-white hover:border-white/25 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          {isRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                        </button>
                      )}
                      {onCancelTask && (
                        <button
                          type="button"
                          onClick={() => onCancelTask(task.id)}
                          aria-label={`Cancel ${task.title}`}
                          title="Cancel task"
                          className="ui-tactile w-6 h-6 rounded-md bg-white/[0.05] border border-white/10 text-emerald-100/60 hover:text-rose-300 hover:border-rose-400/35 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <X className="w-3 h-3" />
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
                        className="ui-tactile w-6 h-6 rounded-md text-emerald-100/60 hover:text-white hover:bg-white/[0.06] flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform duration-200 ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  <AnimatedCollapsible open={isExpanded}>
                    <div className="px-3 pb-3 pt-1 border-t border-white/8 space-y-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-black/50 overflow-hidden">
                          <div
                            className={`h-full w-full origin-left transition-transform duration-300 ease-out ${
                              isRunning ? 'bg-amber-400' : 'bg-emerald-100/40'
                            }`}
                            style={{ transform: `scaleX(${Math.max(0.03, progressPct / 100)})` }}
                          />
                        </div>
                        <span className="font-mono text-[10px] tabular-nums text-emerald-100/70 shrink-0">
                          {progressPct}%
                        </span>
                      </div>

                      <ul
                        className="space-y-1.5 max-h-[144px] overflow-y-auto cyber-scroll pr-1"
                        aria-label="Task steps"
                      >
                        {breakdown.steps.map((step, stepIdx) => {
                          const isStepActive = step.state === 'active';
                          const isStepDone = step.state === 'done';
                          return (
                            <li
                              key={`${task.id}-step-${stepIdx}`}
                              className="flex items-start gap-2 text-[11.5px] leading-snug"
                            >
                              <span className="mt-0.5 shrink-0 flex items-center justify-center w-3 h-3">
                                {isStepDone ? (
                                  <Check className="w-3 h-3 text-[#34D399]" aria-hidden="true" />
                                ) : isStepActive ? (
                                  <StatusPulse
                                    state={isRunning ? 'thinking' : 'idle'}
                                    size="sm"
                                  />
                                ) : (
                                  <span
                                    aria-hidden="true"
                                    className="w-1.5 h-1.5 rounded-full bg-white/22"
                                  />
                                )}
                              </span>
                              <span
                                className={
                                  isStepActive
                                    ? 'text-white font-medium'
                                    : isStepDone
                                    ? 'text-emerald-100/60'
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
                          className="flex items-center gap-1.5 pt-0.5"
                        >
                          <label htmlFor={`steer-task-${variant}-${task.id}`} className="sr-only">
                            Steer {task.title}
                          </label>
                          <input
                            id={`steer-task-${variant}-${task.id}`}
                            type="text"
                            value={steerDrafts[task.id] ?? ''}
                            onChange={(e) =>
                              setSteerDrafts((prev) => ({ ...prev, [task.id]: e.target.value }))
                            }
                            placeholder="Steer running task…"
                            className="flex-1 min-w-0 rounded-lg bg-black/45 border border-white/12 px-2.5 py-1.5 text-[11px] text-white placeholder:text-emerald-100/40 focus:outline-none focus:border-[#34D399]/55"
                          />
                          <button
                            type="submit"
                            disabled={!steerDrafts[task.id]?.trim() || steeringId === task.id}
                            aria-label={`Send instruction to ${task.title}`}
                            className="ui-tactile px-2.5 py-1.5 rounded-lg bg-[#34D399]/18 border border-[#34D399]/40 text-[#6EE7B7] hover:bg-[#34D399] hover:text-[#05140E] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center"
                          >
                            <Send className="w-3 h-3" />
                          </button>
                        </form>
                      )}

                      <div className="pt-1 border-t border-white/6 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] tabular-nums text-emerald-100/50">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {startedClock && <span>started {startedClock}</span>}
                          {startedClock && <span aria-hidden="true">·</span>}
                          <span className={isRunning ? 'text-amber-200/85' : ''}>up {elapsed}</span>
                        </div>
                        {task.sessionId && (
                          <span className="text-[#6EE7B7]/80 truncate max-w-[140px]">
                            {task.sessionId}
                          </span>
                        )}
                      </div>
                    </div>
                  </AnimatedCollapsible>
                </div>
              );
            })}

            {/* Completed / Finished Tasks with Hermes Duet Confirmation Semantics */}
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
              const isExpanded = expandedMap[task.id] ?? false;

              return (
                <div
                  key={task.id}
                  data-testid={`thread-task-card-${task.id}`}
                  data-status={task.rawStatus ?? task.status}
                  data-confirm-state={confirmState}
                  className={`rounded-xl border transition-colors ${
                    confirmState === 'needs-confirm'
                      ? 'bg-white/[0.035] border-[#34D399]/28'
                      : 'bg-white/[0.025] border-white/10'
                  }`}
                >
                  <div className="px-3 py-2.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() =>
                          setExpandedMap((prev) => ({ ...prev, [task.id]: !isExpanded }))
                        }
                        className="flex-1 min-w-0 text-left cursor-pointer focus:outline-none"
                      >
                        <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] font-mono tabular-nums">
                          <StatusPulse state={statusDisplay.pulseState} size="sm" />
                          <span className="text-emerald-100/70">{kindLabel}</span>
                          <span aria-hidden="true" className="text-emerald-100/30">·</span>
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
                          <span aria-hidden="true" className="text-emerald-100/30">·</span>
                          <span className="text-emerald-100/55">{breakdown.ratioLabel}</span>
                          <span aria-hidden="true" className="text-emerald-100/30">·</span>
                          <span className="text-emerald-100/50">{runtime}</span>
                        </div>
                        <h3 className="mt-1 text-[12.5px] font-medium text-white leading-snug">
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
                        className="ui-tactile w-6 h-6 rounded-md text-emerald-100/55 hover:text-white hover:bg-white/[0.06] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                      >
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform duration-200 ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                    </div>

                    {/* Hermes Duet agent_done_at vs confirmed_at review bar */}
                    {confirmState !== 'open' && (
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/6">
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
                            className="ui-tactile inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#34D399] text-[#05140E] font-semibold text-[11px] hover:bg-[#6EE7B7] transition-colors cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                            <span>Mark done</span>
                          </button>
                        )}
                        {confirmState === 'confirmed' && onReopenTask && (
                          <button
                            type="button"
                            onClick={() => onReopenTask(task.id)}
                            className="ui-tactile inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.06] border border-white/12 text-[11px] text-emerald-100/80 hover:text-white transition-colors cursor-pointer"
                          >
                            <Undo2 className="w-3 h-3" />
                            <span>Undo</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <AnimatedCollapsible open={isExpanded}>
                    <div className="px-3 pb-2.5 pt-1 border-t border-white/8 space-y-1.5">
                      <ul className="space-y-1 max-h-[120px] overflow-y-auto cyber-scroll">
                        {breakdown.steps.map((step, i) => (
                          <li
                            key={`${task.id}-done-step-${i}`}
                            className="flex items-start gap-2 text-[11px] text-emerald-100/65"
                          >
                            <Check className="w-3 h-3 text-[#34D399] mt-0.5 shrink-0" />
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

  if (variant === 'mobile-panel') {
    if (!isOpen) return null;
    return (
      <div className="lg:hidden mx-2.5 mt-1 mb-1.5 shrink-0 z-20">
        {renderTaskPanelBody('mobile-thread-tasks-panel', 'mobile-thread-task-banner', 'max-h-[42vh]')}
      </div>
    );
  }

  // Desktop upper-right corner integrated beside the character (hidden by default; click opens, Hide collapses)
  return (
    <div
      data-testid="thread-task-corner-anchor"
      className="hidden lg:flex flex-col items-end lg:absolute lg:top-1.5 lg:right-4 z-30"
    >
      {!isOpen ? (
        renderTriggerButton(false)
      ) : (
        <div className="w-[308px] xl:w-[364px]">
          {renderTaskPanelBody(
            'desktop-thread-tasks-panel',
            'thread-task-banner',
            'max-h-[min(58vh,460px)]'
          )}
        </div>
      )}
    </div>
  );
}
