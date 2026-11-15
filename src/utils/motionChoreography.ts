export interface SlidingIndicatorRect {
  x: number;
  y: number;
  width: number;
  height: number;
  ready: boolean;
}

export interface StaggerOptions {
  stepMs?: number;
  maxDelayMs?: number;
  speedScale?: number;
  reducedMotion?: boolean;
}

/**
 * Computes deterministic, speed-scaled stagger delay in milliseconds for list/card cascades.
 * Clamped to keep longer lists snappy and zeroed when reduced motion is active.
 */
export function computeStaggerDelayMs(
  index: number,
  options: StaggerOptions = {}
): number {
  if (options.reducedMotion) return 0;
  const safeIndex = Math.max(0, Math.floor(Number.isFinite(index) ? index : 0));
  const stepMs = Math.max(0, options.stepMs ?? 30);
  const maxDelayMs = Math.max(0, options.maxDelayMs ?? 240);
  const speed = Math.max(0.25, Math.min(2.5, options.speedScale ?? 1));
  const raw = Math.min(safeIndex * stepMs, maxDelayMs);
  return Math.round(raw / speed);
}

/**
 * Computes GPU transform coordinates for a gliding active tab indicator inside a container.
 */
export function computeSlidingIndicatorRect(
  containerRect: { left: number; top: number; scrollLeft?: number; scrollTop?: number } | null,
  itemRect: { left: number; top: number; width: number; height: number } | null
): SlidingIndicatorRect {
  if (!containerRect || !itemRect || itemRect.width <= 0 || itemRect.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0, ready: false };
  }
  const scrollLeft = containerRect.scrollLeft ?? 0;
  const scrollTop = containerRect.scrollTop ?? 0;
  return {
    x: Number((itemRect.left - containerRect.left + scrollLeft).toFixed(2)),
    y: Number((itemRect.top - containerRect.top + scrollTop).toFixed(2)),
    width: Number(itemRect.width.toFixed(2)),
    height: Number(itemRect.height.toFixed(2)),
    ready: true,
  };
}

/**
 * Top edge scroll fade should only appear once content has actually scrolled under the viewport,
 * keeping top messages at scrollTop === 0 crisp and un-dimmed.
 */
export function shouldShowScrollTopFade(scrollTop: number, thresholdPx = 12): boolean {
  if (!Number.isFinite(scrollTop)) return false;
  return scrollTop > thresholdPx;
}
