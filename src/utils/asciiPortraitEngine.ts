import type { ExpressionMood, EyeState, MouthViseme } from '../types/hermes';

export type DitherStyle = 'floyd' | 'bayer' | 'braille';

export interface PortraitSourceField {
  width: number;
  height: number;
  /** Precomputed base chiaroscuro luminance (0..1) from reference silhouette */
  baseLum: Float32Array;
  /** Ink opacity mask (0..1) so animations know where skin vs hair/lines sit */
  inkMask: Float32Array;
}

export interface PortraitParams {
  cols: number;
  rows: number;
  time: number; // seconds
  mood: ExpressionMood;
  viseme: MouthViseme;
  eyeState: EyeState;
  energy: number; // 0..1 audio level
  isSpeaking: boolean;
  isListening: boolean;
  style?: DitherStyle;
  sourceField?: PortraitSourceField | null;
}

export interface PortraitFrame {
  cols: number;
  rows: number;
  lines: string[];
  /** Per-row intensity values (0..255) matching each character */
  cells: Uint8Array;
}

const HALFTONE_RAMP = ' ·:░▒▓█';

const BAYER_4X4 = [
  -0.46875, 0.03125, -0.34375, 0.15625,
  0.28125, -0.21875, 0.40625, -0.09375,
  -0.28125, 0.21875, -0.40625, 0.09375,
  0.46875, -0.03125, 0.34375, -0.15625,
];

// Standard 2x4 Unicode Braille bit weights:
// col0: row0=0x01, row1=0x02, row2=0x04, row3=0x40
// col1: row0=0x08, row1=0x10, row2=0x20, row3=0x80
const BRAILLE_BITMASK = [0x01, 0x08, 0x02, 0x10, 0x04, 0x20, 0x40, 0x80];

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1));
  return t * t * (3 - 2 * t);
}

function sdEllipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number): number {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return (Math.hypot(dx, dy) - 1) * Math.min(rx, ry);
}

function sdCapsule2(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: number
): number {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const denom = bax * bax + bay * bay || 1;
  const h = clamp01((pax * bax + pay * bay) / denom);
  return Math.hypot(pax - bax * h, pay - bay * h) - r;
}

function getMouthShape(viseme: MouthViseme, energy: number): { rx: number; ry: number; open: number } {
  const e = energy * 0.025;
  switch (viseme) {
    case 'closed':
      return { rx: 0.044, ry: 0.008, open: 0 };
    case 'smile':
      return { rx: 0.056, ry: 0.011, open: 0.15 };
    case 'small':
      return { rx: 0.038, ry: 0.018 + e * 0.65, open: 0.65 };
    case 'mid':
      return { rx: 0.048, ry: 0.027 + e * 0.85, open: 0.85 };
    case 'round':
      return { rx: 0.034, ry: 0.032 + e * 0.9, open: 0.92 };
    case 'wide':
      return { rx: 0.062, ry: 0.036 + e, open: 1.0 };
  }
}

/**
 * Converts RGBA pixels of the transparent black-ink character reference artwork
 * into a sculpted chiaroscuro luminance field for dark-mode halftone dithering:
 * - Exterior transparent background stays 0 (empty space)
 * - Interior enclosed un-inked areas (face, neck, headband, hair speculars) become luminous
 *   studio-shaded skin/highlights with smooth 3/4 falloff across the right jawline
 * - Black ink hair/contours keep subtle rim highlights so curled bob ends pop off dark emerald glass
 */
export function buildPortraitSourceFromRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): PortraitSourceField {
  const total = width * height;
  const outside = new Uint8Array(total);
  const queue = new Int32Array(total);
  let qHead = 0;
  let qTail = 0;

  const alphaAtIdx = (idx: number) => rgba[idx * 4 + 3];
  const pushOutside = (x: number, y: number) => {
    const idx = y * width + x;
    if (!outside[idx] && alphaAtIdx(idx) < 42) {
      outside[idx] = 1;
      queue[qTail++] = idx;
    }
  };

  for (let x = 0; x < width; x++) {
    pushOutside(x, 0);
    // Only flood from bottom corners so neck/collar area stays cleanly enclosed
    if (x < width * 0.26 || x > width * 0.72) {
      pushOutside(x, height - 1);
    }
  }
  for (let y = 0; y < height; y++) {
    pushOutside(0, y);
    pushOutside(width - 1, y);
  }

  while (qHead < qTail) {
    const p = queue[qHead++];
    const x = p % width;
    const y = (p / width) | 0;
    if (x > 0) pushOutside(x - 1, y);
    if (x + 1 < width) pushOutside(x + 1, y);
    if (y > 0) pushOutside(x, y - 1);
    if (y + 1 < height) pushOutside(x, y + 1);
  }

  const baseLum = new Float32Array(total);
  const inkMask = new Float32Array(total);

  for (let y = 0; y < height; y++) {
    const uy = y / Math.max(1, height - 1);
    // Smooth bust dissolve at bottom edge
    const bottomFade = 1 - smoothstep(0.84, 0.99, uy);

    for (let x = 0; x < width; x++) {
      const ux = x / Math.max(1, width - 1);
      const idx = y * width + x;

      if (outside[idx]) {
        baseLum[idx] = 0;
        inkMask[idx] = 0;
        continue;
      }

      const alpha = rgba[idx * 4 + 3] / 255;
      const r = rgba[idx * 4];
      const g = rgba[idx * 4 + 1];
      const b = rgba[idx * 4 + 2];
      const rgbBright = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      // Dark ink strength inside silhouette (supports both transparent and white-filled PNGs)
      const ink = alpha * (1 - rgbBright * 0.85);
      inkMask[idx] = ink;

      // Detect silhouette outer edge (neighbor is outside) for subtle hair rim separation
      const nearOut =
        (x > 0 && outside[idx - 1]) ||
        (x + 1 < width && outside[idx + 1]) ||
        (y > 0 && outside[idx - width]) ||
        (y + 1 < height && outside[idx + width]) ||
        (x > 1 && outside[idx - 2]) ||
        (x + 2 < width && outside[idx + 2]);

      if (ink > 0.35) {
        // Glossy black hair silhouette: crown sheen, diagonal right-side strand highlights, curled-tip rim
        const crownSheen = Math.exp(-Math.pow((uy - 0.14) * 5.0, 2)) * 0.14;
        const strandWave =
          ux > 0.48 && ux < 0.85 && uy > 0.25 && uy < 0.88
            ? Math.max(0, Math.sin((ux - uy * 0.22) * 34)) * 0.085 * (1 - smoothstep(0.75, 0.92, uy))
            : 0;
        const curlSheen =
          uy > 0.56 ? Math.exp(-Math.pow((ux - 0.72) * 4.5, 2)) * 0.09 : 0;
        const rimGlow = nearOut ? 0.44 : 0;
        baseLum[idx] = clamp01((0.03 + crownSheen + strandWave + curlSheen + rimGlow) * bottomFade);
      } else {
        // Sculpted halftone skin shading: bright crisp sclera eye whites + smooth cheek tonal gradient
        const isHeadbandOrShine = uy < 0.36;
        if (isHeadbandOrShine) {
          const bandSheen = 0.85 + Math.exp(-Math.pow((ux - 0.52) * 4.0, 2)) * 0.12;
          baseLum[idx] = clamp01(bandSheen * bottomFade);
        } else {
          const isEyeZone = ux > 0.155 && ux < 0.45 && uy > 0.385 && uy < 0.47;
          const cheekSpec = Math.exp(-Math.pow(Math.hypot((ux - 0.235) * 7.5, (uy - 0.53) * 8.0), 2)) * 0.18;
          const noseBridgeSpec = Math.exp(-Math.pow(Math.hypot((ux - 0.205) * 16.0, (uy - 0.49) * 8.5), 2)) * 0.2;
          const cheekShadow = smoothstep(0.28, 0.50, ux) * 0.34;
          const bangShadow = (1 - smoothstep(0.35, 0.385, uy)) * 0.14;
          const chinNeckShadow = smoothstep(0.60, 0.86, uy) * 0.22;
          const eyeBoost = isEyeZone ? 0.22 : 0;
          const faceLum = 0.66 + cheekSpec + noseBridgeSpec + eyeBoost - cheekShadow - bangShadow - chinNeckShadow;
          baseLum[idx] = clamp01(faceLum * (1 - ink * 0.94) * bottomFade);
        }
      }
    }
  }

  return { width, height, baseLum, inkMask };
}

function sampleSourceBilinear(
  source: PortraitSourceField,
  ux: number,
  uy: number
): { lum: number; ink: number } {
  const maxX = source.width - 1;
  const maxY = source.height - 1;
  const fx = clamp01(ux) * maxX;
  const fy = clamp01(uy) * maxY;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(maxX, x0 + 1);
  const y1 = Math.min(maxY, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;

  const i00 = y0 * source.width + x0;
  const i10 = y0 * source.width + x1;
  const i01 = y1 * source.width + x0;
  const i11 = y1 * source.width + x1;

  const w00 = (1 - tx) * (1 - ty);
  const w10 = tx * (1 - ty);
  const w01 = (1 - tx) * ty;
  const w11 = tx * ty;

  return {
    lum:
      source.baseLum[i00] * w00 +
      source.baseLum[i10] * w10 +
      source.baseLum[i01] * w01 +
      source.baseLum[i11] * w11,
    ink:
      source.inkMask[i00] * w00 +
      source.inkMask[i10] * w10 +
      source.inkMask[i01] * w01 +
      source.inkMask[i11] * w11,
  };
}

/**
 * Samples the reference silhouette field at normalized UV (0..1, 0..1) using smooth bilinear
 * interpolation, expressive head/hair/breathing physics, smooth blinking, eye mood expressions,
 * audio-synced jaw & mouth visemes, and subtle acoustic particles when active.
 */
function sampleReferenceWithExpression(
  ux: number,
  uy: number,
  params: PortraitParams,
  source: PortraitSourceField
): number {
  const { time, mood, viseme, eyeState, energy, isSpeaking, isListening } = params;

  // Breathing, speaking cadence, and expressive head-tilt kinematics around neck pivot (0.38, 0.74)
  const breath = Math.sin(time * 2.2);
  const speakBounce = isSpeaking ? Math.abs(Math.sin(time * 7.2)) * (0.012 + energy * 0.022) : 0;
  const speakNod = isSpeaking ? Math.sin(time * 4.5) * (0.028 + energy * 0.052) : 0;

  const baseTilt =
    mood === 'thinking'
      ? -0.07 + Math.sin(time * 1.6) * 0.024
      : mood === 'happy'
      ? 0.03 + Math.sin(time * 2.2) * 0.022
      : mood === 'listening'
      ? 0.038 + Math.sin(time * 2.6) * 0.018
      : mood === 'alert'
      ? -0.028
      : Math.sin(time * 1.7) * 0.02;
  const tilt = baseTilt + speakNod;

  // Secondary follow-through sway on lower hair curls + shoulder breathing rise
  const lowerFactor = smoothstep(0.45, 0.92, uy);
  const curlLagX =
    Math.sin(time * 2.2 - 0.9) * 0.022 * lowerFactor +
    (isSpeaking ? Math.sin(time * 4.5 - 0.75) * 0.028 * energy * lowerFactor : 0);
  const shoulderLiftY = breath * 0.011 * (0.35 + 0.65 * smoothstep(0.65, 0.95, uy)) - speakBounce;

  const pivotX = 0.38;
  const pivotY = 0.74;
  const dx = ux - pivotX - curlLagX;
  const dy = uy - pivotY - shoulderLiftY;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);

  let ax = pivotX + dx * ct - dy * st;
  let ay = pivotY + dx * st + dy * ct;

  // Subtle jaw drop during open speech vowels so chin/mouth articulates vertically
  const rawMouth = getMouthShape(viseme, energy);
  if (viseme !== 'closed' && viseme !== 'smile' && ay > 0.56 && ay < 0.79 && ax < 0.45) {
    const jawZone = (1 - smoothstep(0.32, 0.45, ax)) * (1 - smoothstep(0.68, 0.79, ay));
    ay -= rawMouth.ry * 0.36 * jawZone;
  }

  // Out-of-bounds clamp to empty dark background
  if (ax < 0 || ax > 1 || ay < 0 || ay > 1) {
    return 0;
  }

  const sampled = sampleSourceBilinear(source, ax, ay);
  let lum = sampled.lum;

  // Dynamic smooth natural blink envelope overlaid seamlessly with discrete eyeState
  const cyclePos = (time * 0.38) % 1; // gentle natural blink every ~2.6s
  const autoBlink =
    cyclePos > 0.91 ? Math.sin(((cyclePos - 0.91) / 0.09) * Math.PI) : 0;
  const targetBlink =
    eyeState === 'blink' ? 1 : eyeState === 'half' ? 0.55 : autoBlink;

  // 1. Expressive Eyes: smooth blinking lids, crisp anime dual catchlights, thinking gaze saccades
  // Measured centroids from reference artwork: eyeL=(0.209, 0.437), eyeR=(0.380, 0.417)
  if (targetBlink > 0.08) {
    const lidCoverY = 0.044 * targetBlink;
    const dLidL = sdEllipse(ax, ay, 0.212, 0.413 + lidCoverY * 0.5, 0.046, lidCoverY);
    const dLidR = sdEllipse(ax, ay, 0.376, 0.396 + lidCoverY * 0.5, 0.066, lidCoverY);
    const dLids = Math.min(dLidL, dLidR);
    if (dLids < 0.01) {
      const lidMask = 1 - smoothstep(-0.004, 0.007, dLids);
      lum = lum * (1 - lidMask) + 0.74 * lidMask;
    }
    if (targetBlink > 0.62) {
      const lashCurve = -Math.pow((ax - 0.376) * 14, 2) * 0.003;
      const dLashL = sdCapsule2(ax, ay, 0.174, 0.449, 0.242, 0.447, 0.0055);
      const dLashR = sdCapsule2(ax, ay + lashCurve, 0.316, 0.435, 0.434, 0.433, 0.0065);
      const dLashes = Math.min(dLashL, dLashR);
      if (dLashes < 0.008) {
        const lashMask = (1 - smoothstep(-0.002, 0.005, dLashes)) * targetBlink;
        lum *= 1 - lashMask * 0.92;
      }
    }
  } else {
    // Expressive gaze saccades + crisp compact iris catchlights (preserving dark iris ring)
    const gazeShiftX =
      mood === 'thinking'
        ? Math.sin(time * 2.4) * 0.01
        : eyeState === 'side'
        ? 0.008
        : Math.sin(time * 0.85) * 0.003;
    const gazeShiftY = mood === 'thinking' ? -0.005 : 0;
    const catchScale = eyeState === 'wide' ? 1.2 : eyeState === 'happy' || mood === 'happy' ? 1.1 : 1.0;
    const catchR = 0.008 * catchScale;
    const dCatchL = sdEllipse(ax, ay, 0.199 + gazeShiftX, 0.427 + gazeShiftY, catchR * 0.85, catchR);
    const dCatchR = sdEllipse(ax, ay, 0.360 + gazeShiftX, 0.408 + gazeShiftY, catchR, catchR);
    const dCatch = Math.min(dCatchL, dCatchR);
    if (dCatch < 0.004) {
      const cMask = 1 - smoothstep(-0.002, 0.003, dCatch);
      lum = Math.max(lum, cMask * 0.98);
    }
  }

  // 2. Real-Time Audio-Synced Mouth Viseme Compositing over exact measured lip center (0.253, 0.618)
  if (viseme !== 'closed') {
    const rx = rawMouth.rx * 0.58;
    const ry = rawMouth.ry * 0.58;
    const mx = 0.253;
    const my = 0.618;
    if (viseme === 'smile') {
      const curve = -Math.pow((ax - mx) * 26, 2) * 0.0045;
      const dPatch = sdEllipse(ax, ay, mx, my, 0.032, 0.014);
      if (dPatch < 0.008) {
        const pMask = 1 - smoothstep(-0.003, 0.007, dPatch);
        lum = lum * (1 - pMask * 0.48) + 0.72 * (pMask * 0.48);
      }
      const dSmile = sdCapsule2(ax, ay + curve, mx - 0.025, my - 0.002, mx + 0.025, my - 0.001, 0.0038);
      if (dSmile < 0.006) {
        const sMask = 1 - smoothstep(-0.002, 0.005, dSmile);
        lum *= 1 - sMask * 0.85;
      }
    } else {
      const dPatch = sdEllipse(ax, ay, mx, my + 0.003, rx * 1.25, ry * 1.3 + 0.008);
      if (dPatch < 0.011) {
        const pMask = 1 - smoothstep(-0.004, 0.008, dPatch);
        lum = lum * (1 - pMask * 0.85) + 0.72 * (pMask * 0.85);
      }
      const dOpenMouth = sdEllipse(ax, ay, mx, my + 0.003, rx, ry);
      if (dOpenMouth < 0.008) {
        const mMask = 1 - smoothstep(-0.003, 0.005, dOpenMouth);
        lum *= 1 - mMask * 0.96;
        // Slender upper-teeth edge & subtle lower tongue highlight inside open vowels
        if (rawMouth.open >= 0.65 && Math.abs(ax - mx) < rx * 0.52) {
          if (ay > my + 0.003 - ry * 0.72 && ay < my + 0.003 - ry * 0.25) {
            lum = Math.max(lum, 0.66 * mMask);
          } else if (ay > my + 0.003 + ry * 0.28) {
            lum = Math.max(lum, 0.28 * mMask);
          }
        }
      }
      const dLowerLip = sdEllipse(ax, ay, mx, my + ry + 0.009, rx * 0.62, 0.0045);
      if (dLowerLip < 0.006) {
        const lMask = 1 - smoothstep(-0.002, 0.005, dLowerLip);
        lum = Math.max(lum, lMask * 0.86);
      }
    }
  }

  // 3. Traveling glint along headband/bangs & dainty acoustic voice sparks when speaking/listening
  if ((isSpeaking || isListening) && sampled.ink < 0.35 && ay < 0.28 && lum > 0.4) {
    const wave = Math.exp(-Math.pow((ax - ((time * 0.46) % 1.1)) * 7.5, 2));
    lum = clamp01(lum + wave * (0.1 + energy * 0.16));
  }

  // Dainty single-dot floating acoustic motes flanking silhouette when actively speaking or listening
  if (lum < 0.02 && (isSpeaking || (isListening && energy > 0.18))) {
    const speed = isSpeaking ? 0.26 : 0.14;
    const p1 = Math.hypot(ux - (0.09 + Math.sin(time * 3.1) * 0.025), uy - (0.42 - ((time * speed) % 0.3)));
    const p2 = Math.hypot(ux - (0.89 + Math.cos(time * 2.6) * 0.025), uy - (0.52 - (((time + 0.45) * speed) % 0.32)));
    const p3 = Math.hypot(ux - (0.13 + Math.cos(time * 2.2) * 0.02), uy - (0.68 - (((time + 0.2) * speed) % 0.28)));
    if (p1 < 0.0075 || p2 < 0.0075 || (isSpeaking && p3 < 0.0068)) {
      lum = Math.max(lum, 0.56 + energy * 0.35);
    }
  }

  return clamp01(lum);
}

/**
 * Pure TypeScript mathematical fallback portrait field (used in headless tests
 * and for the first millisecond before the reference PNG loads).
 */
export function samplePortraitLuminance(nx: number, ny: number, params: PortraitParams): number {
  const { time, mood, viseme, eyeState, energy, isSpeaking, isListening } = params;

  const swayX = Math.sin(time * 1.35) * 0.01 + (isSpeaking ? Math.sin(time * 5.2) * 0.008 * energy : 0);
  const swayY = Math.cos(time * 1.9) * 0.009 - (isSpeaking ? Math.abs(Math.sin(time * 6.8)) * 0.012 * energy : 0);
  const tilt = mood === 'thinking' ? 0.055 : mood === 'happy' ? -0.025 : 0.015;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);

  const rx0 = nx - swayX;
  const ry0 = ny - swayY;
  const x = rx0 * ct - ry0 * st;
  const y = rx0 * st + ry0 * ct;

  // 3/4 turned toward left matching the reference portrait
  const fx = x + 0.11;
  const fy = y + 0.02;

  const dCranium = sdEllipse(fx, fy, 0.0, -0.08, 0.34, 0.41);
  const dJaw = sdEllipse(fx, fy, -0.04, 0.19, 0.22, 0.25);
  const dFace = Math.min(dCranium, (dCranium + dJaw) * 0.5);

  const dNeck = sdCapsule2(x, y, 0.01, 0.32, 0.08, 0.84, 0.125);
  const dCollar = sdEllipse(x, y, 0.06, 0.78, 0.42, 0.18);
  const dBust = Math.min(dNeck, dCollar);

  const dHairCrown = sdEllipse(x, y, 0.03, -0.18, 0.5, 0.48);
  const dHairBackR = sdCapsule2(x, y, 0.28, -0.14, 0.46, 0.62, 0.17);
  const dCurlL = sdCapsule2(x, y, -0.35, 0.12, -0.52, 0.58, 0.1);
  const dBangL = sdCapsule2(x, y, -0.02, -0.56, -0.44, -0.14, 0.11);
  const dBangC = sdCapsule2(x, y, 0.04, -0.54, -0.12, -0.12, 0.09);

  const dHair = Math.min(
    Math.min(dHairCrown, dHairBackR),
    Math.min(dCurlL, Math.min(dBangL, dBangC))
  );

  // Curved headband over crown matching reference
  const dHeadband = Math.abs(sdEllipse(x, y, 0.01, -0.02, 0.32, 0.55)) - 0.038;

  const radialFade = 1 - smoothstep(0.72, 1.0, Math.hypot(x * 0.88, y * 0.92));
  const bottomFade = 1 - smoothstep(0.55, 0.94, y);

  let lum = 0;

  if (dHair < 0.065) {
    const hairMask = 1 - smoothstep(-0.02, 0.05, dHair);
    const rim = smoothstep(-0.055, 0.0, dHair) * (1 - smoothstep(0.0, 0.045, dHair));
    const zigSheen = Math.exp(-Math.pow((y + 0.36 + Math.sin(x * 22) * 0.025) * 8, 2)) * 0.65;
    lum = Math.max(lum, hairMask * (0.05 + rim * 0.38 + zigSheen));
  }

  if (dHeadband < 0.02 && y < -0.08 && x > -0.25 && x < 0.32) {
    const hbMask = 1 - smoothstep(-0.008, 0.015, dHeadband);
    const pulse = isSpeaking || isListening ? 0.08 * energy : 0;
    lum = Math.max(lum, hbMask * (0.94 + pulse));
  }

  if (dBust < 0.045) {
    const bustMask = 1 - smoothstep(-0.015, 0.03, dBust);
    lum = Math.max(lum, bustMask * 0.68);
  }

  if (dFace < 0.035) {
    const faceMask = 1 - smoothstep(-0.018, 0.022, dFace);
    const keyLight = clamp01(0.95 - (fx + 0.05) * 0.85);
    let skinLum = 0.32 + keyLight * 0.68;

    const eyeH =
      eyeState === 'blink' ? 0.006 : eyeState === 'half' ? 0.019 : eyeState === 'wide' ? 0.044 : 0.035;
    const dEyeL = sdEllipse(fx, fy, -0.15, -0.02, 0.046, eyeH);
    const dEyeR = sdEllipse(fx, fy, 0.04, -0.03, 0.064, eyeH);
    const dEyes = Math.min(dEyeL, dEyeR);

    if (dEyes < 0.018) {
      const eMask = 1 - smoothstep(-0.005, 0.014, dEyes);
      skinLum *= 1 - eMask * 0.94;
      if (eyeState !== 'blink') {
        const dCatch = Math.min(
          sdEllipse(fx, fy, -0.158, -0.03, 0.015, 0.014),
          sdEllipse(fx, fy, 0.028, -0.04, 0.018, 0.016)
        );
        skinLum = Math.max(skinLum, (1 - smoothstep(-0.003, 0.008, dCatch)) * 0.98);
      }
    }

    const mouth = getMouthShape(viseme, energy);
    const dMouth = sdEllipse(fx, fy, -0.095, 0.19, mouth.rx * 1.4, mouth.ry * 1.4);
    if (dMouth < 0.02) {
      const mMask = 1 - smoothstep(-0.005, 0.01, dMouth);
      skinLum *= 1 - mMask * (mouth.open > 0.3 ? 0.95 : 0.85);
    }

    lum = lum * (1 - faceMask) + clamp01(skinLum) * faceMask;
  }

  return clamp01(lum * radialFade * bottomFade);
}

/**
 * Renders a monochrome halftone dithered ASCII portrait frame.
 * - `braille`: Serpentine 2x4 Subpixel Atkinson Error Diffusion + Unsharp Contour Boost
 * - `floyd`: Floyd-Steinberg error diffusion across halftone density glyphs
 * - `bayer`: Ordered 4x4 Bayer halftone matrix
 */
export function renderHalftonePortrait(params: PortraitParams): PortraitFrame {
  const { cols, rows, style = 'braille', sourceField } = params;
  const cells = new Uint8Array(cols * rows);
  const lines: string[] = new Array(rows);
  const aspect = (cols * 0.53) / Math.max(1, rows);

  const sampleSub = (ux: number, uy: number, nx: number, ny: number): number =>
    sourceField
      ? sampleReferenceWithExpression(ux, uy, params, sourceField)
      : samplePortraitLuminance(nx, ny, params);

  if (style === 'braille') {
    const subW = cols * 2;
    const subH = rows * 4;
    const raw = new Float32Array(subW * subH);
    const work = new Float32Array(subW * subH);

    // 1. Sample 2x4 subpixel luminance buffer directly from reference artwork / 2D field
    for (let sy = 0; sy < subH; sy++) {
      const uy = (sy + 0.5) / subH;
      const ny = uy * 2 - 1;
      for (let sx = 0; sx < subW; sx++) {
        const ux = (sx + 0.5) / subW;
        const nx = (ux * 2 - 1) * aspect;
        raw[sy * subW + sx] = sampleSub(ux, uy, nx, ny);
      }
    }

    // 2. Unsharp contrast boost so hair highlights, lashes, catchlights & mouth stay crisp
    for (let sy = 0; sy < subH; sy++) {
      for (let sx = 0; sx < subW; sx++) {
        const idx = sy * subW + sx;
        const c = raw[idx];
        const l = raw[sy * subW + Math.max(0, sx - 1)];
        const r = raw[sy * subW + Math.min(subW - 1, sx + 1)];
        const u = raw[Math.max(0, sy - 1) * subW + sx];
        const d = raw[Math.min(subH - 1, sy + 1) * subW + sx];
        const avg = (l + r + u + d) * 0.25;
        const sharpened = c + (c - avg) * 0.42;
        work[idx] = clamp01(smoothstep(0.03, 0.97, sharpened));
      }
    }

    // 3. Serpentine Bill Atkinson Error Diffusion with fine Bayer micro-jitter
    for (let sy = 0; sy < subH; sy++) {
      const forward = (sy & 1) === 0;
      const startX = forward ? 0 : subW - 1;
      const endX = forward ? subW : -1;
      const dir = forward ? 1 : -1;

      for (let sx = startX; sx !== endX; sx += dir) {
        const idx = sy * subW + sx;
        const oldVal = work[idx];
        const jitter = BAYER_4X4[(sy & 3) * 4 + (sx & 3)] * 0.1;
        const newVal = oldVal >= 0.47 + jitter ? 1 : 0;
        work[idx] = newVal;
        const err = (oldVal - newVal) / 8;

        const nx1 = sx + dir;
        const nx2 = sx + dir * 2;
        const px1 = sx - dir;

        if (nx1 >= 0 && nx1 < subW) work[sy * subW + nx1] += err;
        if (nx2 >= 0 && nx2 < subW) work[sy * subW + nx2] += err;
        if (sy + 1 < subH) {
          const row1 = (sy + 1) * subW;
          if (px1 >= 0 && px1 < subW) work[row1 + px1] += err;
          work[row1 + sx] += err;
          if (nx1 >= 0 && nx1 < subW) work[row1 + nx1] += err;
        }
        if (sy + 2 < subH) {
          work[(sy + 2) * subW + sx] += err;
        }
      }
    }

    // 4. Pack 2x4 quantized subpixels into Unicode Braille cells (U+2800..U+28FF)
    for (let r = 0; r < rows; r++) {
      let line = '';
      for (let c = 0; c < cols; c++) {
        let bits = 0;
        let lumSum = 0;
        for (let py = 0; py < 4; py++) {
          const sy = r * 4 + py;
          const rowOff = sy * subW;
          for (let px = 0; px < 2; px++) {
            const sx = c * 2 + px;
            const pIdx = rowOff + sx;
            lumSum += raw[pIdx];
            if (work[pIdx] >= 0.5) {
              bits |= BRAILLE_BITMASK[py * 2 + px];
            }
          }
        }
        const avgCellLum = lumSum / 8;
        cells[r * cols + c] = Math.round(avgCellLum * 255);
        line += bits === 0 ? ' ' : String.fromCharCode(0x2800 + bits);
      }
      lines[r] = line;
    }

    return { cols, rows, lines, cells };
  }

  // Cell-level luminance for Floyd-Steinberg and Bayer modes
  const lumGrid = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const uy = (r + 0.5) / rows;
    const ny = uy * 2 - 1;
    for (let c = 0; c < cols; c++) {
      const ux = (c + 0.5) / cols;
      const nx = (ux * 2 - 1) * aspect;
      lumGrid[r * cols + c] = sampleSub(ux, uy, nx, ny);
    }
  }

  const levels = HALFTONE_RAMP.length - 1;

  if (style === 'floyd') {
    const work = new Float32Array(lumGrid);
    for (let r = 0; r < rows; r++) {
      let line = '';
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const oldVal = clamp01(work[idx]);
        if (lumGrid[idx] < 0.035 && oldVal < 0.06) {
          cells[idx] = 0;
          line += ' ';
          continue;
        }
        const qIdx = clamp01(oldVal) * levels;
        const nearest = Math.round(qIdx);
        const newVal = nearest / levels;
        const err = oldVal - newVal;

        if (c + 1 < cols) work[idx + 1] += err * (7 / 16);
        if (r + 1 < rows) {
          if (c - 1 >= 0) work[idx + cols - 1] += err * (3 / 16);
          work[idx + cols] += err * (5 / 16);
          if (c + 1 < cols) work[idx + cols + 1] += err * (1 / 16);
        }

        cells[idx] = Math.round(newVal * 255);
        line += HALFTONE_RAMP[nearest];
      }
      lines[r] = line;
    }
    return { cols, rows, lines, cells };
  }

  for (let r = 0; r < rows; r++) {
    const bRow = (r & 3) * 4;
    let line = '';
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const lum = lumGrid[idx];
      if (lum < 0.035) {
        cells[idx] = 0;
        line += ' ';
        continue;
      }
      const d = lum + BAYER_4X4[bRow + (c & 3)] * 0.22;
      const q = Math.max(0, Math.min(levels, Math.round(clamp01(d) * levels)));
      cells[idx] = Math.round((q / levels) * 255);
      line += HALFTONE_RAMP[q];
    }
    lines[r] = line;
  }

  return { cols, rows, lines, cells };
}
