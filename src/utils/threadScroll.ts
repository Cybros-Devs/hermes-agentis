export interface ScrollPinInput {
  prevScrollTop: number;
  nextScrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  isNewVisit: boolean;
  isProgrammatic: boolean;
  prevPinned: boolean;
  hasUserScrollIntent?: boolean;
  thresholdPx?: number;
}

export interface ScrollPinResult {
  pinned: boolean;
  away: boolean;
}

export function isNearBottom(params: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  thresholdPx?: number;
}): boolean {
  const threshold = params.thresholdPx ?? 96;
  const distance = params.scrollHeight - params.scrollTop - params.clientHeight;
  return distance <= threshold;
}

/**
 * Computes whether a chat thread container should remain pinned to the bottom.
 * Growing content height (e.g. async history load or DecodedText line wrapping)
 * never unpins when `isProgrammatic` is active, the user has not scrolled upward,
 * or transient clamp jitter occurs without user scroll intent.
 */
export function computeThreadScrollPin(input: ScrollPinInput): ScrollPinResult {
  if (input.isNewVisit) {
    return { pinned: true, away: false };
  }

  const threshold = input.thresholdPx ?? 96;
  const distanceFromBottom = Math.max(
    0,
    input.scrollHeight - input.nextScrollTop - input.clientHeight
  );
  const nearBottom = distanceFromBottom <= threshold;

  if (nearBottom) {
    return { pinned: true, away: false };
  }

  if (input.isProgrammatic) {
    return { pinned: input.prevPinned, away: false };
  }

  const farThreshold = Math.max(120, input.clientHeight * 0.4);
  const scrolledUp = input.nextScrollTop < input.prevScrollTop - 2;
  if (!scrolledUp && input.prevPinned) {
    // Content grew beneath the viewport before the ResizeObserver/rAF snap ran.
    return { pinned: true, away: false };
  }

  if (
    input.prevPinned &&
    input.hasUserScrollIntent === false &&
    distanceFromBottom <= farThreshold
  ) {
    // Browser clamped scrollTop during transient line-wrap shrink before content re-expanded.
    return { pinned: true, away: false };
  }

  return {
    pinned: false,
    away: distanceFromBottom > farThreshold,
  };
}
