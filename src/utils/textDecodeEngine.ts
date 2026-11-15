export interface DecodeFrame {
  /** Finalized readable prefix */
  settled: string;
  /** Actively decoding cipher frontier characters */
  frontier: string;
  /** True once all target characters have settled */
  done: boolean;
}

// Progressive Unicode Braille density bands: dense near settled edge -> airy single-dots at leading edge
const BRAILLE_DENSITY_TIERS = [
  '⣿⡿⢿⣯⣟⣷⣾',
  '⠿⠟⠻⠯⠷⠧⠏',
  '⠓⠋⠛⠚⠙⠖⠦',
  '⠁⠂⠄⠈⠐⠠',
] as const;

/**
 * Computes an appropriate total reveal duration (ms) for any text length
 * so short phrases feel crisp and longer responses remain snappy to read.
 */
export function getDecodeDurationMs(text: string): number {
  const len = text.length;
  if (len <= 0) return 0;
  return Math.round(Math.min(1150, Math.max(380, 320 + len * 5.2)));
}

/**
 * Pure deterministic decoder frame generator:
 * Sweeps a settled text boundary left-to-right across `target`, keeping whitespace
 * and newlines intact while tapering the leading frontier through progressive Braille density glyphs.
 */
export function computeDecodeFrame(
  target: string,
  progress: number,
  tick: number,
  frontierWidth = 6
): DecodeFrame {
  if (!target) {
    return { settled: '', frontier: '', done: true };
  }

  const p = progress < 0 ? 0 : progress > 1 ? 1 : progress;
  if (p >= 0.999) {
    return { settled: target, frontier: '', done: true };
  }

  const len = target.length;
  const settledCount = Math.floor(p * len);
  const settled = target.slice(0, settledCount);

  // Reveal a tapered Braille-scramble frontier right ahead of the settled cursor
  const remaining = len - settledCount;
  const width = Math.min(frontierWidth, remaining);
  const tierCount = BRAILLE_DENSITY_TIERS.length;
  let frontier = '';

  for (let i = 0; i < width; i++) {
    const ch = target[settledCount + i];
    if (ch === '\n' || ch === '\r' || ch === ' ' || ch === '\t') {
      frontier += ch;
    } else {
      const tierIdx = Math.min(tierCount - 1, Math.floor((i / Math.max(1, width)) * tierCount));
      const glyphs = BRAILLE_DENSITY_TIERS[tierIdx];
      const hash = (settledCount + i * 7 + tick * 5 + i * 13) % glyphs.length;
      frontier += glyphs[hash < 0 ? hash + glyphs.length : hash];
    }
  }

  return { settled, frontier, done: false };
}
