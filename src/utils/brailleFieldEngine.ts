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

const BRAILLE_BITMASK = [0x01, 0x08, 0x02, 0x10, 0x04, 0x20, 0x40, 0x80];

const BAYER_4X4 = [
  0.0 / 16, 8.0 / 16, 2.0 / 16, 10.0 / 16,
  12.0 / 16, 4.0 / 16, 14.0 / 16, 6.0 / 16,
  3.0 / 16, 11.0 / 16, 1.0 / 16, 9.0 / 16,
  15.0 / 16, 7.0 / 16, 13.0 / 16, 5.0 / 16,
];

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

function ensureHorizonSubBuffer(len: number): Float32Array {
  if (len > horizonBufCap) {
    horizonBufCap = len;
    horizonSubLum = new Float32Array(len);
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

  const subLum = ensureHorizonSubBuffer(subW * subH);
  const pxTarget = (pointerX + 1) * 0.5;
  const pyBoost = (1 - clamp01((pointerY + 1) * 0.5)) * 0.08;
  const voiceAmp = 0.08 + energy * 0.22;

  for (let sy = 0; sy < subH; sy++) {
    const uy = (sy + 0.5) / subH; // 0 (top) .. 1 (bottom)
    // Soft fade at top AND bottom edge so footer prompt links keep crisp legibility
    const topFade = smoothstep(0.06, 0.42, uy);
    const bottomTaper = 1 - smoothstep(0.64, 0.98, uy);
    const bottomAnchor = smoothstep(0.35, 0.9, uy);
    const rowOff = sy * subW;

    for (let sx = 0; sx < subW; sx++) {
      const ux = (sx + 0.5) / subW;
      const dxPtr = ux - pxTarget;
      const cursorWave = Math.exp(-(dxPtr * dxPtr) * 18) * (0.12 + pyBoost);

      const bandIdx = Math.min(11, Math.floor(ux * 12));
      const bandBoost = bands?.[bandIdx] ? bands[bandIdx] * 0.14 : 0;

      // Primary flowing crest + secondary harmonic contour + acoustic ripple
      const crest1 =
        0.44 -
        Math.sin(ux * 6.2 + time * 0.85) * (0.14 + voiceAmp * 0.35) -
        Math.cos(ux * 13.0 - time * 1.25) * 0.055 -
        cursorWave -
        bandBoost;

      const crest2 =
        0.60 -
        Math.sin(ux * 4.5 - time * 0.62 + 1.4) * (0.11 + voiceAmp * 0.25) -
        Math.sin(ux * 19.0 + time * 1.8) * 0.035 -
        cursorWave * 0.65;

      const crest3 =
        0.74 -
        Math.cos(ux * 8.2 + time * 1.1) * (0.07 + voiceAmp * 0.2) -
        bandBoost * 0.5;

      const d1 = Math.abs(uy - crest1);
      const d2 = Math.abs(uy - crest2);
      const d3 = Math.abs(uy - crest3);

      // Luminous contour lines + soft under-crest halftone gradient
      const line1 = Math.exp(-((d1 * 28) ** 2)) * 0.92;
      const line2 = Math.exp(-((d2 * 24) ** 2)) * 0.72;
      const line3 = Math.exp(-((d3 * 22) ** 2)) * 0.58;

      const fill1 = uy > crest1 ? smoothstep(crest1, crest1 + 0.3, uy) * 0.22 : 0;
      const fill2 = uy > crest2 ? smoothstep(crest2, crest2 + 0.24, uy) * 0.2 : 0;
      const fineRipple =
        (0.5 + 0.5 * Math.sin(ux * 42 + uy * 18 - time * 2.1)) * bottomAnchor * 0.1;

      const lum = clamp01(
        (Math.max(line1, line2, line3) + fill1 + fill2 + fineRipple) * topFade * bottomTaper
      );
      subLum[rowOff + sx] = lum;
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
          const lum = subLum[rowOff + sx];
          lumSum += lum;
          const thresh = 0.14 + BAYER_4X4[bayerRow + (sx & 3)] * 0.76;
          if (lum > thresh) {
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
