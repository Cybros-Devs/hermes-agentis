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
    label: 'Chibi',
    animeTitle: 'Ahoge Mascot',
    defaultTint: 'magenta',
    defaultEyeStyle: 'open',
    tagline: 'Sandbox bot',
    defaultAgentPersona: 'Playful experimental sandbox session for rapid prototyping.',
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
  hairLag: number;    // secondary inertia sway on ears, twintails, ahoge & halo
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

const BRAILLE_BITMASK = [0x01, 0x08, 0x02, 0x10, 0x04, 0x20, 0x40, 0x80];

const BAYER_4X4 = [
  0.0 / 16, 8.0 / 16, 2.0 / 16, 10.0 / 16,
  12.0 / 16, 4.0 / 16, 14.0 / 16, 6.0 / 16,
  3.0 / 16, 11.0 / 16, 1.0 / 16, 9.0 / 16,
  15.0 / 16, 7.0 / 16, 13.0 / 16, 5.0 / 16,
];

const BAYER_THRESH = BAYER_4X4.map((v) => 0.13 + v * 0.72);

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
 * Stateful spring-damper animator for anime Braille canvas companions.
 * Drives smooth asymmetric blinking, velocity-coupled drag tilt & drop bounce settle,
 * damped lip-sync mouth aperture, and secondary ear/twintail/ahoge inertia lag.
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
          // Gentle fixation dwell with periodic glances
          const idleFix = Math.floor(offsetTime * 0.55);
          tGazeX = ((idleFix * 7) % 3 === 0 ? Math.sin(idleFix * 2.1) * 0.22 : 0);
          tGazeY = ((idleFix * 5) % 4 === 0 ? -0.10 : 0.02);
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

      // Drop settle bounce impulse when user releases drag
      if (prevDragging && !input.isDragging) {
        dropImpulse = -0.055;
        liftVel -= 1.4;
      } else if (!prevDragging && input.isDragging) {
        // Subtle anticipation dip before hover lift
        liftVel += 1.6;
      }
      prevDragging = input.isDragging;
      dropImpulse *= Math.exp(-12 * clampedDt);

      // Underdamped spring for playful pickup lift & cushioned settle on drop
      const targetLift = input.isDragging ? 1 : 0;
      liftVel += ((targetLift - state.dragLift) * 140 - liftVel * 14.5) * clampedDt;
      state.dragLift = clamp(state.dragLift + liftVel * clampedDt, -0.18, 1.25);

      // Velocity-coupled pendulum tilt during drag + playful thinking/speaking head tilt
      const dragVx = clamp(input.dragVelX ?? 0, -2.5, 2.5);
      const moodTilt = input.isThinking
        ? Math.sin(offsetTime * 1.6) * 0.075 - 0.04
        : input.isSpeaking
        ? Math.sin(offsetTime * 3.9) * (0.045 + input.energy * 0.055)
        : Math.sin(offsetTime * 1.35) * 0.028;
      const targetTilt = clamp(moodTilt - dragVx * 0.11, -0.22, 0.22);
      tiltVel += ((targetTilt - state.dragTilt) * 125 - tiltVel * 13.5) * clampedDt;
      state.dragTilt = clamp(state.dragTilt + tiltVel * clampedDt, -0.24, 0.24);

      // Breathing + speaking syllable bounce + drop rebound
      const breathBob = Math.sin(offsetTime * 2.3) * 0.022;
      const speakBob = input.isSpeaking ? Math.abs(Math.sin(offsetTime * 7.2)) * (0.015 + input.energy * 0.028) : 0;
      const dragHoverY = state.dragLift * 0.032;
      const targetBounceY = breathBob - speakBob - dragHoverY + dropImpulse;
      bounceVel += ((targetBounceY - state.bounceY) * 150 - bounceVel * 15) * clampedDt;
      state.bounceY = clamp(state.bounceY + bounceVel * clampedDt, -0.09, 0.09);

      // Secondary hair / ear / twintail / halo follow-through inertia
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
  if (d1 < minD) {
    minD = d1;
  }
  if (s1 < minS) {
    minS = s1;
  }
  if (d2 < minD) {
    minD = d2;
  }
  if (s2 < minS) {
    minS = s2;
  }
  return -Math.sqrt(minD) * Math.sign(minS);
}

interface AnimeFaceProfile {
  faceCx: number;
  faceCy: number;
  faceRx: number;
  faceRy: number;
  eyeY: number;
  eyeSep: number;
  eyeRx: number;
  eyeRy: number;
  mouthY: number;
  bangHeight: number;
  partType: 'straight' | 'center' | 'side' | 'wispy';
  hasHeadband?: boolean;
  hasHalo?: boolean;
  hasWhiskers?: boolean;
  hasInnerEar?: boolean;
}

const STATIC_FACE_PROFILES: Record<BrailleShapeKind, AnimeFaceProfile> = {
  clover: {
    faceCx: 0,
    faceCy: 0.10,
    faceRx: 0.42,
    faceRy: 0.43,
    eyeY: 0.14,
    eyeSep: 0.19,
    eyeRx: 0.085,
    eyeRy: 0.105,
    mouthY: 0.34,
    bangHeight: 0.02,
    partType: 'straight',
    hasHeadband: true,
  },
  star: {
    faceCx: 0,
    faceCy: 0.12,
    faceRx: 0.40,
    faceRy: 0.40,
    eyeY: 0.16,
    eyeSep: 0.18,
    eyeRx: 0.085,
    eyeRy: 0.105,
    mouthY: 0.35,
    bangHeight: 0.04,
    partType: 'center',
  },
  ghost: {
    faceCx: 0,
    faceCy: 0.16,
    faceRx: 0.42,
    faceRy: 0.40,
    eyeY: 0.18,
    eyeSep: 0.19,
    eyeRx: 0.09,
    eyeRy: 0.11,
    mouthY: 0.37,
    bangHeight: 0.06,
    partType: 'wispy',
    hasWhiskers: true,
    hasInnerEar: true,
  },
  heart: {
    faceCx: 0,
    faceCy: 0.18,
    faceRx: 0.40,
    faceRy: 0.38,
    eyeY: 0.20,
    eyeSep: 0.18,
    eyeRx: 0.085,
    eyeRy: 0.10,
    mouthY: 0.38,
    bangHeight: 0.08,
    partType: 'side',
    hasInnerEar: true,
  },
  cloud: {
    faceCx: 0,
    faceCy: 0.20,
    faceRx: 0.40,
    faceRy: 0.37,
    eyeY: 0.22,
    eyeSep: 0.18,
    eyeRx: 0.085,
    eyeRy: 0.10,
    mouthY: 0.39,
    bangHeight: 0.10,
    partType: 'straight',
    hasInnerEar: true,
  },
  triangle: {
    faceCx: 0,
    faceCy: 0.16,
    faceRx: 0.40,
    faceRy: 0.39,
    eyeY: 0.20,
    eyeSep: 0.18,
    eyeRx: 0.085,
    eyeRy: 0.10,
    mouthY: 0.37,
    bangHeight: 0.06,
    partType: 'center',
    hasHeadband: true,
  },
  pebble: {
    faceCx: 0,
    faceCy: 0.12,
    faceRx: 0.44,
    faceRy: 0.40,
    eyeY: 0.16,
    eyeSep: 0.20,
    eyeRx: 0.09,
    eyeRy: 0.10,
    mouthY: 0.34,
    bangHeight: 0.04,
    partType: 'wispy',
  },
  trapezoid: {
    faceCx: 0,
    faceCy: 0.18,
    faceRx: 0.39,
    faceRy: 0.38,
    eyeY: 0.22,
    eyeSep: 0.18,
    eyeRx: 0.082,
    eyeRy: 0.098,
    mouthY: 0.38,
    bangHeight: 0.08,
    partType: 'straight',
    hasHalo: true,
  },
  blob: {
    faceCx: 0,
    faceCy: 0.16,
    faceRx: 0.44,
    faceRy: 0.40,
    eyeY: 0.18,
    eyeSep: 0.20,
    eyeRx: 0.09,
    eyeRy: 0.105,
    mouthY: 0.36,
    bangHeight: 0.05,
    partType: 'center',
  },
};

function evaluateInnerEarDist(shape: BrailleShapeKind, x: number, y: number): number {
  if (shape === 'ghost') {
    return Math.min(
      sdTriangle(x, y, -0.45, -0.30, -0.50, -0.66, -0.22, -0.44),
      sdTriangle(x, y, 0.45, -0.30, 0.22, -0.44, 0.50, -0.66)
    );
  }
  if (shape === 'heart') {
    return Math.min(
      sdTriangle(x, y, -0.43, -0.22, -0.52, -0.68, -0.18, -0.36),
      sdTriangle(x, y, 0.43, -0.22, 0.18, -0.36, 0.52, -0.68)
    );
  }
  if (shape === 'cloud') {
    return Math.min(
      sdCapsule(x, y, -0.25, -0.36, -0.30, -0.68, 0.055),
      sdCapsule(x, y, 0.26, -0.35, 0.40, -0.62, 0.05)
    );
  }
  return 1;
}

/**
 * Signed distance for each of the 9 anime-inspired chibi silhouettes in [-1, 1] space.
 */
export function evaluateShapeSdf(shape: BrailleShapeKind, x: number, y: number): number {
  switch (shape) {
    case 'clover': {
      // Cyber Bob: classic anime bob haircut with side cheek flips + headband crown (homage to main character)
      const crown = sdEllipse(x, y, 0, -0.05, 0.56, 0.56);
      const bobLeft = sdCapsule(x, y, -0.44, -0.06, -0.60, 0.50, 0.19);
      const bobRight = sdCapsule(x, y, 0.44, -0.06, 0.60, 0.50, 0.19);
      const flipLeft = sdCircle(x, y, -0.63, 0.52, 0.14);
      const flipRight = sdCircle(x, y, 0.63, 0.52, 0.14);
      const chin = sdEllipse(x, y, 0, 0.26, 0.42, 0.34);
      return smin(
        smin(crown, chin, 0.08),
        smin(smin(bobLeft, flipLeft, 0.09), smin(bobRight, flipRight, 0.09), 0.12),
        0.10
      );
    }
    case 'star': {
      // Starlight Idol Twintails + bouncy ahoge hair sprout
      const head = sdEllipse(x, y, 0, 0.04, 0.50, 0.50);
      const leftTail = smin(
        sdCapsule(x, y, -0.46, -0.10, -0.70, 0.36, 0.15),
        sdCircle(x, y, -0.74, 0.46, 0.16),
        0.10
      );
      const rightTail = smin(
        sdCapsule(x, y, 0.46, -0.10, 0.70, 0.36, 0.15),
        sdCircle(x, y, 0.74, 0.46, 0.16),
        0.10
      );
      const tieL = sdCircle(x, y, -0.48, -0.16, 0.12);
      const tieR = sdCircle(x, y, 0.48, -0.16, 0.12);
      const ahoge = sdCapsule(x, y, -0.02, -0.46, 0.12, -0.72, 0.075);
      return smin(
        smin(head, ahoge, 0.08),
        smin(smin(leftTail, tieL, 0.06), smin(rightTail, tieR, 0.06), 0.08),
        0.08
      );
    }
    case 'ghost': {
      // Cyber Catgirl (Neko): pointed cat ears + fluffy anime hair locks
      const head = sdEllipse(x, y, 0, 0.08, 0.53, 0.50);
      const cheekL = sdCapsule(x, y, -0.44, 0.12, -0.52, 0.54, 0.14);
      const cheekR = sdCapsule(x, y, 0.44, 0.12, 0.52, 0.54, 0.14);
      const cheeks = smin(cheekL, cheekR, 0.08);
      if (y > 0.06) {
        return smin(head, cheeks, 0.06);
      }
      const earL = sdTriangle(x, y, -0.52, -0.18, -0.55, -0.74, -0.14, -0.38) - 0.04;
      const earR = sdTriangle(x, y, 0.52, -0.18, 0.14, -0.38, 0.55, -0.74) - 0.04;
      return smin(head, smin(smin(earL, earR, 0.05), cheeks, 0.08), 0.06);
    }
    case 'heart': {
      // Kitsune Shrine Fox: tall angled fox ears + swept cheek locks
      const head = sdEllipse(x, y, 0, 0.12, 0.50, 0.47);
      const ruffL = sdCapsule(x, y, -0.42, 0.18, -0.62, 0.52, 0.13);
      const ruffR = sdCapsule(x, y, 0.42, 0.18, 0.62, 0.52, 0.13);
      const ruffs = smin(ruffL, ruffR, 0.08);
      if (y > 0.10) {
        return smin(head, ruffs, 0.06);
      }
      const earL = sdTriangle(x, y, -0.50, -0.12, -0.60, -0.78, -0.12, -0.32) - 0.035;
      const earR = sdTriangle(x, y, 0.50, -0.12, 0.12, -0.32, 0.60, -0.78) - 0.035;
      return smin(head, smin(smin(earL, earR, 0.05), ruffs, 0.08), 0.06);
    }
    case 'cloud': {
      // Usagi Bunny: tall perky bunny ears (one playfully tilted) + soft bob
      const head = sdEllipse(x, y, 0, 0.16, 0.50, 0.44);
      const lockL = sdCircle(x, y, -0.45, 0.34, 0.16);
      const lockR = sdCircle(x, y, 0.45, 0.34, 0.16);
      const headLocks = smin(head, smin(lockL, lockR, 0.10), 0.08);
      if (y > 0.06) {
        return headLocks;
      }
      const earL = sdCapsule(x, y, -0.22, -0.22, -0.32, -0.76, 0.13);
      const earR = sdCapsule(x, y, 0.22, -0.22, 0.44, -0.68, 0.125);
      const earTipR = sdCapsule(x, y, 0.44, -0.68, 0.60, -0.56, 0.10);
      return smin(headLocks, smin(earL, smin(earR, earTipR, 0.06), 0.05), 0.06);
    }
    case 'triangle': {
      // Mecha Fin Headset: upward cyber-ear fins + sharp anime hair silhouette
      const head = sdEllipse(x, y, 0, 0.10, 0.50, 0.47);
      const cupL = sdCapsule(x, y, -0.52, 0.02, -0.52, 0.24, 0.12);
      const cupR = sdCapsule(x, y, 0.52, 0.02, 0.52, 0.24, 0.12);
      if (y > 0.26) {
        return smin(head, smin(cupL, cupR, 0.05), 0.05);
      }
      const finL = sdTriangle(x, y, -0.52, 0.04, -0.66, -0.62, -0.34, -0.24) - 0.03;
      const finR = sdTriangle(x, y, 0.52, 0.04, 0.34, -0.24, 0.66, -0.62) - 0.03;
      const topSpike = sdTriangle(x, y, -0.10, -0.34, 0.0, -0.64, 0.10, -0.34) - 0.03;
      return smin(
        smin(head, topSpike, 0.05),
        smin(smin(finL, cupL, 0.05), smin(finR, cupR, 0.05), 0.05),
        0.05
      );
    }
    case 'pebble': {
      // Yume Cozy Hood: rounded kigurumi bear-hood chibi head with cute rounded hood ears
      const hood = sdEllipse(x, y, 0, 0.08, 0.58, 0.52);
      const earL = sdCircle(x, y, -0.42, -0.42, 0.19);
      const earR = sdCircle(x, y, 0.42, -0.42, 0.19);
      const scarf = sdEllipse(x, y, 0, 0.50, 0.46, 0.17);
      return smin(smin(hood, scarf, 0.08), smin(earL, earR, 0.06), 0.07);
    }
    case 'trapezoid': {
      // Seraph Halo: serene hime-cut anime silhouette + floating halo ring above crown
      const head = sdEllipse(x, y, 0, 0.16, 0.50, 0.45);
      const himeL = sdCapsule(x, y, -0.46, 0.02, -0.52, 0.54, 0.13);
      const himeR = sdCapsule(x, y, 0.46, 0.02, 0.52, 0.54, 0.13);
      const haloRing = Math.abs(sdEllipse(x, y, 0, -0.58, 0.42, 0.11)) - 0.055;
      const bodyPart = smin(head, smin(himeL, himeR, 0.08), 0.06);
      return Math.min(bodyPart, haloRing);
    }
    case 'blob':
    default: {
      // Chibi Ahoge Mascot: plush round chibi head + curving ahoge cowlick + soft tufts
      const head = sdEllipse(x, y, 0, 0.12, 0.56, 0.48);
      const tuftL = sdCircle(x, y, -0.52, 0.34, 0.15);
      const tuftR = sdCircle(x, y, 0.52, 0.34, 0.15);
      const ahoge = smin(
        sdCapsule(x, y, -0.02, -0.34, 0.08, -0.66, 0.065),
        sdCapsule(x, y, 0.08, -0.66, 0.28, -0.56, 0.055),
        0.04
      );
      return smin(smin(head, smin(tuftL, tuftR, 0.08), 0.08), ahoge, 0.06);
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
 * Renders an anime-chibi companion styled like the main halftone character in 2x4 Unicode Braille.
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

  // Use stateful damped kinematics when supplied, or smooth fallback curve
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

  const breath = Math.sin(time * 2.2) * 0.02;
  const speakBounce = isSpeaking ? Math.sin(time * 13.5) * energy * 0.028 : 0;

  // Safe 0.90 framing factor guarantees zero edge clipping across all 9 shapes during drag tilt & settle
  const safeBase = 0.90;
  const scaleX = safeBase * (1 + breath * 0.45 - speakBounce * 0.35 + dragLiftAmt * 0.032);
  const scaleY = safeBase * (1 - breath * 0.55 + speakBounce * 0.65 - dragLiftAmt * 0.022);

  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);

  const effGazeX = motion ? motion.gazeX : gazeX;
  const effGazeY = motion ? motion.gazeY : gazeY;
  const gx = clamp(effGazeX, -1, 1) * 0.032;
  const gy = clamp(effGazeY, -1, 1) * 0.024;

  const mouthOpen = motion
    ? clamp01(motion.mouthOpen)
    : targetMouthOpenForViseme(viseme, energy, isSpeaking);
  const smileAmt = motion ? clamp01(motion.smile) : mood === 'happy' ? 1 : 0.25;

  const eps = 0.022;
  const pivotY = 0.08;
  const profile = STATIC_FACE_PROFILES[shape];
  const {
    faceCx,
    faceCy,
    faceRx,
    faceRy,
    bangHeight,
    partType,
    hasHeadband,
    hasHalo,
    hasInnerEar,
  } = profile;

  for (let sy = 0; sy < subH; sy++) {
    const nyRaw = ((sy + 0.5) / subH) * 2 - 1;
    const nyScaled = (nyRaw - bounceY) / scaleY;
    const rowOff = sy * subW;

    for (let sx = 0; sx < subW; sx++) {
      const nxRaw = ((sx + 0.5) / subW) * 2 - 1;
      const nxScaled = nxRaw / scaleX;

      // Rigid tilt around neck/chin pivot + smooth secondary hair/ear lag
      const dxp = nxScaled;
      const dyp = nyScaled - pivotY;
      let nx = dxp * cosT - dyp * sinT;
      const ny = dxp * sinT + dyp * cosT + pivotY;

      if (hairLag !== 0) {
        // Upper ears/halo/ahoge sway cleanly opposite lower twintails/bob tips
        const upperZone = ny < -0.16 ? (-0.16 - ny) * 0.65 : 0;
        const lowerZone = ny > 0.16 ? (ny - 0.16) * 0.55 : 0;
        nx += hairLag * (upperZone - lowerZone);
      }

      // Fast outer bounding reject skips empty margin subpixels without running full SDF
      if (nx > 0.94 || nx < -0.94 || ny < -0.86 || ny > 0.72) {
        subLum[rowOff + sx] = 0;
        continue;
      }

      const d = evaluateShapeSdf(shape, nx, ny);
      if (d > 0.032) {
        subLum[rowOff + sx] = 0;
        continue;
      }

      const edgeCov = clamp(1 - (d + 0.004) / 0.036, 0, 1);

      // Performance optimization: 2-probe SDF gradient near silhouette rim
      let snx = 0;
      let sny = 0;
      let snz = 1;
      if (d > -0.20) {
        const dxGrad = evaluateShapeSdf(shape, nx + eps, ny) - d;
        const dyGrad = evaluateShapeSdf(shape, nx, ny + eps) - d;
        const gradLen = Math.sqrt(dxGrad * dxGrad + dyGrad * dyGrad) || 1;
        const edgeWeight = clamp(1 + d * 4.5, 0, 1);
        snx = (dxGrad / gradLen) * edgeWeight;
        sny = (dyGrad / gradLen) * edgeWeight;
        snz = Math.sqrt(Math.max(0.1, 1 - snx * snx - sny * sny));
      }

      const keyDot = clamp(-0.38 * snx - 0.56 * sny + 0.72 * snz, 0, 1);
      const rim = (1 - snz) * (1 - snz) * 0.34;

      // Bounding check skips sdEllipse + bang trig/exp math for outer hair/ears/halo pixels
      let dFace = 1;
      let bangBottom = bangHeight;
      let inFace = false;
      if (nx > -0.52 && nx < 0.52 && ny > -0.35 && ny < 0.66) {
        dFace = sdEllipse(
          nx - gx * 0.35,
          ny - gy * 0.25,
          faceCx,
          faceCy,
          faceRx,
          faceRy
        );

        if (partType === 'center') {
          bangBottom += -0.05 * Math.exp(-Math.abs(nx) * 8) + 0.025 * Math.cos(nx * 14);
        } else if (partType === 'side') {
          bangBottom += -0.04 * clamp(nx + 0.15, -0.4, 0.4) + 0.02 * Math.sin(nx * 13);
        } else if (partType === 'wispy') {
          bangBottom += 0.03 * Math.cos(nx * 16) - 0.015;
        } else {
          bangBottom += 0.022 * Math.sin(nx * 18) + (Math.abs(nx) < 0.09 ? -0.035 : 0);
        }

        inFace = dFace < 0 && ny > bangBottom;
      }

      let lum: number;
      if (inFace) {
        const faceShade = clamp(0.84 + keyDot * 0.14 - Math.max(0, dFace + 0.12) * 0.25, 0.62, 0.98);
        lum = faceShade * edgeCov;

        const underBang = ny - bangBottom;
        if (underBang >= 0 && underBang < 0.045) {
          lum *= 0.68 + (underBang / 0.045) * 0.32;
        }
      } else {
        lum = (0.34 + keyDot * 0.26 + rim) * edgeCov;

        if (ny > -0.24 && ny < -0.12 && Math.abs(nx) < 0.46) {
          const sheenWave = -0.18 + 0.035 * Math.sin(nx * 17 + 0.4);
          const sheenDist = Math.abs(ny - sheenWave);
          if (sheenDist < 0.048) {
            lum = Math.max(lum, (0.88 - (sheenDist / 0.048) * 0.35) * edgeCov);
          }
        }

        if (hasHeadband && Math.abs(nx) < 0.48) {
          const bandCurve = -0.30 + nx * nx * 0.34;
          const bandDist = Math.abs(ny - bandCurve);
          if (bandDist < 0.055) {
            lum = 0.96 * edgeCov;
          }
        }

        if (hasHalo && ny < -0.40) {
          lum = Math.max(lum, 0.94 * edgeCov);
        }

        if (hasInnerEar && ny < -0.15 && evaluateInnerEarDist(shape, nx, ny) < 0) {
          lum *= 0.24;
        }
      }

      // Expressive anime eyes inside the face with smooth progressive analog blink & squint
      if (dFace < 0.04) {
        const eyeY = profile.eyeY + gy * 0.45;
        const rx = profile.eyeRx * (1 + wideAmt * 0.12);
        const ry = profile.eyeRy * (1 + wideAmt * 0.12);

        if (ny > eyeY - ry * 1.45 && ny < eyeY + ry * 1.45) {
          const leftEyeX = -profile.eyeSep + gx * 0.7;
          const rightEyeX = profile.eyeSep + gx * 0.7;
          const dxL = nx - leftEyeX;
          const dxR = nx - rightEyeX;
          const nearestDx = Math.abs(dxL) < Math.abs(dxR) ? dxL : dxR;
          const nearestEyeX = Math.abs(dxL) < Math.abs(dxR) ? leftEyeX : rightEyeX;
          const dyEye = ny - eyeY;

          if (blinkAmt > 0.86) {
            // Fully closed bowed anime eyelash arch
            const archY = eyeY + 0.022 - nearestDx * nearestDx * 1.8;
            if (Math.abs(nearestDx) < rx * 1.15 && Math.abs(ny - archY) < 0.024) {
              lum = 0.04;
            }
          } else if (eyeState === 'happy' && !isSpeaking && blinkAmt < 0.15) {
            const happyY = eyeY + 0.02 + nearestDx * nearestDx * 3.0;
            if (Math.abs(nearestDx) < rx * 1.1 && Math.abs(ny - happyY) < 0.025) {
              lum = 0.04;
            }
          } else {
            // Continuous lid closure combines blink progression + sleepy/focused squint
            const effectiveClose = Math.max(blinkAmt, squintAmt * 0.56);
            const lidY =
              lerp(eyeY - ry * 0.80, eyeY + 0.018, effectiveClose) +
              nearestDx * nearestDx * lerp(2.2, 0.9, effectiveClose);

            if (Math.abs(nearestDx) < rx * 1.28 && Math.abs(ny - lidY) < 0.025) {
              lum = 0.03;
            } else if (ny > lidY) {
              const ix = nearestDx / rx;
              const iy = dyEye / ry;
              if (ix * ix + iy * iy < 1.0) {
                const g1x = nx - (nearestEyeX - rx * 0.28 + gx * 0.45);
                const g1y = ny - (eyeY - ry * 0.28 + gy * 0.45);
                const g2x = nx - (nearestEyeX + rx * 0.26 + gx * 0.3);
                const g2y = ny - (eyeY + ry * 0.30 + gy * 0.3);
                const r1 = rx * 0.34;
                const r2 = rx * 0.19;
                if (g1x * g1x + g1y * g1y < r1 * r1 || g2x * g2x + g2y * g2y < r2 * r2) {
                  lum = 1.0;
                } else {
                  lum = 0.04;
                }
              }
            }
          }
        }

        // Soft anime cheek blush under eyes
        if ((mood === 'happy' || isSpeaking || smileAmt > 0.65) && ny > eyeY + 0.08 && ny < eyeY + 0.19) {
          const blx = (nx - (-profile.eyeSep - 0.06)) / 0.075;
          const bly = (ny - (eyeY + 0.13)) / 0.038;
          const brx = (nx - (profile.eyeSep + 0.06)) / 0.075;
          if (blx * blx + bly * bly < 1.0 || brx * brx + bly * bly < 1.0) {
            lum *= 0.72;
          }
        }

        // Cute anime whiskers for Neko
        if (profile.hasWhiskers && ny > eyeY + 0.07 && ny < eyeY + 0.19 && Math.abs(nx) > 0.29 && Math.abs(nx) < 0.44) {
          const wy1 = Math.abs(ny - (eyeY + 0.10));
          const wy2 = Math.abs(ny - (eyeY + 0.16));
          if (wy1 < 0.015 || wy2 < 0.015) {
            lum = 0.12;
          }
        }

        // Smoothly damped anime mouth
        const mouthY = profile.mouthY + gy * 0.35;
        if (ny > mouthY - 0.10 && ny < mouthY + 0.10) {
          const mouthX = nx - gx * 0.3;
          if (mouthOpen > 0.10) {
            const mw = 0.048 + mouthOpen * 0.048;
            const mh = 0.020 + mouthOpen * 0.052;
            const mxn = mouthX / mw;
            const myn = (ny - mouthY) / mh;
            if (mxn * mxn + myn * myn < 1.0) {
              lum = 0.05;
            }
          } else if (smileAmt > 0.48) {
            const smileY = mouthY - mouthX * mouthX * (3.2 + smileAmt * 1.4);
            if (Math.abs(mouthX) < 0.062 && Math.abs(ny - smileY) < 0.017) {
              lum = 0.08;
            }
          } else if (Math.abs(mouthX) < 0.048 && Math.abs(ny - mouthY) < 0.015) {
            lum = 0.10;
          }
        }
      }

      subLum[rowOff + sx] = lum;
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
