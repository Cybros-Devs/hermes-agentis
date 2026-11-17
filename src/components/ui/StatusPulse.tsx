export type StatusPulseState =
  | 'idle'
  | 'live'
  | 'thinking'
  | 'speaking'
  | 'listening'
  | 'waiting'
  | 'done'
  | 'error'
  | 'muted';

interface StatusPulseProps {
  state: StatusPulseState;
  size?: 'sm' | 'md';
  className?: string;
}

const DOT_COLOR_MAP: Record<StatusPulseState, string> = {
  idle: 'bg-zinc-400/75',
  live: 'bg-[#4ADE80]',
  speaking: 'bg-[#4ADE80]',
  listening: 'bg-[#34D399]',
  thinking: 'bg-amber-400',
  waiting: 'bg-amber-300/85',
  done: 'bg-[#34D399]/85',
  error: 'bg-rose-400',
  muted: 'bg-rose-400/80',
};

const RING_COLOR_MAP: Record<StatusPulseState, string> = {
  idle: '',
  live: 'bg-[#4ADE80]/55',
  speaking: 'bg-[#4ADE80]/55',
  listening: 'bg-[#34D399]/55',
  thinking: 'bg-amber-400/55',
  waiting: '',
  done: '',
  error: 'bg-rose-400/50',
  muted: '',
};

/**
 * Semantic live-activity indicator. Emits a sonar pulse ring strictly during
 * active streaming/thinking/listening states and remains crisp static on idle.
 */
export function StatusPulse({
  state,
  size = 'sm',
  className = '',
}: StatusPulseProps) {
  const isLive =
    state === 'live' ||
    state === 'speaking' ||
    state === 'listening' ||
    state === 'thinking';

  const dim = size === 'md' ? 'w-2 h-2' : 'w-1.5 h-1.5';

  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex items-center justify-center shrink-0 ${dim} ${className}`}
    >
      {isLive && (
        <span
          className={`ui-status-ring motion-safe-only absolute inset-0 rounded-full ${RING_COLOR_MAP[state]}`}
        />
      )}
      <span className={`relative rounded-full ${dim} ${DOT_COLOR_MAP[state]}`} />
    </span>
  );
}
