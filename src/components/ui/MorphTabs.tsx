import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { computeSlidingIndicatorRect } from '../../utils/motionChoreography';

export interface MorphTabItem<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
  testId?: string;
}

interface MorphTabsProps<T extends string> {
  items: readonly MorphTabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  variant?: 'underline' | 'pill' | 'rail';
  className?: string;
  fullWidth?: boolean;
}

export function MorphTabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  variant = 'underline',
  className = '',
  fullWidth = false,
}: MorphTabsProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [indicator, setIndicator] = useState({ x: 0, y: 0, width: 0, height: 0, ready: false });

  const measure = useCallback(() => {
    const container = containerRef.current;
    const activeEl = itemRefs.current[value];
    if (!container || !activeEl) {
      setIndicator((prev) => (prev.ready ? { ...prev, ready: false } : prev));
      return;
    }
    const cRect = container.getBoundingClientRect();
    const iRect = activeEl.getBoundingClientRect();
    const next = computeSlidingIndicatorRect(
      {
        left: cRect.left,
        top: cRect.top,
        scrollLeft: container.scrollLeft,
        scrollTop: container.scrollTop,
      },
      {
        left: iRect.left,
        top: iRect.top,
        width: iRect.width,
        height: iRect.height,
      }
    );
    setIndicator(next);
  }, [value]);

  useLayoutEffect(() => {
    measure();
  }, [measure, items]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(container);
    for (const item of items) {
      const el = itemRefs.current[item.id];
      if (el) ro.observe(el);
    }
    return () => ro.disconnect();
  }, [items, measure]);

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={ariaLabel}
      className={`relative ${
        variant === 'rail'
          ? 'grid grid-cols-2 sm:flex sm:flex-col gap-1.5 sm:gap-1'
          : 'flex items-center'
      } ${variant === 'underline' ? 'gap-5' : variant === 'pill' ? 'gap-1' : ''} ${className}`}
    >
      {indicator.ready && (
        <span
          aria-hidden="true"
          className={`ui-tab-glide pointer-events-none absolute top-0 left-0 ${
            variant === 'underline'
              ? 'h-[2px] rounded-full bg-[var(--ui-accent,#34d399)] shadow-[0_0_10px_rgba(var(--ui-accent-rgb,52,211,153),0.45)]'
              : 'rounded-lg bg-[rgba(var(--ui-accent-rgb,52,211,153),0.15)] border border-[rgba(var(--ui-accent-rgb,52,211,153),0.42)]'
          }`}
          style={{
            width: `${indicator.width}px`,
            height: variant === 'underline' ? '2px' : `${indicator.height}px`,
            transform:
              variant === 'underline'
                ? `translate3d(${indicator.x}px, ${indicator.y + indicator.height - 2}px, 0)`
                : `translate3d(${indicator.x}px, ${indicator.y}px, 0)`,
          }}
        />
      )}

      {items.map((item) => {
        const active = value === item.id;
        return (
          <button
            key={item.id}
            ref={(el) => {
              itemRefs.current[item.id] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            aria-current={variant === 'underline' && active ? 'page' : undefined}
            data-testid={item.testId}
            onClick={() => onChange(item.id)}
            className={`ui-tactile relative z-10 inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#34D399] transition-colors duration-150 ${
              fullWidth ? 'flex-1 justify-center' : ''
            } ${
              variant === 'underline'
                ? `py-2 text-xs ${
                    active ? 'text-white font-semibold' : 'text-emerald-100/60 hover:text-white font-medium'
                  }`
                : variant === 'rail'
                ? `sm:justify-start justify-center px-3 py-2 rounded-xl text-xs font-medium ${
                    active
                      ? 'text-[var(--ui-accent-soft,#6ee7b7)]'
                      : 'text-emerald-100/65 hover:text-white hover:bg-white/[0.04]'
                  }`
                : `py-2 px-3 rounded-lg text-xs font-medium ${
                    active
                      ? 'text-[var(--ui-accent-soft,#6ee7b7)]'
                      : 'text-emerald-100/55 hover:text-white'
                  }`
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
