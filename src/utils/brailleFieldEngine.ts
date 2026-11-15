export interface HorizonMotionState {
  energy: number;
  pointerX: number;
  pointerY: number;
  bands: number[];
}

export interface HorizonAnimatorInput {
  energy: number;
  pointerX: number;
  pointerY: number;
  bands?: number[];
}

export interface BrailleHorizonParams {
  cols: number;
  rows: number;
  time: number;
  energy: number;
  pointerX: number; // -1..1
  pointerY: number; // -1..1
  bands?: number[];
  motion?: HorizonMotionState | null;
}

export interface BrailleHorizonFrame {
  cols: number;
  rows: number;
  lines: string[];
  /** Per-cell normalized intensity 0..255 */
  cells: Uint8Array;
}

const BRAILLE_CHAR_TABLE: string[] = Array.from({ length: 256 }, (_, i) =>
  i === 0 ? ' ' : String.fromCharCode(0x2800 + i)
);

const BAYER_4X4 = [
  0.0 / 16, 8.0 / 16, 2.0 / 16, 10.0 / 16,
  12.0 / 16, 4.0 / 16, 14.0 / 16, 6.0 / 16,
  3.0 / 16, 11.0 / 16, 1.0 / 16, 9.0 / 16,
  15.0 / 16, 7.0 / 16, 13.0 / 16, 5.0 / 16,
];

const FIELD_EXP_MAX = 8;
const FIELD_EXP_SIZE = 512;
const FIELD_EXP_SCALE = FIELD_EXP_SIZE / FIELD_EXP_MAX;
const FIELD_EXP_LUT = new Float32Array(FIELD_EXP_SIZE + 1);
for (let i = 0; i <= FIELD_EXP_SIZE; i++) {
  FIELD_EXP_LUT[i] = Math.exp(-(i * FIELD_EXP_MAX) / FIELD_EXP_SIZE);
}

function fastFieldExpNeg(x: number): number {
  if (x <= 0) return 1;
  if (x >= FIELD_EXP_MAX) return 0;
  const f = x * FIELD_EXP_SCALE;
  const idx = f | 0;
  const v0 = FIELD_EXP_LUT[idx];
  return v0 + (FIELD_EXP_LUT[idx + 1] - v0) * (f - idx);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1));
  return t * t * (3 - 2 * t);
}

/**
 * Stateful spring-damped filter for acoustic Braille horizon energy, 12-band FFT levels,
 * and pointer interaction, preventing jarring single-frame wave pops on speech transients.
 */
export function createHorizonAnimator() {
  const bands = new Array<number>(12).fill(0);
  const state: HorizonMotionState = {
    energy: 0.08,
    pointerX: 0,
    pointerY: 0,
    bands,
  };
  let energyVel = 0;

  return {
    step(input: HorizonAnimatorInput, dt: number, reducedMotion = false): HorizonMotionState {
      const clampedDt = clamp(dt, 0.004, 0.06);
      if (reducedMotion) {
        state.energy = clamp01(input.energy * 0.4);
        state.pointerX = clamp(input.pointerX, -1, 1);
        state.pointerY = clamp(input.pointerY, -1, 1);
        for (let i = 0; i < 12; i++) {
          bands[i] = clamp01((input.bands?.[i] ?? 0) * 0.5);
        }
        return state;
      }

      // Critically-damped 2nd-order filter on energy: smooth fluid takeoff & release
      const targetEnergy = clamp01(input.energy);
      const eStiffness = targetEnergy > state.energy ? 110 : 52;
      const eDamping = targetEnergy > state.energy ? 21 : 15;
      energyVel += ((targetEnergy - state.energy) * eStiffness - energyVel * eDamping) * clampedDt;
      state.energy = clamp01(state.energy + energyVel * clampedDt);

      // Exponential pointer smoothing
      const ptrFactor = 1 - Math.exp(-10.5 * clampedDt);
      state.pointerX += (clamp(input.pointerX, -1, 1) - state.pointerX) * ptrFactor;
      state.pointerY += (clamp(input.pointerY, -1, 1) - state.pointerY) * ptrFactor;

      // Fast-attack / graceful-release band filtering
      const attackFactor = 1 - Math.exp(-12 * clampedDt);
      const releaseFactor = 1 - Math.exp(-6.5 * clampedDt);
      for (let i = 0; i < 12; i++) {
        const target = clamp01(input.bands?.[i] ?? 0);
        const f = target > bands[i] ? attackFactor : releaseFactor;
        bands[i] += (target - bands[i]) * f;
      }

      return {
        energy: state.energy,
        pointerX: state.pointerX,
        pointerY: state.pointerY,
        bands: bands.slice(),
      };
    },
  };
}

let horizonBufCap = 0;
let horizonSubLum = new Float32Array(0);
let horizonColCap = 0;
let colCrest1 = new Float32Array(0);
let colCrest2 = new Float32Array(0);
let colCrest3 = new Float32Array(0);
let colShimmer = new Float32Array(0);
let colSinU = new Float32Array(0);
let colCosU = new Float32Array(0);
let horizonRowChars: string[] = [];

function ensureHorizonBuffers(subLen: number, subW: number, cols: number): Float32Array {
  if (subLen > horizonBufCap) {
    horizonBufCap = subLen;
    horizonSubLum = new Float32Array(subLen);
  }
  if (subW > horizonColCap) {
    horizonColCap = subW;
    colCrest1 = new Float32Array(subW);
    colCrest2 = new Float32Array(subW);
    colCrest3 = new Float32Array(subW);
    colShimmer = new Float32Array(subW);
    colSinU = new Float32Array(subW);
    colCosU = new Float32Array(subW);
  }
  if (horizonRowChars.length !== cols) {
    horizonRowChars = new Array<string>(cols);
  }
  return horizonSubLum;
}

/**
 * Renders a fluid, modern 2x4 Unicode Braille wave & acoustic topography field
 * designed to flow cleanly across the bottom horizon of the Hermes homepage.
 */
export function renderBrailleHorizon(params: BrailleHorizonParams): BrailleHorizonFrame {
  const { cols, rows, time, motion } = params;
  const energy = motion ? motion.energy : params.energy;
  const pointerX = motion ? motion.pointerX : params.pointerX;
  const pointerY = motion ? motion.pointerY : params.pointerY;
  const bands = motion ? motion.bands : params.bands;

  const subW = cols * 2;
  const subH = rows * 4;
  const lines: string[] = new Array(rows);
  const cells = new Uint8Array(cols * rows);

  const subLum = ensureHorizonBuffers(subW * subH, subW, cols);
  const rowChars = horizonRowChars;
  const pxTarget = (pointerX + 1) * 0.5;
  const pyBoost = (1 - clamp01((pointerY + 1) * 0.5)) * 0.08;
  const voiceAmp = 0.08 + energy * 0.24;
  const bandLen = bands?.length ?? 0;
  const invSubW = 1 / subW;
  const invSubH = 1 / subH;
  const cursorWeight = 0.12 + pyBoost;
  const c1Amp = 0.14 + voiceAmp * 0.36;
  const c2Amp = 0.11 + voiceAmp * 0.26;
  const c3Amp = 0.07 + voiceAmp * 0.22;
  const shimmerScale = 0.16 * (0.35 + energy * 0.65);

  // Precompute all x-only wave terms once per column instead of subH times per pixel
  for (let sx = 0; sx < subW; sx++) {
    const ux = (sx + 0.5) * invSubW;
    const dxPtr = ux - pxTarget;
    const ptrArg = dxPtr * dxPtr * 18;
    const cursorWave = ptrArg < 8 ? fastFieldExpNeg(ptrArg) * cursorWeight : 0;

    let bandBoost = 0;
    if (bandLen > 0) {
      const fIdx = ux * (bandLen - 1);
      const i0 = fIdx | 0;
      const i1 = i0 + 1 < bandLen ? i0 + 1 : bandLen - 1;
      const frac = fIdx - i0;
      const smoothFrac = frac * frac * (3 - 2 * frac);
      const b0 = bands![i0] ?? 0;
      const b1 = bands![i1] ?? b0;
      bandBoost = (b0 + (b1 - b0) * smoothFrac) * 0.15;
    }

    colCrest1[sx] =
      0.44 -
      Math.sin(ux * 6.2 + time * 0.92) * c1Amp -
      Math.cos(ux * 13.0 - time * 1.32) * 0.055 -
      cursorWave -
      bandBoost;

    colCrest2[sx] =
      0.60 -
      Math.sin(ux * 4.5 - time * 0.68 + 1.4) * c2Amp -
      Math.sin(ux * 19.0 + time * 1.9) * 0.035 -
      cursorWave * 0.65 -
      bandBoost * 0.55;

    colCrest3[sx] =
      0.74 -
      Math.cos(ux * 8.2 + time * 1.18) * c3Amp -
      bandBoost * 0.4;

    colShimmer[sx] = (0.88 + shimmerScale * Math.sin(ux * 22 - time * 3.4)) * 0.92;

    const rippleU = ux * 42 - time * 2.25;
    colSinU[sx] = Math.sin(rippleU);
    colCosU[sx] = Math.cos(rippleU);
  }

  for (let sy = 0; sy < subH; sy++) {
    const uy = (sy + 0.5) * invSubH; // 0 (top) .. 1 (bottom)
    // Soft fade at top AND bottom edge so footer prompt links keep crisp legibility
    const topFade = smoothstep(0.06, 0.42, uy);
    const bottomTaper = 1 - smoothstep(0.64, 0.98, uy);
    const fadeEnvelope = topFade * bottomTaper;
    const rowOff = sy * subW;

    if (fadeEnvelope <= 0.001) {
      subLum.fill(0, rowOff, rowOff + subW);
      continue;
    }

    const bottomAnchorWeight = smoothstep(0.35, 0.9, uy) * 0.11;
    const rippleV = uy * 18;
    const sinV = Math.sin(rippleV);
    const cosV = Math.cos(rippleV);

    for (let sx = 0; sx < subW; sx++) {
      const crest1 = colCrest1[sx];
      const crest2 = colCrest2[sx];
      const crest3 = colCrest3[sx];

      const d1 = uy > crest1 ? uy - crest1 : crest1 - uy;
      const d2 = uy > crest2 ? uy - crest2 : crest2 - uy;
      const d3 = uy > crest3 ? uy - crest3 : crest3 - uy;

      const s1 = d1 * 28;
      const s2 = d2 * 24;
      const s3 = d3 * 22;
      const line1 = s1 < 2.83 ? fastFieldExpNeg(s1 * s1) * colShimmer[sx] : 0;
      const line2 = s2 < 2.83 ? fastFieldExpNeg(s2 * s2) * 0.72 : 0;
      const line3 = s3 < 2.83 ? fastFieldExpNeg(s3 * s3) * 0.58 : 0;

      const fill1 = uy > crest1 ? smoothstep(crest1, crest1 + 0.3, uy) * 0.22 : 0;
      const fill2 = uy > crest2 ? smoothstep(crest2, crest2 + 0.24, uy) * 0.2 : 0;
      const sinRipple = colSinU[sx] * cosV + colCosU[sx] * sinV;
      const fineRipple = (0.5 + 0.5 * sinRipple) * bottomAnchorWeight;

      const maxLine = line1 > line2 ? (line1 > line3 ? line1 : line3) : line2 > line3 ? line2 : line3;
      const lum = clamp01((maxLine + fill1 + fill2 + fineRipple) * fadeEnvelope);
      subLum[rowOff + sx] = lum;
    }
  }

  for (let r = 0; r < rows; r++) {
    const r0 = r * 4 * subW;
    const r1 = r0 + subW;
    const r2 = r1 + subW;
    const r3 = r2 + subW;
    const cellRowOff = r * cols;

    for (let c = 0; c < cols; c++) {
      const c2 = c * 2;
      const c2_1 = c2 + 1;
      const bCol = (c & 1) * 2;
      const l00 = subLum[r0 + c2];
      const l01 = subLum[r0 + c2_1];
      const l10 = subLum[r1 + c2];
      const l11 = subLum[r1 + c2_1];
      const l20 = subLum[r2 + c2];
      const l21 = subLum[r2 + c2_1];
      const l30 = subLum[r3 + c2];
      const l31 = subLum[r3 + c2_1];

      const lumSum = l00 + l01 + l10 + l11 + l20 + l21 + l30 + l31;
      let bits = 0;
      if (l00 > 0.14 + BAYER_4X4[bCol] * 0.76) bits |= 0x01;
      if (l01 > 0.14 + BAYER_4X4[bCol + 1] * 0.76) bits |= 0x08;
      if (l10 > 0.14 + BAYER_4X4[4 + bCol] * 0.76) bits |= 0x02;
      if (l11 > 0.14 + BAYER_4X4[5 + bCol] * 0.76) bits |= 0x10;
      if (l20 > 0.14 + BAYER_4X4[8 + bCol] * 0.76) bits |= 0x04;
      if (l21 > 0.14 + BAYER_4X4[9 + bCol] * 0.76) bits |= 0x20;
      if (l30 > 0.14 + BAYER_4X4[12 + bCol] * 0.76) bits |= 0x40;
      if (l31 > 0.14 + BAYER_4X4[13 + bCol] * 0.76) bits |= 0x80;

      cells[cellRowOff + c] = (lumSum * 31.875 + 0.5) | 0;
      rowChars[c] = BRAILLE_CHAR_TABLE[bits];
    }
    lines[r] = rowChars.join('');
  }

  return { cols, rows, lines, cells };
}
