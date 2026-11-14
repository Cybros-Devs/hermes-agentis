import type { ExpressionMood, EyeState, MouthViseme } from '../types/hermes';

export type BrailleShapeKind =
  | 'clover'
  | 'star'
  | 'ghost'
  | 'heart'
  | 'cloud'
  | 'triangle'
  | 'pebble'
  | 'trapezoid'
  | 'blob';

export type BrailleShapeTint =
  | 'lime'
  | 'pink'
  | 'lavender'
  | 'coral'
  | 'orange'
  | 'cyan'
  | 'periwinkle'
  | 'amber'
  | 'magenta';

export interface BrailleShapeMeta {
  kind: BrailleShapeKind;
  label: string;
  animeTitle: string;
  defaultTint: BrailleShapeTint;
  defaultEyeStyle: 'open' | 'sleepy';
  tagline: string;
  defaultAgentPersona: string;
}

export const BRAILLE_SHAPE_CATALOG: BrailleShapeMeta[] = [
  {
    kind: 'clover',
    label: 'Cyber Bob',
    animeTitle: 'Hime Headband',
    defaultTint: 'lime',
    defaultEyeStyle: 'open',
    tagline: 'Core strategist',
    defaultAgentPersona: 'Calm primary Hermes coordinator styled after the main cyber-bob operator.',
  },
  {
    kind: 'star',
    label: 'Twintails',
    animeTitle: 'Starlight Idol',
    defaultTint: 'pink',
    defaultEyeStyle: 'open',
    tagline: 'Launch runner',
    defaultAgentPersona: 'High-energy release and save_page builder running fast launch turns.',
  },
  {
    kind: 'ghost',
    label: 'Neko',
    animeTitle: 'Cyber Catgirl',
    defaultTint: 'lavender',
    defaultEyeStyle: 'open',
    tagline: 'Silent daemon',
    defaultAgentPersona: 'Stealthy background daemon monitoring cron watchers and ambient events.',
  },
  {
    kind: 'heart',
    label: 'Kitsune',
    animeTitle: 'Shrine Fox',
    defaultTint: 'coral',
    defaultEyeStyle: 'open',
    tagline: 'Care & triage',
    defaultAgentPersona: 'Attentive triage agent managing approvals, dispatches, and alerts.',
  },
  {
    kind: 'cloud',
    label: 'Usagi',
    animeTitle: 'Floppy Bunny',
    defaultTint: 'orange',
    defaultEyeStyle: 'open',
    tagline: 'Memory synth',
    defaultAgentPersona: 'Curious synthesis agent curating MEMORY.md and skill indexes.',
  },
  {
    kind: 'triangle',
    label: 'Mecha',
    animeTitle: 'Fin Headset',
    defaultTint: 'cyan',
    defaultEyeStyle: 'open',
    tagline: 'Code reviewer',
    defaultAgentPersona: 'Sharp analytical reviewer auditing diffs, security rules, and tests.',
  },
  {
    kind: 'pebble',
    label: 'Yume',
    animeTitle: 'Cozy Hood',
    defaultTint: 'periwinkle',
    defaultEyeStyle: 'sleepy',
    tagline: 'Deep-work lane',
    defaultAgentPersona: 'Quiet deep-research session focused on long-horizon synthesis.',
  },
  {
    kind: 'trapezoid',
    label: 'Seraph',
    animeTitle: 'Halo Wing',
    defaultTint: 'amber',
    defaultEyeStyle: 'sleepy',
    tagline: 'Brief keeper',
    defaultAgentPersona: 'Steady ops & morning-brief keeper guarding cron schedules.',
  },
  {
    kind: 'blob',
    label: 'Wolfcut',
    animeTitle: 'Cyber Ahoge',
    defaultTint: 'magenta',
    defaultEyeStyle: 'open',
    tagline: 'Sandbox bot',
    defaultAgentPersona: 'Edgy experimental sandbox session with layered wolfcut styling.',
  },
];

export const BRAILLE_TINT_PALETTE: Record<
  BrailleShapeTint,
  { label: string; low: string; mid: string; high: string; glow: string }
> = {
  lime: {
    label: 'Meadow',
    low: '#4D7C0F',
    mid: '#84CC16',
    high: '#ECFCCB',
    glow: 'rgba(163, 230, 53, 0.24)',
  },
  pink: {
    label: 'Blossom',
    low: '#BE185D',
    mid: '#F472B6',
    high: '#FCE7F3',
    glow: 'rgba(244, 114, 182, 0.24)',
  },
  lavender: {
    label: 'Iris',
    low: '#6D28D9',
    mid: '#A78BFA',
    high: '#EDE9FE',
    glow: 'rgba(167, 139, 250, 0.24)',
  },
  coral: {
    label: 'Coral',
    low: '#C2410C',
    mid: '#FB7185',
    high: '#FFE4E6',
    glow: 'rgba(251, 113, 133, 0.24)',
  },
  orange: {
    label: 'Tangerine',
    low: '#C2410C',
    mid: '#FB923C',
    high: '#FFEDD5',
    glow: 'rgba(251, 146, 60, 0.24)',
  },
  cyan: {
    label: 'Glacier',
    low: '#0369A1',
    mid: '#38BDF8',
    high: '#E0F2FE',
    glow: 'rgba(56, 189, 248, 0.24)',
  },
  periwinkle: {
    label: 'Periwinkle',
    low: '#4338CA',
    mid: '#818CF8',
    high: '#E0E7FF',
    glow: 'rgba(129, 140, 248, 0.24)',
  },
  amber: {
    label: 'Honey',
    low: '#B45309',
    mid: '#FBBF24',
    high: '#FEF3C7',
    glow: 'rgba(251, 191, 36, 0.24)',
  },
  magenta: {
    label: 'Berry',
    low: '#9D174D',
    mid: '#EC4899',
    high: '#FCE7F3',
    glow: 'rgba(236, 72, 153, 0.24)',
  },
};

export interface BrailleShapeMotionState {
  blink: number;      // 0 (open) .. 1 (closed)
  squint: number;     // 0 .. 1 sleepy / happy lid narrowing
  wide: number;       // 0 .. 1 alert eye dilation
  mouthOpen: number;  // 0 .. 1 smoothly damped aperture
  smile: number;      // 0 .. 1 smile weight
  gazeX: number;      // -1 .. 1 eye gaze X
  gazeY: number;      // -1 .. 1 eye gaze Y
  dragLift: number;   // 0 .. 1 lift & drop-settle squash/rebound
  dragTilt: number;   // radians rotational tilt (-0.22 .. +0.22)
  hairLag: number;    // secondary inertia sway on curls, twintails, ahoge & halo
  bounceY: number;    // vertical breath/speak/drop offset in UV space
}

export interface BrailleShapeAnimatorInput {
  time: number;
  mood: ExpressionMood;
  eyeStyle: 'open' | 'sleepy';
  viseme: MouthViseme;
  energy: number;
  isSpeaking: boolean;
  isThinking: boolean;
  isDragging: boolean;
  dragVelX?: number;
  dragVelY?: number;
  gazeX?: number;
  gazeY?: number;
  blinkPhaseOffset?: number;
}

export interface BrailleShapeRenderParams {
  shape: BrailleShapeKind;
  cols: number;
  rows: number;
  time: number;
  mood: ExpressionMood;
  eyeState?: EyeState | 'sleepy';
  viseme?: MouthViseme;
  energy?: number;
  isSpeaking?: boolean;
  isDragging?: boolean;
  gazeX?: number;
  gazeY?: number;
  motion?: BrailleShapeMotionState | null;
}

export interface BrailleShapeFrame {
  cols: number;
  rows: number;
  lines: string[];
  cells: Uint8Array;
}

const BAYER_4X4 = [
  0.0 / 16, 8.0 / 16, 2.0 / 16, 10.0 / 16,
  12.0 / 16, 4.0 / 16, 14.0 / 16, 6.0 / 16,
  3.0 / 16, 11.0 / 16, 1.0 / 16, 9.0 / 16,
  15.0 / 16, 7.0 / 16, 13.0 / 16, 5.0 / 16,
];

const BAYER_THRESH = BAYER_4X4.map((v) => 0.14 + v * 0.70);

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1));
  return t * t * (3 - 2 * t);
}

function expApproach(current: number, target: number, rate: number, dt: number): number {
  const factor = 1 - Math.exp(-rate * Math.max(0.001, dt));
  return current + (target - current) * factor;
}

function smin(a: number, b: number, k: number): number {
  if (a + k <= b) return a;
  if (b + k <= a) return b;
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return b * (1 - h) + a * h - k * h * (1 - h);
}

function targetMouthOpenForViseme(viseme: MouthViseme, energy: number, isSpeaking: boolean): number {
  if (!isSpeaking && viseme === 'closed') return 0;
  switch (viseme) {
    case 'wide':
      return clamp01(0.88 + energy * 0.12);
    case 'round':
      return clamp01(0.68 + energy * 0.18);
    case 'mid':
      return clamp01(0.54 + energy * 0.16);
    case 'lth':
      return clamp01(0.48 + energy * 0.14);
    case 'ee':
      return clamp01(0.46 + energy * 0.16);
    case 'small':
      return clamp01(0.32 + energy * 0.14);
    case 'fv':
      return clamp01(0.24 + energy * 0.10);
    case 'rest':
      return 0.12;
    case 'mbp':
    case 'smile':
    case 'closed':
    default:
      return isSpeaking ? clamp01(energy * 0.72) : 0;
  }
}

/**
 * Stateful spring-damper animator for anime Braille bust characters.
 * Drives smooth asymmetric blinking, velocity-coupled drag tilt & drop bounce settle,
 * damped lip-sync mouth aperture, and secondary hair-lock/twintail/ahoge inertia lag.
 */
export function createBrailleShapeAnimator() {
  const state: BrailleShapeMotionState = {
    blink: 0,
    squint: 0,
    wide: 0,
    mouthOpen: 0,
    smile: 0.4,
    gazeX: 0,
    gazeY: 0,
    dragLift: 0,
    dragTilt: 0,
    hairLag: 0,
    bounceY: 0,
  };

  let mouthVel = 0;
  let liftVel = 0;
  let tiltVel = 0;
  let hairVel = 0;
  let bounceVel = 0;
  let prevDragging = false;
  let dropImpulse = 0;

  return {
    step(input: BrailleShapeAnimatorInput, dt: number, reducedMotion = false): BrailleShapeMotionState {
      const clampedDt = clamp(dt, 0.004, 0.06);
      const offsetTime = input.time + (input.blinkPhaseOffset ?? 0);

      // Smooth asymmetric natural blink (~4.2s cadence with occasional double-blink)
      const cyclePos = (offsetTime / 4.2) % 1;
      let targetBlink = 0;
      if (cyclePos > 0.915) {
        targetBlink = Math.sin(((cyclePos - 0.915) / 0.085) * Math.PI);
      } else if (cyclePos > 0.815 && cyclePos < 0.875 && Math.floor(offsetTime / 4.2) % 3 === 1) {
        targetBlink = Math.sin(((cyclePos - 0.815) / 0.06) * Math.PI) * 0.9;
      }

      const targetSquint =
        input.mood === 'focused' || input.eyeStyle === 'sleepy'
          ? 0.65
          : input.mood === 'happy' && !input.isSpeaking
          ? 0.08
          : 0;
      const targetWide = input.mood === 'alert' ? 0.92 : input.isDragging ? 0.38 : 0;

      // Asymmetric fast lid close (rate 34) / graceful lid lift (rate 15)
      const blinkRate = targetBlink > state.blink ? 34 : 15;
      state.blink = expApproach(state.blink, targetBlink, blinkRate, clampedDt);
      state.squint = expApproach(state.squint, targetSquint, 10, clampedDt);
      state.wide = expApproach(state.wide, targetWide, 12, clampedDt);

      // Critically-damped 2nd-order filter for lip-sync mouth aperture (zero teleport jumps)
      const targetMouth = targetMouthOpenForViseme(input.viseme, input.energy, input.isSpeaking);
      const mouthStiffness = targetMouth > state.mouthOpen ? 148 : 118;
      const mouthDamping = 24.5;
      mouthVel += ((targetMouth - state.mouthOpen) * mouthStiffness - mouthVel * mouthDamping) * clampedDt;
      state.mouthOpen = clamp01(state.mouthOpen + mouthVel * clampedDt);

      const targetSmile = input.mood === 'happy' ? 1 : input.isSpeaking ? 0.25 : 0.35;
      state.smile = expApproach(state.smile, targetSmile, 8, clampedDt);

      // Saccade + curious thinking scan + pointer gaze
      let tGazeX = input.gazeX ?? 0;
      let tGazeY = input.gazeY ?? 0;
      if (input.gazeX === undefined && input.gazeY === undefined) {
        if (input.isThinking) {
          const stepPhase = Math.floor(offsetTime * 1.15);
          tGazeX = Math.sin(stepPhase * 1.9) * 0.52;
          tGazeY = -0.34 + Math.cos(stepPhase * 1.3) * 0.08;
        } else {
          const idleFix = Math.floor(offsetTime * 0.55);
          tGazeX = (idleFix * 7) % 3 === 0 ? Math.sin(idleFix * 2.1) * 0.22 : 0;
          tGazeY = (idleFix * 5) % 4 === 0 ? -0.10 : 0.02;
        }
      }
      state.gazeX = expApproach(state.gazeX, clamp(tGazeX, -1, 1), 13, clampedDt);
      state.gazeY = expApproach(state.gazeY, clamp(tGazeY, -1, 1), 13, clampedDt);

      if (reducedMotion) {
        state.dragLift = expApproach(state.dragLift, input.isDragging ? 0.35 : 0, 8, clampedDt);
        state.dragTilt = 0;
        state.hairLag = 0;
        state.bounceY = 0;
        prevDragging = input.isDragging;
        return { ...state };
      }

      if (prevDragging && !input.isDragging) {
        dropImpulse = -0.055;
        liftVel -= 1.4;
      } else if (!prevDragging && input.isDragging) {
        liftVel += 1.6;
      }
      prevDragging = input.isDragging;
      dropImpulse *= Math.exp(-12 * clampedDt);

      const targetLift = input.isDragging ? 1 : 0;
      liftVel += ((targetLift - state.dragLift) * 140 - liftVel * 14.5) * clampedDt;
      state.dragLift = clamp(state.dragLift + liftVel * clampedDt, -0.18, 1.25);

      const dragVx = clamp(input.dragVelX ?? 0, -2.5, 2.5);
      const moodTilt = input.isThinking
        ? Math.sin(offsetTime * 1.6) * 0.075 - 0.04
        : input.isSpeaking
        ? Math.sin(offsetTime * 3.9) * (0.045 + input.energy * 0.055)
        : Math.sin(offsetTime * 1.35) * 0.028;
      const targetTilt = clamp(moodTilt - dragVx * 0.11, -0.22, 0.22);
      tiltVel += ((targetTilt - state.dragTilt) * 125 - tiltVel * 13.5) * clampedDt;
      state.dragTilt = clamp(state.dragTilt + tiltVel * clampedDt, -0.24, 0.24);

      const breathBob = Math.sin(offsetTime * 2.3) * 0.020;
      const speakBob = input.isSpeaking ? Math.abs(Math.sin(offsetTime * 7.2)) * (0.015 + input.energy * 0.026) : 0;
      const dragHoverY = state.dragLift * 0.032;
      const targetBounceY = breathBob - speakBob - dragHoverY + dropImpulse;
      bounceVel += ((targetBounceY - state.bounceY) * 150 - bounceVel * 15) * clampedDt;
      state.bounceY = clamp(state.bounceY + bounceVel * clampedDt, -0.09, 0.09);

      const desiredHairLag = clamp(-tiltVel * 0.055 + Math.sin(offsetTime * 2.3 - 0.75) * 0.025, -0.14, 0.14);
      hairVel += ((desiredHairLag - state.hairLag) * 85 - hairVel * 9.5) * clampedDt;
      state.hairLag = clamp(state.hairLag + hairVel * clampedDt, -0.16, 0.16);

      return { ...state };
    },
  };
}

function sdCircle(x: number, y: number, cx: number, cy: number, r: number): number {
  const dx = x - cx;
  const dy = y - cy;
  return Math.sqrt(dx * dx + dy * dy) - r;
}

function sdEllipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number): number {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return (Math.sqrt(dx * dx + dy * dy) - 1) * (rx < ry ? rx : ry);
}

function sdCapsule(
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
  const h = clamp((pax * bax + pay * bay) / denom, 0, 1);
  const dx = pax - bax * h;
  const dy = pay - bay * h;
  return Math.sqrt(dx * dx + dy * dy) - r;
}

function sdTriangle(
  px: number,
  py: number,
  p0x: number,
  p0y: number,
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number
): number {
  const e0x = p1x - p0x;
  const e0y = p1y - p0y;
  const e1x = p2x - p1x;
  const e1y = p2y - p1y;
  const e2x = p0x - p2x;
  const e2y = p0y - p2y;

  const v0x = px - p0x;
  const v0y = py - p0y;
  const v1x = px - p1x;
  const v1y = py - p1y;
  const v2x = px - p2x;
  const v2y = py - p2y;

  const pq0x = v0x - e0x * clamp((v0x * e0x + v0y * e0y) / (e0x * e0x + e0y * e0y || 1), 0, 1);
  const pq0y = v0y - e0y * clamp((v0x * e0x + v0y * e0y) / (e0x * e0x + e0y * e0y || 1), 0, 1);
  const pq1x = v1x - e1x * clamp((v1x * e1x + v1y * e1y) / (e1x * e1x + e1y * e1y || 1), 0, 1);
  const pq1y = v1y - e1y * clamp((v1x * e1x + v1y * e1y) / (e1x * e1x + e1y * e1y || 1), 0, 1);
  const pq2x = v2x - e2x * clamp((v2x * e2x + v2y * e2y) / (e2x * e2x + e2y * e2y || 1), 0, 1);
  const pq2y = v2y - e2y * clamp((v2x * e2x + v2y * e2y) / (e2x * e2x + e2y * e2y || 1), 0, 1);

  const s = Math.sign(e0x * e2y - e0y * e2x);
  const d0 = pq0x * pq0x + pq0y * pq0y;
  const s0 = s * (v0x * e0y - v0y * e0x);
  const d1 = pq1x * pq1x + pq1y * pq1y;
  const s1 = s * (v1x * e1y - v1y * e1x);
  const d2 = pq2x * pq2x + pq2y * pq2y;
  const s2 = s * (v2x * e2y - v2y * e2x);

  let minD = d0;
  let minS = s0;
  if (d1 < minD) minD = d1;
  if (s1 < minS) minS = s1;
  if (d2 < minD) minD = d2;
  if (s2 < minS) minS = s2;
  return -Math.sqrt(minD) * Math.sign(minS);
}

interface AnimeFaceProfile {
  /** 3/4 head yaw turn: negative looks left like original ref, positive looks right */
  turn: number;
  faceCx: number;
  faceCy: number;
  faceRx: number;
  faceRy: number;
  chinY: number;
  eyeY: number;
  eyeSep: number;
  eyeRx: number;
  eyeRy: number;
  mouthY: number;
  bangBottomBase: number;
  partType: 'straight' | 'center' | 'side' | 'wispy' | 'blunt';
  shineY: number;
  accessory:
    | 'headset'
    | 'ties'
    | 'nekoEar'
    | 'foxEar'
    | 'bunnyPin'
    | 'visorFin'
    | 'hoodCowl'
    | 'halo'
    | 'choker';
}

const STATIC_FACE_PROFILES: Record<BrailleShapeKind, AnimeFaceProfile> = {
  // 1. Cyber Bob — Direct sister character variation of the original reference portrait
  clover: {
    turn: -0.38,
    faceCx: -0.09,
    faceCy: 0.04,
    faceRx: 0.30,
    faceRy: 0.32,
    chinY: 0.36,
    eyeY: 0.03,
    eyeSep: 0.145,
    eyeRx: 0.072,
    eyeRy: 0.082,
    mouthY: 0.215,
    bangBottomBase: -0.11,
    partType: 'straight',
    shineY: -0.34,
    accessory: 'headset',
  },
  // 2. Twintails — High-energy cyber idol with swept bangs and twin ties
  star: {
    turn: 0.26,
    faceCx: 0.06,
    faceCy: 0.05,
    faceRx: 0.29,
    faceRy: 0.31,
    chinY: 0.35,
    eyeY: 0.04,
    eyeSep: 0.14,
    eyeRx: 0.072,
    eyeRy: 0.084,
    mouthY: 0.215,
    bangBottomBase: -0.10,
    partType: 'center',
    shineY: -0.30,
    accessory: 'ties',
  },
  // 3. Neko — Sleek anime cat-ear headphone operator facing 3/4 left
  ghost: {
    turn: -0.32,
    faceCx: -0.07,
    faceCy: 0.08,
    faceRx: 0.29,
    faceRy: 0.30,
    chinY: 0.37,
    eyeY: 0.07,
    eyeSep: 0.145,
    eyeRx: 0.074,
    eyeRy: 0.082,
    mouthY: 0.24,
    bangBottomBase: -0.07,
    partType: 'wispy',
    shineY: -0.25,
    accessory: 'nekoEar',
  },
  // 4. Kitsune — Side-swept shrine fox spirit with sleek fox ears
  heart: {
    turn: 0.34,
    faceCx: 0.08,
    faceCy: 0.09,
    faceRx: 0.28,
    faceRy: 0.30,
    chinY: 0.38,
    eyeY: 0.08,
    eyeSep: 0.14,
    eyeRx: 0.070,
    eyeRy: 0.078,
    mouthY: 0.25,
    bangBottomBase: -0.06,
    partType: 'side',
    shineY: -0.23,
    accessory: 'foxEar',
  },
  // 5. Usagi — Floppy-ear cyber bunny with clean hairpin bangs
  cloud: {
    turn: -0.24,
    faceCx: -0.05,
    faceCy: 0.11,
    faceRx: 0.29,
    faceRy: 0.29,
    chinY: 0.39,
    eyeY: 0.10,
    eyeSep: 0.14,
    eyeRx: 0.072,
    eyeRy: 0.082,
    mouthY: 0.26,
    bangBottomBase: -0.04,
    partType: 'straight',
    shineY: -0.19,
    accessory: 'bunnyPin',
  },
  // 6. Mecha — Sharp cyberpunk pilot with winged temple headset fins
  triangle: {
    turn: 0.34,
    faceCx: 0.08,
    faceCy: 0.07,
    faceRx: 0.28,
    faceRy: 0.30,
    chinY: 0.36,
    eyeY: 0.06,
    eyeSep: 0.14,
    eyeRx: 0.070,
    eyeRy: 0.076,
    mouthY: 0.235,
    bangBottomBase: -0.08,
    partType: 'side',
    shineY: -0.25,
    accessory: 'visorFin',
  },
  // 7. Yume — Slouch-hooded netrunner with wispy bangs and calm half-lidded eyes
  pebble: {
    turn: -0.20,
    faceCx: -0.04,
    faceCy: 0.07,
    faceRx: 0.29,
    faceRy: 0.30,
    chinY: 0.36,
    eyeY: 0.07,
    eyeSep: 0.145,
    eyeRx: 0.072,
    eyeRy: 0.078,
    mouthY: 0.24,
    bangBottomBase: -0.07,
    partType: 'wispy',
    shineY: -0.32,
    accessory: 'hoodCowl',
  },
  // 8. Seraph — Royal hime-cut cyber angel with blunt bangs & floating halo
  trapezoid: {
    turn: 0.18,
    faceCx: 0.04,
    faceCy: 0.09,
    faceRx: 0.28,
    faceRy: 0.30,
    chinY: 0.38,
    eyeY: 0.08,
    eyeSep: 0.14,
    eyeRx: 0.070,
    eyeRy: 0.080,
    mouthY: 0.25,
    bangBottomBase: -0.06,
    partType: 'blunt',
    shineY: -0.24,
    accessory: 'halo',
  },
  // 9. Wolfcut — Layered anime wolfcut with sweeping top ahoge & cyber choker
  blob: {
    turn: -0.28,
    faceCx: -0.06,
    faceCy: 0.07,
    faceRx: 0.29,
    faceRy: 0.30,
    chinY: 0.36,
    eyeY: 0.06,
    eyeSep: 0.142,
    eyeRx: 0.072,
    eyeRy: 0.080,
    mouthY: 0.235,
    bangBottomBase: -0.08,
    partType: 'center',
    shineY: -0.27,
    accessory: 'choker',
  },
};

function evaluateAnimeFaceDist(profile: AnimeFaceProfile, x: number, y: number): number {
  const { faceCx, faceCy, faceRx, faceRy, turn } = profile;
  const dy = y - faceCy;
  // Tapered anime chin contour below cheek level, rounded brow above
  const tChin = clamp01((dy - 0.01) / (faceRy * 0.96));
  const widthAtY = faceRx * (1.0 - tChin * tChin * 0.56);
  // Subtle asymmetric 3/4 cheek/jawline offset
  const jawShift = turn * (0.04 - tChin * 0.08);
  const dx = (x - (faceCx + jawShift)) / Math.max(0.08, widthAtY);
  const ny = dy / faceRy;
  return (Math.sqrt(dx * dx + ny * ny) - 1) * Math.min(widthAtY, faceRy);
}

/**
 * Signed distance for each of the 9 anime portrait bust variations in [-1, 1] space.
 */
export function evaluateShapeSdf(shape: BrailleShapeKind, x: number, y: number): number {
  switch (shape) {
    case 'clover': {
      // Cyber Bob (original reference silhouette): dome hair + swept left/right bob curls + neck + sloping shoulder bust
      const crown = sdEllipse(x, y, 0.05, -0.18, 0.48, 0.48);
      const backHair = sdCapsule(x, y, 0.28, -0.10, 0.44, 0.54, 0.21);
      const leftSideHair = sdCapsule(x, y, -0.34, -0.05, -0.44, 0.48, 0.145);
      const leftCurl = y > 0.20 ? sdCapsule(x, y, -0.44, 0.46, -0.63, 0.39, 0.095) : 1;
      const rightCurl = y > 0.22 ? sdCapsule(x, y, 0.44, 0.52, 0.61, 0.41, 0.095) : 1;
      const chin = y > -0.10 ? sdEllipse(x, y, -0.10, 0.20, 0.25, 0.23) : 1;
      const hair = smin(
        smin(crown, backHair, 0.08),
        smin(smin(leftSideHair, leftCurl, 0.07), rightCurl, 0.07),
        0.08
      );
      if (y < 0.22) return smin(hair, chin, 0.05);
      const neck = sdCapsule(x, y, 0.0, 0.34, 0.02, 0.60, 0.10);
      const bust = sdEllipse(x, y, 0.04, 0.69, 0.33, 0.13);
      return smin(smin(hair, chin, 0.05), smin(neck, bust, 0.06), 0.05);
    }
    case 'star': {
      // Starlight Twintails: anime head/shoulder bust + flared sweeping twintails + ahoge
      const crown = y < 0.35 ? sdEllipse(x, y, 0.0, -0.15, 0.44, 0.43) : 1;
      const chin = y > -0.10 && y < 0.50 ? sdEllipse(x, y, 0.06, 0.20, 0.24, 0.22) : 1;
      const ahoge = y < -0.35 ? sdCapsule(x, y, -0.02, -0.56, 0.14, -0.74, 0.052) : 1;
      const leftTail =
        x < -0.15
          ? smin(
              sdCapsule(x, y, -0.41, -0.12, -0.67, 0.34, 0.135),
              sdCapsule(x, y, -0.67, 0.34, -0.74, 0.55, 0.10),
              0.07
            )
          : 1;
      const rightTail =
        x > 0.15
          ? smin(
              sdCapsule(x, y, 0.41, -0.12, 0.67, 0.34, 0.135),
              sdCapsule(x, y, 0.67, 0.34, 0.74, 0.55, 0.10),
              0.07
            )
          : 1;
      const tails = Math.min(leftTail, rightTail);
      const headCore = smin(smin(crown, chin, 0.05), ahoge, 0.05);
      if (y < 0.22) return smin(headCore, tails, 0.06);
      const neck = sdCapsule(x, y, 0.02, 0.34, 0.0, 0.58, 0.098);
      const bust = sdEllipse(x, y, 0.0, 0.68, 0.31, 0.13);
      return smin(smin(headCore, smin(neck, bust, 0.06), 0.05), tails, 0.06);
    }
    case 'ghost': {
      // Neko Cyber Catgirl: sleek hair locks + pointed cat ears + shoulder bust
      const crown = y < 0.38 ? sdEllipse(x, y, 0.04, -0.10, 0.45, 0.42) : 1;
      const lockL = x < 0 ? sdCapsule(x, y, -0.34, 0.04, -0.44, 0.54, 0.125) : 1;
      const lockR = x > 0 ? sdCapsule(x, y, 0.38, 0.02, 0.48, 0.56, 0.135) : 1;
      const chin = y > -0.08 && y < 0.52 ? sdEllipse(x, y, -0.08, 0.23, 0.24, 0.22) : 1;
      let core = smin(smin(crown, chin, 0.05), Math.min(lockL, lockR), 0.06);
      if (y >= 0.22) {
        const neck = sdCapsule(x, y, 0.0, 0.36, 0.02, 0.60, 0.098);
        const bust = sdEllipse(x, y, 0.02, 0.69, 0.32, 0.13);
        core = smin(core, smin(neck, bust, 0.06), 0.05);
      }
      if (y > -0.05) return core;
      const earL = sdTriangle(x, y, -0.44, -0.22, -0.46, -0.72, -0.14, -0.42) - 0.032;
      const earR = sdTriangle(x, y, 0.46, -0.20, 0.16, -0.40, 0.48, -0.72) - 0.032;
      return smin(core, Math.min(earL, earR), 0.04);
    }
    case 'heart': {
      // Kitsune Shrine Fox: tall angled fox ears + hime side locks + graceful bust
      const crown = y < 0.38 ? sdEllipse(x, y, -0.04, -0.08, 0.44, 0.41) : 1;
      const lockL = x < 0 ? sdCapsule(x, y, -0.40, 0.04, -0.52, 0.56, 0.125) : 1;
      const lockR = x > 0 ? sdCapsule(x, y, 0.36, 0.06, 0.48, 0.54, 0.125) : 1;
      const chin = y > -0.08 && y < 0.52 ? sdEllipse(x, y, 0.08, 0.23, 0.24, 0.22) : 1;
      let core = smin(smin(crown, chin, 0.05), Math.min(lockL, lockR), 0.06);
      if (y >= 0.22) {
        const neck = sdCapsule(x, y, 0.0, 0.36, -0.02, 0.60, 0.098);
        const bust = sdEllipse(x, y, -0.02, 0.69, 0.32, 0.13);
        core = smin(core, smin(neck, bust, 0.06), 0.05);
      }
      if (y > 0.0) return core;
      const earL = sdTriangle(x, y, -0.44, -0.14, -0.54, -0.74, -0.12, -0.36) - 0.03;
      const earR = sdTriangle(x, y, 0.42, -0.16, 0.10, -0.36, 0.52, -0.74) - 0.03;
      return smin(core, Math.min(earL, earR), 0.04);
    }
    case 'cloud': {
      // Usagi Bunny: soft layered anime bob + one upright ear + one folded bunny ear + bust
      const crown = y < 0.42 ? sdEllipse(x, y, 0.03, -0.04, 0.44, 0.40) : 1;
      const lockL = x < 0 ? sdCapsule(x, y, -0.36, 0.10, -0.48, 0.52, 0.13) : 1;
      const lockR = x > 0 ? sdCapsule(x, y, 0.38, 0.08, 0.50, 0.52, 0.135) : 1;
      const chin = y > -0.05 && y < 0.54 ? sdEllipse(x, y, -0.05, 0.25, 0.24, 0.22) : 1;
      let core = smin(smin(crown, chin, 0.05), Math.min(lockL, lockR), 0.06);
      if (y >= 0.24) {
        const neck = sdCapsule(x, y, 0.0, 0.38, 0.0, 0.60, 0.098);
        const bust = sdEllipse(x, y, 0.0, 0.69, 0.31, 0.13);
        core = smin(core, smin(neck, bust, 0.06), 0.05);
      }
      if (y > -0.02) return core;
      const earL = sdCapsule(x, y, -0.20, -0.30, -0.28, -0.74, 0.10);
      const earR = sdCapsule(x, y, 0.22, -0.30, 0.42, -0.68, 0.095);
      const earTipR = sdCapsule(x, y, 0.42, -0.68, 0.56, -0.54, 0.08);
      return smin(core, Math.min(earL, smin(earR, earTipR, 0.05)), 0.05);
    }
    case 'triangle': {
      // Mecha Fin Headset: sharp anime cut + temple headset cups + upward cyber fins + collar bust
      const crown = y < 0.38 ? sdEllipse(x, y, -0.03, -0.10, 0.43, 0.41) : 1;
      const chin = y > -0.08 && y < 0.52 ? sdEllipse(x, y, 0.08, 0.22, 0.24, 0.22) : 1;
      const hairSideL = x < 0 ? sdCapsule(x, y, -0.38, -0.02, -0.44, 0.46, 0.115) : 1;
      const hairSideR = x > 0 ? sdCapsule(x, y, 0.36, 0.02, 0.42, 0.44, 0.105) : 1;
      let body = smin(smin(crown, chin, 0.05), Math.min(hairSideL, hairSideR), 0.06);
      if (y >= 0.22) {
        const neck = sdCapsule(x, y, 0.0, 0.36, 0.0, 0.59, 0.098);
        const bust = sdEllipse(x, y, -0.02, 0.68, 0.33, 0.13);
        body = smin(body, smin(neck, bust, 0.06), 0.05);
      }
      if (y > 0.22) return body;
      const cupL = x < 0 ? sdCapsule(x, y, -0.46, -0.02, -0.46, 0.18, 0.10) : 1;
      const cupR = x > 0 ? sdCapsule(x, y, 0.45, -0.02, 0.45, 0.18, 0.10) : 1;
      const finL = x < 0 ? sdTriangle(x, y, -0.48, -0.02, -0.62, -0.60, -0.32, -0.26) - 0.03 : 1;
      const finR = x > 0 ? sdTriangle(x, y, 0.48, -0.02, 0.32, -0.26, 0.62, -0.60) - 0.03 : 1;
      const crest = Math.abs(x) < 0.22 ? sdTriangle(x, y, -0.09, -0.40, 0.0, -0.66, 0.09, -0.40) - 0.025 : 1;
      return smin(
        smin(body, crest, 0.04),
        Math.min(smin(finL, cupL, 0.04), smin(finR, cupR, 0.04)),
        0.04
      );
    }
    case 'pebble': {
      // Yume Cozy Hood: oversized rounded anime hoodie cowl framing slender face + collar
      const hood = y < 0.48 ? sdEllipse(x, y, 0.02, -0.08, 0.50, 0.46) : 1;
      const hoodEarL = y < -0.20 && x < 0 ? sdCircle(x, y, -0.37, -0.46, 0.13) : 1;
      const hoodEarR = y < -0.20 && x > 0 ? sdCircle(x, y, 0.39, -0.46, 0.13) : 1;
      const cowl = y > 0.20 ? sdEllipse(x, y, 0.0, 0.47, 0.41, 0.18) : 1;
      const bust = y > 0.38 ? sdEllipse(x, y, 0.0, 0.67, 0.35, 0.14) : 1;
      return smin(smin(hood, smin(cowl, bust, 0.07), 0.08), Math.min(hoodEarL, hoodEarR), 0.06);
    }
    case 'trapezoid': {
      // Seraph Halo: serene long hime-cut anime portrait + floating tilted slim halo ring + bust
      const crown = y < 0.38 ? sdEllipse(x, y, -0.02, -0.08, 0.43, 0.40) : 1;
      const himeL = x < 0 ? sdCapsule(x, y, -0.39, 0.0, -0.44, 0.60, 0.115) : 1;
      const himeR = x > 0 ? sdCapsule(x, y, 0.38, 0.0, 0.43, 0.60, 0.115) : 1;
      const chin = y > -0.08 && y < 0.52 ? sdEllipse(x, y, 0.04, 0.22, 0.24, 0.22) : 1;
      let bodyPart = smin(smin(crown, chin, 0.05), Math.min(himeL, himeR), 0.05);
      if (y >= 0.22) {
        const neck = sdCapsule(x, y, 0.0, 0.36, 0.0, 0.59, 0.096);
        const bust = sdEllipse(x, y, 0.0, 0.68, 0.31, 0.13);
        bodyPart = smin(bodyPart, smin(neck, bust, 0.06), 0.05);
      }
      if (y > -0.40) return bodyPart;
      const haloRing = Math.abs(sdEllipse(x, y - x * 0.06, 0.0, -0.60, 0.36, 0.075)) - 0.026;
      return Math.min(bodyPart, haloRing);
    }
    case 'blob':
    default: {
      // Wolfcut Cyber Ahoge: jagged layered anime wolfcut + dramatic curved ahoge + collar bust
      const crown = y < 0.38 ? sdEllipse(x, y, 0.03, -0.10, 0.45, 0.42) : 1;
      const tuftL1 = x < 0 ? sdCapsule(x, y, -0.36, 0.08, -0.57, 0.38, 0.105) : 1;
      const tuftL2 = x < 0 && y > 0.10 ? sdCapsule(x, y, -0.34, 0.26, -0.53, 0.56, 0.105) : 1;
      const tuftR1 = x > 0 ? sdCapsule(x, y, 0.38, 0.08, 0.57, 0.38, 0.105) : 1;
      const tuftR2 = x > 0 && y > 0.10 ? sdCapsule(x, y, 0.34, 0.26, 0.53, 0.56, 0.105) : 1;
      const chin = y > -0.08 && y < 0.52 ? sdEllipse(x, y, -0.06, 0.21, 0.24, 0.22) : 1;
      const tufts = Math.min(smin(tuftL1, tuftL2, 0.06), smin(tuftR1, tuftR2, 0.06));
      let body = smin(smin(crown, chin, 0.05), tufts, 0.06);
      if (y >= 0.22) {
        const neck = sdCapsule(x, y, 0.0, 0.35, 0.01, 0.59, 0.098);
        const bust = sdEllipse(x, y, 0.02, 0.68, 0.32, 0.13);
        body = smin(body, smin(neck, bust, 0.06), 0.05);
      }
      if (y > -0.35) return body;
      const ahoge = smin(
        sdCapsule(x, y, -0.04, -0.48, 0.08, -0.72, 0.052),
        sdCapsule(x, y, 0.08, -0.72, 0.28, -0.62, 0.045),
        0.04
      );
      return smin(body, ahoge, 0.06);
    }
  }
}

let shapeBufCap = 0;
let shapeSubLum = new Float32Array(0);

function ensureShapeSubBuffer(len: number): Float32Array {
  if (len > shapeBufCap) {
    shapeBufCap = len;
    shapeSubLum = new Float32Array(len);
  }
  return shapeSubLum;
}

/**
 * Renders an expressive 3/4 anime bust portrait variation styled after the main manga character in 2x4 Unicode Braille.
 */
export function renderBrailleShape(params: BrailleShapeRenderParams): BrailleShapeFrame {
  const {
    shape,
    cols,
    rows,
    time,
    mood,
    eyeState = 'open',
    viseme = 'closed',
    energy = 0.08,
    isSpeaking = false,
    isDragging = false,
    gazeX = 0,
    gazeY = 0,
    motion,
  } = params;

  const subW = cols * 2;
  const subH = rows * 4;
  const subLum = ensureShapeSubBuffer(subW * subH);
  const lines: string[] = new Array(rows);
  const cells = new Uint8Array(cols * rows);

  const blinkAmt = motion
    ? clamp01(motion.blink)
    : eyeState === 'blink'
    ? 1
    : 0;
  const squintAmt = motion
    ? clamp01(motion.squint)
    : eyeState === 'sleepy'
    ? 0.65
    : eyeState === 'happy' && !isSpeaking
    ? 0.72
    : 0;
  const wideAmt = motion
    ? clamp01(motion.wide)
    : eyeState === 'wide'
    ? 0.9
    : 0;
  const dragLiftAmt = motion ? motion.dragLift : isDragging ? 1 : 0;
  const tilt = motion ? motion.dragTilt : 0;
  const hairLag = motion ? motion.hairLag : 0;
  const bounceY = motion ? motion.bounceY : Math.sin(time * 2.2) * 0.018;

  const breath = Math.sin(time * 2.2) * 0.018;
  const speakBounce = isSpeaking ? Math.sin(time * 13.5) * energy * 0.024 : 0;

  // Safe framing scale guarantees zero top/left/right clipping across all 9 portraits
  const safeBase = 0.90;
  const scaleX = safeBase * (1 + breath * 0.35 - speakBounce * 0.25 + dragLiftAmt * 0.030);
  const scaleY = safeBase * (1 - breath * 0.45 + speakBounce * 0.55 - dragLiftAmt * 0.020);

  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);

  const effGazeX = motion ? motion.gazeX : gazeX;
  const effGazeY = motion ? motion.gazeY : gazeY;
  const gx = clamp(effGazeX, -1, 1) * 0.022;
  const gy = clamp(effGazeY, -1, 1) * 0.018;

  const mouthOpen = motion
    ? clamp01(motion.mouthOpen)
    : targetMouthOpenForViseme(viseme, energy, isSpeaking);
  const smileAmt = motion ? clamp01(motion.smile) : mood === 'happy' ? 1 : 0.25;

  const pivotY = 0.14;
  const profile = STATIC_FACE_PROFILES[shape];
  const turn = profile.turn;
  const turnSign = turn < 0 ? -1 : 1;
  const faceShiftX = gx * 0.30;
  const faceShiftY = gy * 0.22;

  // Perspective-foreshortened anime eye geometry matching 3/4 head turn
  const eyeCenterX = profile.faceCx + turn * 0.12;
  const farFactor = 0.80;
  const nearFactor = 1.08;
  const leftEyeRx = profile.eyeRx * (turn < 0 ? farFactor : nearFactor) * (1 + wideAmt * 0.10);
  const rightEyeRx = profile.eyeRx * (turn < 0 ? nearFactor : farFactor) * (1 + wideAmt * 0.10);
  const leftEyeX = eyeCenterX - profile.eyeSep * (turn < 0 ? 0.92 : 1.02) + gx * 0.65;
  const rightEyeX = eyeCenterX + profile.eyeSep * (turn < 0 ? 1.02 : 0.92) + gx * 0.65;
  const eyeY = profile.eyeY + gy * 0.45;
  const eyeRy = profile.eyeRy * (1 + wideAmt * 0.12);

  // Delicate pointed nose & cupid's-bow mouth aligned to 3/4 face plane
  const noseX = profile.faceCx + turn * 0.26 + gx * 0.40;
  const noseY = profile.eyeY + 0.095 + gy * 0.30;
  const mouthXBase = profile.faceCx + turn * 0.20 + gx * 0.30;
  const mouthY = profile.mouthY + gy * 0.32;

  for (let sy = 0; sy < subH; sy++) {
    const nyRaw = ((sy + 0.5) / subH) * 2 - 1;
    const nyScaled = (nyRaw - bounceY) / scaleY;
    const rowOff = sy * subW;

    for (let sx = 0; sx < subW; sx++) {
      const nxRaw = ((sx + 0.5) / subW) * 2 - 1;
      const nxScaled = nxRaw / scaleX;

      const dxp = nxScaled;
      const dyp = nyScaled - pivotY;
      let nx = dxp * cosT - dyp * sinT;
      const ny = dxp * sinT + dyp * cosT + pivotY;

      if (hairLag !== 0) {
        const upperZone = ny < -0.22 ? (-0.22 - ny) * 0.55 : 0;
        const lowerZone = ny > 0.22 ? (ny - 0.22) * 0.55 : 0;
        nx += hairLag * (upperZone - lowerZone);
      }

      if (nx > 0.90 || nx < -0.90 || ny < -0.84 || ny > 0.78) {
        subLum[rowOff + sx] = 0;
        continue;
      }

      const d = evaluateShapeSdf(shape, nx, ny);
      if (d > 0.030) {
        subLum[rowOff + sx] = 0;
        continue;
      }

      const edgeCov = clamp(1 - (d + 0.004) / 0.034, 0, 1);
      // Graceful vignette at bottom of bust collar so torso melts smoothly into backdrop
      const bottomFade = ny > 0.65 ? clamp01(1 - (ny - 0.65) / 0.14) : 1;
      const alphaCov = edgeCov * bottomFade;
      if (alphaCov <= 0.01) {
        subLum[rowOff + sx] = 0;
        continue;
      }

      // Compute 3/4 tapered anime face SDF only within face region
      let dFace = 1;
      let bangBottom = profile.bangBottomBase;
      let inFace = false;
      if (nx > -0.46 && nx < 0.46 && ny > -0.34 && ny < 0.45) {
        dFace = evaluateAnimeFaceDist(profile, nx - faceShiftX, ny - faceShiftY);

        if (profile.partType === 'center') {
          const dxC = nx - profile.faceCx;
          bangBottom += -0.055 / (1 + dxC * dxC * 42) + 0.024 * Math.cos(nx * 18);
        } else if (profile.partType === 'side') {
          bangBottom += -0.075 * clamp((nx - profile.faceCx) * turnSign + 0.12, -0.35, 0.35) + 0.02 * Math.sin(nx * 16);
        } else if (profile.partType === 'wispy') {
          bangBottom += 0.032 * Math.cos((nx - profile.faceCx) * 20) - 0.012;
        } else if (profile.partType === 'blunt') {
          bangBottom += 0.014 * Math.sin(nx * 12) + (Math.abs(nx - profile.faceCx) < 0.10 ? 0.015 : 0);
        } else {
          // Straight layered manga bangs like original reference
          bangBottom += 0.026 * Math.sin((nx - profile.faceCx) * 20) + (Math.abs(nx - profile.faceCx) < 0.07 ? -0.028 : 0);
        }

        inFace = dFace < 0 && ny > bangBottom;
      }

      // Check neck & collar region below chin
      const inNeckCollar =
        !inFace &&
        ny > profile.chinY - 0.04 &&
        ny < 0.78 &&
        Math.abs(nx) < 0.34;

      let lum: number;

      if (inFace) {
        // Luminous manga face: turned-front cheek stays crisp bright, far back temple gets soft shading
        const templeDist = (nx - profile.faceCx) * -turnSign;
        const templeShadow = smoothstep(0.14, 0.30, templeDist) * 0.14;
        lum = clamp(0.94 - templeShadow, 0.74, 0.97);

        // Soft cast shadow directly beneath the bang fringe
        const underBang = ny - bangBottom;
        if (underBang >= 0 && underBang < 0.046) {
          lum *= 0.62 + (underBang / 0.046) * 0.38;
        }

        // Crisp dark manga jawline contour along bottom-outer edge of chin
        if (dFace > -0.022 && ny > profile.eyeY + 0.08) {
          lum = 0.07;
        }
      } else if (inNeckCollar && Math.abs(nx) < 0.115 && ny < 0.56) {
        // Slender neck with iconic manga triangle cast shadow directly beneath chin
        const chinShadow = ny < profile.chinY + 0.08 && nx * -turnSign < 0.07;
        lum = chinShadow ? 0.12 : 0.78;
      } else if (inNeckCollar && ny >= 0.50) {
        // Sculpted diagonal anime collar + V-neck trim + dark chest jacket contrast (matches reference bust)
        const vNotch = 0.51 + Math.abs(nx - turn * 0.05) * 0.85;
        const shoulderSlope = 0.54 + Math.abs(nx) * 0.36;
        if (ny < shoulderSlope && ny > vNotch) {
          lum = 0.88; // Bright crisp collar rim
        } else if (Math.abs(ny - shoulderSlope) < 0.024 || Math.abs(ny - vNotch) < 0.024) {
          lum = 0.94; // Clean manga collar highlight stroke
        } else {
          lum = 0.24; // Dark cyber jacket/shoulder fold
        }
      } else {
        // High-contrast dark manga hair interior + crisp outer rim outline (matches original ink style!)
        const isOuterRim = d > -0.070;
        const rimBoost = isOuterRim ? clamp01(1 + d / 0.070) * 0.45 : 0;
        const strandShade = 0.045 * Math.max(0, Math.sin(nx * 36 - ny * 8));
        lum = 0.14 + rimBoost + strandShade;

        // Serrated / jagged manga hair-shine band curving across crown & bangs (key reference signature!)
        if (ny > profile.shineY - 0.11 && ny < profile.shineY + 0.11 && Math.abs(nx) < 0.44) {
          const shineCurve = profile.shineY + nx * nx * 0.28 - turn * nx * 0.08;
          const jag = 0.022 * Math.sin(nx * 34 + 0.5) + 0.014 * Math.cos(nx * 58);
          const distShine = Math.abs(ny - (shineCurve + jag));
          const strandBreak = Math.sin(nx * 52 + ny * 5);
          if (distShine < 0.042 && strandBreak > -0.35) {
            lum = Math.max(lum, 0.94);
          }
        }

        // Subtle secondary curl highlight near lower flared bob / twintail tips
        if (ny > 0.34 && ny < 0.56 && Math.abs(nx) > 0.32) {
          const tipSheen = 0.36 + 0.18 * Math.sin(ny * 26 + nx * 12);
          lum = Math.max(lum, tipSheen);
        }
      }

      // Signature Character Accessories (High-contrast manga white/glow accents!)
      switch (profile.accessory) {
        case 'headset': {
          const bandCurve = -0.37 + nx * nx * 0.65 - nx * 0.12;
          if (ny < 0.0 && Math.abs(ny - bandCurve) < 0.046 && nx > -0.18 && nx < 0.40) {
            lum = 0.97;
          }
          const cupDx = (nx - 0.31) / 0.09;
          const cupDy = (ny - 0.04) / 0.125;
          const cupDistSq = cupDx * cupDx + cupDy * cupDy;
          if (cupDistSq < 1.0) {
            lum = cupDistSq > 0.58 && cupDistSq < 0.78 ? 0.96 : 0.10;
          }
          break;
        }
        case 'ties': {
          const tLx = nx + 0.41;
          const tLy = ny + 0.12;
          const tRx = nx - 0.41;
          const tRy = ny + 0.12;
          if (tLx * tLx + tLy * tLy < 0.0065 || tRx * tRx + tRy * tRy < 0.0065) {
            lum = 0.97;
          }
          break;
        }
        case 'nekoEar': {
          if (ny < -0.24) {
            const bandCurve = -0.38 + nx * nx * 0.55;
            if (Math.abs(ny - bandCurve) < 0.030 && Math.abs(nx) < 0.33) {
              lum = 0.92;
            }
            const innerEar = Math.min(
              sdTriangle(nx, ny, -0.37, -0.35, -0.41, -0.58, -0.22, -0.44),
              sdTriangle(nx, ny, 0.38, -0.33, 0.24, -0.43, 0.42, -0.58)
            );
            if (innerEar < 0) lum = 0.94;
          }
          break;
        }
        case 'foxEar': {
          if (ny < -0.24) {
            const innerFox = Math.min(
              sdTriangle(nx, ny, -0.37, -0.27, -0.46, -0.60, -0.20, -0.39),
              sdTriangle(nx, ny, 0.36, -0.28, 0.20, -0.40, 0.45, -0.60)
            );
            if (innerFox < 0) lum = 0.92;
          }
          const bellDx = nx;
          const bellDy = ny - 0.48;
          if (bellDx * bellDx + bellDy * bellDy < 0.0022) lum = 0.98;
          break;
        }
        case 'bunnyPin': {
          if (ny < -0.26) {
            const innerB = Math.min(
              sdCapsule(nx, ny, -0.21, -0.36, -0.26, -0.64, 0.032),
              sdCapsule(nx, ny, 0.24, -0.35, 0.38, -0.61, 0.030)
            );
            if (innerB < 0) lum = 0.92;
          }
          if (Math.abs(nx + 0.18) < 0.060 && Math.abs(ny + 0.12) < 0.016) {
            lum = 0.98;
          }
          break;
        }
        case 'visorFin': {
          const finStripe = Math.min(
            sdCapsule(nx, ny, -0.48, -0.08, -0.57, -0.52, 0.020),
            sdCapsule(nx, ny, 0.48, -0.08, 0.57, -0.52, 0.020)
          );
          if (finStripe < 0) lum = 0.96;
          if (Math.abs(nx - 0.44) < 0.040 && Math.abs(ny - 0.08) < 0.065) lum = 0.90;
          break;
        }
        case 'hoodCowl': {
          if (ny > 0.36 && ny < 0.66 && (Math.abs(nx + 0.10) < 0.014 || Math.abs(nx - 0.10) < 0.014)) {
            lum = 0.95;
          }
          break;
        }
        case 'halo': {
          if (ny < -0.46) lum = 0.98;
          break;
        }
        case 'choker': {
          if (ny > 0.39 && ny < 0.45 && Math.abs(nx) < 0.115) {
            lum = Math.abs(nx) < 0.024 ? 0.98 : 0.06;
          }
          break;
        }
      }

      // Expressive 3/4 Anime Facial Details inside Face & Eye Zone
      if (dFace < 0.05) {
        // 1. Expressive Arched Manga Eyebrows (even subtly visible near bang edge)
        const browRaise = mood === 'alert' ? -0.022 : mood === 'thinking' ? -0.014 : 0;
        const browTiltL = mood === 'focused' ? 0.014 : mood === 'thinking' ? -0.012 : 0;
        const browTiltR = mood === 'focused' ? -0.014 : 0;
        const browY = eyeY - eyeRy * 1.38 + browRaise;
        if (ny > browY - 0.032 && ny < browY + 0.032) {
          const browDL = sdCapsule(nx, ny, leftEyeX - leftEyeRx * 0.95, browY + 0.008, leftEyeX + leftEyeRx * 0.9, browY + browTiltL, 0.012);
          const browDR = sdCapsule(nx, ny, rightEyeX - rightEyeRx * 0.9, browY + browTiltR, rightEyeX + rightEyeRx * 0.95, browY + 0.008, 0.012);
          if (browDL < 0 || browDR < 0) {
            lum = 0.05;
          }
        }

        // 2. Almond Anime Eyes (thick winged upper lash, iris, dual catchlights, eyelid crease)
        if (ny > eyeY - eyeRy * 1.40 && ny < eyeY + eyeRy * 1.45) {
          const dxL = nx - leftEyeX;
          const dxR = nx - rightEyeX;
          const isLeft = Math.abs(dxL) < Math.abs(dxR);
          const nearestDx = isLeft ? dxL : dxR;
          const nearestEyeX = isLeft ? leftEyeX : rightEyeX;
          const rx = isLeft ? leftEyeRx : rightEyeRx;
          const outerDir = isLeft ? -1 : 1;
          const dyEye = ny - eyeY;

          if (blinkAmt > 0.86) {
            // Bowed closed anime eyelash arch + outer corner flick
            const archY = eyeY + 0.018 - nearestDx * nearestDx * 2.1;
            const dClosed = sdCapsule(nx, ny, nearestEyeX - rx * 1.05, archY, nearestEyeX + rx * 1.05, archY, 0.018);
            const dWing = sdCapsule(nx, ny, nearestEyeX + outerDir * rx, archY, nearestEyeX + outerDir * rx * 1.28, archY - 0.018, 0.013);
            if (dClosed < 0 || dWing < 0) lum = 0.03;
          } else if (eyeState === 'happy' && !isSpeaking && blinkAmt < 0.15) {
            // Cheerful upward anime ^ ^ happy arc
            const happyY = eyeY + 0.015 + nearestDx * nearestDx * 3.4;
            if (Math.abs(nearestDx) < rx * 1.08 && Math.abs(ny - happyY) < 0.020) {
              lum = 0.03;
            }
          } else {
            const effectiveClose = Math.max(blinkAmt, squintAmt * 0.56);
            const lidCurve = (nearestDx / rx) * (nearestDx / rx) * eyeRy * lerp(0.55, 0.25, effectiveClose);
            const lidY = lerp(eyeY - eyeRy * 0.72, eyeY + 0.016, effectiveClose) + lidCurve;

            // Thick dark manga upper eyelash + wing flick on outer corner
            const lashThick = lerp(0.024, 0.019, effectiveClose);
            const outerWing =
              (nearestDx * outerDir > rx * 0.72 && nearestDx * outerDir < rx * 1.38) &&
              Math.abs(ny - (lidY - (nearestDx * outerDir - rx * 0.72) * 0.35)) < 0.015;

            if ((Math.abs(nearestDx) < rx * 1.15 && Math.abs(ny - lidY) < lashThick) || outerWing) {
              lum = 0.025;
            } else if (ny > lidY) {
              const ix = nearestDx / rx;
              const iy = dyEye / eyeRy;
              const eyeBallSq = ix * ix + iy * iy;
              if (eyeBallSq < 1.0) {
                // Crisp white sclera + centered dark anime iris + dual specular catchlights
                const irisX = (nearestDx - gx * 0.35) / (rx * 0.72);
                const irisY = (dyEye - gy * 0.25) / (eyeRy * 0.84);
                if (irisX * irisX + irisY * irisY < 1.0) {
                  const g1x = nx - (nearestEyeX - rx * 0.24 + gx * 0.4);
                  const g1y = ny - (eyeY - eyeRy * 0.22 + gy * 0.4);
                  const g2x = nx - (nearestEyeX + rx * 0.24 + gx * 0.25);
                  const g2y = ny - (eyeY + eyeRy * 0.28 + gy * 0.25);
                  const r1 = rx * 0.31;
                  const r2 = rx * 0.16;
                  if (g1x * g1x + g1y * g1y < r1 * r1 || g2x * g2x + g2y * g2y < r2 * r2) {
                    lum = 1.0;
                  } else {
                    lum = 0.03;
                  }
                } else {
                  lum = 0.98; // Clean bright anime sclera corners
                }
              } else if (Math.abs(nearestDx) < rx * 0.75 && Math.abs(ny - (eyeY + eyeRy * 0.96)) < 0.010) {
                // Delicate lower lash tick
                lum = 0.16;
              }
            }
          }
        }

        // 3. Delicate pointed anime nose shadow tick (signature manga touch!)
        const ndx = nx - noseX;
        const ndy = ny - noseY;
        if (ndx * ndx + ndy * ndy < 0.00038) {
          lum = 0.10;
        }

        // 4. Soft manga cheek blush hatch under eyes
        if ((mood === 'happy' || isSpeaking || smileAmt > 0.65) && ny > eyeY + 0.08 && ny < eyeY + 0.17) {
          const blx = (nx - (leftEyeX - 0.03)) / 0.055;
          const brx = (nx - (rightEyeX + 0.03)) / 0.055;
          const by = (ny - (eyeY + 0.12)) / 0.026;
          if (blx * blx + by * by < 1.0 || brx * brx + by * by < 1.0) {
            lum *= 0.78;
          }
        }

        // 5. Subtle cyber-cat whisker ticks for Neko
        if (profile.accessory === 'nekoEar' && ny > eyeY + 0.07 && ny < eyeY + 0.17 && Math.abs(nx - profile.faceCx) > 0.19 && Math.abs(nx - profile.faceCx) < 0.30) {
          if (Math.abs(ny - (eyeY + 0.10)) < 0.011 || Math.abs(ny - (eyeY + 0.145)) < 0.011) {
            lum = 0.14;
          }
        }

        // 6. Refined manga cupid's-bow lips / smooth speaking viseme cavity
        if (ny > mouthY - 0.075 && ny < mouthY + 0.085) {
          const mx = nx - mouthXBase;
          if (mouthOpen > 0.10) {
            const mw = 0.036 + mouthOpen * 0.034;
            const mh = 0.016 + mouthOpen * 0.040;
            const mxn = mx / mw;
            const myn = (ny - mouthY) / mh;
            if (mxn * mxn + myn * myn < 1.0) {
              // Subtle upper teeth hint inside open anime mouth
              lum = ny < mouthY - mh * 0.32 && mouthOpen > 0.25 ? 0.90 : 0.04;
            }
          } else if (smileAmt > 0.48) {
            const smileCurve = mouthY - mx * mx * (3.6 + smileAmt * 1.4);
            if (Math.abs(mx) < 0.048 && Math.abs(ny - smileCurve) < 0.014) {
              lum = 0.06;
            }
          } else {
            // Crisp cupid's bow upper lip + tiny bright lower lip glint
            const bowY = mouthY - Math.abs(mx) * 0.12;
            if (Math.abs(mx) < 0.042 && Math.abs(ny - bowY) < 0.013) {
              lum = 0.07;
            } else if (Math.abs(mx) < 0.018 && Math.abs(ny - (mouthY + 0.022)) < 0.008) {
              lum = 0.98;
            }
          }
        }
      }

      subLum[rowOff + sx] = lum * alphaCov;
    }
  }

  for (let r = 0; r < rows; r++) {
    let line = '';
    const r0 = r * 4 * subW;
    const r1 = r0 + subW;
    const r2 = r1 + subW;
    const r3 = r2 + subW;
    const cellRowOff = r * cols;

    for (let c = 0; c < cols; c++) {
      const c2 = c * 2;
      const bCol = (c & 1) * 2;
      const l00 = subLum[r0 + c2];
      const l01 = subLum[r0 + c2 + 1];
      const l10 = subLum[r1 + c2];
      const l11 = subLum[r1 + c2 + 1];
      const l20 = subLum[r2 + c2];
      const l21 = subLum[r2 + c2 + 1];
      const l30 = subLum[r3 + c2];
      const l31 = subLum[r3 + c2 + 1];

      const lumSum = l00 + l01 + l10 + l11 + l20 + l21 + l30 + l31;
      if (lumSum <= 0.12) {
        cells[cellRowOff + c] = 0;
        line += ' ';
        continue;
      }

      let bits = 0;
      if (l00 > BAYER_THRESH[bCol]) bits |= 0x01;
      if (l01 > BAYER_THRESH[bCol + 1]) bits |= 0x08;
      if (l10 > BAYER_THRESH[4 + bCol]) bits |= 0x02;
      if (l11 > BAYER_THRESH[5 + bCol]) bits |= 0x10;
      if (l20 > BAYER_THRESH[8 + bCol]) bits |= 0x04;
      if (l21 > BAYER_THRESH[9 + bCol]) bits |= 0x20;
      if (l30 > BAYER_THRESH[12 + bCol]) bits |= 0x40;
      if (l31 > BAYER_THRESH[13 + bCol]) bits |= 0x80;

      cells[cellRowOff + c] = Math.round(lumSum * 31.875);
      line += bits === 0 ? ' ' : String.fromCharCode(0x2800 + bits);
    }
    lines[r] = line;
  }

  return { cols, rows, lines, cells };
}
