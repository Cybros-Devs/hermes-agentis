import type { ExpressionMood, EyeState, MouthViseme } from '../types/hermes';
import {
  NEUTRAL_IDLE_POSE,
  evaluateIdleActionStep,
  resolveIdleSetForShape,
  type IdleActionFrame,
  type IdleAnimationSetId,
  type IdleHandPose,
  type IdlePoseDeltas,
  type IdlePropKind,
} from './brailleIdleLoops';

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
  hoverBoost: number; // 0 .. 1 pointer hover perk-up
  earTwitch: number;  // subtle ear/fin/ahoge perk twitch
  haloFloat: number;  // independent levitation offset for halo & crests
  idle: IdleActionFrame;
}

export interface BrailleShapeAnimatorInput {
  time: number;
  shape?: BrailleShapeKind;
  idleSetOverride?: IdleAnimationSetId;
  mood: ExpressionMood;
  eyeStyle: 'open' | 'sleepy';
  viseme: MouthViseme;
  energy: number;
  isSpeaking: boolean;
  isThinking: boolean;
  isDragging: boolean;
  isHovered?: boolean;
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
  idlePose?: IdlePoseDeltas | null;
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
 * damped lip-sync mouth aperture, secondary hair lag, and 6x6 separated idle action loops.
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
    hoverBoost: 0,
    earTwitch: 0,
    haloFloat: 0,
    idle: evaluateIdleActionStep('tactician', 0, true),
  };

  let mouthVel = 0;
  let liftVel = 0;
  let tiltVel = 0;
  let hairVel = 0;
  let bounceVel = 0;
  let hoverVel = 0;
  let earTwitchVel = 0;
  let prevDragging = false;
  let prevHovered = false;
  let prevThinking = false;
  let dropImpulse = 0;
  let earImpulse = 0;

  return {
    step(input: BrailleShapeAnimatorInput, dt: number, reducedMotion = false): BrailleShapeMotionState {
      const clampedDt = clamp(dt, 0.004, 0.06);
      const phase = input.blinkPhaseOffset ?? 0;
      const offsetTime = input.time + phase;
      const setId = input.idleSetOverride ?? resolveIdleSetForShape(input.shape ?? 'clover');

      const suppressIdle = reducedMotion || input.isSpeaking || input.isDragging;
      const idle = evaluateIdleActionStep(setId, offsetTime, suppressIdle);
      const idlePose = idle.pose;

      // Quasi-periodic asymmetric natural blink (~3.9s–4.5s cadence with occasional double-blink)
      const jitterTime = offsetTime + 0.16 * Math.sin(offsetTime * 0.43 + phase * 0.7);
      const cyclePos = ((jitterTime / 4.2) % 1 + 1) % 1;
      let targetBlink = 0;
      if (cyclePos > 0.915) {
        targetBlink = Math.sin(((cyclePos - 0.915) / 0.085) * Math.PI);
      } else if (cyclePos > 0.815 && cyclePos < 0.875 && Math.floor(jitterTime / 4.2) % 3 === 1) {
        targetBlink = Math.sin(((cyclePos - 0.815) / 0.06) * Math.PI) * 0.9;
      }

      const isHovered = Boolean(input.isHovered);
      const targetSquint = clamp01(
        (input.mood === 'focused' || input.eyeStyle === 'sleepy'
          ? 0.62
          : input.mood === 'happy' && !input.isSpeaking
          ? 0.08 + (isHovered ? 0.08 : 0)
          : 0) +
          idlePose.squintEyes * 0.45
      );
      const targetWide = clamp01(
        (input.mood === 'alert'
          ? 0.92
          : input.isDragging
          ? 0.38
          : isHovered
          ? 0.24
          : 0) +
          idlePose.wideEyes * 0.55
      );

      // Asymmetric fast lid close (rate 36) / graceful lid lift (rate 15)
      const blinkRate = targetBlink > state.blink ? 36 : 15;
      state.blink = expApproach(state.blink, targetBlink, blinkRate, clampedDt);
      state.squint = expApproach(state.squint, targetSquint, 10, clampedDt);
      state.wide = expApproach(state.wide, targetWide, 12, clampedDt);

      // Critically-damped 2nd-order filter for lip-sync mouth aperture (zero teleport jumps)
      const idleMouthTarget =
        idlePose.mouthMode === 'yawn'
          ? 0.72 * idle.envelope
          : idlePose.mouthMode === 'o'
          ? 0.42 * idle.envelope
          : idlePose.mouthMode === 'hum'
          ? 0.22 * idle.envelope
          : 0;
      const targetMouth = Math.max(
        targetMouthOpenForViseme(input.viseme, input.energy, input.isSpeaking),
        idleMouthTarget
      );
      const mouthStiffness = targetMouth > state.mouthOpen ? 160 : 122;
      const mouthDamping = 24.5;
      mouthVel += ((targetMouth - state.mouthOpen) * mouthStiffness - mouthVel * mouthDamping) * clampedDt;
      state.mouthOpen = clamp01(state.mouthOpen + mouthVel * clampedDt);

      const targetSmile = clamp01(
        (input.mood === 'happy'
          ? 1
          : input.isSpeaking
          ? 0.28
          : isHovered
          ? 0.68
          : 0.35) +
          (idlePose.mouthMode === 'smile' || idlePose.mouthMode === 'grin' ? 0.35 : 0)
      );
      state.smile = expApproach(state.smile, targetSmile, 9, clampedDt);

      // Saccade + curious thinking scan + pointer gaze + separated idle gaze
      let tGazeX = input.gazeX ?? 0;
      let tGazeY = input.gazeY ?? 0;
      if (input.gazeX === undefined && input.gazeY === undefined) {
        if (input.isThinking) {
          const stepPhase = Math.floor(offsetTime * 1.15);
          tGazeX = Math.sin(stepPhase * 1.9) * 0.52;
          tGazeY = -0.34 + Math.cos(stepPhase * 1.3) * 0.08;
        } else if (Math.abs(idlePose.gazeX) > 0.02 || Math.abs(idlePose.gazeY) > 0.02) {
          tGazeX = idlePose.gazeX;
          tGazeY = idlePose.gazeY;
        } else {
          const idleFix = Math.floor(offsetTime * 0.55);
          tGazeX = (idleFix * 7) % 3 === 0 ? Math.sin(idleFix * 2.1) * 0.20 : 0;
          tGazeY = (idleFix * 5) % 4 === 0 ? -0.08 : 0.02;
        }
      }
      state.gazeX = expApproach(state.gazeX, clamp(tGazeX, -1, 1), 14, clampedDt);
      state.gazeY = expApproach(state.gazeY, clamp(tGazeY, -1, 1), 14, clampedDt);

      if (reducedMotion) {
        state.dragLift = expApproach(state.dragLift, input.isDragging ? 0.35 : 0, 8, clampedDt);
        state.dragTilt = 0;
        state.hairLag = 0;
        state.bounceY = 0;
        state.hoverBoost = expApproach(state.hoverBoost, isHovered ? 0.4 : 0, 8, clampedDt);
        state.earTwitch = 0;
        state.haloFloat = 0;
        state.idle = idle;
        prevDragging = input.isDragging;
        prevHovered = isHovered;
        prevThinking = input.isThinking;
        return { ...state, idle };
      }

      if (prevDragging && !input.isDragging) {
        dropImpulse = -0.058;
        liftVel -= 1.45;
        earImpulse += 0.22;
      } else if (!prevDragging && input.isDragging) {
        liftVel += 1.65;
        earImpulse += 0.16;
      }
      if (!prevHovered && isHovered) {
        hoverVel += 2.2;
        earImpulse += 0.26;
        bounceVel -= 0.16;
      }
      if (!prevThinking && input.isThinking) {
        earImpulse += 0.18;
      }
      prevDragging = input.isDragging;
      prevHovered = isHovered;
      prevThinking = input.isThinking;

      dropImpulse *= Math.exp(-12 * clampedDt);
      earImpulse *= Math.exp(-9 * clampedDt);

      const targetLift = input.isDragging ? 1 : 0;
      liftVel += ((targetLift - state.dragLift) * 145 - liftVel * 14.2) * clampedDt;
      state.dragLift = clamp(state.dragLift + liftVel * clampedDt, -0.18, 1.25);

      const targetHover = isHovered ? 1 : 0;
      hoverVel += ((targetHover - state.hoverBoost) * 140 - hoverVel * 15) * clampedDt;
      state.hoverBoost = clamp(state.hoverBoost + hoverVel * clampedDt, 0, 1.2);

      // Subtle periodic ear perk wave + reactive impulse + idle ear delta
      const perkPulse = Math.pow(Math.max(0, Math.sin(offsetTime * 1.08)), 16) * 0.12;
      const idleEar = (idlePose.earLeft + idlePose.earRight) * 0.35;
      const targetEarTwitch = clamp(
        perkPulse + earImpulse + idleEar + (input.isSpeaking ? input.energy * 0.08 : 0),
        -0.25,
        0.32
      );
      earTwitchVel += ((targetEarTwitch - state.earTwitch) * 190 - earTwitchVel * 14) * clampedDt;
      state.earTwitch = clamp(state.earTwitch + earTwitchVel * clampedDt, -0.25, 0.35);

      state.haloFloat =
        Math.sin(offsetTime * 2.1 + 0.4) * 0.022 -
        state.hoverBoost * 0.014 -
        state.dragLift * 0.012 -
        idlePose.haloLift;

      const dragVx = clamp(input.dragVelX ?? 0, -2.5, 2.5);
      const moodTilt = input.isThinking
        ? Math.sin(offsetTime * 1.6) * 0.065 - 0.035
        : input.isSpeaking
        ? Math.sin(offsetTime * 3.9) * (0.045 + input.energy * 0.05)
        : isHovered
        ? Math.sin(offsetTime * 2.0) * 0.032 + idlePose.tilt * 0.5
        : Math.sin(offsetTime * 1.15) * 0.014 + idlePose.tilt;
      const targetTilt = clamp(moodTilt - dragVx * 0.11, -0.22, 0.22);
      tiltVel += ((targetTilt - state.dragTilt) * 130 - tiltVel * 13.5) * clampedDt;
      state.dragTilt = clamp(state.dragTilt + tiltVel * clampedDt, -0.24, 0.24);

      const breathBob = Math.sin(offsetTime * 2.2) * 0.016;
      const speakBob = input.isSpeaking ? Math.abs(Math.sin(offsetTime * 7.2)) * (0.016 + input.energy * 0.028) : 0;
      const dragHoverY = state.dragLift * 0.032 + state.hoverBoost * 0.014;
      const targetBounceY = breathBob - speakBob - dragHoverY + dropImpulse + idlePose.headY;
      bounceVel += ((targetBounceY - state.bounceY) * 155 - bounceVel * 15) * clampedDt;
      state.bounceY = clamp(state.bounceY + bounceVel * clampedDt, -0.11, 0.11);

      const desiredHairLag = clamp(
        -tiltVel * 0.058 + Math.sin(offsetTime * 2.3 - 0.75) * (0.022 + state.hoverBoost * 0.010) + idlePose.hairSway,
        -0.16,
        0.16
      );
      hairVel += ((desiredHairLag - state.hairLag) * 90 - hairVel * 9.2) * clampedDt;
      state.hairLag = clamp(state.hairLag + hairVel * clampedDt, -0.17, 0.17);

      state.idle = idle;

      return { ...state, idle };
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
    turn: -0.36,
    faceCx: -0.08,
    faceCy: 0.04,
    faceRx: 0.30,
    faceRy: 0.31,
    chinY: 0.35,
    eyeY: 0.035,
    eyeSep: 0.142,
    eyeRx: 0.072,
    eyeRy: 0.082,
    mouthY: 0.215,
    bangBottomBase: -0.105,
    partType: 'straight',
    shineY: -0.33,
    accessory: 'headset',
  },
  // 2. Twintails — High-energy cyber idol with balanced bangs, twin ties & grounded shoulder bust
  star: {
    turn: 0.22,
    faceCx: 0.04,
    faceCy: 0.05,
    faceRx: 0.295,
    faceRy: 0.305,
    chinY: 0.35,
    eyeY: 0.045,
    eyeSep: 0.142,
    eyeRx: 0.072,
    eyeRy: 0.082,
    mouthY: 0.218,
    bangBottomBase: -0.095,
    partType: 'center',
    shineY: -0.29,
    accessory: 'ties',
  },
  // 3. Neko — Sleek anime cat-ear headphone operator facing 3/4 left
  ghost: {
    turn: -0.30,
    faceCx: -0.06,
    faceCy: 0.075,
    faceRx: 0.295,
    faceRy: 0.30,
    chinY: 0.36,
    eyeY: 0.07,
    eyeSep: 0.142,
    eyeRx: 0.072,
    eyeRy: 0.080,
    mouthY: 0.238,
    bangBottomBase: -0.07,
    partType: 'wispy',
    shineY: -0.24,
    accessory: 'nekoEar',
  },
  // 4. Kitsune — Side-swept shrine fox spirit with sleek fox ears
  heart: {
    turn: 0.32,
    faceCx: 0.07,
    faceCy: 0.085,
    faceRx: 0.285,
    faceRy: 0.30,
    chinY: 0.37,
    eyeY: 0.08,
    eyeSep: 0.140,
    eyeRx: 0.070,
    eyeRy: 0.078,
    mouthY: 0.245,
    bangBottomBase: -0.06,
    partType: 'side',
    shineY: -0.22,
    accessory: 'foxEar',
  },
  // 5. Usagi — Floppy-ear cyber bunny with clean hairpin bangs
  cloud: {
    turn: -0.22,
    faceCx: -0.045,
    faceCy: 0.105,
    faceRx: 0.29,
    faceRy: 0.29,
    chinY: 0.38,
    eyeY: 0.098,
    eyeSep: 0.140,
    eyeRx: 0.072,
    eyeRy: 0.080,
    mouthY: 0.255,
    bangBottomBase: -0.04,
    partType: 'straight',
    shineY: -0.18,
    accessory: 'bunnyPin',
  },
  // 6. Mecha — Sharp cyberpunk pilot with winged temple headset fins
  triangle: {
    turn: 0.32,
    faceCx: 0.07,
    faceCy: 0.065,
    faceRx: 0.285,
    faceRy: 0.30,
    chinY: 0.36,
    eyeY: 0.06,
    eyeSep: 0.140,
    eyeRx: 0.070,
    eyeRy: 0.076,
    mouthY: 0.235,
    bangBottomBase: -0.075,
    partType: 'side',
    shineY: -0.24,
    accessory: 'visorFin',
  },
  // 7. Yume — Slouch-hooded netrunner with wispy bangs and calm half-lidded eyes
  pebble: {
    turn: -0.18,
    faceCx: -0.035,
    faceCy: 0.07,
    faceRx: 0.295,
    faceRy: 0.295,
    chinY: 0.36,
    eyeY: 0.07,
    eyeSep: 0.144,
    eyeRx: 0.072,
    eyeRy: 0.078,
    mouthY: 0.238,
    bangBottomBase: -0.068,
    partType: 'wispy',
    shineY: -0.30,
    accessory: 'hoodCowl',
  },
  // 8. Seraph — Royal hime-cut cyber angel with blunt bangs & separated floating halo
  trapezoid: {
    turn: 0.16,
    faceCx: 0.035,
    faceCy: 0.095,
    faceRx: 0.285,
    faceRy: 0.295,
    chinY: 0.375,
    eyeY: 0.085,
    eyeSep: 0.142,
    eyeRx: 0.070,
    eyeRy: 0.078,
    mouthY: 0.248,
    bangBottomBase: -0.055,
    partType: 'blunt',
    shineY: -0.22,
    accessory: 'halo',
  },
  // 9. Wolfcut — Layered anime wolfcut with sweeping top ahoge & cyber choker
  blob: {
    turn: -0.26,
    faceCx: -0.055,
    faceCy: 0.07,
    faceRx: 0.29,
    faceRy: 0.30,
    chinY: 0.36,
    eyeY: 0.065,
    eyeSep: 0.142,
    eyeRx: 0.072,
    eyeRy: 0.080,
    mouthY: 0.235,
    bangBottomBase: -0.075,
    partType: 'center',
    shineY: -0.26,
    accessory: 'choker',
  },
};

function evaluateAnimeFaceDist(profile: AnimeFaceProfile, x: number, y: number): number {
  const { faceCx, faceCy, faceRx, faceRy, turn } = profile;
  const dy = y - faceCy;
  // Tapered anime chin contour below cheek level, rounded brow above
  const tChin = clamp01((dy - 0.01) / (faceRy * 0.96));
  const widthAtY = faceRx * (1.0 - tChin * tChin * 0.54);
  const jawShift = turn * (0.04 - tChin * 0.075);
  const dx = (x - (faceCx + jawShift)) / Math.max(0.08, widthAtY);
  const ny = dy / faceRy;
  return (Math.sqrt(dx * dx + ny * ny) - 1) * Math.min(widthAtY, faceRy);
}

/**
 * Signed distance for each of the 9 anime portrait bust variations in [-1, 1] space.
 */
export function evaluateShapeSdf(
  shape: BrailleShapeKind,
  x: number,
  y: number,
  pose: IdlePoseDeltas | null = null
): number {
  const earLOff = pose ? pose.earLeft : 0;
  const earROff = pose ? pose.earRight : 0;
  const ahogeY = pose ? pose.ahogeBounce : 0;
  const hoodL = pose ? pose.hoodLift : 0;
  const hoodSx = pose ? pose.hoodScaleX : 0;
  const haloSpin = pose ? pose.haloSpin : 0;

  switch (shape) {
    case 'clover': {
      // Cyber Bob: dome hair + swept left/right bob curls + grounded neck + broad collar shoulders
      const crown = sdEllipse(x, y, 0.04, -0.18, 0.48, 0.47);
      const backHair = sdCapsule(x, y, 0.28, -0.10, 0.44, 0.54, 0.21);
      const leftSideHair = sdCapsule(x, y, -0.34, -0.05, -0.44, 0.48, 0.145);
      const leftCurl = y > 0.20 ? sdCapsule(x, y, -0.44, 0.46, -0.63, 0.39, 0.095) : 1;
      const rightCurl = y > 0.22 ? sdCapsule(x, y, 0.44, 0.52, 0.61, 0.41, 0.095) : 1;
      const chin = y > -0.10 ? sdEllipse(x, y, -0.08, 0.20, 0.25, 0.22) : 1;
      const hair = smin(
        smin(crown, backHair, 0.08),
        smin(smin(leftSideHair, leftCurl, 0.07), rightCurl, 0.07),
        0.08
      );
      if (y < 0.22) return smin(hair, chin, 0.05);
      const neck = sdCapsule(x, y, 0.0, 0.33, 0.01, 0.58, 0.092);
      const bust = sdEllipse(x, y, 0.02, 0.67, 0.37, 0.16);
      return smin(smin(hair, chin, 0.05), smin(neck, bust, 0.06), 0.05);
    }
    case 'star': {
      // Starlight Twintails: anime head/shoulder bust + flared sweeping twintails + reactive ahoge
      const crown = y < 0.35 ? sdEllipse(x, y, 0.0, -0.15, 0.44, 0.42) : 1;
      const chin = y > -0.10 && y < 0.50 ? sdEllipse(x, y, 0.04, 0.20, 0.24, 0.215) : 1;
      const ahoge = y < -0.32 ? sdCapsule(x, y, -0.02, -0.55, 0.14, -0.74 - ahogeY, 0.052) : 1;
      const leftTail =
        x < -0.15
          ? smin(
              sdCapsule(x, y, -0.41, -0.12, -0.66, 0.33, 0.132),
              sdCapsule(x, y, -0.66, 0.33, -0.73, 0.54, 0.098),
              0.07
            )
          : 1;
      const rightTail =
        x > 0.15
          ? smin(
              sdCapsule(x, y, 0.41, -0.12, 0.66, 0.33, 0.132),
              sdCapsule(x, y, 0.66, 0.33, 0.73, 0.54, 0.098),
              0.07
            )
          : 1;
      const tails = Math.min(leftTail, rightTail);
      const headCore = smin(smin(crown, chin, 0.05), ahoge, 0.05);
      if (y < 0.22) return smin(headCore, tails, 0.06);
      const neck = sdCapsule(x, y, 0.01, 0.33, 0.0, 0.57, 0.090);
      const bust = sdEllipse(x, y, 0.0, 0.67, 0.36, 0.155);
      return smin(smin(headCore, smin(neck, bust, 0.06), 0.05), tails, 0.06);
    }
    case 'ghost': {
      // Neko Cyber Catgirl: sleek hair locks + pointed cat ears (independent left/right flick) + bust
      const crown = y < 0.38 ? sdEllipse(x, y, 0.03, -0.10, 0.45, 0.41) : 1;
      const lockL = x < 0 ? sdCapsule(x, y, -0.34, 0.04, -0.44, 0.54, 0.125) : 1;
      const lockR = x > 0 ? sdCapsule(x, y, 0.38, 0.02, 0.48, 0.55, 0.132) : 1;
      const chin = y > -0.08 && y < 0.52 ? sdEllipse(x, y, -0.06, 0.22, 0.24, 0.215) : 1;
      let core = smin(smin(crown, chin, 0.05), Math.min(lockL, lockR), 0.06);
      if (y >= 0.22) {
        const neck = sdCapsule(x, y, 0.0, 0.35, 0.01, 0.58, 0.092);
        const bust = sdEllipse(x, y, 0.01, 0.67, 0.36, 0.155);
        core = smin(core, smin(neck, bust, 0.06), 0.05);
      }
      if (y > -0.05) return core;
      const earL = sdTriangle(x, y, -0.44, -0.22, -0.46 + earLOff * 0.24, -0.71 + Math.abs(earLOff) * 0.18, -0.14, -0.42) - 0.030;
      const earR = sdTriangle(x, y, 0.46, -0.20, 0.16, -0.40, 0.48 - earROff * 0.24, -0.71 + Math.abs(earROff) * 0.18) - 0.030;
      return smin(core, Math.min(earL, earR), 0.04);
    }
    case 'heart': {
      // Kitsune Shrine Fox: tall angled fox ears + hime side locks + graceful bust
      const crown = y < 0.38 ? sdEllipse(x, y, -0.03, -0.08, 0.44, 0.40) : 1;
      const lockL = x < 0 ? sdCapsule(x, y, -0.40, 0.04, -0.52, 0.55, 0.125) : 1;
      const lockR = x > 0 ? sdCapsule(x, y, 0.36, 0.06, 0.48, 0.54, 0.125) : 1;
      const chin = y > -0.08 && y < 0.52 ? sdEllipse(x, y, 0.07, 0.225, 0.24, 0.215) : 1;
      let core = smin(smin(crown, chin, 0.05), Math.min(lockL, lockR), 0.06);
      if (y >= 0.22) {
        const neck = sdCapsule(x, y, 0.0, 0.35, -0.01, 0.58, 0.092);
        const bust = sdEllipse(x, y, -0.01, 0.67, 0.36, 0.155);
        core = smin(core, smin(neck, bust, 0.06), 0.05);
      }
      if (y > 0.0) return core;
      const earL = sdTriangle(x, y, -0.44, -0.14, -0.54 + earLOff * 0.2, -0.73, -0.12, -0.36) - 0.03;
      const earR = sdTriangle(x, y, 0.42, -0.16, 0.10, -0.36, 0.52 - earROff * 0.2, -0.73) - 0.03;
      return smin(core, Math.min(earL, earR), 0.04);
    }
    case 'cloud': {
      // Usagi Bunny: soft layered anime bob + independent floppy ears + bust
      const crown = y < 0.42 ? sdEllipse(x, y, 0.03, -0.04, 0.44, 0.39) : 1;
      const lockL = x < 0 ? sdCapsule(x, y, -0.36, 0.10, -0.48, 0.52, 0.13) : 1;
      const lockR = x > 0 ? sdCapsule(x, y, 0.38, 0.08, 0.50, 0.52, 0.132) : 1;
      const chin = y > -0.05 && y < 0.54 ? sdEllipse(x, y, -0.05, 0.245, 0.24, 0.215) : 1;
      let core = smin(smin(crown, chin, 0.05), Math.min(lockL, lockR), 0.06);
      if (y >= 0.24) {
        const neck = sdCapsule(x, y, 0.0, 0.37, 0.0, 0.59, 0.092);
        const bust = sdEllipse(x, y, 0.0, 0.68, 0.35, 0.155);
        core = smin(core, smin(neck, bust, 0.06), 0.05);
      }
      if (y > -0.02) return core;
      const earL = sdCapsule(x, y, -0.20, -0.30, -0.28 + earLOff * 0.35, -0.73, 0.098);
      const earR = sdCapsule(x, y, 0.22, -0.30, 0.42, -0.66 + earROff * 0.28, 0.092);
      const earTipR = sdCapsule(x, y, 0.42, -0.66 + earROff * 0.28, 0.56, -0.52 + earROff * 0.36, 0.078);
      return smin(core, Math.min(earL, smin(earR, earTipR, 0.05)), 0.05);
    }
    case 'triangle': {
      // Mecha Fin Headset: sharp anime cut + temple headset cups + upward cyber fins + collar bust
      const crown = y < 0.38 ? sdEllipse(x, y, -0.03, -0.10, 0.43, 0.40) : 1;
      const chin = y > -0.08 && y < 0.52 ? sdEllipse(x, y, 0.07, 0.22, 0.24, 0.215) : 1;
      const hairSideL = x < 0 ? sdCapsule(x, y, -0.38, -0.02, -0.44, 0.46, 0.115) : 1;
      const hairSideR = x > 0 ? sdCapsule(x, y, 0.36, 0.02, 0.42, 0.44, 0.105) : 1;
      let body = smin(smin(crown, chin, 0.05), Math.min(hairSideL, hairSideR), 0.06);
      if (y >= 0.22) {
        const neck = sdCapsule(x, y, 0.0, 0.35, 0.0, 0.58, 0.092);
        const bust = sdEllipse(x, y, -0.01, 0.67, 0.37, 0.155);
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
      const hood = y < 0.48 ? sdEllipse(x, y, 0.02, -0.08 + hoodL, 0.50 + hoodSx, 0.45 - hoodL * 0.4) : 1;
      const hoodEarL = y < -0.20 && x < 0 ? sdCircle(x, y, -0.37 - hoodSx * 0.4, -0.45 + hoodL, 0.125) : 1;
      const hoodEarR = y < -0.20 && x > 0 ? sdCircle(x, y, 0.39 + hoodSx * 0.4, -0.45 + hoodL, 0.125) : 1;
      const cowl = y > 0.20 ? sdEllipse(x, y, 0.0, 0.46, 0.41 + hoodSx * 0.5, 0.18) : 1;
      const bust = y > 0.38 ? sdEllipse(x, y, 0.0, 0.66, 0.37, 0.155) : 1;
      return smin(smin(hood, smin(cowl, bust, 0.07), 0.08), Math.min(hoodEarL, hoodEarR), 0.06);
    }
    case 'trapezoid': {
      // Seraph Halo: serene long hime-cut anime portrait + separated floating halo ring + bust
      const crown = y < 0.38 ? sdEllipse(x, y, -0.01, -0.05, 0.43, 0.38) : 1;
      const himeL = x < 0 ? sdCapsule(x, y, -0.39, 0.02, -0.44, 0.60, 0.115) : 1;
      const himeR = x > 0 ? sdCapsule(x, y, 0.38, 0.02, 0.43, 0.60, 0.115) : 1;
      const chin = y > -0.08 && y < 0.52 ? sdEllipse(x, y, 0.035, 0.22, 0.24, 0.215) : 1;
      let bodyPart = smin(smin(crown, chin, 0.05), Math.min(himeL, himeR), 0.05);
      if (y >= 0.22) {
        const neck = sdCapsule(x, y, 0.0, 0.35, 0.0, 0.58, 0.090);
        const bust = sdEllipse(x, y, 0.0, 0.67, 0.36, 0.155);
        bodyPart = smin(bodyPart, smin(neck, bust, 0.06), 0.05);
      }
      if (y > -0.45) return bodyPart;
      const haloRing = Math.abs(sdEllipse(x, y - x * (0.06 + haloSpin), 0.0, -0.63, 0.35, 0.068)) - 0.024;
      return Math.min(bodyPart, haloRing);
    }
    case 'blob':
    default: {
      // Wolfcut Cyber Ahoge: jagged layered anime wolfcut + dramatic curved ahoge + collar bust
      const crown = y < 0.38 ? sdEllipse(x, y, 0.03, -0.10, 0.45, 0.41) : 1;
      const tuftL1 = x < 0 ? sdCapsule(x, y, -0.36, 0.08, -0.57, 0.38, 0.105) : 1;
      const tuftL2 = x < 0 && y > 0.10 ? sdCapsule(x, y, -0.34, 0.26, -0.53, 0.56, 0.105) : 1;
      const tuftR1 = x > 0 ? sdCapsule(x, y, 0.38, 0.08, 0.57, 0.38, 0.105) : 1;
      const tuftR2 = x > 0 && y > 0.10 ? sdCapsule(x, y, 0.34, 0.26, 0.53, 0.56, 0.105) : 1;
      const chin = y > -0.08 && y < 0.52 ? sdEllipse(x, y, -0.055, 0.21, 0.24, 0.215) : 1;
      const tufts = Math.min(smin(tuftL1, tuftL2, 0.06), smin(tuftR1, tuftR2, 0.06));
      let body = smin(smin(crown, chin, 0.05), tufts, 0.06);
      if (y >= 0.22) {
        const neck = sdCapsule(x, y, 0.0, 0.35, 0.01, 0.58, 0.092);
        const bust = sdEllipse(x, y, 0.01, 0.67, 0.36, 0.155);
        body = smin(body, smin(neck, bust, 0.06), 0.05);
      }
      if (y > -0.35) return body;
      const ahoge = smin(
        sdCapsule(x, y, -0.04, -0.48, 0.08, -0.72 - ahogeY, 0.052),
        sdCapsule(x, y, 0.08, -0.72 - ahogeY, 0.28, -0.62 - ahogeY * 0.7, 0.045),
        0.04
      );
      return smin(body, ahoge, 0.06);
    }
  }
}

/**
 * Evaluates crisp dynamic wings, swishing cat/fox tail, separated hand poses, and small Braille props.
 * Returns null if `(x, y)` is outside the active feature, or a `{ lum, cov }` sample in [0, 1].
 */
function evaluateDynamicFeature(
  x: number,
  y: number,
  shape: BrailleShapeKind,
  pose: IdlePoseDeltas,
  chinY: number,
  mouthXBase: number
): { lum: number; cov: number } | null {
  // 1. Expanding seraph wings behind shoulders
  if (pose.wingOpen > 0.04 && Math.abs(x) > 0.26 && y > -0.04 && y < 0.68) {
    const spread = pose.wingOpen;
    const flapY = Math.sin(pose.wingOpen * Math.PI) * 0.07;
    const sideSign = x < 0 ? -1 : 1;
    const ax = sideSign * 0.30;
    const bx1 = sideSign * (0.54 + spread * 0.30);
    const by1 = 0.14 - flapY;
    const bx2 = sideSign * (0.50 + spread * 0.25);
    const by2 = 0.34 - flapY * 0.5;
    const bx3 = sideSign * (0.44 + spread * 0.18);
    const by3 = 0.50;
    const wTop = sdCapsule(x, y, ax, 0.28, bx1, by1, 0.058);
    const wMid = sdCapsule(x, y, ax, 0.35, bx2, by2, 0.052);
    const wBot = sdCapsule(x, y, ax, 0.41, bx3, by3, 0.042);
    const dw = Math.min(wTop, Math.min(wMid, wBot));
    if (dw < 0.026) {
      const cov = clamp01(1 - (dw + 0.004) / 0.030);
      const rim = dw > -0.024 ? 0.98 : 0.72;
      return { lum: rim, cov };
    }
  }

  // 2. Swishing tail for Neko / Wolfcut / Kitsune
  if (Math.abs(pose.tailWag) > 0.03 && y > 0.02 && y < 0.72 && Math.abs(x) > 0.24) {
    const side = shape === 'heart' ? -1 : 1;
    if (x * side > 0.22) {
      const tipX = side * (0.72 + pose.tailWag * 0.14);
      const tipY = 0.14 - Math.abs(pose.tailWag) * 0.14;
      const dt = smin(
        sdCapsule(x, y, side * 0.28, 0.56, side * 0.56, 0.42, 0.058),
        sdCapsule(x, y, side * 0.56, 0.42, tipX, tipY, 0.050),
        0.055
      );
      if (dt < 0.024) {
        const cov = clamp01(1 - (dt + 0.004) / 0.028);
        const nearTip = Math.hypot(x - tipX, y - tipY) < 0.10;
        const isRim = dt > -0.016;
        return { lum: nearTip ? 0.98 : isRim ? 0.76 : 0.30, cov };
      }
    }
  }

  // 3. Separated Hand / Item Gestures
  const hand: IdleHandPose = pose.hand;
  if (hand !== 'none') {
    const hp = pose.handPhase;
    let dHand = 1;
    let dProp = 1;
    const handLum = hand === 'peek' ? 0.88 : 0.95;
    let propLum = 0.98;

    switch (hand) {
      case 'chinTap': {
        const bob = hp * 0.035;
        const hx = mouthXBase - 0.06;
        const hy = chinY + 0.025 + bob;
        dHand = smin(
          sdCircle(x, y, hx, hy, 0.052),
          sdCapsule(x, y, hx - 0.08, hy + 0.16, hx, hy, 0.034),
          0.03
        );
        break;
      }
      case 'salute': {
        const lift = hp;
        const hx = 0.42;
        const hy = 0.02 - lift * 0.18;
        dHand = smin(
          sdCapsule(x, y, 0.30, 0.44, hx + 0.10, hy + 0.14, 0.042),
          sdCapsule(x, y, hx + 0.10, hy + 0.14, hx - 0.04, hy, 0.040),
          0.02
        );
        break;
      }
      case 'clasp': {
        dHand = smin(
          sdEllipse(x, y, mouthXBase, 0.46, 0.125, 0.072),
          sdCapsule(x, y, mouthXBase - 0.10, 0.59, mouthXBase, 0.45, 0.036),
          0.03
        );
        break;
      }
      case 'tome': {
        const tilt = Math.sin(hp * Math.PI * 2) * 0.030;
        const bx = mouthXBase;
        const by = 0.47;
        const pageL = sdCapsule(x, y, bx - 0.25, by - 0.06 + tilt, bx - 0.01, by + 0.02, 0.036);
        const pageR = sdCapsule(x, y, bx + 0.01, by + 0.02, bx + 0.25, by - 0.06 - tilt, 0.036);
        dProp = Math.min(pageL, pageR);
        dHand = Math.min(
          sdCircle(x, y, bx - 0.24, by + 0.01, 0.044),
          sdCircle(x, y, bx + 0.24, by + 0.01, 0.044)
        );
        break;
      }
      case 'mug': {
        const mx = mouthXBase + 0.05;
        const my = 0.47;
        dProp = sdCapsule(x, y, mx, my - 0.045, mx, my + 0.085, 0.074);
        dHand = sdCircle(x, y, mx - 0.09, my + 0.02, 0.046);
        propLum = 0.92;
        break;
      }
      case 'peace': {
        const hx = -0.46;
        const hy = 0.14;
        const f1 = sdCapsule(x, y, hx, hy, hx - 0.08, hy - 0.16, 0.026);
        const f2 = sdCapsule(x, y, hx + 0.03, hy, hx + 0.07, hy - 0.17, 0.026);
        const palm = sdCircle(x, y, hx + 0.01, hy + 0.03, 0.050);
        dHand = smin(palm, Math.min(f1, f2), 0.02);
        break;
      }
      case 'cheer': {
        const bounce = Math.abs(Math.sin(hp * Math.PI * 3)) * 0.10;
        const hL = sdCircle(x, y, -0.54, 0.14 - bounce, 0.058);
        const hR = sdCircle(x, y, 0.54, 0.14 - bounce, 0.058);
        const aL = sdCapsule(x, y, -0.34, 0.48, -0.54, 0.14 - bounce, 0.036);
        const aR = sdCapsule(x, y, 0.34, 0.48, 0.54, 0.14 - bounce, 0.036);
        dHand = Math.min(smin(hL, aL, 0.02), smin(hR, aR, 0.02));
        break;
      }
      case 'pawSwipe': {
        const swipe = Math.sin(hp * Math.PI * 2) * 0.09;
        const px = mouthXBase - 0.24 + swipe;
        const py = 0.22 - Math.abs(swipe) * 0.5;
        dHand = smin(
          sdCircle(x, y, px, py, 0.064),
          sdCapsule(x, y, px - 0.07, py + 0.20, px, py + 0.02, 0.040),
          0.02
        );
        break;
      }
      case 'peek': {
        const slx = mouthXBase - 0.02;
        const sly = 0.27;
        dHand = sdCapsule(x, y, slx - 0.17, sly + 0.13, slx + 0.14, sly - 0.01, 0.056);
        break;
      }
      case 'wave': {
        const wag = Math.sin(hp * Math.PI * 4) * 0.11;
        const wx = -0.58 + wag;
        const wy = 0.06 - Math.abs(wag) * 0.25;
        const arm = sdCapsule(x, y, -0.34, 0.44, wx, wy + 0.05, 0.036);
        const palm = sdCircle(x, y, wx, wy, 0.058);
        dHand = smin(arm, palm, 0.02);
        break;
      }
      case 'juggle': {
        const hL = sdCircle(x, y, -0.50, 0.34 + Math.sin(hp * Math.PI * 4) * 0.05, 0.052);
        const hR = sdCircle(x, y, 0.50, 0.34 - Math.sin(hp * Math.PI * 4) * 0.05, 0.052);
        dHand = Math.min(hL, hR);
        break;
      }
    }

    const best = Math.min(dHand, dProp);
    if (best < 0.024) {
      const cov = clamp01(1 - (best + 0.004) / 0.028);
      const isEdge = best > -0.015;
      const fillLum = dProp < dHand ? propLum : handLum;
      return { lum: isEdge ? 0.98 : fillLum, cov };
    }
  }

  // 4. Crisp Small Braille Ambient Props
  const prop: IdlePropKind = pose.prop;
  if (prop !== 'none') {
    const pp = pose.propPhase;
    let dProp = 1;
    const propLum = 0.98;

    switch (prop) {
      case 'radar': {
        const cx = 0.64;
        const cy = -0.28;
        const r = 0.07 + ((pp * 1.4) % 1) * 0.16;
        const ring = Math.abs(sdCircle(x, y, cx, cy, r)) - 0.018;
        const dot = sdCircle(x, y, cx, cy, 0.030);
        dProp = x > 0.38 && y < 0.0 ? Math.min(ring, dot) : 1;
        break;
      }
      case 'orbit': {
        const a1 = pp * Math.PI * 2;
        const a2 = a1 + Math.PI;
        const ox1 = Math.cos(a1) * 0.48;
        const oy1 = -0.62 + Math.sin(a1) * 0.09;
        const ox2 = Math.cos(a2) * 0.48;
        const oy2 = -0.62 + Math.sin(a2) * 0.09;
        dProp = Math.min(sdCircle(x, y, ox1, oy1, 0.038), sdCircle(x, y, ox2, oy2, 0.038));
        break;
      }
      case 'sparkle': {
        const sx = 0.62;
        const sy = -0.28 + Math.sin(pp * Math.PI * 2) * 0.04;
        const sc = 0.075 + Math.sin(pp * Math.PI) * 0.035;
        const hBar = sdCapsule(x, y, sx - sc, sy, sx + sc, sy, 0.018);
        const vBar = sdCapsule(x, y, sx, sy - sc, sx, sy + sc, 0.018);
        const sx2 = -0.62;
        const sy2 = -0.20;
        const s2 = sdCircle(x, y, sx2, sy2, 0.032);
        dProp = Math.min(Math.min(hBar, vBar), s2);
        break;
      }
      case 'steam': {
        const rise = (pp * 1.5) % 1;
        const c1 = sdCircle(x, y, mouthXBase + Math.sin(rise * 6) * 0.035, 0.33 - rise * 0.20, 0.032);
        const c2 = sdCircle(x, y, mouthXBase + 0.08 - Math.cos(rise * 5) * 0.035, 0.27 - rise * 0.20, 0.028);
        dProp = Math.min(c1, c2);
        break;
      }
      case 'bubbles': {
        const b1 = sdCircle(x, y, 0.48, -0.10 - pp * 0.05, 0.028);
        const b2 = sdCircle(x, y, 0.58, -0.24 - pp * 0.08, 0.042);
        const b3 = sdCircle(x, y, 0.68, -0.42 - pp * 0.10, 0.062);
        dProp = Math.min(b1, Math.min(b2, b3));
        break;
      }
      case 'note': {
        const nyNote = -0.22 - pp * 0.24 + Math.sin(pp * 8) * 0.03;
        const nxNote = 0.62 + Math.cos(pp * 6) * 0.03;
        const head = sdCircle(x, y, nxNote, nyNote, 0.038);
        const stem = sdCapsule(x, y, nxNote + 0.028, nyNote, nxNote + 0.028, nyNote - 0.12, 0.017);
        const flag = sdCapsule(x, y, nxNote + 0.028, nyNote - 0.12, nxNote + 0.095, nyNote - 0.075, 0.017);
        dProp = Math.min(head, Math.min(stem, flag));
        break;
      }
      case 'orb': {
        const t1 = pp * Math.PI * 2;
        const o1 = sdCircle(x, y, -0.58 + Math.cos(t1) * 0.09, 0.02 + Math.sin(t1) * 0.18, 0.048);
        const o2 = sdCircle(x, y, 0.58 - Math.cos(t1) * 0.09, 0.02 - Math.sin(t1) * 0.18, 0.048);
        dProp = Math.min(o1, o2);
        break;
      }
      case 'heart': {
        const hx = 0.60;
        const hy = -0.24 - pp * 0.20;
        const l1 = sdCircle(x, y, hx - 0.032, hy - 0.016, 0.036);
        const l2 = sdCircle(x, y, hx + 0.032, hy - 0.016, 0.036);
        const tip = sdTriangle(x, y, hx - 0.064, hy, hx + 0.064, hy, hx, hy + 0.08);
        dProp = Math.min(tip, Math.min(l1, l2));
        break;
      }
      case 'zzz': {
        const drift = (pp * 1.3) % 1;
        const zx = 0.58 + drift * 0.12;
        const zy = -0.22 - drift * 0.26;
        const zTop = sdCapsule(x, y, zx - 0.045, zy - 0.045, zx + 0.045, zy - 0.045, 0.016);
        const zDiag = sdCapsule(x, y, zx + 0.045, zy - 0.045, zx - 0.045, zy + 0.045, 0.016);
        const zBot = sdCapsule(x, y, zx - 0.045, zy + 0.045, zx + 0.045, zy + 0.045, 0.016);
        dProp = Math.min(zTop, Math.min(zDiag, zBot));
        break;
      }
    }

    if (dProp < 0.022) {
      return { lum: propLum, cov: clamp01(1 - (dProp + 0.004) / 0.026) };
    }
  }

  return null;
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
    idlePose: idlePoseParam,
  } = params;

  const subW = cols * 2;
  const subH = rows * 4;
  const subLum = ensureShapeSubBuffer(subW * subH);
  const lines: string[] = new Array(rows);
  const cells = new Uint8Array(cols * rows);

  const pose: IdlePoseDeltas = idlePoseParam ?? motion?.idle?.pose ?? NEUTRAL_IDLE_POSE;

  const blinkAmt = motion
    ? clamp01(motion.blink)
    : eyeState === 'blink'
    ? 1
    : 0;
  const squintAmt = motion
    ? clamp01(motion.squint)
    : eyeState === 'sleepy'
    ? 0.60
    : eyeState === 'happy' && !isSpeaking
    ? 0.72
    : 0;
  const wideAmt = motion
    ? clamp01(motion.wide)
    : eyeState === 'wide'
    ? 0.9
    : 0;
  const dragLiftAmt = motion ? motion.dragLift : isDragging ? 1 : 0;
  const hoverBoost = motion ? motion.hoverBoost : 0;
  const earTwitch = motion ? motion.earTwitch : 0;
  const haloFloat = motion ? motion.haloFloat : 0;
  const tilt = motion ? motion.dragTilt : pose.tilt;
  const hairLag = motion ? motion.hairLag : pose.hairSway;
  const bounceY = motion ? motion.bounceY : Math.sin(time * 2.2) * 0.016 + pose.headY;

  const breath = Math.sin(time * 2.2) * 0.016;
  const speakBounce = isSpeaking ? Math.sin(time * 13.5) * energy * 0.024 : 0;

  // Safe framing scale guarantees zero clipping across bust, halo, wings, and ambient props
  const safeBase = 0.89;
  const scaleX = safeBase * (1 + breath * 0.35 - speakBounce * 0.25 + dragLiftAmt * 0.030 + hoverBoost * 0.024 - pose.squashY * 0.35);
  const scaleY = safeBase * (1 - breath * 0.45 + speakBounce * 0.55 - dragLiftAmt * 0.020 + hoverBoost * 0.028 + pose.squashY * 0.55);

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
  const faceShiftX = gx * 0.26 + pose.headX * 0.5;
  const faceShiftY = gy * 0.20;

  // Perspective-foreshortened anime eye geometry matching 3/4 head turn
  const eyeCenterX = profile.faceCx + turn * 0.11;
  const farFactor = 0.84;
  const nearFactor = 1.06;
  const leftEyeRx = profile.eyeRx * (turn < 0 ? farFactor : nearFactor) * (1 + wideAmt * 0.10);
  const rightEyeRx = profile.eyeRx * (turn < 0 ? nearFactor : farFactor) * (1 + wideAmt * 0.10);
  const leftEyeX = eyeCenterX - profile.eyeSep * (turn < 0 ? 0.93 : 1.02) + gx * 0.65;
  const rightEyeX = eyeCenterX + profile.eyeSep * (turn < 0 ? 1.02 : 0.93) + gx * 0.65;
  const eyeY = profile.eyeY + gy * 0.42;
  const eyeRy = profile.eyeRy * (1 + wideAmt * 0.10);

  // Delicate pointed nose & cupid's-bow mouth aligned to 3/4 face plane
  const noseX = profile.faceCx + turn * 0.24 + gx * 0.36;
  const noseY = profile.eyeY + 0.095 + gy * 0.28;
  const mouthXBase = profile.faceCx + turn * 0.18 + gx * 0.28;
  const mouthY = profile.mouthY + gy * 0.30;

  const hasDynamicOverlay =
    pose.wingOpen > 0.04 ||
    Math.abs(pose.tailWag) > 0.03 ||
    pose.hand !== 'none' ||
    pose.prop !== 'none';

  for (let sy = 0; sy < subH; sy++) {
    const nyRaw = ((sy + 0.5) / subH) * 2 - 1;
    const nyScaled = (nyRaw - bounceY) / scaleY;
    const rowOff = sy * subW;

    for (let sx = 0; sx < subW; sx++) {
      const nxRaw = ((sx + 0.5) / subW) * 2 - 1;
      const nxScaled = nxRaw / scaleX;

      const dxp = nxScaled - pose.headX * 0.5;
      const dyp = nyScaled - pivotY;
      let nx = dxp * cosT - dyp * sinT;
      let ny = dxp * sinT + dyp * cosT + pivotY;

      if (hairLag !== 0) {
        const upperZone = ny < -0.22 ? (-0.22 - ny) * 0.55 : 0;
        const lowerZone = ny > 0.22 ? (ny - 0.22) * 0.55 : 0;
        nx += hairLag * (upperZone - lowerZone);
      }

      if (haloFloat !== 0 && shape === 'trapezoid' && ny < -0.48) {
        ny -= haloFloat;
      }
      if (earTwitch !== 0 && ny < -0.24) {
        const earZone = smoothstep(-0.24, -0.58, ny);
        nx += Math.sign(nx || 1) * earTwitch * earZone * 0.13;
        ny += earTwitch * earZone * 0.08;
      }

      if (nx > 0.94 || nx < -0.94 || ny < -0.88 || ny > 0.80) {
        subLum[rowOff + sx] = 0;
        continue;
      }

      // Check foreground dynamic gestures/props & background wings/tail
      const dyn = hasDynamicOverlay
        ? evaluateDynamicFeature(nx, ny, shape, pose, profile.chinY, mouthXBase)
        : null;

      const d = evaluateShapeSdf(shape, nx, ny, pose);
      if (d > 0.030) {
        if (dyn && dyn.cov > 0.01) {
          subLum[rowOff + sx] = dyn.lum * dyn.cov;
        } else {
          subLum[rowOff + sx] = 0;
        }
        continue;
      }

      const edgeCov = clamp(1 - (d + 0.004) / 0.034, 0, 1);
      // Graceful vignette at bottom of bust collar so torso melts cleanly below shoulders
      const bottomFade = ny > 0.72 ? clamp01(1 - (ny - 0.72) / 0.12) : 1;
      const alphaCov = edgeCov * bottomFade;
      if (alphaCov <= 0.01) {
        subLum[rowOff + sx] = dyn ? dyn.lum * dyn.cov : 0;
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
          bangBottom += -0.052 / (1 + dxC * dxC * 42) + 0.022 * Math.cos(nx * 18);
        } else if (profile.partType === 'side') {
          bangBottom += -0.072 * clamp((nx - profile.faceCx) * turnSign + 0.12, -0.35, 0.35) + 0.018 * Math.sin(nx * 16);
        } else if (profile.partType === 'wispy') {
          bangBottom += 0.028 * Math.cos((nx - profile.faceCx) * 20) - 0.012;
        } else if (profile.partType === 'blunt') {
          bangBottom += 0.012 * Math.sin(nx * 12) + (Math.abs(nx - profile.faceCx) < 0.10 ? 0.014 : 0);
        } else {
          // Straight layered manga bangs like original reference
          bangBottom += 0.024 * Math.sin((nx - profile.faceCx) * 20) + (Math.abs(nx - profile.faceCx) < 0.07 ? -0.026 : 0);
        }

        inFace = dFace < 0 && ny > bangBottom;
      }

      // Check neck & collar region below chin
      const inNeckCollar =
        !inFace &&
        ny > profile.chinY - 0.05 &&
        ny < 0.80 &&
        Math.abs(nx) < 0.38;

      let lum: number;

      if (inFace) {
        // Halftone manga skin shading (0.50–0.74) so sclera, dark iris, and specular catchlight pop crisply
        const templeDist = (nx - profile.faceCx) * -turnSign;
        const templeShadow = smoothstep(0.08, 0.27, templeDist) * 0.24;
        const cheekGlow = Math.exp(-((nx - profile.faceCx - turn * 0.12) ** 2 + (ny - (profile.eyeY + 0.11)) ** 2) * 18) * 0.08;
        lum = clamp(0.71 - templeShadow + cheekGlow, 0.44, 0.78);

        // Soft cast shadow directly beneath the bang fringe
        const underBang = ny - bangBottom;
        if (underBang >= 0 && underBang < 0.048) {
          lum *= 0.52 + (underBang / 0.048) * 0.48;
        }

        // Crisp dark manga jawline contour along bottom-outer edge of chin
        if (dFace > -0.022 && ny > profile.eyeY + 0.08) {
          lum = 0.06;
        }
      } else if (inNeckCollar && Math.abs(nx) < 0.105 && ny < 0.56) {
        // Grounded slender neck with clean manga triangle cast shadow directly beneath chin
        const chinShadow = ny < profile.chinY + 0.075 && nx * -turnSign < 0.06;
        lum = chinShadow ? 0.12 : 0.78;
      } else if (inNeckCollar && ny >= 0.52) {
        // Clean anime V-collar shirt & dark shoulder jacket with zero crossed X distortion
        const vNeck = 0.52 + Math.max(0, 0.12 - Math.abs(nx)) * 0.95;
        const collarOuter = 0.54 + Math.abs(nx) * 0.30;
        if (Math.abs(nx) < 0.16 && Math.abs(ny - vNeck) < 0.024) {
          lum = 0.94; // Clean white/glow V-collar trim
        } else if (Math.abs(nx) < 0.13 && ny < vNeck && ny >= 0.50) {
          lum = 0.76; // Inner collarbone skin triangle
        } else if (ny >= vNeck && ny < collarOuter + 0.03) {
          lum = 0.86; // Crisp folded collar lapel
        } else {
          lum = 0.24; // Dark cyber jacket / shoulder body
        }
      } else {
        // High-contrast dark manga hair interior + crisp outer rim outline
        const isOuterRim = d > -0.068;
        const rimBoost = isOuterRim ? clamp01(1 + d / 0.068) * 0.44 : 0;
        const strandShade = 0.042 * Math.max(0, Math.sin(nx * 36 - ny * 8));
        lum = 0.14 + rimBoost + strandShade;

        // Serrated / jagged manga hair-shine band curving across crown & bangs
        if (ny > profile.shineY - 0.10 && ny < profile.shineY + 0.10 && Math.abs(nx) < 0.44) {
          const shineCurve = profile.shineY + nx * nx * 0.28 - turn * nx * 0.08;
          const jag = 0.020 * Math.sin(nx * 34 + 0.5) + 0.012 * Math.cos(nx * 58);
          const distShine = Math.abs(ny - (shineCurve + jag));
          const strandBreak = Math.sin(nx * 52 + ny * 5);
          if (distShine < 0.040 && strandBreak > -0.35) {
            lum = Math.max(lum, 0.93);
          }
        }

        // Subtle secondary curl highlight near lower flared bob / twintail tips
        if (ny > 0.34 && ny < 0.56 && Math.abs(nx) > 0.32) {
          const tipSheen = 0.35 + 0.16 * Math.sin(ny * 26 + nx * 12);
          lum = Math.max(lum, tipSheen);
        }
      }

      // Signature Character Accessories
      switch (profile.accessory) {
        case 'headset': {
          const bandCurve = -0.37 + nx * nx * 0.65 - nx * 0.12;
          if (ny < 0.0 && Math.abs(ny - bandCurve) < 0.044 && nx > -0.18 && nx < 0.40) {
            lum = 0.96;
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
          if (tLx * tLx + tLy * tLy < 0.0062 || tRx * tRx + tRy * tRy < 0.0062) {
            lum = 0.97;
          }
          break;
        }
        case 'nekoEar': {
          if (ny < -0.24) {
            const bandCurve = -0.37 + nx * nx * 0.55;
            if (Math.abs(ny - bandCurve) < 0.028 && Math.abs(nx) < 0.32) {
              lum = 0.92;
            }
            const innerEar = Math.min(
              sdTriangle(nx, ny, -0.37, -0.35, -0.41 + pose.earLeft * 0.2, -0.57, -0.22, -0.44),
              sdTriangle(nx, ny, 0.38, -0.33, 0.24, -0.43, 0.42 - pose.earRight * 0.2, -0.57)
            );
            if (innerEar < 0) lum = 0.92;
          }
          break;
        }
        case 'foxEar': {
          if (ny < -0.24) {
            const innerFox = Math.min(
              sdTriangle(nx, ny, -0.37, -0.27, -0.46, -0.59, -0.20, -0.39),
              sdTriangle(nx, ny, 0.36, -0.28, 0.20, -0.40, 0.45, -0.59)
            );
            if (innerFox < 0) lum = 0.92;
          }
          const bellDx = nx;
          const bellDy = ny - 0.49;
          if (bellDx * bellDx + bellDy * bellDy < 0.0020) lum = 0.98;
          break;
        }
        case 'bunnyPin': {
          if (ny < -0.26) {
            const innerB = Math.min(
              sdCapsule(nx, ny, -0.21, -0.36, -0.26 + pose.earLeft * 0.3, -0.63, 0.030),
              sdCapsule(nx, ny, 0.24, -0.35, 0.38, -0.60 + pose.earRight * 0.25, 0.028)
            );
            if (innerB < 0) lum = 0.92;
          }
          if (Math.abs(nx + 0.18) < 0.056 && Math.abs(ny + 0.12) < 0.015) {
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
          if (ny > 0.38 && ny < 0.66 && (Math.abs(nx + 0.10) < 0.013 || Math.abs(nx - 0.10) < 0.013)) {
            lum = 0.95;
          }
          break;
        }
        case 'halo': {
          if (ny < -0.51) lum = 0.98;
          break;
        }
        case 'choker': {
          if (ny > 0.39 && ny < 0.45 && Math.abs(nx) < 0.105) {
            lum = Math.abs(nx) < 0.022 ? 0.98 : 0.06;
          }
          break;
        }
      }

      // Expressive 3/4 Anime Facial Details inside Face & Eye Zone
      if (dFace < 0.05) {
        // 1. Expressive Arched Manga Eyebrows
        const browRaise = mood === 'alert' ? -0.022 : mood === 'thinking' ? -0.014 : 0;
        const browTiltL = mood === 'focused' ? 0.014 : mood === 'thinking' ? -0.012 : 0;
        const browTiltR = mood === 'focused' ? -0.014 : 0;
        const browY = eyeY - eyeRy * 1.38 + browRaise;
        if (ny > browY - 0.030 && ny < browY + 0.030) {
          const browDL = sdCapsule(nx, ny, leftEyeX - leftEyeRx * 0.92, browY + 0.008, leftEyeX + leftEyeRx * 0.88, browY + browTiltL, 0.011);
          const browDR = sdCapsule(nx, ny, rightEyeX - rightEyeRx * 0.88, browY + browTiltR, rightEyeX + rightEyeRx * 0.92, browY + 0.008, 0.011);
          if (browDL < 0 || browDR < 0) {
            lum = 0.05;
          }
        }

        // 2. Almond Anime Eyes with deep dark iris, sharp single catchlight & independent winks
        if (ny > eyeY - eyeRy * 1.38 && ny < eyeY + eyeRy * 1.42) {
          const dxL = nx - leftEyeX;
          const dxR = nx - rightEyeX;
          const isLeft = Math.abs(dxL) < Math.abs(dxR);
          const nearestDx = isLeft ? dxL : dxR;
          const nearestEyeX = isLeft ? leftEyeX : rightEyeX;
          const rx = isLeft ? leftEyeRx : rightEyeRx;
          const outerDir = isLeft ? -1 : 1;
          const dyEye = ny - eyeY;

          const eyeBlink = clamp01(Math.max(blinkAmt, isLeft ? pose.blinkLeft : pose.blinkRight));
          const isHappyArc =
            (eyeState === 'happy' && !isSpeaking && eyeBlink < 0.15) ||
            (pose.happyEyes > 0.40 && eyeBlink < 0.25);

          if (eyeBlink > 0.80) {
            // Bowed closed anime eyelash arch + outer corner flick
            const archY = eyeY + 0.018 - nearestDx * nearestDx * 2.1;
            const dClosed = sdCapsule(nx, ny, nearestEyeX - rx * 1.05, archY, nearestEyeX + rx * 1.05, archY, 0.018);
            const dWing = sdCapsule(nx, ny, nearestEyeX + outerDir * rx, archY, nearestEyeX + outerDir * rx * 1.28, archY - 0.018, 0.013);
            if (dClosed < 0 || dWing < 0) lum = 0.03;
          } else if (isHappyArc) {
            // Cheerful upward anime ^ ^ happy arc
            const happyY = eyeY + 0.012 + nearestDx * nearestDx * 3.4;
            if (Math.abs(nearestDx) < rx * 1.08 && Math.abs(ny - happyY) < 0.020) {
              lum = 0.03;
            }
          } else {
            const effectiveClose = Math.max(eyeBlink, squintAmt * 0.54);
            const lidCurve = (nearestDx / rx) * (nearestDx / rx) * eyeRy * lerp(0.55, 0.25, effectiveClose);
            const lidY = lerp(eyeY - eyeRy * 0.72, eyeY + 0.016, effectiveClose) + lidCurve;

            const lashThick = lerp(0.025, 0.020, effectiveClose);
            const outerWing =
              nearestDx * outerDir > rx * 0.72 &&
              nearestDx * outerDir < rx * 1.36 &&
              Math.abs(ny - (lidY - (nearestDx * outerDir - rx * 0.72) * 0.35)) < 0.015;

            if ((Math.abs(nearestDx) < rx * 1.18 && Math.abs(ny - lidY) < lashThick) || outerWing) {
              lum = 0.02;
            } else if (ny > lidY) {
              const ix = nearestDx / rx;
              const iy = dyEye / eyeRy;
              const eyeBallSq = ix * ix + iy * iy;
              if (eyeBallSq < 1.0) {
                // Deep dark anime iris (80% width) + crisp upper-left catchlight dot + clean sclera contrast
                const irisX = (nearestDx - gx * 0.35) / (rx * 0.80);
                const irisY = (dyEye - gy * 0.25) / (eyeRy * 0.88);
                if (irisX * irisX + irisY * irisY < 1.0) {
                  const g1x = nx - (nearestEyeX - rx * 0.24 + gx * 0.4);
                  const g1y = ny - (eyeY - eyeRy * 0.20 + gy * 0.4);
                  const r1 = rx * 0.21;
                  if (g1x * g1x + g1y * g1y < r1 * r1) {
                    lum = 1.0;
                  } else if (dyEye > eyeRy * 0.48 && Math.abs(nearestDx) < rx * 0.40) {
                    lum = 0.36; // Subtle lower iris sheen
                  } else {
                    lum = 0.02;
                  }
                } else {
                  lum = 0.92; // Clean sclera corner highlight
                }
              } else if (Math.abs(nearestDx) < rx * 0.78 && Math.abs(ny - (eyeY + eyeRy * 0.98)) < 0.012) {
                // Delicate lower lash anchor
                lum = 0.10;
              }
            }
          }
        }

        // 3. Delicate pointed anime nose shadow tick
        const ndx = nx - noseX;
        const ndy = ny - noseY;
        if (ndx * ndx + ndy * ndy < 0.00038) {
          lum = 0.09;
        }

        // 4. Soft manga cheek blush hatch under eyes
        if ((mood === 'happy' || isSpeaking || smileAmt > 0.65 || pose.happyEyes > 0.4) && ny > eyeY + 0.08 && ny < eyeY + 0.17) {
          const blx = (nx - (leftEyeX - 0.03)) / 0.052;
          const brx = (nx - (rightEyeX + 0.03)) / 0.052;
          const by = (ny - (eyeY + 0.12)) / 0.024;
          if (blx * blx + by * by < 1.0 || brx * brx + by * by < 1.0) {
            lum *= 0.76;
          }
        }

        // 5. Subtle cyber-cat whisker ticks for Neko
        if (profile.accessory === 'nekoEar' && ny > eyeY + 0.07 && ny < eyeY + 0.17 && Math.abs(nx - profile.faceCx) > 0.19 && Math.abs(nx - profile.faceCx) < 0.30) {
          if (Math.abs(ny - (eyeY + 0.10)) < 0.011 || Math.abs(ny - (eyeY + 0.145)) < 0.011) {
            lum = 0.14;
          }
        }

        // 6. Expressive Mouth (speaking viseme / cat :3 / yawn / hum / grin / cupid's bow)
        if (ny > mouthY - 0.075 && ny < mouthY + 0.085) {
          const mx = nx - mouthXBase;
          if (mouthOpen > 0.10) {
            const mw = pose.mouthMode === 'o' ? 0.026 : 0.035 + mouthOpen * 0.032;
            const mh = pose.mouthMode === 'o' ? 0.032 : 0.016 + mouthOpen * 0.038;
            const mxn = mx / mw;
            const myn = (ny - mouthY) / mh;
            if (mxn * mxn + myn * myn < 1.0) {
              lum = ny < mouthY - mh * 0.32 && mouthOpen > 0.25 && pose.mouthMode !== 'o' ? 0.90 : 0.04;
            }
          } else if (pose.mouthMode === 'cat') {
            // Playful anime :3 cat mouth
            const catY = mouthY + 0.006 - Math.abs(Math.sin(mx * 42)) * 0.016;
            if (Math.abs(mx) < 0.052 && Math.abs(ny - catY) < 0.012) {
              lum = 0.05;
            }
          } else if (pose.mouthMode === 'grin') {
            const grinTop = mouthY - 0.010;
            const grinBot = mouthY + 0.028 - mx * mx * 4.5;
            if (Math.abs(mx) < 0.056 && ny > grinTop && ny < grinBot) {
              lum = ny < grinTop + 0.014 ? 0.96 : 0.06;
            }
          } else if (smileAmt > 0.48) {
            const smileCurve = mouthY - mx * mx * (3.6 + smileAmt * 1.4);
            if (Math.abs(mx) < 0.048 && Math.abs(ny - smileCurve) < 0.014) {
              lum = 0.06;
            }
          } else {
            const bowY = mouthY - Math.abs(mx) * 0.12;
            if (Math.abs(mx) < 0.042 && Math.abs(ny - bowY) < 0.013) {
              lum = 0.07;
            } else if (Math.abs(mx) < 0.018 && Math.abs(ny - (mouthY + 0.022)) < 0.008) {
              lum = 0.98;
            }
          }
        }
      }

      // Composite foreground hand gesture over lower face / chest when active
      let finalLum = lum * alphaCov;
      if (dyn && dyn.cov > 0.25 && pose.hand !== 'none') {
        finalLum = lerp(finalLum, dyn.lum, dyn.cov);
      }
      subLum[rowOff + sx] = finalLum;
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
