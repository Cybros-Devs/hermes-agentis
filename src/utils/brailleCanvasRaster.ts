export interface DotBucketSpec {
  xy: Float32Array;
  len: number;
  hex: string;
  alpha: number;
}

export interface BrailleRasterSurface {
  imageData: ImageData;
  u32: Uint32Array;
  bytes: Uint8ClampedArray;
  width: number;
  height: number;
}

export type BrailleDotProfile = 'crisp' | 'balanced' | 'phosphor';

export interface TonalRasterOptions {
  /** Optical dot matrix profile modulating core crispness and diameter range */
  dotProfile?: BrailleDotProfile;
  /** Additive-weighted phosphor bloom halo intensity around high-tier highlight dots (0..1.5) */
  bloom?: number;
}

const IS_LITTLE_ENDIAN = (() => {
  const buf = new ArrayBuffer(4);
  new Uint32Array(buf)[0] = 0x0a0b0c0d;
  return new Uint8Array(buf)[0] === 0x0d;
})();

export function parseHexRgb(hex: string): [number, number, number] {
  const clean = hex.charCodeAt(0) === 35 ? hex.slice(1) : hex;
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) || 0;
    const g = parseInt(clean[1] + clean[1], 16) || 0;
    const b = parseInt(clean[2] + clean[2], 16) || 0;
    return [r, g, b];
  }
  if (clean.length === 6) {
    const n = parseInt(clean, 16);
    if (!Number.isNaN(n)) {
      return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
    }
  }
  return [230, 240, 236];
}

export function mixHexColors(hexA: string, hexB: string, t: number): string {
  const cleanA = hexA.charCodeAt(0) === 35 ? hexA.slice(1) : hexA;
  const cleanB = hexB.charCodeAt(0) === 35 ? hexB.slice(1) : hexB;
  if (cleanA.length !== 6 || cleanB.length !== 6) return hexA;
  const [r1, g1, b1] = parseHexRgb(hexA);
  const [r2, g2, b2] = parseHexRgb(hexB);
  const w = Math.max(0, Math.min(1, t));
  const r = Math.round(r1 + (r2 - r1) * w);
  const g = Math.round(g1 + (g2 - g1) * w);
  const b = Math.round(b1 + (b2 - b1) * w);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export interface PortraitToneParams {
  mood: string;
  isSpeaking: boolean;
  isListening: boolean;
  isLoading: boolean;
  isThumb?: boolean;
  energy: number;
  tintHex?: string | null;
}

export interface PortraitTonePalette {
  hexes: [string, string, string, string, string];
  alphas: [number, number, number, number, number];
}

/**
 * Computes state-reactive 5-tier halftone dot colors & opacities for the Braille portrait
 * so cognitive states (thinking amber phosphor, listening/speaking sky-silver glow, alert rose)
 * read naturally within the dot matrix itself.
 */
export function resolvePortraitTonePalette(params: PortraitToneParams): PortraitTonePalette {
  const { mood, isSpeaking, isListening, isLoading, isThumb = false, energy, tintHex } = params;
  const speakingHot = !isThumb && isSpeaking && energy > 0.22;
  const activeVoiceTint = !isThumb && (isLoading || isListening || speakingHot);
  const isThinkingState = !isThumb && !activeVoiceTint && mood === 'thinking';
  const isAlertState = !isThumb && !activeVoiceTint && mood === 'alert';

  const baseHexes: [string, string, string, string, string] = isThinkingState
    ? ['#B48448', '#D9B26F', '#EFE2C4', '#F8F3E8', '#FFFFFF']
    : isAlertState
    ? ['#B0707C', '#D89AA6', '#EFD4D9', '#F9ECEF', '#FFFFFF']
    : activeVoiceTint
    ? ['#BAE6FD', '#E0F2FE', '#F1F5F9', '#F8FAFC', '#FFFFFF']
    : ['#94A3B8', '#CBD5E1', '#E2E8F0', '#F1F5F9', '#FFFFFF'];

  const hexes: [string, string, string, string, string] = tintHex
    ? [
        mixHexColors(baseHexes[0], tintHex, activeVoiceTint ? 0.85 : 0.52),
        mixHexColors(baseHexes[1], tintHex, activeVoiceTint ? 0.72 : 0.44),
        mixHexColors(baseHexes[2], tintHex, 0.52),
        mixHexColors(baseHexes[3], tintHex, 0.34),
        mixHexColors(baseHexes[4], tintHex, 0.16),
      ]
    : baseHexes;

  const boost = activeVoiceTint ? Math.min(0.06, energy * 0.05) : 0;
  const alphas: [number, number, number, number, number] = isLoading
    ? [0.46, 0.62, 0.76, 0.88, 0.96]
    : [
        Math.min(0.99, 0.56 + boost),
        Math.min(0.99, 0.74 + boost),
        Math.min(0.99, 0.87 + boost * 0.5),
        0.95,
        0.99,
      ];

  return { hexes, alphas };
}

export interface ShapeToneParams {
  low: string;
  mid: string;
  high: string;
  isThinking: boolean;
  isSpeaking: boolean;
  energy: number;
}

export function resolveShapeTonePalette(params: ShapeToneParams): {
  hexes: [string, string, string, string, string];
  alphas: [number, number, number, number, number];
} {
  const { low, mid, high, isThinking, isSpeaking, energy } = params;
  const warmAmberMid = '#FBBF24';
  const warmAmberHigh = '#FEF3C7';

  const hex0 = isThinking ? mixHexColors(low, '#D97706', 0.22) : low;
  const hex1 = isThinking
    ? mixHexColors(mixHexColors(low, mid, 0.58), warmAmberMid, 0.2)
    : mixHexColors(low, mid, 0.58);
  const hex2 = isThinking ? mixHexColors(mid, warmAmberMid, 0.28) : mid;
  const hex3 = isThinking
    ? mixHexColors(mixHexColors(mid, high, 0.55), warmAmberHigh, 0.32)
    : mixHexColors(mid, high, 0.55);
  const hex4 = isSpeaking
    ? mixHexColors(high, '#FFFFFF', Math.min(0.55, 0.18 + energy * 0.35))
    : isThinking
    ? mixHexColors(high, warmAmberHigh, 0.35)
    : high;

  const speakBoost = isSpeaking ? Math.min(0.05, energy * 0.04) : 0;
  return {
    hexes: [hex0, hex1, hex2, hex3, hex4],
    alphas: [
      Math.min(0.99, 0.74 + speakBoost),
      Math.min(0.99, 0.86 + speakBoost),
      0.93,
      0.96,
      0.99,
    ],
  };
}

export function createRasterSurface(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): BrailleRasterSurface {
  const w = Math.max(1, width | 0);
  const h = Math.max(1, height | 0);
  const imageData = ctx.createImageData(w, h);
  return {
    imageData,
    u32: new Uint32Array(imageData.data.buffer),
    bytes: imageData.data,
    width: w,
    height: h,
  };
}

/**
 * Rasterizes coordinate dot buckets into a reusable straight-RGBA ImageData buffer
 * with analytical subpixel box-coverage anti-aliasing (single putImageData call/frame).
 */
export function rasterizeDotBucketsToSurface(
  surface: BrailleRasterSurface,
  buckets: readonly DotBucketSpec[],
  dpr: number,
  dotDiameterCss: number
): void {
  const { u32, bytes, width, height } = surface;
  u32.fill(0);

  const dotPx = Math.max(0.75, dotDiameterCss * dpr);

  for (let bIdx = 0; bIdx < buckets.length; bIdx++) {
    const bucket = buckets[bIdx];
    const len = bucket.len;
    if (len <= 0) continue;

    const [r, g, b] = parseHexRgb(bucket.hex);
    const baseA = Math.max(0, Math.min(255, Math.round(bucket.alpha * 255)));
    if (baseA === 0) continue;

    const xy = bucket.xy;
    const packedRgb = (b << 16) | (g << 8) | r;

    for (let i = 0; i < len; i += 2) {
      const x0 = xy[i] * dpr;
      const y0 = xy[i + 1] * dpr;
      const x1 = x0 + dotPx;
      const y1 = y0 + dotPx;

      let ix0 = x0 | 0;
      if (x0 < 0) ix0 = 0;
      let iy0 = y0 | 0;
      if (y0 < 0) iy0 = 0;
      let ix1 = x1 | 0;
      if (ix1 >= width) ix1 = width - 1;
      let iy1 = y1 | 0;
      if (iy1 >= height) iy1 = height - 1;

      for (let py = iy0; py <= iy1; py++) {
        const pyNext = py + 1;
        const covY = (pyNext < y1 ? pyNext : y1) - (py > y0 ? py : y0);
        if (covY <= 0) continue;
        const rowPixel = py * width;

        for (let px = ix0; px <= ix1; px++) {
          const pxNext = px + 1;
          const covX = (pxNext < x1 ? pxNext : x1) - (px > x0 ? px : x0);
          if (covX <= 0) continue;

          const covA = (baseA * covX * covY + 0.5) | 0;
          if (covA <= 0) continue;

          const pIdx = rowPixel + px;
          const off = pIdx << 2;
          const prevA = bytes[off + 3];

          if (prevA === 0) {
            if (IS_LITTLE_ENDIAN) {
              u32[pIdx] = ((covA > 255 ? 255 : covA) << 24) | packedRgb;
            } else {
              bytes[off] = r;
              bytes[off + 1] = g;
              bytes[off + 2] = b;
              bytes[off + 3] = covA > 255 ? 255 : covA;
            }
          } else {
            const sumA = prevA + covA;
            const nextA = sumA > 255 ? 255 : sumA;
            const wNew = covA / (prevA + covA);
            const wOld = 1 - wNew;
            bytes[off] = (bytes[off] * wOld + r * wNew + 0.5) | 0;
            bytes[off + 1] = (bytes[off + 1] * wOld + g * wNew + 0.5) | 0;
            bytes[off + 2] = (bytes[off + 2] * wOld + b * wNew + 0.5) | 0;
            bytes[off + 3] = nextA;
          }
        }
      }
    }
  }
}

export interface TonalDotBucketSpec extends DotBucketSpec {
  /** Relative diameter scale for halftone dot-size modulation (e.g. 0.68 shadows .. 1.18 highlights). */
  diameterScale?: number;
  /** Optional phosphor bloom intensity override for luminous highlight dots. */
  bloomWeight?: number;
}

/**
 * Multi-tier halftone rasterizer with per-bucket dot-size modulation, squared-radial
 * circular anti-aliasing (zero per-pixel sqrt), and optional soft phosphor corona bloom
 * for luminous eyes, crests, and anime rim highlights.
 */
export function rasterizeTonalDotBucketsToSurface(
  surface: BrailleRasterSurface,
  buckets: readonly TonalDotBucketSpec[],
  dpr: number,
  baseDotDiameterCss: number,
  options?: TonalRasterOptions
): void {
  const { u32, bytes, width, height } = surface;
  u32.fill(0);

  const profile = options?.dotProfile ?? 'balanced';
  const bloom = Math.max(0, Math.min(1.5, options?.bloom ?? 0));
  const profileScale = profile === 'crisp' ? 0.78 : profile === 'phosphor' ? 1.06 : 0.88;
  const softEdgeCut = profile === 'crisp' ? 0.52 : profile === 'phosphor' ? 0.28 : 0.44;
  const invEdgeSpan = 1 / (1.3225 - softEdgeCut); // (1.15)^2 = 1.3225

  const baseDotPx = Math.max(0.72, baseDotDiameterCss * dpr * profileScale);

  // Pass 1 (optional): Subtle soft phosphor halo beneath top-tier bright dots
  if (bloom > 0.04) {
    const startBloomBucket = Math.max(0, buckets.length - 2);
    for (let bIdx = startBloomBucket; bIdx < buckets.length; bIdx++) {
      const bucket = buckets[bIdx];
      const len = bucket.len;
      if (len <= 0) continue;

      const tierGain = bIdx === buckets.length - 1 ? 1.0 : 0.48;
      const haloAlphaMax = Math.min(
        96,
        Math.round(bucket.alpha * bloom * tierGain * (bucket.bloomWeight ?? 1) * 62)
      );
      if (haloAlphaMax <= 2) continue;

      const [r, g, b] = parseHexRgb(bucket.hex);
      const scale = bucket.diameterScale ?? 1;
      const dotPx = Math.max(0.65, baseDotPx * scale);
      const centerShift = (baseDotPx - dotPx) * 0.5;
      const haloRadius = dotPx * (0.95 + bloom * 0.38);
      const invHaloR2 = 1 / (haloRadius * haloRadius);
      const packedRgb = (b << 16) | (g << 8) | r;
      const xy = bucket.xy;

      for (let i = 0; i < len; i += 2) {
        const cx = xy[i] * dpr + centerShift + dotPx * 0.5;
        const cy = xy[i + 1] * dpr + centerShift + dotPx * 0.5;

        let ix0 = (cx - haloRadius) | 0;
        if (ix0 < 0) ix0 = 0;
        let iy0 = (cy - haloRadius) | 0;
        if (iy0 < 0) iy0 = 0;
        let ix1 = (cx + haloRadius) | 0;
        if (ix1 >= width) ix1 = width - 1;
        let iy1 = (cy + haloRadius) | 0;
        if (iy1 >= height) iy1 = height - 1;

        for (let py = iy0; py <= iy1; py++) {
          const dy = py + 0.5 - cy;
          const dy2 = dy * dy;
          const rowPixel = py * width;

          for (let px = ix0; px <= ix1; px++) {
            const dx = px + 0.5 - cx;
            const norm2 = (dx * dx + dy2) * invHaloR2;
            if (norm2 >= 1) continue;

            const falloff = 1 - norm2;
            const covA = (haloAlphaMax * falloff * falloff + 0.5) | 0;
            if (covA <= 1) continue;

            const pIdx = rowPixel + px;
            const off = pIdx << 2;
            const prevA = bytes[off + 3];
            if (prevA === 0) {
              if (IS_LITTLE_ENDIAN) {
                u32[pIdx] = (covA << 24) | packedRgb;
              } else {
                bytes[off] = r;
                bytes[off + 1] = g;
                bytes[off + 2] = b;
                bytes[off + 3] = covA;
              }
            } else {
              const nextA = prevA + covA > 210 ? 210 : prevA + covA;
              const nr = bytes[off] + ((r * covA) >> 8);
              const ng = bytes[off + 1] + ((g * covA) >> 8);
              const nb = bytes[off + 2] + ((b * covA) >> 8);
              bytes[off] = nr > 255 ? 255 : nr;
              bytes[off + 1] = ng > 255 ? 255 : ng;
              bytes[off + 2] = nb > 255 ? 255 : nb;
              bytes[off + 3] = nextA;
            }
          }
        }
      }
    }
  }

  // Pass 2: Crisp circular anti-aliased halftone dot cores
  for (let bIdx = 0; bIdx < buckets.length; bIdx++) {
    const bucket = buckets[bIdx];
    const len = bucket.len;
    if (len <= 0) continue;

    const [r, g, b] = parseHexRgb(bucket.hex);
    const baseA = Math.max(0, Math.min(255, Math.round(bucket.alpha * 255)));
    if (baseA === 0) continue;

    const scale = bucket.diameterScale ?? 1;
    const dotPx = Math.max(0.65, baseDotPx * scale);
    const radius = dotPx * 0.5;
    // Slight centering shift so varying dot diameters stay aligned on their subpixel center
    const centerShift = (baseDotPx - dotPx) * 0.5;
    const effRadius = radius + 0.45;
    const invRadius2 = 1 / (effRadius * effRadius);
    const xy = bucket.xy;
    const packedRgb = (b << 16) | (g << 8) | r;

    for (let i = 0; i < len; i += 2) {
      const x0 = xy[i] * dpr + centerShift;
      const y0 = xy[i + 1] * dpr + centerShift;
      const cx = x0 + radius;
      const cy = y0 + radius;
      const x1 = x0 + dotPx;
      const y1 = y0 + dotPx;

      let ix0 = (x0 - 0.35) | 0;
      if (ix0 < 0) ix0 = 0;
      let iy0 = (y0 - 0.35) | 0;
      if (iy0 < 0) iy0 = 0;
      let ix1 = (x1 + 0.35) | 0;
      if (ix1 >= width) ix1 = width - 1;
      let iy1 = (y1 + 0.35) | 0;
      if (iy1 >= height) iy1 = height - 1;

      for (let py = iy0; py <= iy1; py++) {
        const dy = py + 0.5 - cy;
        const dy2 = dy * dy;
        const rowPixel = py * width;

        for (let px = ix0; px <= ix1; px++) {
          const dx = px + 0.5 - cx;
          const norm2 = (dx * dx + dy2) * invRadius2;
          if (norm2 >= 1.3225) continue;

          // Smooth circular anti-aliased kernel without per-pixel sqrt
          const radialCov = norm2 <= softEdgeCut ? 1 : (1.3225 - norm2) * invEdgeSpan;
          const covA = (baseA * radialCov + 0.5) | 0;
          if (covA <= 0) continue;

          const pIdx = rowPixel + px;
          const off = pIdx << 2;
          const prevA = bytes[off + 3];

          if (prevA === 0) {
            if (IS_LITTLE_ENDIAN) {
              u32[pIdx] = ((covA > 255 ? 255 : covA) << 24) | packedRgb;
            } else {
              bytes[off] = r;
              bytes[off + 1] = g;
              bytes[off + 2] = b;
              bytes[off + 3] = covA > 255 ? 255 : covA;
            }
          } else {
            const srcA = (covA > 255 ? 255 : covA) / 255;
            const dstA = prevA / 255;
            const invSrcA = 1 - srcA;
            const outA = srcA + dstA * invSrcA;
            if (outA > 0) {
              const dstW = (dstA * invSrcA) / outA;
              const srcW = srcA / outA;
              bytes[off] = (bytes[off] * dstW + r * srcW + 0.5) | 0;
              bytes[off + 1] = (bytes[off + 1] * dstW + g * srcW + 0.5) | 0;
              bytes[off + 2] = (bytes[off + 2] * dstW + b * srcW + 0.5) | 0;
              bytes[off + 3] = Math.min(255, (outA * 255 + 0.5) | 0);
            }
          }
        }
      }
    }
  }
}
