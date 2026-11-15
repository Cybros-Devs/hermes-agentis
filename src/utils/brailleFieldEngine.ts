export type BrailleHorizonStyle = 'silk' | 'peaks' | 'pulse';

export interface HorizonMotionState {
  energy: number;
  pointerX: number;
  pointerY: number;
  bands: number[];
  pointerVelX?: number;
  wakePhase?: number;
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
  style?: BrailleHorizonStyle;
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

const BAYER_8X8 = [
  0 / 64, 32 / 64, 8 / 64, 40 / 64, 2 / 64, 34 / 64, 10 / 64, 42 / 64,
  48 / 64, 16 / 64, 56 / 64, 24 / 64, 50 / 64, 18 / 64, 58 / 64, 26 / 64,
  12 / 64, 44 / 64, 4 / 64, 36 / 64, 14 / 64, 46 / 64, 6 / 64, 38 / 64,
  60 / 64, 28 / 64, 52 / 64, 20 / 64, 62 / 64, 30 / 64, 54 / 64, 22 / 64,
  3 / 64, 35 / 64, 11 / 64, 43 / 64, 1 / 64, 33 / 64, 9 / 64, 41 / 64,
  51 / 64, 19 / 64, 59 / 64, 27 / 64, 49 / 64, 17 / 64, 57 / 64, 25 / 64,
  15 / 64, 47 / 64, 7 / 64, 39 / 64, 13 / 64, 45 / 64, 5 / 64, 37 / 64,
  63 / 64, 31 / 64, 55 / 64, 23 / 64, 61 / 64, 29 / 64, 53 / 64, 21 / 64,
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
 * and pointer interaction with directional wake tracking.
 */
export function createHorizonAnimator() {
  const bands = new Array<number>(12).fill(0);
  const state: HorizonMotionState = {
    energy: 0.08,
    pointerX: 0,
    pointerY: 0,
    bands,
    pointerVelX: 0,
    wakePhase: 0,
  };
  let energyVel = 0;
  let pointerVelX = 0;
  let wakePhase = 0;

  return {
    step(input: HorizonAnimatorInput, dt: number, reducedMotion = false): HorizonMotionState {
      const clampedDt = clamp(dt, 0.004, 0.06);
      if (reducedMotion) {
        state.energy = clamp01(input.energy * 0.4);
        state.pointerX = clamp(input.pointerX, -1, 1);
        state.pointerY = clamp(input.pointerY, -1, 1);
        state.pointerVelX = 0;
        for (let i = 0; i < 12; i++) {
          bands[i] = clamp01((input.bands?.[i] ?? 0) * 0.5);
        }
        return state;
      }

      // Critically-damped 2nd-order filter on energy: fluid takeoff & release with zero derivative spikes
      const targetEnergy = clamp01(input.energy);
      const eStiffness = targetEnergy > state.energy ? 68 : 42;
      const eDamping = targetEnergy > state.energy ? 17.5 : 13.5;
      energyVel += ((targetEnergy - state.energy) * eStiffness - energyVel * eDamping) * clampedDt;
      state.energy = clamp01(state.energy + energyVel * clampedDt);

      // Exponential pointer smoothing + damped horizontal wake velocity
      const prevPtrX = state.pointerX;
      const ptrFactor = 1 - Math.exp(-9.5 * clampedDt);
      state.pointerX += (clamp(input.pointerX, -1, 1) - state.pointerX) * ptrFactor;
      state.pointerY += (clamp(input.pointerY, -1, 1) - state.pointerY) * ptrFactor;

      const rawVelX = clamp((state.pointerX - prevPtrX) / clampedDt, -3.5, 3.5);
      const velFactor = 1 - Math.exp(-7.0 * clampedDt);
      pointerVelX += (rawVelX - pointerVelX) * velFactor;
      wakePhase += clampedDt * (1.2 + Math.abs(pointerVelX) * 2.4 + state.energy * 1.4);

      // Fast-attack / graceful-release band filtering
      const attackFactor = 1 - Math.exp(-9.5 * clampedDt);
      const releaseFactor = 1 - Math.exp(-6.0 * clampedDt);
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
        pointerVelX,
        wakePhase,
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
let colMist = new Float32Array(0);
let colSinU = new Float32Array(0);
let colCosU = new Float32Array(0);
let colPeakTop = new Float32Array(0);
let colBarGate = new Float32Array(0);
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
    colMist = new Float32Array(subW);
    colSinU = new Float32Array(subW);
    colCosU = new Float32Array(subW);
    colPeakTop = new Float32Array(subW);
    colBarGate = new Float32Array(subW);
  }
  if (horizonRowChars.length !== cols) {
    horizonRowChars = new Array<string>(cols);
  }
  return horizonSubLum;
}

/**
 * Renders a fluid, modern 2x4 Unicode Braille wave & acoustic topography field
 * with 8x8 Bayer dithering, directional cursor wake ripples, subtle mist, and Silk/Peaks/Pulse styles.
 */
export function renderBrailleHorizon(params: BrailleHorizonParams): BrailleHorizonFrame {
  const { cols, rows, time, motion, style = 'silk' } = params;
  const energy = motion ? motion.energy : params.energy;
  const pointerX = motion ? motion.pointerX : params.pointerX;
  const pointerY = motion ? motion.pointerY : params.pointerY;
  const pointerVelX = motion?.pointerVelX ?? 0;
  const wakePhase = motion?.wakePhase ?? time * 1.4;
  const bands = motion ? motion.bands : params.bands;

  const subW = cols * 2;
  const subH = rows * 4;
  const lines: string[] = new Array(rows);
  const cells = new Uint8Array(cols * rows);

  const subLum = ensureHorizonBuffers(subW * subH, subW, cols);
  const rowChars = horizonRowChars;
  const pxTarget = (pointerX + 1) * 0.5;
  const pyBoost = (1 - clamp01((pointerY + 1) * 0.5)) * 0.08;
  const voiceAmp = 0.08 + energy * 0.25;
  const bandLen = bands?.length ?? 0;
  const invSubW = 1 / subW;
  const invSubH = 1 / subH;
  const cursorWeight = 0.12 + pyBoost;
  const wakeAmp = clamp(Math.abs(pointerVelX) * 0.055, 0, 0.09);
  const wakeDir = pointerVelX >= 0 ? -1 : 1;
  const c1Amp = 0.14 + voiceAmp * 0.36;
  const c2Amp = 0.11 + voiceAmp * 0.27;
  const c3Amp = 0.07 + voiceAmp * 0.22;
  const shimmerScale = 0.18 * (0.35 + energy * 0.65);
  const isPeaks = style === 'peaks';
  const isPulse = style === 'pulse';
  const barCount = Math.max(18, Math.round(cols * 0.28));

  // Precompute column-invariant wave topography, FFT boost, and directional pointer wake
  for (let sx = 0; sx < subW; sx++) {
    const ux = (sx + 0.5) * invSubW;
    const dxPtr = ux - pxTarget;
    const ptrArg = dxPtr * dxPtr * 18;
    const cursorWave = ptrArg < 8 ? fastFieldExpNeg(ptrArg) * cursorWeight : 0;

    let wakeWave = 0;
    if (wakeAmp > 0.004) {
      const behind = dxPtr * wakeDir;
      if (behind > -0.04 && behind < 0.42) {
        const wakeEnv = fastFieldExpNeg(behind * behind * 22);
        wakeWave = wakeEnv * Math.sin(behind * 34 - wakePhase * 6.5) * wakeAmp;
      }
    }

    let bandBoost = 0;
    if (bandLen > 0) {
      const fIdx = ux * (bandLen - 1);
      const i0 = fIdx | 0;
      const i1 = i0 + 1 < bandLen ? i0 + 1 : bandLen - 1;
      const frac = fIdx - i0;
      const smoothFrac = frac * frac * (3 - 2 * frac);
      const b0 = bands![i0] ?? 0;
      const b1 = bands![i1] ?? b0;
      bandBoost = (b0 + (b1 - b0) * smoothFrac) * 0.16;
    }

    const pulseMod = isPulse
      ? Math.sin(Math.abs(dxPtr) * 32 - time * 5.2) * (0.045 + energy * 0.075) * fastFieldExpNeg(dxPtr * dxPtr * 3.8)
      : 0;

    colCrest1[sx] =
      0.44 -
      Math.sin(ux * 6.2 + time * 0.92) * c1Amp -
      Math.cos(ux * 13.0 - time * 1.32) * 0.055 -
      cursorWave -
      wakeWave -
      bandBoost -
      pulseMod;

    colCrest2[sx] =
      0.60 -
      Math.sin(ux * 4.5 - time * 0.68 + 1.4) * c2Amp -
      Math.sin(ux * 19.0 + time * 1.9) * 0.036 -
      cursorWave * 0.65 -
      wakeWave * 0.55 -
      bandBoost * 0.58 -
      pulseMod * 0.6;

    colCrest3[sx] =
      0.74 -
      Math.cos(ux * 8.2 + time * 1.18) * c3Amp -
      bandBoost * 0.42;

    if (isPeaks) {
      const barPos = ux * barCount;
      const barIdx = barPos | 0;
      const barFrac = barPos - barIdx - 0.5;
      const barCenterU = (barIdx + 0.5) / barCount;
      const barGate = barFrac > -0.34 && barFrac < 0.34 ? 1 : 0;
      let barBand = 0.14 + 0.12 * Math.sin(barCenterU * 11 + time * 2.4);
      if (bandLen > 0) {
        const bi = Math.min(bandLen - 1, Math.floor(barCenterU * bandLen));
        barBand = (bands![bi] ?? 0) * 0.42 + 0.08;
      }
      const ptrBar = fastFieldExpNeg((barCenterU - pxTarget) * (barCenterU - pxTarget) * 20) * (0.12 + energy * 0.14);
      colBarGate[sx] = barGate;
      colPeakTop[sx] = clamp(0.84 - (barBand * (0.55 + energy * 0.75) + ptrBar), 0.18, 0.82);
    }

    colShimmer[sx] = (0.94 + shimmerScale * Math.sin(ux * 22 - time * 3.4)) * 0.98;
    const sparkleGate = Math.sin(ux * 54 - time * 4.6) * Math.cos(ux * 31 + time * 2.9);
    colMist[sx] =
      energy > 0.14
        ? clamp01(0.42 + 0.58 * sparkleGate) * energy * 0.42
        : 0;

    const rippleU = isPulse ? Math.abs(dxPtr) * 38 - time * 4.4 : ux * 42 - time * 2.25;
    colSinU[sx] = Math.sin(rippleU);
    colCosU[sx] = Math.cos(rippleU);
  }

  for (let sy = 0; sy < subH; sy++) {
    const uy = (sy + 0.5) * invSubH; // 0 (top) .. 1 (bottom)
    // Top fade guarantees row 0 fades completely into dark background while keeping fluid horizon
    const topFade = smoothstep(0.08, 0.42, uy);
    const bottomTaper = 1 - smoothstep(0.66, 0.98, uy);
    const fadeEnvelope = topFade * bottomTaper;
    const rowOff = sy * subW;

    if (fadeEnvelope <= 0.001) {
      subLum.fill(0, rowOff, rowOff + subW);
      continue;
    }

    const bottomAnchorWeight = smoothstep(0.35, 0.9, uy) * (isPulse ? 0.15 : 0.10);
    const rippleV = uy * 18;
    const sinV = Math.sin(rippleV);
    const cosV = Math.cos(rippleV);
    const peakScanMask = isPeaks && (sy % 3 !== 2) ? 1 : 0.42;

    for (let sx = 0; sx < subW; sx++) {
      const crest1 = colCrest1[sx];
      const crest2 = colCrest2[sx];
      const crest3 = colCrest3[sx];

      const d1 = uy > crest1 ? uy - crest1 : crest1 - uy;
      const d2 = uy > crest2 ? uy - crest2 : crest2 - uy;
      const d3 = uy > crest3 ? uy - crest3 : crest3 - uy;

      const s1 = d1 * 29;
      const s2 = d2 * 24;
      const s3 = d3 * 22;
      const line1 = s1 < 2.83 ? fastFieldExpNeg(s1 * s1) * Math.min(1.06, colShimmer[sx] * 1.06) : 0;
      const line2 = s2 < 2.83 ? fastFieldExpNeg(s2 * s2) * 0.72 : 0;
      const line3 = s3 < 2.83 ? fastFieldExpNeg(s3 * s3) * 0.54 : 0;

      // Subtle rising mist spray + crisp peak glint just above the primary wave crest when active
      let mist = 0;
      const mistOffset = crest1 - uy;
      if (mistOffset > 0.008 && mistOffset < 0.16 && colMist[sx] > 0.02) {
        mist = colMist[sx] * fastFieldExpNeg(mistOffset * mistOffset * 165);
      }

      // Valley trough attenuation right below crest1 deepens separation between crest1 and crest2
      const troughAtten = uy > crest1 && uy < crest2 ? 0.65 + 0.35 * smoothstep(crest1, crest2, uy) : 1;
      const fill1 = uy > crest1 ? smoothstep(crest1, crest1 + 0.34, uy) * 0.16 * troughAtten : 0;
      const fill2 = uy > crest2 ? smoothstep(crest2, crest2 + 0.28, uy) * 0.15 : 0;
      const sinRipple = colSinU[sx] * cosV + colCosU[sx] * sinV;
      const fineRipple = (0.5 + 0.5 * sinRipple) * bottomAnchorWeight;

      let peakBoost = 0;
      if (isPeaks && colBarGate[sx] > 0.5) {
        const peakTop = colPeakTop[sx];
        if (uy >= peakTop && uy < 0.86) {
          const capDist = uy - peakTop;
          const capGlow = capDist < 0.055 ? 0.86 : 0.46 * (1 - smoothstep(peakTop, 0.86, uy) * 0.45);
          peakBoost = capGlow * peakScanMask;
        }
      }

      const maxLine = line1 > line2 ? (line1 > line3 ? line1 : line3) : line2 > line3 ? line2 : line3;
      const combined = maxLine > peakBoost ? maxLine : peakBoost;
      const lum = clamp01((combined + fill1 + fill2 + fineRipple + mist) * fadeEnvelope);
      subLum[rowOff + sx] = lum;
    }
  }

  for (let r = 0; r < rows; r++) {
    const syBase = r * 4;
    const r0 = syBase * subW;
    const r1 = r0 + subW;
    const r2 = r1 + subW;
    const r3 = r2 + subW;
    const bRow0 = (syBase & 7) << 3;
    const bRow1 = ((syBase + 1) & 7) << 3;
    const bRow2 = ((syBase + 2) & 7) << 3;
    const bRow3 = ((syBase + 3) & 7) << 3;
    const cellRowOff = r * cols;

    for (let c = 0; c < cols; c++) {
      const c2 = c * 2;
      const c2_1 = c2 + 1;
      const bx0 = c2 & 7;
      const bx1 = c2_1 & 7;

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
      if (l00 > 0.13 + BAYER_8X8[bRow0 + bx0] * 0.72) bits |= 0x01;
      if (l01 > 0.13 + BAYER_8X8[bRow0 + bx1] * 0.72) bits |= 0x08;
      if (l10 > 0.13 + BAYER_8X8[bRow1 + bx0] * 0.72) bits |= 0x02;
      if (l11 > 0.13 + BAYER_8X8[bRow1 + bx1] * 0.72) bits |= 0x10;
      if (l20 > 0.13 + BAYER_8X8[bRow2 + bx0] * 0.72) bits |= 0x04;
      if (l21 > 0.13 + BAYER_8X8[bRow2 + bx1] * 0.72) bits |= 0x20;
      if (l30 > 0.13 + BAYER_8X8[bRow3 + bx0] * 0.72) bits |= 0x40;
      if (l31 > 0.13 + BAYER_8X8[bRow3 + bx1] * 0.72) bits |= 0x80;

      cells[cellRowOff + c] = (lumSum * 31.875 + 0.5) | 0;
      rowChars[c] = BRAILLE_CHAR_TABLE[bits];
    }
    lines[r] = rowChars.join('');
  }

  return { cols, rows, lines, cells };
}
