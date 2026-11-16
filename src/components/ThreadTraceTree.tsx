import { useState } from 'react';
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
import type { ClassifiedTraceStep } from '../utils/threadTrace';
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

  const hiddenCount =
    !showAllSteps && items.length > DEFAULT_VISIBLE_LIMIT
      ? items.length - DEFAULT_VISIBLE_LIMIT
      : 0;
  const visibleItems = hiddenCount > 0 ? items.slice(-DEFAULT_VISIBLE_LIMIT) : items;

  const renderStepIcon = (icon: ClassifiedTraceStep['icon']) => {
    switch (icon) {
      case 'reasoning':
        return <Brain className="w-3.5 h-3.5 text-emerald-300/90" />;
      case 'commentary':
        return <MessageSquareText className="w-3.5 h-3.5 text-sky-300/85" />;
      case 'spawn':
        return <Users className="w-3.5 h-3.5 text-[#6EE7B7]/85" />;
      case 'link':
        return <Link2 className="w-3.5 h-3.5 text-sky-300/85" />;
      case 'tool':
        return <Wrench className="w-3.5 h-3.5 text-emerald-300/85" />;
      default:
        return <CornerDownRight className="w-3.5 h-3.5 text-emerald-100/45" />;
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
        className="ui-tactile inline-flex items-center gap-2 min-h-[28px] text-left group cursor-pointer rounded-lg px-1.5 -mx-1.5 py-1 hover:bg-white/[0.03] transition-colors"
      >
        <StatusPulse size="sm" state={isLive ? 'thinking' : 'idle'} />
        <span className="text-[12.5px] font-medium text-emerald-50/85 group-hover:text-white transition-colors">
          {agentLabel}
        </span>
        {stepSummary && (
          <span className="font-mono text-[11px] text-emerald-100/45 tabular-nums">
            · {stepSummary}
          </span>
        )}
        <ChevronDown
          className={`w-3.5 h-3.5 text-emerald-100/40 group-hover:text-white transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            collapsed ? '-rotate-90' : 'rotate-0'
          }`}
          aria-hidden="true"
        />
      </button>

      <AnimatedCollapsible open={!collapsed}>
        <div className="ml-1.5 pl-3.5 border-l border-white/[0.08] mt-1 space-y-1.5 pb-0.5">
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAllSteps(true)}
              className="ui-tactile flex items-center gap-2 min-h-[26px] text-xs text-emerald-100/50 hover:text-white transition-colors cursor-pointer"
            >
              <MoreHorizontal className="w-3.5 h-3.5 text-emerald-100/45 shrink-0" aria-hidden="true" />
              <span className="font-mono text-[11px] tabular-nums">
                +{hiddenCount} earlier
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
                        <span className="font-medium text-emerald-200/90 shrink-0">
                          {step.label}
                        </span>
                      </div>
                      <span className="font-mono text-[10.5px] tabular-nums text-emerald-100/35 shrink-0">
                        {step.timestamp}
                      </span>
                    </div>
                    {step.detail && (
                      <p
                        data-testid="reasoning-trace-detail"
                        className="ml-5.5 text-[12px] leading-relaxed text-emerald-100/65 whitespace-pre-wrap break-words rounded-md bg-white/[0.025] border border-white/[0.06] px-2.5 py-1.5"
                      >
                        {step.detail}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 min-w-0">
                      <span aria-hidden="true" className="shrink-0 flex items-center">
                        {renderStepIcon(step.icon)}
                      </span>
                      <span className="font-medium text-emerald-50/85 shrink-0 truncate max-w-[160px] sm:max-w-none">
                        {step.label}
                      </span>
                      {step.detail && (
                        <span className="text-emerald-100/45 truncate text-[12px]">
                          {step.detail}
                        </span>
                      )}
                    </div>

                    <span className="font-mono text-[10.5px] tabular-nums text-emerald-100/35 shrink-0">
                      {step.timestamp}
                    </span>
                  </>
                )}
              </StaggerItem>
            );
          })}

          {isLive && !hideLiveFooter && (
            <div className="flex items-center gap-2 text-[12px] text-emerald-100/75 py-0.5">
              <Sparkles className="w-3.5 h-3.5 text-[#6EE7B7] motion-safe:animate-spin motion-safe-only shrink-0" />
              <span className="font-medium text-emerald-50/85">Thinking</span>
            </div>
          )}
        </div>
      </AnimatedCollapsible>
    </div>
  );
}
