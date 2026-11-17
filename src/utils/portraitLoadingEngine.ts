import type { PortraitFrame } from './asciiPortraitEngine';

export type PortraitAssetStatus = 'loading' | 'ready' | 'error';

export interface PortraitLoadingParams {
  cols: number;
  rows: number;
  time: number;
  variant?: 'hero' | 'compact' | 'thumb' | 'sidebar' | 'stage';
  status?: 'loading' | 'error';
  reducedMotion?: boolean;
}

// Standard 2x4 Unicode Braille bit weights:
// col0: row0=0x01, row1=0x02, row2=0x04, row3=0x40
// col1: row0=0x08, row1=0x10, row2=0x20, row3=0x80
const BRAILLE_BITMASK = [0x01, 0x08, 0x02, 0x10, 0x04, 0x20, 0x40, 0x80] as const;

const BAYER_8X8 = [
  0, 32, 8, 40, 2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37,
  63, 31, 55, 23, 61, 29, 53, 21,
].map((v) => v / 64 - 0.5);

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1));
  return t * t * (3 - 2 * t);
}

/**
 * Smooth ease-out progress (0 -> 1) over ~460ms after real portrait assets finish decoding,
 * or instant 1 when reduced motion is active.
 */
export function computeMaterializeProgress(
  elapsedSinceReadySec: number,
  reducedMotion: boolean
): number {
  if (reducedMotion) return 1;
  if (elapsedSinceReadySec <= 0) return 0;
  const duration = 0.46;
  const t = clamp01(elapsedSinceReadySec / duration);
  return 1 - (1 - t) ** 3;
}

/**
 * Renders a bespoke animated Unicode Braille orbital aperture & scanline shimmer loader
 * (or offline signal glyph on error) so no synthetic/mock character silhouette is ever shown
 * while the real character artwork & sprite sheet load.
 */
export function renderPortraitLoadingFrame(params: PortraitLoadingParams): PortraitFrame {
  const {
    cols,
    rows,
    time,
    variant = 'stage',
    status = 'loading',
    reducedMotion = false,
  } = params;

  const cells = new Uint8Array(cols * rows);
  const lines: string[] = new Array(rows);
  const subW = cols * 2;
  const subH = rows * 4;
  const aspect = (cols * 0.53) / Math.max(1, rows);
  const t = reducedMotion ? 0.35 : time;
  const isThumb = variant === 'thumb' || variant === 'sidebar';
  const isError = status === 'error';

  const scanY = -0.84 + ((t * 0.68) % 1.68);
  const sweepAngle = t * 2.4;
  const innerSpin = -t * 1.65;

  const raw = new Float32Array(subW * subH);

  for (let sy = 0; sy < subH; sy++) {
    const uy = (sy + 0.5) / subH;
    const ny = uy * 2 - 1;
    const rowOff = sy * subW;

    for (let sx = 0; sx < subW; sx++) {
      const ux = (sx + 0.5) / subW;
      const nx = (ux * 2 - 1) * aspect;
      const dist = Math.hypot(nx, ny);
      const angle = Math.atan2(ny, nx);

      let lum = 0;

      if (isError) {
        const outerRing = Math.exp(-(((dist - 0.58) / 0.042) ** 2));
        const dashMask = Math.cos(angle * 6) > 0.05 ? 0.8 : 0.2;
        const slash =
          dist < 0.44
            ? Math.exp(-(((nx - ny) / 0.05) ** 2)) * 0.85
            : 0;
        lum = clamp01(Math.max(outerRing * dashMask * 0.55, slash));
      } else {
        // Outer calibration ring with dual travelling telemetry arcs & crisp degree ticks
        const ringR = isThumb ? 0.66 : 0.56 + Math.sin(t * 1.8) * 0.012;
        const ringBand = Math.exp(-(((dist - ringR) / (isThumb ? 0.072 : 0.038)) ** 2));
        const arcDelta = Math.atan2(Math.sin(angle - sweepAngle), Math.cos(angle - sweepAngle));
        const arcGlow = smoothstep(-1.55, 0.1, arcDelta) * (1 - smoothstep(0.05, 0.52, arcDelta));
        const twinDelta = Math.atan2(Math.sin(angle - sweepAngle + Math.PI), Math.cos(angle - sweepAngle + Math.PI));
        const twinGlow = smoothstep(-0.9, 0.1, twinDelta) * (1 - smoothstep(0.04, 0.4, twinDelta)) * 0.6;
        const ticks = Math.pow(Math.max(0, Math.cos(angle * 6 - sweepAngle * 0.3)), 14) * 0.46;
        lum += ringBand * (0.24 + 0.72 * Math.max(arcGlow, twinGlow) + ticks);

        if (!isThumb) {
          // Inner counter-rotating orbital ring
          const innerR = 0.31 + Math.sin(t * 2.6) * 0.022;
          const innerBand = Math.exp(-(((dist - innerR) / 0.029) ** 2));
          const innerSeg = Math.cos(angle * 3 - innerSpin) > -0.1 ? 1 : 0.16;
          lum += innerBand * innerSeg * 0.62;

          // Center harmonic iris core pulse + concentric ripple wave
          const coreWave = 0.5 + 0.5 * Math.sin(t * 4.2 - dist * 18);
          const coreMask = Math.exp(-((dist / 0.13) ** 2));
          const pulseRing = Math.exp(-(((dist - ((t * 0.45) % 0.56)) / 0.038) ** 2)) * 0.36;
          lum += coreMask * (0.38 + coreWave * 0.46) + pulseRing;

          // Horizontal halftone telemetry scanline sweep across aperture
          const scanBand = Math.exp(-(((ny - scanY) / 0.068) ** 2));
          const apertureClip = 1 - smoothstep(0.48, 0.62, dist);
          lum += scanBand * apertureClip * 0.52;

          // Subtle radial telemetry mist inside outer boundary
          const mistNoise =
            0.5 +
            0.5 * Math.sin(ux * 30 + t * 2.4) * Math.cos(uy * 26 - t * 1.9);
          const mistRing =
            Math.exp(-(((dist - 0.43) / 0.15) ** 2)) * mistNoise * 0.22;
          lum += mistRing;
        } else {
          const centerDot = Math.exp(-((dist / 0.24) ** 2)) * (0.55 + 0.35 * Math.sin(t * 4));
          lum += centerDot;
        }
      }

      raw[rowOff + sx] = clamp01(lum);
    }
  }

  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      let bits = 0;
      let lumSum = 0;
      for (let py = 0; py < 4; py++) {
        const sy = r * 4 + py;
        const rowOff = sy * subW;
        const bitBase = py * 2;
        const bayerRow = (sy & 7) * 8;
        for (let px = 0; px < 2; px++) {
          const sx = c * 2 + px;
          const v = raw[rowOff + sx];
          lumSum += v;
          const jitter = isThumb ? 0 : BAYER_8X8[bayerRow + (sx & 7)] * 0.18;
          if (v >= 0.36 + jitter) {
            bits |= BRAILLE_BITMASK[bitBase + px];
          }
        }
      }
      cells[r * cols + c] = Math.round((lumSum * 0.125) * 255);
      line += bits === 0 ? ' ' : String.fromCharCode(0x2800 + bits);
    }
    lines[r] = line;
  }

  return { cols, rows, lines, cells };
}

/**
 * Smoothly dissolves from the Braille orbital loader into the decoded real portrait frame
 * along a soft top-to-bottom scan wavefront + radial focus lock so the character materializes
 * with zero abrupt pop and a clean luminous scanline frontier.
 */
export function blendLoadingToPortraitFrame(
  loadingFrame: PortraitFrame,
  portraitFrame: PortraitFrame,
  progress: number
): PortraitFrame {
  if (progress >= 0.995) return portraitFrame;
  if (progress <= 0.005) return loadingFrame;

  const { cols, rows } = portraitFrame;
  const cells = new Uint8Array(cols * rows);
  const lines: string[] = new Array(rows);
  const frontier = progress * 1.24 - 0.12;

  for (let r = 0; r < rows; r++) {
    const ny = r / Math.max(1, rows - 1);
    const lLine = loadingFrame.lines[r] ?? '';
    const pLine = portraitFrame.lines[r] ?? '';
    let outLine = '';

    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const nx = c / Math.max(1, cols - 1) - 0.5;
      const centerDist = Math.abs(nx) * 0.24;
      const hash = (((r * 73 + c * 179) ^ (r * c * 13)) & 31) / 31;
      const localThreshold = ny * 0.58 + centerDist + hash * 0.22;
      const delta = frontier - localThreshold;

      if (delta >= 0) {
        const pChar = pLine[c] ?? ' ';
        const pCell = portraitFrame.cells[idx] ?? 0;
        if (delta < 0.095 && pChar !== ' ') {
          outLine += pChar;
          cells[idx] = Math.min(255, Math.max(pCell, 244));
        } else {
          outLine += pChar;
          cells[idx] = pCell;
        }
      } else if (delta > -0.075 && ((r + c) & 1) === 0 && (lLine[c] ?? ' ') !== ' ') {
        outLine += lLine[c] ?? ' ';
        cells[idx] = Math.min(255, Math.max(loadingFrame.cells[idx] ?? 0, 218));
      } else {
        outLine += lLine[c] ?? ' ';
        cells[idx] = loadingFrame.cells[idx] ?? 0;
      }
    }
    lines[r] = outLine;
  }

  return { cols, rows, lines, cells };
}
