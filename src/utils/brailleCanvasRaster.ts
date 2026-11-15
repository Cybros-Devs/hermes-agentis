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
}

/**
 * Multi-tier halftone rasterizer with per-bucket dot-size modulation and circular
 * anti-aliased subpixel coverage so bright highlights bloom cleanly and subtle
 * shadows render as delicate crisp pinpoints without harsh square pixel stairs.
 */
export function rasterizeTonalDotBucketsToSurface(
  surface: BrailleRasterSurface,
  buckets: readonly TonalDotBucketSpec[],
  dpr: number,
  baseDotDiameterCss: number
): void {
  const { u32, bytes, width, height } = surface;
  u32.fill(0);

  const baseDotPx = Math.max(0.75, baseDotDiameterCss * dpr);

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
    const invRadius = 1 / Math.max(0.45, radius + 0.45);
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
          const dist = Math.sqrt(dx * dx + dy2);
          const norm = dist * invRadius;
          if (norm >= 1.15) continue;

          // Smooth circular anti-aliased kernel with crisp core
          const radialCov = norm <= 0.58 ? 1 : Math.max(0, 1 - (norm - 0.58) / 0.57);
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
