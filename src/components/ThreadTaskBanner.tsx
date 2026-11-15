import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Pause, Play, Square } from 'lucide-react';
import type { BackgroundTask, ChannelId } from '../types/hermes';
import {
  formatElapsedDuration,
  formatStartClock,
  getTaskStatusDisplay,
  partitionChannelTasks,
  resolveTaskStepBreakdown,
} from '../utils/taskInsights';
import { AnimatedCollapsible, StatusPulse } from './ui';

interface ThreadTaskBannerProps {
  activeChannel: ChannelId;
  activeSessionId: string;
  tasks: BackgroundTask[];
  activeIsThinking: boolean;
  workingSeconds: number;
  onToggleTaskStatus?: (id: string) => void;
  onStopSpeaking?: () => void;
}

export function ThreadTaskBanner({
  activeChannel,
  activeSessionId,
  tasks,
  activeIsThinking,
  workingSeconds,
  onToggleTaskStatus,
  onStopSpeaking,
}: ThreadTaskBannerProps) {
  const partition = useMemo(
    () => partitionChannelTasks(tasks, activeChannel),
    [tasks, activeChannel]
  );

  const hasRunningTask = partition.running.length > 0;
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const [showCompleted, setShowCompleted] = useState(false);

  // Tick every 1s strictly while at least one task in the active thread is running.
  useEffect(() => {
    setNowMs(Date.now());
    if (!hasRunningTask) return;
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [hasRunningTask, activeChannel]);

  // Collapse completed archive drawer automatically when switching threads.
  useEffect(() => {
    setShowCompleted(false);
  }, [activeChannel]);

  const activeAndPaused = useMemo(
    () => [...partition.running, ...partition.paused],
    [partition.running, partition.paused]
  );

  if (partition.all.length === 0 && !activeIsThinking) {
    return null;
  }

  return (
    <section
      aria-label={`Active tasks for #${activeChannel}`}
      data-testid="thread-task-banner"
      data-channel={activeChannel}
      className="shrink-0 px-3.5 sm:px-14 lg:px-20 pt-1.5 pb-2 z-10"
    >
      <div className="max-w-[68ch] space-y-2">
        {/* Live foreground turn card when no background task record owns this turn */}
        {partition.running.length === 0 && activeIsThinking && (
          <div
            data-testid="thread-live-turn-card"
            className="ui-card-enter rounded-xl bg-[#07130F]/92 border border-amber-400/30 px-3.5 py-2.5"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono tabular-nums">
                  <StatusPulse state="thinking" size="sm" />
                  <span className="text-emerald-100/75">Active turn</span>
                  <span aria-hidden="true" className="text-emerald-100/30">·</span>
                  <span className="text-amber-300 font-semibold">Working</span>
                  <span aria-hidden="true" className="text-emerald-100/30">·</span>
                  <span className="text-white/85">up {workingSeconds}s</span>
                  <span aria-hidden="true" className="text-emerald-100/30">·</span>
                  <span className="text-[#6EE7B7]">#{activeChannel}</span>
                </div>
                <p className="text-xs text-emerald-50/85 truncate">
                  Executing turn inside <span className="font-mono text-[#6EE7B7]">{activeSessionId}</span>
                </p>
              </div>
              {onStopSpeaking && (
                <button
                  type="button"
                  onClick={onStopSpeaking}
                  className="ui-tactile shrink-0 inline-flex items-center gap-1.5 min-h-[30px] px-2.5 rounded-lg bg-white/[0.06] border border-white/12 text-[11px] font-medium text-emerald-50 hover:bg-white/12 transition-colors cursor-pointer"
                >
                  <Square className="w-2.5 h-2.5 fill-current" />
                  <span>Stop</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Running & Paused Tasks Strictly Scoped to Active Thread */}
        {activeAndPaused.map((task, idx) => {
          const isRunning = task.status === 'running';
          const defaultExpanded = isRunning && idx === 0;
          const isExpanded = expandedMap[task.id] ?? defaultExpanded;
          const breakdown = resolveTaskStepBreakdown(task);
          const statusDisplay = getTaskStatusDisplay(task);
          const elapsed = formatElapsedDuration(task.createdAtMs, nowMs);
          const startedClock = formatStartClock(task.createdAtMs) || task.updatedAt;
          const progressPct = Math.max(0, Math.min(100, Math.round(task.progress)));

          return (
            <div
              key={task.id}
              data-testid={`thread-task-card-${task.id}`}
              data-status={task.status}
              className={`ui-card-enter rounded-xl border transition-colors ${
                isRunning
                  ? 'bg-[#07130F]/94 border-amber-400/28 shadow-[0_8px_24px_rgba(0,0,0,0.28)]'
                  : 'bg-[#07130F]/85 border-white/12'
              }`}
            >
              {/* Header Row: Toggle button + separate Pause/Resume action (no nested buttons) */}
              <div className="flex items-start justify-between gap-2 px-3.5 pt-2.5 pb-2">
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
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono tabular-nums">
                    <StatusPulse state={statusDisplay.pulseState} size="sm" />
                    <span className="text-emerald-100/75">{task.kind ?? 'Background'}</span>
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

                  <div className="mt-1 flex items-center justify-between gap-2">
                    <h3 className="text-[13px] font-semibold text-white group-hover:text-emerald-50 truncate">
                      {task.title}
                    </h3>
                  </div>

                  {!isExpanded && (
                    <div className="mt-1 space-y-1.5">
                      <p className="text-[11.5px] text-emerald-100/65 truncate">
                        {breakdown.activeStepText}
                      </p>
                      <div className="h-1 w-full rounded-full bg-white/8 overflow-hidden">
                        <div
                          className={`h-full origin-left transition-transform duration-300 ${
                            isRunning ? 'bg-amber-400/85' : 'bg-emerald-100/35'
                          }`}
                          style={{ transform: `scaleX(${Math.max(0.03, progressPct / 100)})` }}
                        />
                      </div>
                    </div>
                  )}
                </button>

                <div className="flex items-center gap-1 shrink-0 pt-0.5">
                  {onToggleTaskStatus && (
                    <button
                      type="button"
                      onClick={() => onToggleTaskStatus(task.id)}
                      aria-label={isRunning ? `Pause ${task.title}` : `Resume ${task.title}`}
                      title={isRunning ? 'Pause task' : 'Resume task'}
                      className="ui-tactile w-7 h-7 rounded-lg bg-white/[0.05] border border-white/10 text-emerald-100/75 hover:text-white hover:border-white/25 flex items-center justify-center transition-colors cursor-pointer"
                    >
                      {isRunning ? (
                        <Pause className="w-3 h-3" />
                      ) : (
                        <Play className="w-3 h-3" />
                      )}
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
                    className="ui-tactile w-7 h-7 rounded-lg text-emerald-100/60 hover:text-white hover:bg-white/[0.06] flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform duration-200 ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Expandable Step Breakdown & Runtime Telemetry */}
              <AnimatedCollapsible open={isExpanded}>
                <div className="px-3.5 pb-3 pt-1 border-t border-white/8 space-y-2.5">
                  {/* Progress Bar & Percent */}
                  <div className="flex items-center gap-2.5">
                    <div className="flex-1 h-1.5 rounded-full bg-black/50 overflow-hidden">
                      <div
                        className={`h-full w-full origin-left transition-transform duration-300 ease-out ${
                          isRunning ? 'bg-amber-400' : 'bg-emerald-100/40'
                        }`}
                        style={{ transform: `scaleX(${Math.max(0.03, progressPct / 100)})` }}
                      />
                    </div>
                    <span className="font-mono text-[10.5px] tabular-nums text-emerald-100/70 shrink-0">
                      {progressPct}%
                    </span>
                  </div>

                  {/* Step-by-Step Checklist (internally scrollable on compact viewports so card border & footer never clip) */}
                  <ul
                    className="space-y-1.5 max-h-[118px] sm:max-h-[180px] overflow-y-auto cyber-scroll pr-1"
                    aria-label="Task steps"
                  >
                    {breakdown.steps.map((step, stepIdx) => {
                      const isStepActive = step.state === 'active';
                      const isStepDone = step.state === 'done';
                      return (
                        <li
                          key={`${task.id}-step-${stepIdx}`}
                          className="flex items-start gap-2 text-[12px] leading-snug"
                        >
                          <span className="mt-1 shrink-0 flex items-center justify-center w-3 h-3">
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

                  {/* Footer Metadata (started clock · elapsed · channel · run/session) */}
                  <div className="pt-1 border-t border-white/6 flex flex-wrap items-center justify-between gap-2 font-mono text-[10.5px] tabular-nums text-emerald-100/50">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {startedClock && <span>started {startedClock}</span>}
                      {startedClock && <span aria-hidden="true">·</span>}
                      <span className={isRunning ? 'text-amber-200/80' : ''}>
                        up {elapsed}
                      </span>
                      {task.sessionId && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{task.sessionId}</span>
                        </>
                      )}
                    </div>
                    <span className="text-[#6EE7B7]/85">#{task.channelId}</span>
                  </div>
                </div>
              </AnimatedCollapsible>
            </div>
          );
        })}

        {/* Completed Tasks Summary for this Thread (collapsed by default so chat stays spacious) */}
        {partition.completed.length > 0 && (
          <div
            data-testid="thread-completed-tasks"
            className="rounded-xl bg-[#07130F]/75 border border-white/10"
          >
            <button
              type="button"
              aria-expanded={showCompleted}
              onClick={() => setShowCompleted((v) => !v)}
              className="w-full px-3.5 py-2 flex items-center justify-between gap-2 text-left cursor-pointer"
            >
              <div className="min-w-0 flex items-center gap-2 text-[11.5px] font-mono tabular-nums">
                <StatusPulse state="live" size="sm" />
                <span className="text-[#6EE7B7] font-medium shrink-0">
                  {partition.completed.length === 1
                    ? 'Done'
                    : `${partition.completed.length} done`}
                </span>
                <span aria-hidden="true" className="text-emerald-100/30">·</span>
                <span className="text-emerald-50/85 font-sans truncate">
                  {partition.completed[0].title}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-[10.5px] tabular-nums text-emerald-100/50">
                  {resolveTaskStepBreakdown(partition.completed[0]).ratioLabel}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-emerald-100/55 transition-transform duration-200 ${
                    showCompleted ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </button>

            <AnimatedCollapsible open={showCompleted}>
              <div className="px-3.5 pb-2.5 pt-1 border-t border-white/8 space-y-2.5">
                {partition.completed.map((task) => {
                  const breakdown = resolveTaskStepBreakdown(task);
                  const runtime = formatElapsedDuration(
                    task.createdAtMs,
                    task.updatedAtMs ?? nowMs
                  );
                  return (
                    <div key={task.id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-white truncate">{task.title}</span>
                        <span className="font-mono text-[10.5px] text-[#6EE7B7]/85 shrink-0 tabular-nums">
                          {task.updatedAt} · {runtime}
                        </span>
                      </div>
                      <ul className="space-y-1">
                        {breakdown.steps.map((step, i) => (
                          <li
                            key={`${task.id}-done-step-${i}`}
                            className="flex items-start gap-2 text-[11.5px] text-emerald-100/60"
                          >
                            <Check className="w-3 h-3 text-[#34D399] mt-0.5 shrink-0" />
                            <span>{step.text}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </AnimatedCollapsible>
          </div>
        )}
      </div>
    </section>
  );
}
