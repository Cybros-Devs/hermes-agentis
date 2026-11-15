import { useLayoutEffect, useRef, useState } from 'react';
import { Terminal } from 'lucide-react';
import type { ChannelId, TerminalEntry } from '../types/hermes';
import { DecodedText } from './DecodedText';
import { EmptyState, ScrollToBottomButton, StatusPulse } from './ui';

interface CommandTerminalProps {
  activeChannel: ChannelId;
  activeSessionId?: string;
  entries: TerminalEntry[];
  isThinking: boolean;
  onSubmitInput: (value: string) => void;
}

const QUICK_COMMANDS = [
  '/brief',
  '/tasks',
  '/skills',
  '/cron',
  '/gateway',
  '/approve card-1',
  '/help',
];

export function CommandTerminal({
  activeChannel,
  activeSessionId,
  entries,
  isThinking,
  onSubmitInput,
}: CommandTerminalProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isPinnedRef = useRef(true);
  const lastChannelRef = useRef(activeChannel);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const scopedEntries = entries.filter((entry) => entry.channelId === activeChannel);
  const lastEntryLen = scopedEntries[scopedEntries.length - 1]?.text.length ?? 0;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const switchedChannel = lastChannelRef.current !== activeChannel;
    lastChannelRef.current = activeChannel;
    if (switchedChannel) {
      isPinnedRef.current = true;
      setAwayFromBottom(false);
    }
    if (!isPinnedRef.current) return;

    const snap = () => {
      if (scrollRef.current && isPinnedRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    };
    snap();
    const rafId = requestAnimationFrame(snap);
    const timerId = window.setTimeout(snap, 60);
    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(timerId);
    };
  }, [scopedEntries.length, lastEntryLen, isThinking, activeChannel]);

  return (
    <section
      aria-label="Hermes Command Line Interface"
      className="relative flex flex-col h-full rounded-xl bg-[#0B1714]/90 border border-white/12 overflow-hidden shadow-[0_12px_36px_rgba(0,0,0,0.35)]"
    >
      {/* Terminal Header & Quick Commands */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-white/10 bg-black/35">
        <div className="flex items-center gap-2 font-mono text-xs text-emerald-50/85">
          <Terminal className="w-3.5 h-3.5 text-[#34D399]" />
          <span className="font-semibold text-white">hermes-agent</span>
          <span className="text-emerald-100/40">·</span>
          <span className="text-emerald-100/75">{activeSessionId || `hermes-${activeChannel}`}</span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto cyber-scroll">
          {QUICK_COMMANDS.map((cmd) => (
            <button
              key={cmd}
              type="button"
              onClick={() => onSubmitInput(cmd)}
              className="ui-tactile px-2.5 py-1 rounded-md bg-white/[0.06] border border-white/14 font-mono text-[11px] text-emerald-50/90 hover:border-[#34D399]/60 hover:text-[#6EE7B7] whitespace-nowrap shrink-0 cursor-pointer"
            >
              {cmd}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable Output Stream */}
      <div
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current;
          if (!el) return;
          const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
          const pinned = dist < 96;
          isPinnedRef.current = pinned;
          setAwayFromBottom(dist > 140);
        }}
        data-testid="terminal-stream"
        className="cyber-scroll flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs leading-relaxed"
      >
        {scopedEntries.length === 0 ? (
          <EmptyState
            icon={<Terminal className="w-4 h-4" />}
            title={`Session ${activeSessionId || `hermes-${activeChannel}`} ready`}
            description="Type a slash command (/help) or send a prompt below to drive this lane."
          />
        ) : (
          scopedEntries.map((entry) => {
            const isUser = entry.role === 'user' || entry.role === 'command';
            const isSystem = entry.role === 'system';

            return (
              <div key={entry.id} className="ui-msg-enter space-y-1">
                <div className="flex items-center gap-2 text-[11px] text-emerald-100/60">
                  <span
                    className={
                      isUser
                        ? 'text-[#6EE7B7] font-semibold'
                        : isSystem
                        ? 'text-emerald-200/75 font-semibold'
                        : 'text-white font-semibold'
                    }
                  >
                    {isUser ? 'YOU' : isSystem ? 'SYSTEM' : 'HERMES'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{entry.source.toUpperCase()}</span>
                  <span aria-hidden="true">·</span>
                  <span>{entry.timestamp}</span>
                </div>
                <pre
                  className={`whitespace-pre-wrap break-words font-mono text-[12.5px] leading-relaxed ${
                    isUser
                      ? 'text-white rounded-lg bg-[#34D399]/[0.07] border border-[#34D399]/20 px-3 py-2'
                      : isSystem
                      ? 'text-emerald-50/85 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2'
                      : 'text-emerald-50/92 pl-0.5'
                  }`}
                >
                  {isUser ? (
                    `$ ${entry.text}`
                  ) : (
                    <DecodedText
                      text={entry.text}
                      animate={!entry.id.startsWith('init-')}
                      speedMultiplier={1.25}
                    />
                  )}
                </pre>
              </div>
            );
          })
        )}

        {isThinking && (
          <div className="ui-msg-enter flex items-center gap-2 text-xs text-[#6EE7B7]">
            <StatusPulse state="thinking" size="sm" />
            <span>HERMES</span>
            <span aria-hidden="true">·</span>
            <span>Routing through active lane...</span>
          </div>
        )}
      </div>

      {/* Compact Terminal Footer */}
      <div className="px-4 py-2 border-t border-white/[0.07] bg-black/25 flex items-center justify-between gap-3 font-mono text-[10.5px] text-emerald-100/45 tabular-nums shrink-0">
        <span className="truncate">Tab autocomplete · ↑↓ command history</span>
        <span className="shrink-0">
          #{activeChannel} · {scopedEntries.length} {scopedEntries.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      <ScrollToBottomButton
        visible={awayFromBottom}
        compact
        testId="cli-jump-to-latest-btn"
        onClick={() => {
          isPinnedRef.current = true;
          setAwayFromBottom(false);
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        }}
        className="absolute bottom-11 right-4 z-20"
      />
    </section>
  );
}

