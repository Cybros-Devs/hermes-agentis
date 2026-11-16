import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ThreadMinimapTurn } from '../utils/threadMinimap';

interface ThreadTurnMinimapProps {
  turns: ThreadMinimapTurn[];
  activeTurnId: string | null;
  onJumpToTurn: (anchorId: string) => void;
}

export function ThreadTurnMinimap({
  turns,
  activeTurnId,
  onJumpToTurn,
}: ThreadTurnMinimapProps) {
  const railRef = useRef<HTMLElement | null>(null);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [popoverTop, setPopoverTop] = useState<number>(0);

  const effectiveActiveId =
    activeTurnId ?? (turns.length > 0 ? turns[turns.length - 1]?.anchorId ?? null : null);

  const previewTurn = useMemo(
    () => (hoveredIdx !== null ? turns[hoveredIdx] ?? null : null),
    [hoveredIdx, turns]
  );

  // Clear stale hover index if turns shrink or swap channels.
  useEffect(() => {
    if (hoveredIdx !== null && hoveredIdx >= turns.length) {
      setHoveredIdx(null);
    }
  }, [hoveredIdx, turns.length]);

  const updatePreviewAnchor = useCallback((idx: number) => {
    setHoveredIdx(idx);
    const railEl = railRef.current;
    const btnEl = buttonRefs.current[idx];
    if (!railEl || !btnEl) return;

    const railRect = railEl.getBoundingClientRect();
    const btnRect = btnEl.getBoundingClientRect();
    const estimatedCardHeight = 132;
    const centerOffset = btnRect.top - railRect.top + btnRect.height * 0.5 - 26;
    const maxTop = Math.max(0, railRect.height - estimatedCardHeight);
    setPopoverTop(Math.max(0, Math.min(maxTop, Math.round(centerOffset))));
  }, []);

  if (turns.length === 0) {
    return null;
  }

  return (
    <nav
      ref={railRef}
      aria-label="Conversation turn minimap"
      data-testid="thread-turn-minimap"
      onMouseLeave={() => setHoveredIdx(null)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setHoveredIdx(null);
          (e.currentTarget.querySelector('button:focus') as HTMLElement | null)?.blur();
        }
      }}
      className="hidden sm:flex flex-col justify-center items-start absolute left-2 lg:left-3.5 top-3 bottom-3 z-20 pointer-events-none select-none"
    >
      <div className="pointer-events-auto relative max-h-full overflow-y-auto cyber-scroll py-1 pr-2 flex flex-col items-start">
        {turns.map((turn, idx) => {
          const isCurrent = turn.anchorId === effectiveActiveId;
          const isHovered = hoveredIdx === idx;
          const isLive = turn.status === 'live';
          const isError = turn.status === 'error';
          const isBudget = turn.status === 'budget';
          const isCancelled = turn.status === 'cancelled';

          const tickColorStyle =
            isHovered || isCurrent
              ? isLive
                ? undefined
                : isError
                ? undefined
                : {
                    backgroundColor: isHovered ? 'var(--ui-accent)' : 'var(--ui-accent-soft)',
                    boxShadow: isHovered
                      ? '0 0 10px rgba(var(--ui-accent-rgb), 0.45)'
                      : '0 0 6px rgba(var(--ui-accent-rgb), 0.25)',
                  }
              : undefined;

          return (
            <button
              key={turn.id}
              ref={(el) => {
                buttonRefs.current[idx] = el;
              }}
              type="button"
              data-testid={`minimap-tick-${turn.anchorId}`}
              data-active={String(isCurrent)}
              data-status={turn.status}
              aria-label={`Jump to turn ${turn.turnNumber}: ${turn.title}`}
              aria-current={isCurrent ? 'location' : undefined}
              onMouseEnter={() => updatePreviewAnchor(idx)}
              onFocus={() => updatePreviewAnchor(idx)}
              onBlur={(e) => {
                if (!railRef.current?.contains(e.relatedTarget as Node | null)) {
                  setHoveredIdx(null);
                }
              }}
              onClick={() => {
                onJumpToTurn(turn.anchorId);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  const nextIdx = Math.min(turns.length - 1, idx + 1);
                  buttonRefs.current[nextIdx]?.focus();
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  const prevIdx = Math.max(0, idx - 1);
                  buttonRefs.current[prevIdx]?.focus();
                }
              }}
              className="group relative flex items-center py-[5px] px-1 cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-[#34D399]/70 rounded-sm"
            >
              <span
                style={tickColorStyle}
                className={`block h-[2px] w-5 rounded-full origin-left transition-[transform,opacity,background-color] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  isHovered
                    ? `scale-x-100 ${
                        isLive
                          ? 'bg-amber-300'
                          : isError
                          ? 'bg-rose-400'
                          : ''
                      }`
                    : isCurrent
                    ? `scale-x-[0.82] ${
                        isLive
                          ? 'bg-amber-300/95'
                          : isError
                          ? 'bg-rose-400/90'
                          : ''
                      }`
                    : `scale-x-[0.5] ${
                        isLive
                          ? 'bg-amber-300/70 group-hover:bg-amber-300'
                          : isError
                          ? 'bg-rose-400/55 group-hover:bg-rose-300'
                          : isBudget
                          ? 'bg-amber-200/45 group-hover:bg-amber-200/80'
                          : isCancelled
                          ? 'bg-white/20 group-hover:bg-white/45'
                          : 'bg-white/22 group-hover:bg-white/65'
                      } group-hover:scale-x-[0.88]`
                }`}
              />
              {isLive && (
                <span
                  aria-hidden="true"
                  className="ml-1 w-1 h-1 rounded-full bg-amber-300 motion-safe:animate-pulse motion-safe-only"
                />
              )}
            </button>
          );
        })}
      </div>

      {previewTurn && (
        <div
          role="tooltip"
          data-testid="minimap-preview-card"
          style={{ top: `${popoverTop}px` }}
          className="ui-pop-in pointer-events-none absolute left-full ml-2 w-[268px] sm:w-[304px] rounded-xl border border-white/[0.18] bg-[#091511] px-3.5 py-2.5 shadow-[0_20px_48px_rgba(0,0,0,0.78)]"
        >
          <p className="text-[13px] font-semibold text-white leading-snug line-clamp-2 break-words">
            {previewTurn.title}
          </p>
          <p className="mt-1 text-[12px] leading-[1.52] text-emerald-100/68 line-clamp-3 break-words">
            {previewTurn.snippet}
          </p>
          <div className="mt-2 pt-1.5 border-t border-white/[0.06] flex items-center justify-between gap-2 font-mono text-[10px] text-emerald-100/45 tabular-nums">
            <span className="truncate">
              Turn {previewTurn.turnNumber}/{turns.length}
              {previewTurn.stepCount > 0
                ? ` · ${previewTurn.stepCount} ${
                    previewTurn.stepCount === 1 ? 'step' : 'steps'
                  }`
                : ''}
              {previewTurn.status === 'live'
                ? ' · Live'
                : previewTurn.status === 'error'
                ? ' · Error'
                : previewTurn.status === 'cancelled'
                ? ' · Cancelled'
                : previewTurn.status === 'budget'
                ? ' · Budget'
                : ''}
            </span>
            {previewTurn.timestamp && (
              <span className="shrink-0 text-emerald-100/40">{previewTurn.timestamp}</span>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
