import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  Link2,
  MoreHorizontal,
  Sparkles,
  Users,
  Wrench,
} from 'lucide-react';
import type { ClassifiedTraceStep } from '../utils/threadTrace';
import { AnimatedCollapsible, StaggerItem } from './ui';

interface ThreadTraceTreeProps {
  agentLabel?: string;
  sessionId: string;
  items: ClassifiedTraceStep[];
  isLive: boolean;
}

const DEFAULT_VISIBLE_LIMIT = 4;

export function ThreadTraceTree({
  agentLabel = 'Hermes',
  sessionId,
  items,
  isLive,
}: ThreadTraceTreeProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showAllSteps, setShowAllSteps] = useState(false);

  const hiddenCount =
    !showAllSteps && items.length > DEFAULT_VISIBLE_LIMIT
      ? items.length - DEFAULT_VISIBLE_LIMIT
      : 0;
  const visibleItems = hiddenCount > 0 ? items.slice(-DEFAULT_VISIBLE_LIMIT) : items;

  const renderStepIcon = (icon: ClassifiedTraceStep['icon']) => {
    switch (icon) {
      case 'spawn':
        return <Users className="w-3 h-3 text-[#6EE7B7]" />;
      case 'link':
        return <Link2 className="w-3 h-3 text-sky-300" />;
      case 'tool':
        return <Wrench className="w-3 h-3 text-emerald-300" />;
      default:
        return <CornerDownRight className="w-3 h-3 text-emerald-100/55" />;
    }
  };

  return (
    <div className="max-w-[68ch] py-1" data-testid="thread-trace-tree">
      {/* Trace Header Row: Agent Identity + Smoothly Rotating Collapse Chevron */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
        className="ui-tactile w-full min-h-[36px] flex items-center justify-between gap-2 text-left group cursor-pointer rounded-lg px-1 -mx-1 hover:bg-white/[0.03]"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            aria-hidden="true"
            className={`w-6 h-6 rounded-full border flex items-center justify-center text-[11px] font-mono shrink-0 transition-colors ${
              isLive
                ? 'border-[#34D399]/60 bg-[#34D399]/14 text-[#6EE7B7]'
                : 'border-white/15 bg-white/[0.06] text-emerald-100/80'
            }`}
          >
            ⠓
          </span>
          <span className="text-[13.5px] font-medium text-white truncate">
            {agentLabel}
          </span>
          <span className="font-mono text-[11px] text-emerald-100/45 truncate">
            {sessionId}
          </span>
        </div>

        <span className="text-emerald-100/45 group-hover:text-white transition-colors shrink-0 p-1">
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              collapsed ? 'rotate-0' : 'rotate-180'
            }`}
          />
        </span>
      </button>

      {/* Smooth Animated Vertical Timeline Branch */}
      <AnimatedCollapsible open={!collapsed}>
        <div className="ml-3 pl-4 border-l border-white/12 mt-1.5 space-y-2.5 pb-1">
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAllSteps(true)}
              className="ui-tactile flex items-center gap-2.5 min-h-[32px] text-xs text-emerald-100/55 hover:text-white transition-colors cursor-pointer"
            >
              <span
                aria-hidden="true"
                className="w-5 h-5 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center text-emerald-100/60"
              >
                <MoreHorizontal className="w-3 h-3" />
              </span>
              <span className="font-mono text-[11.5px] tabular-nums">
                +{hiddenCount} earlier
              </span>
            </button>
          )}

          {visibleItems.map((step, idx) => (
            <StaggerItem
              key={step.id}
              index={idx}
              className="flex items-center justify-between gap-2.5 text-[12.5px] leading-snug"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  aria-hidden="true"
                  className="w-5 h-5 rounded-full bg-white/[0.05] border border-white/10 flex items-center justify-center shrink-0"
                >
                  {renderStepIcon(step.icon)}
                </span>
                <span className="font-medium text-emerald-50/90 shrink-0 truncate max-w-[140px] sm:max-w-none">
                  {step.label}
                </span>
                {step.detail && (
                  <span className="text-emerald-100/45 truncate text-[12px]">
                    {step.detail}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 font-mono text-[11px] tabular-nums text-emerald-100/35 shrink-0">
                <span>{step.timestamp}</span>
                <ChevronRight className="w-3 h-3 opacity-60" aria-hidden="true" />
              </div>
            </StaggerItem>
          ))}

          {isLive && (
            <div className="flex items-center gap-2.5 text-[12.5px] text-emerald-100/80 pt-0.5">
              <span
                aria-hidden="true"
                className="w-5 h-5 rounded-full bg-[#34D399]/12 border border-[#34D399]/35 flex items-center justify-center shrink-0"
              >
                <Sparkles className="w-3 h-3 text-[#6EE7B7] motion-safe:animate-spin motion-safe-only" />
              </span>
              <span className="font-medium text-emerald-50/90">Thinking</span>
              <span className="font-mono text-[11px] text-[#6EE7B7]/75">⠿</span>
            </div>
          )}
        </div>
      </AnimatedCollapsible>
    </div>
  );
}

