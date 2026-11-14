import { useLayoutEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';
import type { ChannelId, TerminalEntry } from '../types/hermes';
import { DecodedText } from './DecodedText';

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
  const scopedEntries = entries.filter((entry) => entry.channelId === activeChannel);
  const lastEntryLen = scopedEntries[scopedEntries.length - 1]?.text.length ?? 0;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const switchedChannel = lastChannelRef.current !== activeChannel;
    lastChannelRef.current = activeChannel;
    if (switchedChannel) isPinnedRef.current = true;
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
      className="flex flex-col h-full rounded-xl bg-[#0B1714]/80 border border-white/10 overflow-hidden"
    >
      {/* Terminal Header & Quick Commands */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-white/8 bg-black/20">
        <div className="flex items-center gap-2 font-mono text-xs text-emerald-50/80">
          <Terminal className="w-3.5 h-3.5 text-[#34D399]" />
          <span className="font-semibold text-white">hermes-agent</span>
          <span className="text-emerald-100/35">·</span>
          <span className="text-emerald-100/60">{activeSessionId || `hermes-${activeChannel}`}</span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto">
          {QUICK_COMMANDS.map((cmd) => (
            <button
              key={cmd}
              type="button"
              onClick={() => onSubmitInput(cmd)}
              className="px-2.5 py-1 rounded-md bg-white/[0.05] border border-white/10 font-mono text-[11px] text-emerald-50/80 hover:border-[#34D399]/55 hover:text-[#6EE7B7] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
          isPinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
        }}
        data-testid="terminal-stream"
        className="cyber-scroll flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs leading-relaxed"
      >
        {scopedEntries.length === 0 ? (
          <p className="text-emerald-100/45">
            Session {activeSessionId || `hermes-${activeChannel}`} ready. Type a slash command (/help) or prompt below.
          </p>
        ) : (
          scopedEntries.map((entry) => {
            const isUser = entry.role === 'user' || entry.role === 'command';
            const isSystem = entry.role === 'system';

            return (
              <div key={entry.id} className="space-y-1">
                <div className="flex items-center gap-2 text-[11px] text-emerald-100/45">
                  <span
                    className={
                      isUser
                        ? 'text-[#6EE7B7] font-semibold'
                        : isSystem
                        ? 'text-emerald-100/65 font-semibold'
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
                      ? 'text-white'
                      : isSystem
                      ? 'text-emerald-50/85 bg-black/30 border border-white/10 rounded-lg p-2.5'
                      : 'text-emerald-50/90'
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
          <div className="flex items-center gap-2 text-xs text-[#6EE7B7]">
            <span>HERMES</span>
            <span aria-hidden="true">·</span>
            <span>Routing through active lane...</span>
          </div>
        )}
      </div>
    </section>
  );
}
