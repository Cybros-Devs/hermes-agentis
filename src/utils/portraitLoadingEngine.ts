import type { PortraitFrame } from './asciiPortraitEngine';

export type PortraitAssetStatus = 'loading' | 'ready' | 'error';

export interface PortraitLoadingParams {
  cols: number;
  rows: number;
  time: number;
  variant?: 'hero' | 'thumb' | 'stage';
  status?: 'loading' | 'error';
  reducedMotion?: boolean;
}

// Standard 2x4 Unicode Braille bit weights:
// col0: row0=0x01, row1=0x02, row2=0x04, row3=0x40
// col1: row0=0x08, row1=0x10, row2=0x20, row3=0x80
const BRAILLE_BITMASK = [0x01, 0x08, 0x02, 0x10, 0x04, 0x20, 0x40, 0x80] as const;

const BAYER_4X4 = [
  -0.46875, 0.03125, -0.34375, 0.15625,
  0.28125, -0.21875, 0.40625, -0.09375,
  -0.28125, 0.21875, -0.40625, 0.09375,
  0.46875, -0.03125, 0.34375, -0.15625,
] as const;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1));
  return t * t * (3 - 2 * t);
}

/**
 * Smooth ease-out progress (0 -> 1) over ~420ms after real portrait assets finish decoding,
 * or instant 1 when reduced motion is active.
 */
export function computeMaterializeProgress(
  elapsedSinceReadySec: number,
  reducedMotion: boolean
): number {
  if (reducedMotion) return 1;
  if (elapsedSinceReadySec <= 0) return 0;
  const duration = 0.42;
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
  const isThumb = variant === 'thumb';
  const isError = status === 'error';

  const scanY = -0.82 + ((t * 0.65) % 1.64);
  const sweepAngle = t * 2.25;
  const innerSpin = -t * 1.45;

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
        // Broken dual ring + diagonal signal slash (clean terminal offline icon, no mock character)
        const outerRing = Math.exp(-(((dist - 0.58) / 0.042) ** 2));
        const dashMask = Math.cos(angle * 6) > 0.05 ? 0.8 : 0.2;
        const slash =
          dist < 0.44
            ? Math.exp(-(((nx - ny) / 0.05) ** 2)) * 0.85
            : 0;
        lum = clamp01(Math.max(outerRing * dashMask * 0.55, slash));
      } else {
        // Outer calibration ring with travelling arc highlight
        const ringR = isThumb ? 0.66 : 0.56;
        const ringBand = Math.exp(-(((dist - ringR) / (isThumb ? 0.07 : 0.044)) ** 2));
        const arcDelta = Math.atan2(Math.sin(angle - sweepAngle), Math.cos(angle - sweepAngle));
        const arcGlow = smoothstep(-1.4, 0.1, arcDelta) * (1 - smoothstep(0.05, 0.55, arcDelta));
        const ticks = Math.pow(Math.max(0, Math.cos(angle * 4 - sweepAngle * 0.35)), 12) * 0.45;
        lum += ringBand * (0.28 + 0.68 * arcGlow + ticks);

        // Inner counter-rotating orbital ring
        if (!isThumb) {
          const innerR = 0.31 + Math.sin(t * 2.4) * 0.018;
          const innerBand = Math.exp(-(((dist - innerR) / 0.032) ** 2));
          const innerSeg = Math.cos(angle * 3 - innerSpin) > -0.15 ? 1 : 0.18;
          lum += innerBand * innerSeg * 0.56;

          // Center harmonic core pulse (aperture iris, never facial features)
          const coreWave = 0.5 + 0.5 * Math.sin(t * 3.8 - dist * 16);
          const coreMask = Math.exp(-((dist / 0.14) ** 2));
          lum += coreMask * (0.34 + coreWave * 0.44);

          // Horizontal halftone telemetry scanline sweep across aperture
          const scanBand = Math.exp(-(((ny - scanY) / 0.075) ** 2));
          const apertureClip = 1 - smoothstep(0.50, 0.64, dist);
          lum += scanBand * apertureClip * 0.48;

          // Subtle ambient signal mist inside outer boundary
          const mistNoise =
            0.5 +
            0.5 * Math.sin(ux * 34 + t * 2.2) * Math.cos(uy * 28 - t * 1.7);
          const mistRing =
            Math.exp(-(((dist - 0.43) / 0.15) ** 2)) * mistNoise * 0.24;
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
        const bayerRow = (sy & 3) * 4;
        for (let px = 0; px < 2; px++) {
          const sx = c * 2 + px;
          const v = raw[rowOff + sx];
          lumSum += v;
          const jitter = isThumb ? 0 : BAYER_4X4[bayerRow + (sx & 3)] * 0.22;
          if (v >= 0.38 + jitter) {
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
 * along a soft top-to-bottom scan wavefront so the character materializes with zero abrupt pop.
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
      const hash = (((r * 73 + c * 179) ^ (r * c * 13)) & 31) / 31;
      const localThreshold = ny * 0.68 + hash * 0.32;
      const usePortrait = frontier >= localThreshold;

      if (usePortrait) {
        outLine += pLine[c] ?? ' ';
        cells[idx] = portraitFrame.cells[idx] ?? 0;
      } else {
        outLine += lLine[c] ?? ' ';
        cells[idx] = loadingFrame.cells[idx] ?? 0;
      }
    }
    lines[r] = outLine;
  }

  return { cols, rows, lines, cells };
}
