import { useEffect, useRef } from 'react';
import { CornerDownLeft, Terminal } from 'lucide-react';
import { CATEGORY_LABELS, type SlashCommandSpec } from '../utils/slashPalette';

interface SlashCommandPaletteProps {
  open: boolean;
  items: SlashCommandSpec[];
  selectedIndex: number;
  onHoverIndex: (idx: number) => void;
  onSelectItem: (spec: SlashCommandSpec) => void;
  onClose: () => void;
}

export function SlashCommandPalette({
  open,
  items,
  selectedIndex,
  onHoverIndex,
  onSelectItem,
  onClose,
}: SlashCommandPaletteProps) {
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const activeEl = listRef.current.querySelector<HTMLElement>('[data-active="true"]');
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [open, selectedIndex, items.length]);

  if (!open) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-full mb-1.5 px-2.5 sm:px-6 lg:px-8 z-40">
      <div
        role="listbox"
        aria-label="Hermes Agent slash commands"
        data-testid="slash-command-palette"
        className="pointer-events-auto ui-menu-pop lg:max-w-[740px] lg:mx-auto w-full rounded-xl border border-white/14 bg-[#12151E]/96 backdrop-blur-xl shadow-[0_18px_48px_rgba(0,0,0,0.68)] overflow-hidden"
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/[0.08] bg-white/[0.02]">
          <div className="flex items-center gap-1.5 font-mono text-[10.5px] text-zinc-300">
            <Terminal className="w-3 h-3 text-[var(--ui-accent-soft)] shrink-0" />
            <span>Hermes Commands</span>
            <span className="text-zinc-500">· {items.length}</span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-500">
            <span className="hidden sm:inline">↑↓ navigate · Enter select</span>
            <button
              type="button"
              onClick={onClose}
              className="text-zinc-400 hover:text-white px-1.5 py-0.5 rounded border border-white/[0.08] hover:border-white/20 hover:bg-white/[0.06] cursor-pointer"
            >
              Esc
            </button>
          </div>
        </div>

      {items.length === 0 ? (
        <div className="px-3.5 py-3 font-mono text-xs text-zinc-400">
          No matching command. Press Enter to send as prompt or type <span className="text-white">/help</span>.
        </div>
      ) : (
        <div
          ref={listRef}
          className="max-h-[36dvh] sm:max-h-[260px] overflow-y-auto cyber-scroll divide-y divide-white/[0.04]"
        >
          {items.map((item, idx) => {
            const isSelected = idx === selectedIndex;
            const cmdSlug = item.command.slice(1);
            return (
              <button
                key={item.command}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-active={isSelected ? 'true' : 'false'}
                data-testid={`slash-item-${cmdSlug}`}
                onMouseEnter={() => onHoverIndex(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelectItem(item);
                }}
                className={`w-full px-3 py-2 text-left flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[rgba(var(--ui-accent-rgb),0.14)] text-white'
                    : 'text-zinc-300 hover:bg-white/[0.04]'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-mono text-xs font-semibold text-white">
                      {item.usage}
                    </span>
                    <span className="font-mono text-[10px] text-zinc-500">
                      {CATEGORY_LABELS[item.category]}
                    </span>
                  </div>
                  <p className="text-[11.5px] text-zinc-400 truncate mt-0.5">{item.summary}</p>
                </div>

                <span
                  className={`shrink-0 inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded border ${
                    isSelected
                      ? 'border-[rgba(var(--ui-accent-rgb),0.42)] bg-[rgba(var(--ui-accent-rgb),0.14)] text-[var(--ui-accent-soft)]'
                      : 'border-white/[0.08] text-zinc-500'
                  }`}
                >
                  <CornerDownLeft className="w-2.5 h-2.5" />
                  <span>{item.action === 'run' ? 'Run' : 'Use'}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}
