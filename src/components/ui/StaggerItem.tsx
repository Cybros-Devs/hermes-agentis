import type { CSSProperties, ReactNode } from 'react';
import { computeStaggerDelayMs } from '../../utils/motionChoreography';

interface StaggerItemProps {
  index: number;
  speedScale?: number;
  reducedMotion?: boolean;
  children: ReactNode;
  className?: string;
}

export function getStaggerVars(
  index: number,
  speedScale = 1,
  reducedMotion = false
): CSSProperties {
  const delayMs = computeStaggerDelayMs(index, {
    stepMs: 30,
    maxDelayMs: 240,
    speedScale,
    reducedMotion,
  });
  return {
    '--stagger-delay': `${delayMs}ms`,
  } as CSSProperties;
}

export function StaggerItem({
  index,
  speedScale = 1,
  reducedMotion = false,
  children,
  className = '',
}: StaggerItemProps) {
  return (
    <div
      style={getStaggerVars(index, speedScale, reducedMotion)}
      className={`ui-stagger-enter ${className}`}
    >
      {children}
    </div>
  );
}
