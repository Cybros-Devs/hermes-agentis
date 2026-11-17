import { useMemo, useState } from 'react';
import {
  Brain,
  ChevronDown,
  CornerDownRight,
  Link2,
  MessageSquareText,
  MoreHorizontal,
  Sparkles,
  Users,
  Wrench,
} from 'lucide-react';
import { coalesceConsecutiveSteps, type ClassifiedTraceStep } from '../utils/threadTrace';
import { AnimatedCollapsible, StaggerItem, StatusPulse } from './ui';

interface ThreadTraceTreeProps {
  agentLabel?: string;
  sessionId?: string;
  items: ClassifiedTraceStep[];
  isLive: boolean;
  hideLiveFooter?: boolean;
}

const DEFAULT_VISIBLE_LIMIT = 6;

export function ThreadTraceTree({
  agentLabel = 'Activity',
  sessionId,
  items,
  isLive,
  hideLiveFooter = false,
}: ThreadTraceTreeProps) {
  const [collapsed, setCollapsed] = useState(true);
  const [showAllSteps, setShowAllSteps] = useState(false);

  const coalescedItems = useMemo(() => coalesceConsecutiveSteps(items), [items]);

  const hiddenCount =
    !showAllSteps && coalescedItems.length > DEFAULT_VISIBLE_LIMIT
      ? coalescedItems.length - DEFAULT_VISIBLE_LIMIT
      : 0;
  const visibleItems =
    hiddenCount > 0 ? coalescedItems.slice(-DEFAULT_VISIBLE_LIMIT) : coalescedItems;

  const renderStepIcon = (icon: ClassifiedTraceStep['icon']) => {
    switch (icon) {
      case 'reasoning':
        return <Brain className="w-3.5 h-3.5 text-zinc-300" />;
      case 'commentary':
        return <MessageSquareText className="w-3.5 h-3.5 text-sky-300/80" />;
      case 'spawn':
        return <Users className="w-3.5 h-3.5 text-zinc-300" />;
      case 'link':
        return <Link2 className="w-3.5 h-3.5 text-sky-300/80" />;
      case 'tool':
        return <Wrench className="w-3.5 h-3.5 text-zinc-400" />;
      default:
        return <CornerDownRight className="w-3.5 h-3.5 text-zinc-500" />;
    }
  };

  const hasReasoning = items.some((s) => s.icon === 'reasoning' || s.isReasoning);
  const stepSummary =
    items.length > 0
      ? `${items.length} ${items.length === 1 ? 'step' : 'steps'}${hasReasoning ? ' · reasoning' : ''}`
      : isLive
      ? 'Running'
      : '';

  return (
    <div className="max-w-[66ch] py-0.5" data-testid="thread-trace-tree" title={sessionId}>
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
        className={`ui-tactile inline-flex items-center gap-2 min-h-[28px] text-left group cursor-pointer rounded-lg px-2.5 py-1 border transition-colors ${
          !collapsed || isLive
            ? 'border-white/[0.08] bg-[#14171F]/90 hover:bg-[#191D27]'
            : 'border-transparent hover:border-white/[0.07] hover:bg-[#14171F]/70'
        }`}
      >
        <StatusPulse size="sm" state={isLive ? 'thinking' : 'idle'} />
        <span className="text-[12.5px] font-medium text-zinc-200 group-hover:text-white transition-colors">
          {agentLabel}
        </span>
        {stepSummary && (
          <span
            className={`font-mono text-[11px] tabular-nums ${
              isLive ? 'text-amber-300/90' : 'text-zinc-400'
            }`}
          >
            · {stepSummary}
          </span>
        )}
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-200 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            collapsed ? '-rotate-90' : 'rotate-0'
          }`}
          aria-hidden="true"
        />
      </button>

      <AnimatedCollapsible open={!collapsed}>
        <div className="mt-1.5 rounded-xl border border-white/[0.08] bg-[#14171F]/88 px-3 py-2.5 space-y-1.5">
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAllSteps(true)}
              className="ui-tactile flex items-center gap-2 min-h-[26px] text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <MoreHorizontal className="w-3.5 h-3.5 text-zinc-500 shrink-0" aria-hidden="true" />
              <span className="font-mono text-[11px] tabular-nums">
                +{hiddenCount} earlier groups
              </span>
            </button>
          )}

          {visibleItems.map((step, idx) => {
            const isReasoningStep = Boolean(step.isReasoning || step.icon === 'reasoning');
            return (
              <StaggerItem
                key={step.id}
                index={idx}
                className={`text-[12.5px] leading-snug py-0.5 ${
                  isReasoningStep ? 'space-y-1' : 'flex items-center justify-between gap-3'
                }`}
              >
                {isReasoningStep ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span aria-hidden="true" className="shrink-0 flex items-center">
                          {renderStepIcon(step.icon)}
                        </span>
                        <span className="font-medium text-zinc-200 shrink-0">
                          {step.label}
                        </span>
                      </div>
                      <span className="font-mono text-[10.5px] tabular-nums text-zinc-500 shrink-0">
                        {step.timestamp}
                      </span>
                    </div>
                    {step.detail && (
                      <p
                        data-testid="reasoning-trace-detail"
                        className="ml-5.5 text-[12px] leading-relaxed text-zinc-300/90 whitespace-pre-wrap break-words rounded-lg bg-[#0D1016] border border-white/[0.07] px-2.5 py-1.5"
                      >
                        {step.detail}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span aria-hidden="true" className="shrink-0 flex items-center">
                        {renderStepIcon(step.icon)}
                      </span>
                      <span
                        title={step.label}
                        className="font-medium text-zinc-200 min-w-0 truncate"
                      >
                        {step.label}
                      </span>
                      {step.detail && (
                        <span
                          className={`text-zinc-400 text-[12px] ${
                            /^(completed|complete|done|finished|running|started|failed|error|cancelled|interrupted)$/i.test(
                              step.detail
                            )
                              ? 'shrink-0'
                              : 'truncate min-w-0'
                          }`}
                        >
                          {step.detail}
                        </span>
                      )}
                      {step.repeatCount > 1 && (
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-zinc-300 tabular-nums shrink-0">
                          ×{step.repeatCount}
                        </span>
                      )}
                    </div>

                    <span className="font-mono text-[10.5px] tabular-nums text-zinc-500 shrink-0">
                      {step.timestamp}
                    </span>
                  </>
                )}
              </StaggerItem>
            );
          })}

          {isLive && !hideLiveFooter && (
            <div className="flex items-center gap-2 text-[12px] text-zinc-300 py-0.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-300 motion-safe:animate-spin motion-safe-only shrink-0" />
              <span className="font-medium text-zinc-200">Thinking</span>
            </div>
          )}
        </div>
      </AnimatedCollapsible>
    </div>
  );
}
