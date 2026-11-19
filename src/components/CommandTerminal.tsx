import { useLayoutEffect, useRef, useState } from 'react';
import type { ChannelId, TerminalEntry } from '../types/hermes';
import { DecodedText } from './DecodedText';
import { ScrollToBottomButton, StatusPulse } from './ui';

interface CommandTerminalProps {
  activeChannel: ChannelId;
  activeSessionId?: string;
  entries: TerminalEntry[];
  isThinking: boolean;
  onSubmitInput: (value: string) => void;
}

const QUICK_COMMANDS: Array<{ cmd: string; summary: string }> = [
  { cmd: '/gateway', summary: 'Probe server health, profile & capabilities' },
  { cmd: '/skills', summary: 'List skills loaded from GET /v1/skills' },
  { cmd: '/toolsets', summary: 'Inspect enabled toolsets from GET /v1/toolsets' },
  { cmd: '/cron', summary: 'Show scheduled jobs from GET /api/jobs' },
  { cmd: '/sessions', summary: 'List active sessions on this gateway' },
  { cmd: '/tasks', summary: 'Inspect active & completed turn tasks' },
  { cmd: '/help', summary: 'Show all CLI & slash commands' },
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

  const isDraftSession = !activeSessionId || activeSessionId === 'new session';
  const sessionLabel = isDraftSession
    ? activeChannel
      ? `hermes-${activeChannel}`
      : 'new-session'
    : activeSessionId;
  const readyHeading = isDraftSession
    ? 'New session ready'
    : `Session ${sessionLabel} ready`;

  return (
    <section
      aria-label="Hermes Command Line Interface"
      className="relative flex flex-col h-full max-w-[780px] mx-auto w-full overflow-hidden"
    >
      {/* Clean Single-Row Console Header */}
      <div className="pb-2.5 border-b border-white/[0.08] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <h1 className="text-base font-semibold text-white tracking-tight shrink-0">
            Hermes CLI
          </h1>
          <span aria-hidden="true" className="text-zinc-600 shrink-0">·</span>
          <span title={sessionLabel} className="font-mono text-[11px] text-zinc-400 truncate">
            {sessionLabel}
          </span>
        </div>

        {scopedEntries.length > 0 ? (
          <div className="flex flex-nowrap sm:flex-wrap lg:flex-nowrap items-center sm:justify-end gap-0.5 min-w-0 overflow-x-auto cyber-scroll">
            {QUICK_COMMANDS.map(({ cmd, summary }) => (
              <button
                key={cmd}
                type="button"
                title={summary}
                onClick={() => onSubmitInput(cmd)}
                className="ui-tactile px-1.5 py-1 rounded-md font-mono text-[10.5px] text-zinc-400 hover:text-[var(--ui-accent-soft)] hover:bg-white/[0.05] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {cmd}
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onSubmitInput('/help')}
            className="self-start sm:self-auto font-mono text-[11px] text-zinc-400 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            /help
          </button>
        )}
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
        className="cyber-scroll flex-1 overflow-y-auto py-4 space-y-3 font-mono text-xs leading-relaxed"
      >
        {scopedEntries.length === 0 ? (
          <div className="h-full flex flex-col justify-center max-w-[540px] mx-auto py-4 space-y-4">
            <div className="space-y-1">
              <div className="text-sm font-sans font-semibold text-white">
                {readyHeading}
              </div>
              <p className="text-xs font-sans text-zinc-400">
                Run a quick command below or enter a prompt in the composer.
              </p>
            </div>
            <div className="divide-y divide-white/[0.06] border-y border-white/[0.07]">
              {QUICK_COMMANDS.slice(0, 6).map(({ cmd, summary }) => (
                <button
                  key={cmd}
                  type="button"
                  onClick={() => onSubmitInput(cmd)}
                  className="ui-tactile w-full text-left py-2.5 px-1 flex items-center justify-between gap-4 hover:bg-white/[0.03] transition-colors cursor-pointer group"
                >
                  <span className="text-[var(--ui-accent-soft)] font-semibold shrink-0 group-hover:translate-x-0.5 transition-transform">
                    {cmd}
                  </span>
                  <span className="text-[11px] text-zinc-400 truncate">{summary}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          scopedEntries.map((entry) => {
            const isUser = entry.role === 'user' || entry.role === 'command';
            const isSystem = entry.role === 'system';

            return (
              <div key={entry.id} className="ui-msg-enter space-y-1">
                <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                  <span
                    className={
                      isUser
                        ? 'text-[var(--ui-accent-soft)] font-semibold'
                        : isSystem
                        ? 'text-zinc-300 font-semibold'
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
                      ? 'text-white rounded-lg bg-white/[0.06] border border-white/[0.12] px-3 py-2'
                      : isSystem
                      ? 'text-zinc-200 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2'
                      : 'text-zinc-100 pl-0.5'
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
          <div className="ui-msg-enter flex items-center gap-2 text-xs text-[var(--ui-accent-soft)]">
            <StatusPulse state="thinking" size="sm" />
            <span>HERMES</span>
            <span aria-hidden="true">·</span>
            <span>Routing through active lane...</span>
          </div>
        )}
      </div>

      {/* Quiet Terminal Footer */}
      {scopedEntries.length > 0 && (
        <div className="pt-2 border-t border-white/[0.07] flex items-center justify-between gap-3 font-mono text-[10.5px] text-zinc-500 tabular-nums shrink-0">
          <span className="truncate">Tab autocomplete · ↑↓ history</span>
          <span className="shrink-0">
            {scopedEntries.length} {scopedEntries.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
      )}

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

