import { useEffect, useState } from 'react';
import { computeDecodeFrame, getDecodeDurationMs } from '../utils/textDecodeEngine';

interface DecodedTextProps {
  text: string;
  animate?: boolean;
  className?: string;
  frontierClassName?: string;
  speedMultiplier?: number;
  durationMs?: number;
}

export function DecodedText({
  text,
  animate = true,
  className,
  frontierClassName = 'text-[var(--ui-accent-soft)]',
  speedMultiplier = 1,
  durationMs,
}: DecodedTextProps) {
  const isUiReduced = () =>
    (typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) ||
    (typeof document !== 'undefined' &&
      document.documentElement.getAttribute('data-ui-motion') === 'reduced');

  const [frame, setFrame] = useState(() => {
    if (!animate || isUiReduced() || !text) {
      return { settled: text, frontier: '', done: true };
    }
    return computeDecodeFrame(text, 0, 0);
  });

  useEffect(() => {
    if (!animate || isUiReduced() || !text) {
      setFrame({ settled: text, frontier: '', done: true });
      return;
    }

    const totalMs = Math.max(
      220,
      Math.round((durationMs ?? getDecodeDurationMs(text)) / Math.max(0.25, speedMultiplier))
    );
    const start = performance.now();
    let tick = 0;
    let lastScramble = start;
    let rafId = 0;

    setFrame(computeDecodeFrame(text, 0.02, 0));

    const step = (now: number) => {
      const elapsed = now - start;
      const rawProgress = Math.min(1, elapsed / totalMs);
      // Ease-out cubic sweep so opening words appear crisply and trailing edge resolves smoothly
      const eased = 1 - Math.pow(1 - rawProgress, 1.35);

      if (now - lastScramble >= 32) {
        tick++;
        lastScramble = now;
      }

      const next = computeDecodeFrame(text, eased, tick);
      setFrame(next);

      if (!next.done && rawProgress < 1) {
        rafId = window.requestAnimationFrame(step);
      } else {
        setFrame({ settled: text, frontier: '', done: true });
      }
    };

    rafId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(rafId);
  }, [text, animate, speedMultiplier, durationMs]);

  return (
    <span className={className} aria-label={text}>
      <span aria-hidden="true">
        {frame.settled}
        {frame.frontier ? <span className={frontierClassName}>{frame.frontier}</span> : null}
      </span>
    </span>
  );
}
