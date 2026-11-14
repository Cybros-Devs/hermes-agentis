import type { ExpressionMood, EyeState, MouthViseme } from '../types/hermes';

export type DitherStyle = 'braille';

export interface PortraitSourceField {
  width: number;
  height: number;
  /** Precomputed base chiaroscuro luminance (0..1) from reference silhouette */
  baseLum: Float32Array;
  /** Ink opacity mask (0..1) so animations know where skin vs hair/lines sit */
  inkMask: Float32Array;
}

/**
 * Continuous interpolated animation state for 60fps fluid character motion
 * (2.5D head yaw/pitch turning, smooth eye blinks, eyebrow micro-expressions,
 * damped lip-sync aperture, eye gaze saccades, and overlapping hair/shoulder follow-through).
 */
export interface PortraitMotionState {
  blink: number;       // 0 (open) .. 1 (closed)
  squint: number;      // 0 .. 1 happy/focused cheek squint
  wide: number;        // 0 .. 1 alert eye expansion
  browLift: number;    // -0.45 (focused) .. +1.0 (raised emphasis)
  mouthOpen: number;   // 0 .. 1 vertical aperture
  mouthWidth: number;  // 0.60 .. 1.38 horizontal stretch
  mouthRound: number;  // 0 .. 1 roundness for O/oo vowels
  smile: number;       // 0 .. 1 upturned smile corners
  jawDrop: number;     // 0 .. 1 downward chin/jaw articulation
  teethTop: number;    // 0 .. 1 upper teeth bar prominence
  teethBottom: number; // 0 .. 1 lower teeth / smile bar (Wide / Ee)
  tongueShow: number;  // 0 .. 1 tongue visibility inside open cavity
  tongueLift: number;  // 0 .. 1 raised tongue tip behind upper teeth (L / Th)
  lipPress: number;    // 0 .. 1 bilabial pressed seal (M / B / P)
  lipBite: number;     // 0 .. 1 labiodental upper-teeth-on-lower-lip (F / V)
  puckerRing: number;  // 0 .. 1 pursed O/Oo lip highlight ring
  restPart: number;    // 0 .. 1 relaxed natural/rest slight parting
  gazeX: number;       // -1 .. 1 eye saccade X
  gazeY: number;       // -1 .. 1 eye saccade Y
  headYaw: number;     // -0.35 .. +0.35 radians 2.5D left/right head turn
  headPitch: number;   // -0.22 .. +0.22 radians 2.5D up/down head pitch
  headTilt: number;    // radians planar head tilt
  headNodY: number;    // normalized UV vertical head/breath shift
  headSwayX: number;   // normalized UV horizontal sway
  hairLagX: number;    // normalized UV secondary follow-through on lower curls
  hairLagY: number;    // normalized UV secondary bounce on lower curls
  shoulderY: number;   // normalized UV decoupled collar/shoulder breathing
  listenPulse: number; // 0 .. 1 active listening/speaking aura
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
  motion?: PortraitMotionState | null;
}

export interface PortraitFrame {
  cols: number;
  rows: number;
  lines: string[];
  /** Per-row intensity values (0..255) matching each character */
  cells: Uint8Array;
}

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

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function expApproach(current: number, target: number, rate: number, dt: number): number {
  const factor = 1 - Math.exp(-rate * Math.max(0.001, dt));
  return current + (target - current) * factor;
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
    case 'rest':
      return { rx: 0.045, ry: 0.011, open: 0.14 };
    case 'mbp':
      return { rx: 0.050, ry: 0.007, open: 0 };
    case 'fv':
      return { rx: 0.048, ry: 0.015 + e * 0.3, open: 0.34 };
    case 'lth':
      return { rx: 0.052, ry: 0.028 + e * 0.6, open: 0.68 };
    case 'smile':
      return { rx: 0.056, ry: 0.011, open: 0.15 };
    case 'small':
      return { rx: 0.046, ry: 0.021 + e * 0.65, open: 0.52 };
    case 'mid':
      return { rx: 0.052, ry: 0.031 + e * 0.85, open: 0.82 };
    case 'round':
      return { rx: 0.034, ry: 0.035 + e * 0.9, open: 0.92 };
    case 'ee':
      return { rx: 0.068, ry: 0.028 + e * 0.65, open: 0.78 };
    case 'wide':
      return { rx: 0.060, ry: 0.044 + e, open: 1.0 };
  }
}

export interface LookTarget {
  /** Normalized pointer horizontal offset from portrait center (-1 left .. +1 right) */
  x: number;
  /** Normalized pointer vertical offset from portrait center (-1 up .. +1 down) */
  y: number;
}

function getTargetMotionFromParams(
  params: PortraitParams,
  lookTarget?: LookTarget | null
): PortraitMotionState {
  const { time, mood, viseme, eyeState, energy, isSpeaking, isListening } = params;

  // Natural rhythmic breathing & overlapping secondary action
  const breath = Math.sin(time * 2.05);
  const breathLag = Math.sin(time * 2.05 - 0.85);
  const speakCadence = isSpeaking ? Math.sin(time * 7.6) : 0;
  const speakBounce = isSpeaking ? Math.abs(speakCadence) * (0.009 + energy * 0.016) : 0;
  const speakNod = isSpeaking ? Math.sin(time * 4.4) * (0.024 + energy * 0.042) : 0;

  // Expressive autonomous 2.5D head yaw & pitch choreography per mood
  let headYaw = Math.sin(time * 0.72) * 0.115 + Math.sin(time * 0.31) * 0.045;
  let headPitch = Math.sin(time * 1.08) * 0.045;

  if (mood === 'thinking') {
    headYaw = -0.19 + Math.sin(time * 0.85) * 0.06;
    headPitch = -0.095 + Math.cos(time * 0.7) * 0.025;
  } else if (mood === 'listening') {
    headYaw = 0.13 + Math.sin(time * 1.15) * 0.05;
    headPitch = 0.035 + Math.sin(time * 2.2) * (0.025 + energy * 0.04);
  } else if (mood === 'alert') {
    headYaw = 0.16 + Math.sin(time * 2.6) * 0.025;
    headPitch = -0.045;
  } else if (mood === 'focused') {
    headYaw = 0.05 + Math.sin(time * 0.55) * 0.04;
    headPitch = 0.03 + Math.sin(time * 1.1) * 0.02;
  } else if (mood === 'happy') {
    headYaw = 0.08 + Math.sin(time * 1.15) * 0.11;
    headPitch = -0.02 + Math.sin(time * 2.2) * 0.045;
  }

  if (isSpeaking) {
    // Conversational emphasis head turns toward viewer & syllable nods
    headYaw += 0.08 + Math.sin(time * 1.55) * (0.09 + energy * 0.07);
    headPitch += Math.sin(time * 3.6) * (0.035 + energy * 0.055);
  }

  // Blend subtle pointer-tracking head turn when user hovers/moves cursor near portrait
  if (lookTarget) {
    const lx = clamp(lookTarget.x, -1, 1);
    const ly = clamp(lookTarget.y, -1, 1);
    headYaw = lerp(headYaw, lx * 0.28, 0.65);
    headPitch = lerp(headPitch, ly * 0.16, 0.6);
  }

  headYaw = clamp(headYaw, -0.34, 0.34);
  headPitch = clamp(headPitch, -0.2, 0.2);

  const baseTilt =
    mood === 'thinking'
      ? -0.068 + Math.sin(time * 1.4) * 0.022
      : mood === 'happy'
      ? 0.032 + Math.sin(time * 2.1) * 0.024
      : mood === 'listening'
      ? 0.042 + Math.sin(time * 2.5) * 0.018
      : mood === 'alert'
      ? -0.024
      : mood === 'focused'
      ? -0.014 + Math.sin(time * 1.3) * 0.01
      : Math.sin(time * 1.6) * 0.02;
  const headTilt = baseTilt + speakNod - headYaw * 0.12;

  // Smooth natural blink curve (~3.0s cycle, plus occasional double blink)
  const blinkCycle = (time * 0.33) % 1;
  let autoBlink = 0;
  if (blinkCycle > 0.925) {
    autoBlink = Math.sin(((blinkCycle - 0.925) / 0.075) * Math.PI);
  } else if (blinkCycle > 0.83 && blinkCycle < 0.885 && Math.floor(time * 0.33) % 3 === 1) {
    autoBlink = Math.sin(((blinkCycle - 0.83) / 0.055) * Math.PI) * 0.92;
  }

  const blink =
    eyeState === 'blink' ? 1 : eyeState === 'half' ? 0.48 : autoBlink;
  const squint =
    eyeState === 'happy' || mood === 'happy'
      ? 0.52
      : eyeState === 'half' || mood === 'focused'
      ? 0.36
      : viseme === 'ee'
      ? 0.22
      : 0;
  const wide = eyeState === 'wide' || mood === 'alert' ? 0.88 : 0;

  // Dynamic eyebrow micro-expressions (emphasis raises, focused narrows, curious thinking lift)
  let browLift = 0.08 * Math.sin(time * 1.3);
  if (mood === 'alert' || eyeState === 'wide') browLift = 0.72;
  else if (mood === 'thinking') browLift = 0.38 + Math.sin(time * 1.6) * 0.12;
  else if (mood === 'focused' || eyeState === 'half') browLift = -0.34;
  else if (mood === 'happy' || eyeState === 'happy') browLift = 0.28 + Math.sin(time * 2.1) * 0.1;
  if (isSpeaking) {
    browLift += Math.max(0, Math.sin(time * 3.8)) * energy * 0.45;
  }
  browLift = clamp(browLift, -0.45, 1.0);

  // Mouth targets mapped to the 10-viseme Talking Reference sheet
  let mouthOpen = 0;
  let mouthWidth = 1;
  let mouthRound = 0;
  let smile = mood === 'happy' ? 0.68 : 0.08;
  let jawDrop = 0;
  let teethTop = 0;
  let teethBottom = 0;
  let tongueShow = 0;
  let tongueLift = 0;
  let lipPress = 0;
  let lipBite = 0;
  let puckerRing = 0;
  let restPart = 0;

  switch (viseme) {
    case 'closed':
      mouthOpen = 0;
      mouthWidth = 0.92;
      break;
    case 'rest': // Natural/Rest subtle relaxed parting
      mouthOpen = 0.10;
      mouthWidth = 0.94;
      teethTop = 0.48;
      jawDrop = 0.05;
      restPart = 1;
      break;
    case 'smile':
      mouthOpen = 0;
      mouthWidth = 1.12;
      smile = 1;
      break;
    case 'mbp': // M / B / P bilabial pressed seal
      mouthOpen = 0;
      mouthWidth = 1.10;
      smile = 0.02;
      lipPress = 1;
      break;
    case 'fv': // F / V labiodental upper teeth resting on raised lower lip
      mouthOpen = 0.24 + energy * 0.06;
      mouthWidth = 1.02;
      teethTop = 0.98;
      lipBite = 1;
      jawDrop = 0.12;
      break;
    case 'lth': // L / Th medium open with raised tongue tip behind upper teeth
      mouthOpen = 0.56 + energy * 0.12;
      mouthWidth = 1.02;
      teethTop = 0.96;
      tongueShow = 1;
      tongueLift = 0.96;
      jawDrop = 0.45;
      break;
    case 'small': // Slightly Open (Ah/Uh) horizontal slit with crisp upper teeth bar
      mouthOpen = 0.30 + energy * 0.10;
      mouthWidth = 1.04;
      teethTop = 0.98;
      jawDrop = 0.22;
      break;
    case 'mid': // conversational open
      mouthOpen = 0.62 + energy * 0.14;
      mouthWidth = 1.06;
      mouthRound = 0.10;
      teethTop = 0.94;
      tongueShow = 0.58;
      jawDrop = 0.58;
      break;
    case 'round': { // Rounded / Oh (O/Oo) & tighter Rouh / Oo at lower energy
      const tightOo = energy < 0.45 ? 1 - smoothstep(0.18, 0.45, energy) : 0;
      mouthOpen = lerp(0.76 + energy * 0.14, 0.38, tightOo);
      mouthWidth = lerp(0.74, 0.56, tightOo);
      mouthRound = 0.98;
      puckerRing = lerp(0.92, 1.0, tightOo);
      jawDrop = lerp(0.62, 0.28, tightOo);
      break;
    }
    case 'ee': // Wide / Ee (E/I) stretched grin with crisp upper & lower teeth bars
      mouthOpen = 0.54 + energy * 0.12;
      mouthWidth = 1.36;
      smile = Math.max(smile, 0.96);
      teethTop = 1;
      teethBottom = 0.98;
      jawDrop = 0.36;
      break;
    case 'wide': // Wide Open (A/Ha) deep jaw drop + upper teeth + arched tongue
      mouthOpen = 0.92 + energy * 0.08;
      mouthWidth = 1.14;
      teethTop = 1;
      tongueShow = 0.96;
      tongueLift = 0.08;
      jawDrop = 1.0;
      break;
  }

  // Natural micro-saccades for gaze (blended with pointer lookTarget when active)
  let gazeX =
    mood === 'thinking'
      ? -0.42 + Math.sin(time * 1.9) * 0.34
      : eyeState === 'side'
      ? 0.72
      : mood === 'listening'
      ? Math.sin(time * 1.2) * 0.22
      : Math.sin(time * 0.75) * 0.18;
  let gazeY =
    mood === 'thinking'
      ? -0.48 + Math.cos(time * 1.3) * 0.15
      : mood === 'alert'
      ? -0.1
      : Math.cos(time * 0.65) * 0.08;

  if (lookTarget) {
    gazeX = lerp(gazeX, clamp(lookTarget.x * 1.15, -1, 1), 0.75);
    gazeY = lerp(gazeY, clamp(lookTarget.y * 0.9, -1, 1), 0.75);
  }

  const listenPulse = isSpeaking
    ? clamp01(0.58 + energy * 0.42)
    : isListening
    ? clamp01(0.36 + energy * 0.45)
    : 0;

  return {
    blink,
    squint,
    wide,
    browLift,
    mouthOpen: clamp01(mouthOpen),
    mouthWidth,
    mouthRound,
    smile: clamp01(smile),
    jawDrop: clamp01(jawDrop),
    teethTop: clamp01(teethTop),
    teethBottom: clamp01(teethBottom),
    tongueShow: clamp01(tongueShow),
    tongueLift: clamp01(tongueLift),
    lipPress: clamp01(lipPress),
    lipBite: clamp01(lipBite),
    puckerRing: clamp01(puckerRing),
    restPart: clamp01(restPart),
    gazeX,
    gazeY,
    headYaw,
    headPitch,
    headTilt,
    headNodY: breath * 0.008 - speakBounce,
    headSwayX: Math.sin(time * 1.15) * 0.005 + (isSpeaking ? Math.sin(time * 3.8) * 0.005 * energy : 0),
    hairLagX:
      breathLag * 0.017 +
      (isSpeaking ? Math.sin(time * 4.4 - 0.72) * 0.024 * energy : 0),
    hairLagY:
      Math.cos(time * 2.05 - 0.6) * 0.006 +
      (isSpeaking ? Math.sin(time * 7.6 - 0.65) * 0.011 * energy : 0),
    shoulderY: breath * 0.012,
    listenPulse,
  };
}

/**
 * Stateful damped-spring / exponential animator for 60fps Canvas playback.
 * Drives smooth 2.5D head turns, blinks, eyebrow raises, lip-sync, and secondary hair elasticity.
 */
export function createPortraitAnimator() {
  const state: PortraitMotionState = {
    blink: 0,
    squint: 0.4,
    wide: 0,
    browLift: 0,
    mouthOpen: 0,
    mouthWidth: 1,
    mouthRound: 0,
    smile: 0.4,
    jawDrop: 0,
    teethTop: 0,
    teethBottom: 0,
    tongueShow: 0,
    tongueLift: 0,
    lipPress: 0,
    lipBite: 0,
    puckerRing: 0,
    restPart: 0,
    gazeX: 0,
    gazeY: 0,
    headYaw: 0,
    headPitch: 0,
    headTilt: 0,
    headNodY: 0,
    headSwayX: 0,
    hairLagX: 0,
    hairLagY: 0,
    shoulderY: 0,
    listenPulse: 0,
  };
  let hairVelX = 0;
  let hairVelY = 0;
  let prevHeadTilt = 0;
  let prevHeadYaw = 0;
  let prevHeadNodY = 0;

  return {
    step(
      params: Omit<PortraitParams, 'cols' | 'rows' | 'style' | 'sourceField' | 'motion'>,
      dt: number,
      reducedMotion = false,
      lookTarget?: LookTarget | null
    ): PortraitMotionState {
      const clampedDt = Math.min(0.06, Math.max(0.004, dt));
      const target = getTargetMotionFromParams(params as PortraitParams, lookTarget);

      // Asymmetric crisp blink: fast close (rate 38), graceful open (rate 19)
      const blinkRate = target.blink > state.blink ? 38 : 19;
      state.blink = expApproach(state.blink, target.blink, blinkRate, clampedDt);
      state.squint = expApproach(state.squint, target.squint, 10, clampedDt);
      state.wide = expApproach(state.wide, target.wide, 14, clampedDt);
      state.browLift = expApproach(state.browLift, target.browLift, 13, clampedDt);

      // Lip-sync: snappy vocal attack (rate 30), natural vowel release (rate 18)
      const mouthRate = target.mouthOpen > state.mouthOpen ? 30 : 18;
      state.mouthOpen = expApproach(state.mouthOpen, target.mouthOpen, mouthRate, clampedDt);
      state.mouthWidth = expApproach(state.mouthWidth, target.mouthWidth, 24, clampedDt);
      state.mouthRound = expApproach(state.mouthRound, target.mouthRound, 24, clampedDt);
      state.smile = expApproach(state.smile, target.smile, 12, clampedDt);
      state.jawDrop = expApproach(state.jawDrop, target.jawDrop, 22, clampedDt);
      state.teethTop = expApproach(state.teethTop, target.teethTop, 28, clampedDt);
      state.teethBottom = expApproach(state.teethBottom, target.teethBottom, 26, clampedDt);
      state.tongueShow = expApproach(state.tongueShow, target.tongueShow, 24, clampedDt);
      state.tongueLift = expApproach(state.tongueLift, target.tongueLift, 24, clampedDt);
      state.lipPress = expApproach(state.lipPress, target.lipPress, 28, clampedDt);
      state.lipBite = expApproach(state.lipBite, target.lipBite, 28, clampedDt);
      state.puckerRing = expApproach(state.puckerRing, target.puckerRing, 24, clampedDt);
      state.restPart = expApproach(state.restPart, target.restPart, 22, clampedDt);

      // Eye saccades snap cleanly with organic smoothing
      state.gazeX = expApproach(state.gazeX, target.gazeX, 16, clampedDt);
      state.gazeY = expApproach(state.gazeY, target.gazeY, 16, clampedDt);

      if (reducedMotion) {
        state.headYaw = expApproach(state.headYaw, target.headYaw * 0.2, 5, clampedDt);
        state.headPitch = expApproach(state.headPitch, target.headPitch * 0.2, 5, clampedDt);
        state.headTilt = expApproach(state.headTilt, target.headTilt * 0.25, 6, clampedDt);
        state.headNodY = expApproach(state.headNodY, target.headNodY * 0.2, 6, clampedDt);
        state.headSwayX = 0;
        state.hairLagX = 0;
        state.hairLagY = 0;
        state.shoulderY = 0;
      } else {
        state.headYaw = expApproach(state.headYaw, target.headYaw, 7.5, clampedDt);
        state.headPitch = expApproach(state.headPitch, target.headPitch, 8.0, clampedDt);
        state.headTilt = expApproach(state.headTilt, target.headTilt, 8.5, clampedDt);
        state.headNodY = expApproach(state.headNodY, target.headNodY, 10, clampedDt);
        state.headSwayX = expApproach(state.headSwayX, target.headSwayX, 8, clampedDt);
        state.shoulderY = expApproach(state.shoulderY, target.shoulderY, 5.5, clampedDt);

        // Spring-damper secondary follow-through on lower hair curls reacting to both head yaw & tilt velocity
        const tiltVel = (state.headTilt - prevHeadTilt) / clampedDt;
        const yawVel = (state.headYaw - prevHeadYaw) / clampedDt;
        const nodVel = (state.headNodY - prevHeadNodY) / clampedDt;
        const desiredLagX = target.hairLagX - tiltVel * 0.032 - yawVel * 0.042;
        const desiredLagY = target.hairLagY - nodVel * 0.028;

        const stiffness = 62;
        const damping = 9.2;
        hairVelX += ((desiredLagX - state.hairLagX) * stiffness - hairVelX * damping) * clampedDt;
        hairVelY += ((desiredLagY - state.hairLagY) * stiffness - hairVelY * damping) * clampedDt;
        state.hairLagX = clamp(state.hairLagX + hairVelX * clampedDt, -0.06, 0.06);
        state.hairLagY = clamp(state.hairLagY + hairVelY * clampedDt, -0.04, 0.04);
      }

      state.listenPulse = expApproach(state.listenPulse, target.listenPulse, 9, clampedDt);
      prevHeadTilt = state.headTilt;
      prevHeadYaw = state.headYaw;
      prevHeadNodY = state.headNodY;

      return { ...state };
    },
  };
}

/**
 * Converts RGBA pixels of the transparent black-ink character reference artwork
 * into a sculpted chiaroscuro luminance field for dark-mode halftone dithering.
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
      const ink = alpha * (1 - rgbBright * 0.85);
      inkMask[idx] = ink;

      const nearOut =
        (x > 0 && outside[idx - 1]) ||
        (x + 1 < width && outside[idx + 1]) ||
        (y > 0 && outside[idx - width]) ||
        (y + 1 < height && outside[idx + width]) ||
        (x > 1 && outside[idx - 2]) ||
        (x + 2 < width && outside[idx + 2]);

      if (ink > 0.35) {
        const crownSheen = Math.exp(-(((uy - 0.14) * 5.0) ** 2)) * 0.14;
        const strandWave =
          ux > 0.48 && ux < 0.85 && uy > 0.25 && uy < 0.88
            ? Math.max(0, Math.sin((ux - uy * 0.22) * 34)) * 0.085 * (1 - smoothstep(0.75, 0.92, uy))
            : 0;
        const curlSheen =
          uy > 0.56 ? Math.exp(-(((ux - 0.72) * 4.5) ** 2)) * 0.09 : 0;
        const rimGlow = nearOut ? 0.46 : 0;
        baseLum[idx] = clamp01((0.03 + crownSheen + strandWave + curlSheen + rimGlow) * bottomFade);
      } else {
        const isHeadbandOrShine = uy < 0.36;
        if (isHeadbandOrShine) {
          const bandSheen = 0.85 + Math.exp(-(((ux - 0.52) * 4.0) ** 2)) * 0.12;
          baseLum[idx] = clamp01(bandSheen * bottomFade);
        } else {
          const isEyeZone = ux > 0.16 && ux < 0.45 && uy > 0.39 && uy < 0.475;
          const cheekSpec = Math.exp(-(((ux - 0.24) * 7.2) ** 2 + ((uy - 0.535) * 7.8) ** 2)) * 0.12;
          const noseBridgeSpec = Math.exp(-(((ux - 0.21) * 15.0) ** 2 + ((uy - 0.495) * 8.5) ** 2)) * 0.14;
          const cheekShadow = smoothstep(0.285, 0.50, ux) * 0.36;
          const bangShadow = (1 - smoothstep(0.35, 0.39, uy)) * 0.16;
          const chinNeckShadow = smoothstep(0.62, 0.87, uy) * 0.24;
          const eyeBoost = isEyeZone ? 0.15 : 0;
          const faceLum = 0.62 + cheekSpec + noseBridgeSpec + eyeBoost - cheekShadow - bangShadow - chinNeckShadow;
          baseLum[idx] = clamp01(Math.min(0.86, faceLum) * (1 - ink * 0.94) * bottomFade);
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

interface PrecomputedReferenceFrame {
  time: number;
  energy: number;
  isSpeaking: boolean;
  isListening: boolean;
  motion: PortraitMotionState;
  ct: number;
  st: number;
  glintSweep: number;
  mote1X: number;
  mote1Y: number;
  mote2X: number;
  mote2Y: number;
  mote3X: number;
  mote3Y: number;
}

function buildReferenceFrameConstants(params: PortraitParams): PrecomputedReferenceFrame {
  const motion = params.motion ?? getTargetMotionFromParams(params);
  const { time, energy, isSpeaking, isListening } = params;
  const speed = isSpeaking ? 0.28 : 0.16;

  return {
    time,
    energy,
    isSpeaking,
    isListening,
    motion,
    ct: Math.cos(motion.headTilt),
    st: Math.sin(motion.headTilt),
    glintSweep: (time * 0.46) % 1.15,
    mote1X: 0.08 + Math.sin(time * 3.0) * 0.022,
    mote1Y: 0.44 - ((time * speed) % 0.32),
    mote2X: 0.91 + Math.cos(time * 2.5) * 0.02,
    mote2Y: 0.54 - (((time + 0.45) * speed) % 0.34),
    mote3X: 0.12 + Math.cos(time * 2.2) * 0.018,
    mote3Y: 0.70 - (((time + 0.22) * speed) % 0.28),
  };
}

/**
 * Samples the reference silhouette field at normalized UV (0..1, 0..1) using:
 * - Safe crown/curl framing
 * - 2.5D cylindrical/ellipsoidal depth parallax for headYaw & headPitch turning
 * - Overlapping multi-zone hair, bang, and shoulder breathing kinematics
 * - Sculpted eyelids, eyebrows, happy squints, dual iris catchlights, and audio-synced mouth visemes
 */
function sampleReferenceWithExpression(
  ux: number,
  uy: number,
  fc: PrecomputedReferenceFrame,
  source: PortraitSourceField
): number {
  const { motion, ct, st, energy, isSpeaking } = fc;

  // 1. Safe viewport framing inset so crown arc, turned cheeks & bob curls never clip edges
  const framedX = (ux - 0.50) * 1.105 + 0.49;
  const framedY = (uy - 0.56) * 1.11 + 0.51;

  // 2. Head/collar separation & Live2D-style 2.5D depth parallax (nose & front face lead the turn)
  const headMask = 1 - smoothstep(0.68, 0.88, framedY);
  const hx = framedX - 0.43;
  const hy = framedY - 0.46;

  const faceDome = Math.exp(-(((hx + 0.13) / 0.25) ** 2 + ((hy - 0.02) / 0.29) ** 2));
  // Nose bridge & mouth protrusion: sticks out furthest toward viewer so it leads 2.5D yaw/pitch turns
  const noseDome = Math.exp(-(((framedX - 0.23) / 0.085) ** 2 + ((framedY - 0.54) / 0.14) ** 2));
  const crownDome = Math.exp(-(((framedX - 0.36) / 0.22) ** 2 + ((framedY - 0.22) / 0.16) ** 2));
  const backHairDepth = smoothstep(0.06, 0.40, hx) * (1 - smoothstep(0.64, 0.90, framedY));
  const zDepth = (faceDome * 1.05 + noseDome * 0.48 + crownDome * 0.38 - backHairDepth * 0.78) * headMask;

  // Inverse parallax warp: turning right (headYaw > 0) swings nose/face right & tucks far hair left
  const yawParallaxX = -motion.headYaw * (0.105 * zDepth + 0.016 * headMask);
  const pitchParallaxY = -motion.headPitch * (0.092 * zDepth + 0.014 * headMask);

  // Subtle horizontal cylindrical foreshortening across the turning cheek/face plane
  const faceZone = faceDome * headMask;
  const foreshortenX =
    -hx * motion.headYaw * 0.15 * faceZone +
    (motion.headYaw > 0 ? -0.016 * motion.headYaw * faceZone : 0);

  // 3. Overlapping multi-zone kinematics around neck pivot (0.38, 0.74)
  const lowerFactor = smoothstep(0.45, 0.90, framedY);
  const bangFactor = (1 - smoothstep(0.28, 0.42, framedY)) * smoothstep(0.10, 0.32, framedX);
  const shoulderFactor = smoothstep(0.70, 0.94, framedY);

  const localSwayX =
    motion.headSwayX +
    motion.hairLagX * lowerFactor +
    motion.hairLagX * 0.38 * bangFactor;
  const localNodY =
    lerp(motion.headNodY, motion.shoulderY, shoulderFactor) +
    motion.hairLagY * lowerFactor;

  const pivotX = 0.38;
  const pivotY = 0.74;
  const dx = framedX + yawParallaxX + foreshortenX - pivotX - localSwayX;
  const dy = framedY + pitchParallaxY - pivotY - localNodY;

  let ax = pivotX + dx * ct - dy * st;
  let ay = pivotY + dx * st + dy * ct;

  // 4. Coupled downward jaw & chin articulation when mouth opens wide
  const jawAmt = clamp01(motion.jawDrop + motion.mouthOpen * 0.12);
  if (jawAmt > 0.04 && ay > 0.630 && ay < 0.790 && ax > 0.190 && ax < 0.460) {
    const latW = smoothstep(0.190, 0.228, ax) * (1 - smoothstep(0.320, 0.460, ax));
    const vertW = smoothstep(0.630, 0.675, ay) * (1 - smoothstep(0.738, 0.790, ay));
    ay -= jawAmt * 0.030 * latW * vertW;
  }

  if (ax < 0 || ax > 1 || ay < 0 || ay > 1) {
    return 0;
  }

  const sampled = sampleSourceBilinear(source, ax, ay);
  let lum = sampled.lum;

  // 2.5D key-light cheek & nose shading shift as head turns toward/away from studio key light
  if (sampled.ink < 0.35 && faceZone > 0.1 && Math.abs(motion.headYaw) > 0.02) {
    const cheekArea = smoothstep(0.18, 0.46, ax) * smoothstep(0.38, 0.65, ay) * (1 - smoothstep(0.65, 0.76, ay));
    lum = clamp01(lum + motion.headYaw * 0.20 * cheekArea);
  }

  // 5. Dynamic Eyebrow Micro-Expressions (lift on emphasis/alert/thinking, narrow on focus)
  if (Math.abs(motion.browLift) > 0.08 && sampled.ink < 0.55) {
    const bOffset = -motion.browLift * 0.014;
    const dBrowL = sdCapsule2(ax, ay, 0.195, 0.392 + bOffset, 0.240, 0.386 + bOffset * 0.85, 0.0042);
    const dBrowR = sdCapsule2(ax, ay, 0.330, 0.376 + bOffset * 0.9, 0.415, 0.372 + bOffset * 0.75, 0.0048);
    const dBrows = Math.min(dBrowL, dBrowR);
    if (dBrows < 0.006) {
      const bMask = (1 - smoothstep(-0.002, 0.0042, dBrows)) * clamp01(Math.abs(motion.browLift));
      lum *= 1 - bMask * 0.74;
    }
  }

  // 6. Template-Calibrated Blinking Sequence:
  // Natural Open -> Half-Closed (skin lid + heavy rim + visible lower iris + crease) -> Closed (clean skin + bowed lash + outer tick + fold crease)
  const blink = motion.blink;
  if (blink > 0.05) {
    // Progressive upper lid closure + slight lower lid rise at full closure
    const upperDropL = lerp(0.414, 0.453, blink);
    const upperDropR = lerp(0.402, 0.445, blink);
    const lowerRise = smoothstep(0.55, 1.0, blink) * 0.010;
    const botL = 0.465 - lowerRise;
    const botR = 0.468 - lowerRise;

    // Clear upper iris & upper lash cleanly with matching stippled skin tone
    const inEyeXL = 1 - smoothstep(0.030, 0.041, Math.abs(ax - 0.218));
    const inEyeXR = 1 - smoothstep(0.049, 0.064, Math.abs(ax - 0.380));
    const skinToneL = 0.70;
    const skinToneR = clamp01(0.67 - smoothstep(0.32, 0.46, ax) * 0.24);

    // Wipe above dropped upper lid down to upperDrop (+ full lower-lash wipe when nearly closed)
    const wipeBotL = blink > 0.64 ? lerp(upperDropL, 0.476, smoothstep(0.64, 0.88, blink)) : upperDropL;
    const wipeBotR = blink > 0.64 ? lerp(upperDropR, 0.478, smoothstep(0.64, 0.88, blink)) : upperDropR;

    if (inEyeXL > 0.02 && ay > 0.394 && ay < wipeBotL + 0.004) {
      const vMask = smoothstep(0.394, 0.404, ay) * (1 - smoothstep(wipeBotL - 0.004, wipeBotL + 0.004, ay));
      const mask = inEyeXL * vMask * smoothstep(0.04, 0.20, blink);
      lum = lerp(lum, skinToneL, mask * 0.98);
    }
    if (inEyeXR > 0.02 && ay > 0.384 && ay < wipeBotR + 0.004) {
      const vMask = smoothstep(0.384, 0.395, ay) * (1 - smoothstep(wipeBotR - 0.004, wipeBotR + 0.004, ay));
      const mask = inEyeXR * vMask * smoothstep(0.04, 0.20, blink);
      lum = lerp(lum, skinToneR, mask * 0.98);
    }

    // Also soften lower sclera/rim subtly on full close
    if (blink > 0.70) {
      const lowCleanL = inEyeXL * smoothstep(botL - 0.004, botL + 0.005, ay) * (1 - smoothstep(botL + 0.005, 0.476, ay));
      const lowCleanR = inEyeXR * smoothstep(botR - 0.004, botR + 0.005, ay) * (1 - smoothstep(botR + 0.005, 0.478, ay));
      const fullClean = smoothstep(0.70, 0.92, blink);
      if (lowCleanL > 0.02) lum = lerp(lum, skinToneL, lowCleanL * fullClean * 0.92);
      if (lowCleanR > 0.02) lum = lerp(lum, skinToneR, lowCleanR * fullClean * 0.92);
    }

    // Subtle upper-eyelid fold crease floating ~0.016 above the dropped upper lid (matches template Half-Closed & Closed!)
    const creaseCurveL = (((ax - 0.218) / 0.032) ** 2) * 0.003;
    const creaseCurveR = (((ax - 0.380) / 0.056) ** 2) * 0.004;
    const dCreaseL = sdCapsule2(ax, ay + creaseCurveL, 0.194, upperDropL - 0.015, 0.242, upperDropL - 0.016, 0.0018);
    const dCreaseR = sdCapsule2(ax, ay + creaseCurveR, 0.332, upperDropR - 0.016, 0.428, upperDropR - 0.018, 0.0020);
    const dCrease = Math.min(dCreaseL, dCreaseR);
    if (dCrease < 0.004) {
      const cMask = (1 - smoothstep(-0.001, 0.003, dCrease)) * smoothstep(0.20, 0.75, blink);
      lum *= 1 - cMask * 0.38;
    }

    // Crisp bowed upper eyelash rim (smoothly transitions from Half-Closed lid edge -> bowed Closed lash + outer corner flick)
    const lashBaseL = lerp(upperDropL, 0.453, smoothstep(0.65, 1.0, blink));
    const lashBaseR = lerp(upperDropR, 0.447, smoothstep(0.65, 1.0, blink));
    // Closed eyes curve gently downward in the center and lift cleanly at inner/outer corners
    const arcShapeL = -(((ax - 0.218) / 0.030) ** 2) * lerp(-0.0025, 0.0056, blink);
    const arcShapeR = -(((ax - 0.380) / 0.054) ** 2) * lerp(-0.003, 0.0072, blink);
    const dLashMainL = sdCapsule2(ax, ay + arcShapeL, 0.190, lashBaseL, 0.244, lashBaseL - 0.002, 0.0040);
    const dLashMainR = sdCapsule2(ax, ay + arcShapeR, 0.328, lashBaseR + 0.001, 0.433, lashBaseR - 0.003, 0.0047);
    // Delicate outer-corner eyelash wing on outer left & outer right edges
    const dWingL = sdCapsule2(ax, ay, 0.190, lashBaseL - 0.002, 0.182, lashBaseL - 0.007, 0.0026);
    const dWingR = sdCapsule2(ax, ay, 0.431, lashBaseR - 0.003, 0.443, lashBaseR - 0.009, 0.0030);
    const dLashes = Math.min(Math.min(dLashMainL, dLashMainR), Math.min(dWingL, dWingR));
    if (dLashes < 0.007) {
      const lashMask = (1 - smoothstep(-0.002, 0.0046, dLashes)) * smoothstep(0.14, 0.52, blink);
      lum *= 1 - lashMask * 0.96;
    }

    // During half-closed stage, preserve a scaled lower catchlight sparkle beneath the descending lid
    if (blink < 0.62) {
      const gx = motion.gazeX * 0.008;
      const gy = motion.gazeY * 0.005;
      const halfCatch = 1 - smoothstep(0.15, 0.58, blink);
      const dHalfCatch = sdEllipse(ax, ay, 0.364 + gx, 0.436 + gy, 0.0068, 0.0065);
      if (dHalfCatch < 0.004 && ay > lashBaseR + 0.004) {
        const cMask = (1 - smoothstep(-0.002, 0.003, dHalfCatch)) * halfCatch;
        lum = Math.max(lum, cMask * 0.94);
      }
    }
  } else {
    // Natural Open Eyes: soft cheek warmth strictly below lower lash + crisp dual iris catchlights
    if (motion.squint > 0.18) {
      const lift = motion.squint * 0.006;
      const cheekWarmL = sdEllipse(ax, ay, 0.218, 0.482 - lift, 0.036, 0.012);
      const cheekWarmR = sdEllipse(ax, ay, 0.378, 0.482 - lift, 0.052, 0.013);
      const dSquint = Math.min(cheekWarmL, cheekWarmR);
      if (dSquint < 0.008) {
        const sMask = (1 - smoothstep(-0.003, 0.006, dSquint)) * motion.squint * 0.65;
        const cheekTone = clamp01(0.70 - smoothstep(0.28, 0.48, ax) * 0.20);
        lum = lerp(lum, cheekTone, sMask);
      }
    }

    const gx = motion.gazeX * 0.010;
    const gy = motion.gazeY * 0.006;
    const catchScale = 1 + motion.wide * 0.2 + motion.squint * 0.08;
    const catchR = 0.0072 * catchScale;
    const dCatchL = sdEllipse(ax, ay, 0.214 + gx, 0.428 + gy, catchR * 0.85, catchR);
    const dCatchR = sdEllipse(ax, ay, 0.360 + gx, 0.422 + gy, catchR, catchR);
    const dSubCatchR = sdEllipse(ax, ay, 0.396 + gx * 0.65, 0.440 + gy * 0.65, catchR * 0.52, catchR * 0.52);
    const dCatch = Math.min(dCatchL, Math.min(dCatchR, dSubCatchR));
    if (dCatch < 0.004) {
      const cMask = 1 - smoothstep(-0.002, 0.003, dCatch);
      lum = Math.max(lum, cMask * 0.98);
    }
  }

  // 7. Reference-Calibrated 10-Shape Talking Articulation at Resting Lip Center (mx = 0.274, my = 0.614):
  // Closed, Natural/Rest, M/B/P, F/V, Slightly Open (Ah/Uh), Wide Open (A/Ha), Rounded (O/Oo), Wide (Ee), L/Th
  const mxBase = 0.274;
  const my = 0.614;
  const openAmt = motion.mouthOpen;
  const smileAmt = motion.smile;
  const lipPress = motion.lipPress;
  const lipBite = motion.lipBite;
  const restPart = motion.restPart;
  const roundAmt = clamp01(motion.mouthRound);
  const wideStretch = clamp01((motion.mouthWidth - 0.94) / 0.40) * (1 - roundAmt);
  const isPureClosed =
    openAmt <= 0.03 && lipPress < 0.08 && lipBite < 0.08 && restPart < 0.08 && smileAmt <= 0.32;

  if (isPureClosed) {
    // Refine resting ink notch into a clean closed lip seal matching Reference Panel 1 (Closed)
    if (ax >= 0.232 && ax <= 0.318 && ay >= 0.592 && ay <= 0.646) {
      const dPatch = sdEllipse(ax, ay, 0.273, 0.616, 0.035, 0.020);
      if (dPatch < 0.006) {
        const pMask = 1 - smoothstep(-0.003, 0.005, dPatch);
        const skinGrad = clamp01(0.73 - smoothstep(0.245, 0.335, ax) * 0.16);
        lum = lerp(lum, skinGrad, pMask * 0.92);
      }
      const bowCurve = (((ax - 0.272) * 26) ** 2) * 0.0022;
      const dClosedLine = sdCapsule2(ax, ay - bowCurve, 0.246, 0.615, 0.300, 0.613, 0.0026);
      if (dClosedLine < 0.005 && ax >= 0.232) {
        const cMask = 1 - smoothstep(-0.002, 0.0034, dClosedLine);
        lum = lerp(lum, 0.015, cMask * 0.92);
      }
      const dUnderLip = sdEllipse(ax, ay, 0.272, 0.625, 0.014, 0.0032);
      if (dUnderLip < 0.004) {
        const uMask = 1 - smoothstep(-0.002, 0.003, dUnderLip);
        lum = Math.max(lum, uMask * 0.78);
      }
    }
  } else {
    const isSmileOnly =
      openAmt <= 0.05 && lipPress < 0.15 && lipBite < 0.15 && restPart < 0.15 && smileAmt > 0.32;

    if (isSmileOnly) {
      // Closed gentle smile lifting outer lip corner slightly while preserving cupid's bow
      const dOuterCornerPatch = sdEllipse(ax, ay, 0.294, 0.616, 0.024, 0.016);
      if (dOuterCornerPatch < 0.006 && ax >= 0.232) {
        const pMask = (1 - smoothstep(-0.003, 0.005, dOuterCornerPatch)) * smileAmt * 0.65;
        lum = lerp(lum, 0.68, pMask);
      }
      const smileLift = (((ax - 0.272) * 24) ** 2) * (0.0034 + smileAmt * 0.0018);
      const dSmile = sdCapsule2(ax, ay + smileLift, 0.245, 0.615, 0.306, 0.612, 0.0030);
      if (dSmile < 0.005 && ax >= 0.232) {
        const sMask = (1 - smoothstep(-0.002, 0.0038, dSmile)) * Math.min(1, smileAmt * 0.95);
        lum = lerp(lum, 0.015, sMask * 0.88);
      }
    } else {
      const isRoundO = roundAmt > 0.50;
      const isWideEe = !isRoundO && (motion.teethBottom > 0.35 || wideStretch > 0.48);
      const isFv = !isRoundO && lipBite > 0.42;
      const isRest = !isRoundO && restPart > 0.45 && openAmt < 0.16;

      // Wide / Ee shifts gently onto the 3/4 cheek plane so both teeth rows & corners stay crisp inside jawline
      const mx = isWideEe ? 0.283 : mxBase;
      const activeBlend = clamp01(
        Math.max(openAmt * 3.0, lipPress * 1.4, lipBite * 1.4, restPart * 1.2)
      );

      // Erase resting mouth notch cleanly within cheek interior (never crossing left jawline at ax < 0.228)
      const cleanW = lerp(0.038, 0.052, Math.max(openAmt, wideStretch, lipPress * 0.72));
      const cleanH = lerp(0.024, 0.038, Math.max(openAmt, lipBite * 0.5));
      if (ax >= 0.228 && ax <= 0.340 && ay >= 0.578 && ay <= 0.672) {
        const dPatch = sdEllipse(ax, ay, 0.278, 0.616, cleanW, cleanH);
        if (dPatch < 0.008) {
          const pMask = (1 - smoothstep(-0.004, 0.006, dPatch)) * activeBlend;
          const skinGrad = clamp01(0.73 - smoothstep(0.245, 0.345, ax) * 0.17);
          lum = lerp(lum, skinGrad, pMask * 0.97);
        }
      }

      if (lipPress > 0.45 && openAmt < 0.14) {
        // Bilabial M / B / P: crisp wide pressed horizontal lip seal with corner inward dimples
        const pressBlend = smoothstep(0.2, 0.75, lipPress);
        const cornerCurve = (((ax - 0.274) * 30) ** 2) * 0.0014;
        const dSeal = sdCapsule2(ax, ay - cornerCurve, 0.241, 0.615, 0.308, 0.613, 0.0034);
        if (dSeal < 0.005 && ax >= 0.228) {
          const sMask = (1 - smoothstep(-0.002, 0.0036, dSeal)) * pressBlend;
          lum = lerp(lum, 0.015, sMask * 0.96);
        }
        // Subtle corner tension ticks
        const dTickL = sdCapsule2(ax, ay, 0.241, 0.612, 0.242, 0.618, 0.0018);
        const dTickR = sdCapsule2(ax, ay, 0.307, 0.610, 0.308, 0.616, 0.0018);
        const dTicks = Math.min(dTickL, dTickR);
        if (dTicks < 0.004 && ax >= 0.228) {
          const tMask = (1 - smoothstep(-0.002, 0.003, dTicks)) * pressBlend;
          lum = lerp(lum, 0.02, tMask * 0.88);
        }
        // Subtle pressed lip cushion highlight directly below the seal
        const dPressGlow = sdEllipse(ax, ay, 0.274, 0.624, 0.019, 0.0042);
        if (dPressGlow < 0.005 && ax >= 0.228) {
          const gMask = (1 - smoothstep(-0.002, 0.0035, dPressGlow)) * pressBlend;
          lum = Math.max(lum, gMask * 0.84);
        }
      } else {
        // Articulatory aperture (Natural/Rest, F/V, Ah/Uh, A/Ha, O/Oo, Wide/Ee, L/Th)
        const rx = isRoundO
          ? lerp(0.014, 0.022, openAmt)
          : isWideEe
          ? lerp(0.034, 0.038, Math.max(openAmt, wideStretch))
          : isFv
          ? 0.030
          : isRest
          ? 0.022
          : openAmt < 0.45
          ? lerp(0.028, 0.031, openAmt / 0.45) // Slightly Open (Ah/Uh) crisp wide oval
          : lerp(0.031, 0.036, (openAmt - 0.45) / 0.55); // Wide Open (A/Ha)

        const ry = isRoundO
          ? lerp(0.016, 0.026, openAmt)
          : isWideEe
          ? lerp(0.0165, 0.020, openAmt)
          : isFv
          ? 0.0125
          : isRest
          ? 0.0062
          : openAmt < 0.45
          ? lerp(0.011, 0.014, openAmt / 0.45) // Slightly Open (Ah/Uh) distinct teeth + dark slit
          : lerp(0.018, 0.035, (openAmt - 0.45) / 0.55); // Wide Open (A/Ha) tall jaw drop

        const cy = my + lerp(0.000, 0.012, motion.jawDrop);
        const slantY = isWideEe ? (ax - mx) * -0.032 : isFv ? (ax - mx) * -0.018 : 0;
        const mouthLocalY = ay - slantY;

        const normX = (ax - mx) / (rx || 0.01);
        const cornerLift = isWideEe ? Math.max(0, normX * normX - 0.20) * -0.0028 : 0;
        const topFlatten = isWideEe
          ? Math.max(0, 1 - normX * normX) * 0.0024 + cornerLift
          : isFv
          ? Math.max(0, 1 - normX * normX) * 0.0018
          : 0;

        const lipBorder = isWideEe ? 0.0034 : isRest || isFv ? 0.0024 : 0.0036;
        const dOuterLip = sdEllipse(
          ax,
          mouthLocalY + topFlatten * 0.5,
          mx,
          cy,
          rx + lipBorder,
          ry + lipBorder
        );
        const dCavity = sdEllipse(ax, mouthLocalY + topFlatten, mx, cy, rx, ry);

        if (dOuterLip < 0.0055 && ax >= 0.230) {
          const lipRim = (1 - smoothstep(-0.002, 0.0034, dOuterLip)) * activeBlend;
          if (isWideEe) {
            lum = lerp(lum, 0.02, lipRim * 0.90);
          } else if (isRest) {
            lum *= 1 - lipRim * 0.58;
          } else {
            lum *= 1 - lipRim * 0.80;
          }
        }

        if (dCavity < 0.005 && ax >= 0.230) {
          const cMask = (1 - smoothstep(-0.002, 0.0030, dCavity)) * activeBlend;
          // Deep crisp oral interior (protected dark anchor <= 0.025)
          lum = lerp(lum, 0.012, cMask * 0.98);

          // 1) Crisp white upper teeth row (Ah/Uh, A/Ha, Wide/Ee, L/Th, F/V, subtle Rest)
          if (motion.teethTop > 0.12 && !isRoundO) {
            const teethCutoff = isFv
              ? cy + 0.0008 // Upper teeth extend horizontally onto lower lip
              : isWideEe
              ? cy - 0.0020 // Crisp upper teeth bar above central dark smile gap
              : isRest
              ? cy + ry * 0.06
              : openAmt < 0.45
              ? cy - ry * 0.10 // Ah/Uh: bright upper teeth top-row leaving dark lower slit
              : cy - ry * 0.40; // A/Ha: clean curved upper teeth arch at top of deep throat cavity
            const teethSpan = isFv ? 0.86 : isWideEe ? 0.88 : 0.85;
            if (mouthLocalY < teethCutoff && Math.abs(normX) < teethSpan) {
              const tEdge = 1 - smoothstep(teethCutoff - 0.0020, teethCutoff + 0.0004, mouthLocalY);
              const tBright = isRest ? 0.72 : lerp(0.88, 0.98, motion.teethTop);
              lum = Math.max(lum, tBright * tEdge * cMask);
            }
          }

          // 2) Wide / Ee crisp lower teeth bar separated by a clean thin dark smile gap
          if (motion.teethBottom > 0.2 && !isRoundO && !isFv) {
            const lowTeethTop = cy + 0.0022;
            if (mouthLocalY > lowTeethTop && Math.abs(normX) < 0.84) {
              const ltEdge = smoothstep(lowTeethTop, lowTeethTop + 0.0022, mouthLocalY);
              lum = Math.max(lum, 0.96 * motion.teethBottom * ltEdge * cMask);
            }
          }

          // 3) Tongue inside cavity:
          //    - L/Th: bright raised tongue tip pressing behind upper teeth with crisp dark side pockets
          //    - A/Ha: subtle darker-halftone tongue low on floor so deep open throat stays starkly black
          if (motion.tongueShow > 0.18 && !isRoundO && !isFv) {
            if (motion.tongueLift > 0.35) {
              const dTongueTip = sdEllipse(
                ax,
                mouthLocalY,
                mx,
                cy + ry * 0.26,
                rx * 0.38,
                ry * 0.48
              );
              if (dTongueTip < 0.005) {
                const tgMask = (1 - smoothstep(-0.002, 0.0028, dTongueTip)) * motion.tongueShow * cMask;
                lum = Math.max(lum, 0.84 * tgMask);
              }
            } else {
              const dFloorTongue = sdEllipse(
                ax,
                mouthLocalY,
                mx + 0.002,
                cy + ry * 0.66,
                rx * 0.56,
                ry * 0.30
              );
              if (dFloorTongue < 0.005) {
                const tgMask = (1 - smoothstep(-0.002, 0.003, dFloorTongue)) * motion.tongueShow * cMask;
                lum = Math.max(lum, 0.43 * tgMask);
              }
            }
          }

          // 4) F/V raised lower lip cushion tucking directly beneath upper teeth
          if (lipBite > 0.35) {
            const dTuckLip = sdEllipse(ax, mouthLocalY, mx, cy + ry * 0.44, rx * 0.84, ry * 0.48);
            if (dTuckLip < 0.005 && mouthLocalY > cy + 0.0020) {
              const bMask = (1 - smoothstep(-0.002, 0.0026, dTuckLip)) * lipBite * cMask;
              lum = Math.max(lum, 0.96 * bMask);
            }
          }
        }

        // Luminous pursed O/Oo lip highlight ring around the rounded cavity
        if (motion.puckerRing > 0.20) {
          const dRing = Math.abs(sdEllipse(ax, mouthLocalY, mx + 0.001, cy + 0.001, rx + 0.0066, ry + 0.0066)) - 0.0038;
          if (dRing < 0.005 && ax >= 0.228) {
            const rMask = (1 - smoothstep(-0.002, 0.0035, dRing)) * motion.puckerRing * activeBlend;
            lum = Math.max(lum, rMask * 0.88);
          }
        }

        // Clean luminous lower-lip crescent directly below cavity
        const lowerOffset = isFv ? ry * 0.68 + 0.0024 : ry + 0.0056;
        const dLowerLipRim = sdEllipse(
          ax,
          mouthLocalY,
          mx + 0.001,
          cy + lowerOffset,
          rx * (isRoundO ? 0.72 : 0.80),
          0.0038
        );
        if (dLowerLipRim < 0.005 && ax >= 0.228) {
          const lMask = (1 - smoothstep(-0.002, 0.0035, dLowerLipRim)) * activeBlend;
          lum = Math.max(lum, lMask * 0.86);
        }
      }
    }
  }

  // 8. Traveling specular glint along headband & bangs during listening/speaking
  const aura = motion.listenPulse;
  if (aura > 0.06 && sampled.ink < 0.35 && ay < 0.28 && lum > 0.4) {
    const wave = Math.exp(-(((ax - fc.glintSweep) * 7.5) ** 2));
    lum = clamp01(lum + wave * aura * (0.15 + energy * 0.16));
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

  const yawShift = params.motion ? params.motion.headYaw * 0.14 : Math.sin(time * 0.72) * 0.02;
  const fx = x + 0.11 - yawShift;
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

  const dHeadband = Math.abs(sdEllipse(x, y, 0.01, -0.02, 0.32, 0.55)) - 0.038;

  const radialFade = 1 - smoothstep(0.72, 1.0, Math.hypot(x * 0.88, y * 0.92));
  const bottomFade = 1 - smoothstep(0.55, 0.94, y);

  let lum = 0;

  if (dHair < 0.065) {
    const hairMask = 1 - smoothstep(-0.02, 0.05, dHair);
    const rim = smoothstep(-0.055, 0.0, dHair) * (1 - smoothstep(0.0, 0.045, dHair));
    const zigSheen = Math.exp(-(((y + 0.36 + Math.sin(x * 22) * 0.025) * 8) ** 2)) * 0.65;
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

// Reusable typed scratch buffers for Braille subpixel dithering to avoid GC pressure at 60fps
let cachedSubLen = 0;
let rawSubBuf = new Float32Array(0);
let workSubBuf = new Float32Array(0);

function ensureSubBuffers(len: number) {
  if (len <= cachedSubLen) return;
  cachedSubLen = len;
  rawSubBuf = new Float32Array(len);
  workSubBuf = new Float32Array(len);
}

/**
 * Renders a monochrome Unicode Braille (U+2800..U+28FF) halftone ASCII portrait frame
 * using 2x4 subpixel Serpentine Bill Atkinson Error Diffusion + Unsharp Contour Boost.
 */
export function renderHalftonePortrait(params: PortraitParams): PortraitFrame {
  const { cols, rows, sourceField } = params;
  const cells = new Uint8Array(cols * rows);
  const lines: string[] = new Array(rows);
  const aspect = (cols * 0.53) / Math.max(1, rows);
  const fc = sourceField ? buildReferenceFrameConstants(params) : null;

  const subW = cols * 2;
  const subH = rows * 4;
  ensureSubBuffers(subW * subH);
  const raw = rawSubBuf;
  const work = workSubBuf;

  // 1. Sample 2x4 subpixel luminance buffer directly from reference artwork / 2D field
  if (sourceField && fc) {
    for (let sy = 0; sy < subH; sy++) {
      const uy = (sy + 0.5) / subH;
      const rowOff = sy * subW;
      for (let sx = 0; sx < subW; sx++) {
        const ux = (sx + 0.5) / subW;
        raw[rowOff + sx] = sampleReferenceWithExpression(ux, uy, fc, sourceField);
      }
    }
  } else {
    for (let sy = 0; sy < subH; sy++) {
      const uy = (sy + 0.5) / subH;
      const ny = uy * 2 - 1;
      const rowOff = sy * subW;
      for (let sx = 0; sx < subW; sx++) {
        const ux = (sx + 0.5) / subW;
        const nx = (ux * 2 - 1) * aspect;
        raw[rowOff + sx] = samplePortraitLuminance(nx, ny, params);
      }
    }
  }

  // 2. Unsharp contrast boost so hair highlights, lashes, catchlights & mouth teeth/cavity stay crisp
  for (let sy = 0; sy < subH; sy++) {
    const rowOff = sy * subW;
    const upOff = Math.max(0, sy - 1) * subW;
    const dnOff = Math.min(subH - 1, sy + 1) * subW;
    for (let sx = 0; sx < subW; sx++) {
      const idx = rowOff + sx;
      const c = raw[idx];
      // Preserve crisp feature anchors (solid teeth/catchlights vs deep oral cavity) from unsharp ringing
      if (c >= 0.94 || c <= 0.025) {
        work[idx] = c;
        continue;
      }
      const l = raw[rowOff + Math.max(0, sx - 1)];
      const r = raw[rowOff + Math.min(subW - 1, sx + 1)];
      const u = raw[upOff + sx];
      const d = raw[dnOff + sx];
      const avg = (l + r + u + d) * 0.25;
      const sharpened = c + (c - avg) * 0.42;
      work[idx] = clamp01(smoothstep(0.03, 0.97, sharpened));
    }
  }

  // 3. Serpentine Bill Atkinson Error Diffusion with feature-anchor protection
  for (let sy = 0; sy < subH; sy++) {
    const forward = (sy & 1) === 0;
    const startX = forward ? 0 : subW - 1;
    const endX = forward ? subW : -1;
    const dir = forward ? 1 : -1;
    const rowOff = sy * subW;
    const bayerRow = (sy & 3) * 4;

    for (let sx = startX; sx !== endX; sx += dir) {
      const idx = rowOff + sx;
      const rawVal = raw[idx];
      const isBrightAnchor = rawVal >= 0.94;
      const isDarkAnchor = rawVal <= 0.025;
      const oldVal = work[idx];
      const jitter = (isBrightAnchor || isDarkAnchor) ? 0 : BAYER_4X4[bayerRow + (sx & 3)] * 0.1;
      const newVal = isBrightAnchor
        ? 1
        : isDarkAnchor
        ? 0
        : oldVal >= 0.47 + jitter
        ? 1
        : 0;
      work[idx] = newVal;
      // Don't dump harsh boundary error across locked teeth / deep cavity features
      const err = (isBrightAnchor || isDarkAnchor) ? 0 : (oldVal - newVal) * 0.125;

      const nx1 = sx + dir;
      const nx2 = sx + dir * 2;
      const px1 = sx - dir;

      if (nx1 >= 0 && nx1 < subW) work[rowOff + nx1] += err;
      if (nx2 >= 0 && nx2 < subW) work[rowOff + nx2] += err;
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
        const bitBase = py * 2;
        for (let px = 0; px < 2; px++) {
          const pIdx = rowOff + c * 2 + px;
          lumSum += raw[pIdx];
          if (work[pIdx] >= 0.5) {
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
