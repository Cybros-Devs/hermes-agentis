import type { BrailleShapeKind } from './brailleShapesEngine';

export type IdleAnimationSetId =
  | 'tactician'
  | 'celestial'
  | 'scholar'
  | 'idol'
  | 'neko'
  | 'trickster';

export type IdleMouthMode = 'default' | 'smile' | 'cat' | 'hum' | 'yawn' | 'grin' | 'o';

export type IdleHandPose =
  | 'none'
  | 'chinTap'
  | 'salute'
  | 'clasp'
  | 'tome'
  | 'mug'
  | 'peace'
  | 'cheer'
  | 'pawSwipe'
  | 'peek'
  | 'wave'
  | 'juggle';

export type IdlePropKind =
  | 'none'
  | 'radar'
  | 'orbit'
  | 'sparkle'
  | 'steam'
  | 'bubbles'
  | 'note'
  | 'orb'
  | 'heart'
  | 'zzz';

export interface IdleActionDef {
  id: string;
  label: string;
}

export interface IdleAnimationSetMeta {
  id: IdleAnimationSetId;
  label: string;
  actions: readonly [
    IdleActionDef,
    IdleActionDef,
    IdleActionDef,
    IdleActionDef,
    IdleActionDef,
    IdleActionDef,
  ];
}

export interface IdlePoseDeltas {
  headX: number;
  headY: number;
  tilt: number;
  gazeX: number;
  gazeY: number;
  blinkLeft: number;
  blinkRight: number;
  happyEyes: number;
  wideEyes: number;
  squintEyes: number;
  mouthMode: IdleMouthMode;
  earLeft: number;
  earRight: number;
  tailWag: number;
  hairSway: number;
  haloLift: number;
  haloSpin: number;
  wingOpen: number;
  ahogeBounce: number;
  hoodLift: number;
  hoodScaleX: number;
  squashY: number;
  hand: IdleHandPose;
  handPhase: number;
  prop: IdlePropKind;
  propPhase: number;
}

export interface IdleActionFrame {
  setId: IdleAnimationSetId;
  actionIndex: number;
  actionId: string;
  actionLabel: string;
  isResting: boolean;
  envelope: number;
  phase: number;
  pose: IdlePoseDeltas;
}

export const IDLE_ACTION_SLOT_SECONDS = 4.0;
export const IDLE_ACTIVE_END_SECONDS = 3.15;
export const IDLE_EASE_IN_SECONDS = 0.45;
export const IDLE_EASE_OUT_START_SECONDS = 2.65;
export const IDLE_ACTIONS_PER_SET = 6;
export const IDLE_FULL_LOOP_SECONDS = IDLE_ACTION_SLOT_SECONDS * IDLE_ACTIONS_PER_SET;

export const NEUTRAL_IDLE_POSE: IdlePoseDeltas = {
  headX: 0,
  headY: 0,
  tilt: 0,
  gazeX: 0,
  gazeY: 0,
  blinkLeft: 0,
  blinkRight: 0,
  happyEyes: 0,
  wideEyes: 0,
  squintEyes: 0,
  mouthMode: 'default',
  earLeft: 0,
  earRight: 0,
  tailWag: 0,
  hairSway: 0,
  haloLift: 0,
  haloSpin: 0,
  wingOpen: 0,
  ahogeBounce: 0,
  hoodLift: 0,
  hoodScaleX: 0,
  squashY: 0,
  hand: 'none',
  handPhase: 0,
  prop: 'none',
  propPhase: 0,
};

export const IDLE_ANIMATION_SETS: Record<IdleAnimationSetId, IdleAnimationSetMeta> = {
  tactician: {
    id: 'tactician',
    label: 'Cyber Tactician',
    actions: [
      { id: 'radar-scan', label: 'Radar Scan' },
      { id: 'chin-tap', label: 'Chin Tap' },
      { id: 'visor-adjust', label: 'Headset Adjust' },
      { id: 'affirm-nod', label: 'Affirmative Nod' },
      { id: 'signal-wave', label: 'Signal Wave' },
      { id: 'calm-wink', label: 'Calm Wink' },
    ],
  },
  celestial: {
    id: 'celestial',
    label: 'Celestial Seraph',
    actions: [
      { id: 'halo-spin', label: 'Halo Orbit' },
      { id: 'halo-polish', label: 'Halo Polish' },
      { id: 'wing-flutter', label: 'Wing Flutter' },
      { id: 'serene-pray', label: 'Serene Clasp' },
      { id: 'blessing-sparkle', label: 'Blessing Sparkle' },
      { id: 'sleepy-sway', label: 'Dreamy Sway' },
    ],
  },
  scholar: {
    id: 'scholar',
    label: 'Cozy Scholar',
    actions: [
      { id: 'hood-snuggle', label: 'Hood Snuggle' },
      { id: 'drowsy-yawn', label: 'Drowsy Yawn' },
      { id: 'page-turn', label: 'Tome Flip' },
      { id: 'thought-bubble', label: 'Thought Bubbles' },
      { id: 'head-nod-doze', label: 'Sleepy Doze' },
      { id: 'warm-sip', label: 'Warm Cocoa Sip' },
    ],
  },
  idol: {
    id: 'idol',
    label: 'Starlight Idol',
    actions: [
      { id: 'twintail-bounce', label: 'Twintail Bounce' },
      { id: 'idol-peace', label: 'Idol Peace Wink' },
      { id: 'star-cheer', label: 'Star Cheer' },
      { id: 'mic-hum', label: 'Melody Hum' },
      { id: 'ahoge-boing', label: 'Ahoge Boing' },
      { id: 'curtsy-bow', label: 'Stage Bow' },
    ],
  },
  neko: {
    id: 'neko',
    label: 'Stealth Neko',
    actions: [
      { id: 'ear-flick', label: 'Radar Ear Flick' },
      { id: 'paw-swipe', label: 'Playful Paw' },
      { id: 'tail-swish', label: 'Tail Swish' },
      { id: 'prowl-crouch', label: 'Stealth Prowl' },
      { id: 'purr-curl', label: 'Happy Purr' },
      { id: 'ear-groom', label: 'Ear Groom' },
    ],
  },
  trickster: {
    id: 'trickster',
    label: 'Spirit Trickster',
    actions: [
      { id: 'floppy-ear-hop', label: 'Bounce Hop' },
      { id: 'kitsune-peek', label: 'Sleeve Peek' },
      { id: 'orb-juggle', label: 'Spirit Orbs' },
      { id: 'cheek-puff', label: 'Cheek Pout' },
      { id: 'spin-perk', label: 'Joyful Perk' },
      { id: 'wave-hello', label: 'Friendly Wave' },
    ],
  },
};

export const IDLE_SET_ORDER: readonly IdleAnimationSetId[] = [
  'tactician',
  'celestial',
  'scholar',
  'idol',
  'neko',
  'trickster',
];

const SHAPE_TO_IDLE_SET: Record<BrailleShapeKind, IdleAnimationSetId> = {
  clover: 'tactician',
  triangle: 'tactician',
  trapezoid: 'celestial',
  pebble: 'scholar',
  star: 'idol',
  ghost: 'neko',
  blob: 'neko',
  cloud: 'trickster',
  heart: 'trickster',
};

export function resolveIdleSetForShape(shape: BrailleShapeKind): IdleAnimationSetId {
  return SHAPE_TO_IDLE_SET[shape] ?? 'tactician';
}

export function getIdleSetMeta(setId: IdleAnimationSetId): IdleAnimationSetMeta {
  return IDLE_ANIMATION_SETS[setId] ?? IDLE_ANIMATION_SETS.tactician;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1));
  return t * t * (3 - 2 * t);
}

function buildPoseForAction(
  setId: IdleAnimationSetId,
  actionIndex: number,
  env: number,
  phase: number
): IdlePoseDeltas {
  const pose: IdlePoseDeltas = { ...NEUTRAL_IDLE_POSE };
  if (env <= 0.001) return pose;

  const s = Math.sin(phase * Math.PI * 2);
  const s2 = Math.sin(phase * Math.PI * 4);
  const bell = Math.sin(phase * Math.PI);

  switch (setId) {
    case 'tactician':
      switch (actionIndex) {
        case 0: // radar-scan
          pose.gazeX = s * 0.72 * env;
          pose.gazeY = -0.18 * env;
          pose.tilt = -s * 0.045 * env;
          pose.prop = 'radar';
          pose.propPhase = phase;
          break;
        case 1: // chin-tap
          pose.tilt = -0.095 * env;
          pose.headY = -0.012 * env;
          pose.gazeX = -0.25 * env;
          pose.gazeY = -0.24 * env;
          pose.squintEyes = 0.25 * env;
          pose.hand = 'chinTap';
          pose.handPhase = Math.abs(s2) * env;
          break;
        case 2: // visor-adjust
          pose.tilt = 0.065 * env;
          pose.gazeX = 0.22 * env;
          pose.hand = 'salute';
          pose.handPhase = bell * env;
          break;
        case 3: // affirm-nod
          pose.headY = (0.042 * Math.max(0, s2) - 0.01) * env;
          pose.happyEyes = 0.65 * env;
          pose.mouthMode = 'smile';
          break;
        case 4: // signal-wave
          pose.tilt = -0.055 * env;
          pose.happyEyes = 0.45 * env;
          pose.mouthMode = 'smile';
          pose.hand = 'wave';
          pose.handPhase = phase;
          break;
        case 5: // calm-wink
        default:
          pose.tilt = 0.075 * env;
          pose.blinkRight = bell * env;
          pose.mouthMode = 'smile';
          pose.prop = 'sparkle';
          pose.propPhase = phase;
          break;
      }
      break;

    case 'celestial':
      switch (actionIndex) {
        case 0: // halo-spin
          pose.haloLift = 0.055 * bell * env;
          pose.haloSpin = s2 * 0.12 * env;
          pose.gazeY = -0.18 * env;
          pose.prop = 'orbit';
          pose.propPhase = phase;
          break;
        case 1: // halo-polish
          pose.tilt = -0.07 * env;
          pose.haloLift = 0.025 * Math.sin(phase * Math.PI * 3) * env;
          pose.happyEyes = 0.55 * env;
          pose.mouthMode = 'smile';
          pose.hand = 'salute';
          pose.handPhase = phase;
          break;
        case 2: // wing-flutter
          pose.headY = -0.032 * bell * env;
          pose.wingOpen = (0.65 + 0.35 * Math.abs(s2)) * env;
          pose.hairSway = s2 * 0.04 * env;
          break;
        case 3: // serene-pray
          pose.headY = 0.015 * env;
          pose.blinkLeft = 0.85 * env;
          pose.blinkRight = 0.85 * env;
          pose.mouthMode = 'smile';
          pose.hand = 'clasp';
          pose.handPhase = env;
          break;
        case 4: // blessing-sparkle
          pose.tilt = 0.06 * env;
          pose.happyEyes = 0.8 * env;
          pose.haloLift = 0.04 * env;
          pose.mouthMode = 'smile';
          pose.prop = 'sparkle';
          pose.propPhase = phase;
          break;
        case 5: // sleepy-sway
        default:
          pose.tilt = s * 0.095 * env;
          pose.squintEyes = 0.75 * env;
          pose.haloLift = 0.02 * s * env;
          pose.hairSway = -s * 0.06 * env;
          break;
      }
      break;

    case 'scholar':
      switch (actionIndex) {
        case 0: // hood-snuggle
          pose.headY = 0.026 * env;
          pose.hoodLift = -0.03 * bell * env;
          pose.hoodScaleX = 0.045 * bell * env;
          pose.squintEyes = 0.55 * env;
          pose.mouthMode = 'smile';
          break;
        case 1: // drowsy-yawn
          pose.tilt = -0.055 * env;
          pose.blinkLeft = 0.72 * env;
          pose.blinkRight = 0.72 * env;
          pose.mouthMode = 'yawn';
          pose.prop = 'zzz';
          pose.propPhase = phase;
          break;
        case 2: // page-turn
          pose.gazeX = s * 0.36 * env;
          pose.gazeY = 0.32 * env;
          pose.hand = 'tome';
          pose.handPhase = phase;
          break;
        case 3: // thought-bubble
          pose.tilt = 0.08 * env;
          pose.gazeX = 0.35 * env;
          pose.gazeY = -0.35 * env;
          pose.prop = 'bubbles';
          pose.propPhase = phase;
          break;
        case 4: // head-nod-doze
          pose.headY = (phase < 0.68 ? phase * 0.085 : 0.058 - (phase - 0.68) * 0.18) * env;
          pose.tilt = 0.06 * env;
          pose.blinkLeft = (phase < 0.70 ? 0.92 : 0.15) * env;
          pose.blinkRight = (phase < 0.70 ? 0.92 : 0.15) * env;
          pose.wideEyes = phase >= 0.70 ? 0.65 * env : 0;
          break;
        case 5: // warm-sip
        default:
          pose.headY = 0.012 * env;
          pose.happyEyes = 0.72 * env;
          pose.mouthMode = 'hum';
          pose.hand = 'mug';
          pose.handPhase = env;
          pose.prop = 'steam';
          pose.propPhase = phase;
          break;
      }
      break;

    case 'idol':
      switch (actionIndex) {
        case 0: // twintail-bounce
          pose.headY = -0.045 * Math.abs(s2) * env;
          pose.hairSway = s2 * 0.11 * env;
          pose.squashY = s2 * 0.04 * env;
          pose.happyEyes = 0.65 * env;
          pose.mouthMode = 'grin';
          break;
        case 1: // idol-peace
          pose.tilt = -0.085 * env;
          pose.blinkLeft = 0.92 * env;
          pose.mouthMode = 'grin';
          pose.hand = 'peace';
          pose.handPhase = env;
          pose.prop = 'sparkle';
          pose.propPhase = phase;
          break;
        case 2: // star-cheer
          pose.headY = -0.038 * Math.abs(s2) * env;
          pose.wideEyes = 0.55 * env;
          pose.mouthMode = 'grin';
          pose.hand = 'cheer';
          pose.handPhase = phase;
          pose.prop = 'sparkle';
          pose.propPhase = phase;
          break;
        case 3: // mic-hum
          pose.tilt = s * 0.075 * env;
          pose.happyEyes = 0.7 * env;
          pose.mouthMode = 'hum';
          pose.prop = 'note';
          pose.propPhase = phase;
          break;
        case 4: // ahoge-boing
          pose.ahogeBounce = s2 * 0.095 * env;
          pose.wideEyes = 0.45 * env;
          pose.mouthMode = 'o';
          break;
        case 5: // curtsy-bow
        default:
          pose.headY = 0.052 * bell * env;
          pose.happyEyes = 0.9 * env;
          pose.mouthMode = 'smile';
          pose.hairSway = 0.05 * bell * env;
          break;
      }
      break;

    case 'neko':
      switch (actionIndex) {
        case 0: // ear-flick
          pose.earLeft = (phase < 0.45 ? Math.sin(phase * Math.PI * 5) * 0.18 : 0) * env;
          pose.earRight = (phase >= 0.45 ? Math.sin((phase - 0.45) * Math.PI * 5) * 0.18 : 0) * env;
          pose.gazeX = (phase < 0.45 ? -0.45 : 0.45) * env;
          pose.mouthMode = 'cat';
          break;
        case 1: // paw-swipe
          pose.tilt = -0.065 * env;
          pose.mouthMode = 'cat';
          pose.hand = 'pawSwipe';
          pose.handPhase = phase;
          break;
        case 2: // tail-swish
          pose.tailWag = s * 0.95 * env;
          pose.mouthMode = 'cat';
          pose.happyEyes = 0.45 * env;
          break;
        case 3: // prowl-crouch
          pose.headY = 0.048 * bell * env;
          pose.squashY = -0.045 * bell * env;
          pose.squintEyes = 0.65 * env;
          pose.gazeX = s * 0.55 * env;
          pose.mouthMode = 'cat';
          break;
        case 4: // purr-curl
          pose.happyEyes = 0.95 * env;
          pose.tilt = 0.055 * s * env;
          pose.mouthMode = 'cat';
          pose.prop = 'heart';
          pose.propPhase = phase;
          break;
        case 5: // ear-groom
        default:
          pose.tilt = -0.105 * env;
          pose.blinkLeft = 0.8 * env;
          pose.earLeft = -0.12 * env;
          pose.mouthMode = 'cat';
          pose.hand = 'pawSwipe';
          pose.handPhase = 0.5 + 0.3 * s;
          break;
      }
      break;

    case 'trickster':
    default:
      switch (actionIndex) {
        case 0: // floppy-ear-hop
          pose.headY = -0.055 * Math.abs(s2) * env;
          pose.earLeft = s2 * 0.16 * env;
          pose.earRight = -s2 * 0.16 * env;
          pose.squashY = s2 * 0.04 * env;
          pose.mouthMode = 'smile';
          break;
        case 1: // kitsune-peek
          pose.tilt = 0.08 * env;
          pose.happyEyes = 0.55 * env;
          pose.hand = 'peek';
          pose.handPhase = env;
          break;
        case 2: // orb-juggle
          pose.gazeY = -0.16 * env;
          pose.mouthMode = 'smile';
          pose.hand = 'juggle';
          pose.handPhase = phase;
          pose.prop = 'orb';
          pose.propPhase = phase;
          break;
        case 3: // cheek-puff
          pose.tilt = -0.05 * env;
          pose.squintEyes = 0.45 * env;
          pose.mouthMode = 'o';
          pose.hoodScaleX = 0.03 * env;
          break;
        case 4: // spin-perk
          pose.headX = s * 0.035 * env;
          pose.tilt = s * 0.095 * env;
          pose.hairSway = -s * 0.085 * env;
          pose.tailWag = s * 0.8 * env;
          pose.happyEyes = 0.8 * env;
          break;
        case 5: // wave-hello
        default:
          pose.tilt = -0.06 * env;
          pose.happyEyes = 0.85 * env;
          pose.mouthMode = 'grin';
          pose.hand = 'wave';
          pose.handPhase = phase;
          break;
      }
      break;
  }

  return pose;
}

/**
 * Evaluates a character's 6-action separated idle animation loop at `offsetTime`.
 * Each action occupies a 4.0s window: 0.00-3.15s active motion + 3.15-4.00s calm neutral rest.
 */
export function evaluateIdleActionStep(
  setId: IdleAnimationSetId,
  offsetTime: number,
  reducedMotion = false
): IdleActionFrame {
  const setMeta = getIdleSetMeta(setId);
  const safeTime = Number.isFinite(offsetTime) ? offsetTime : 0;
  const wrapped = ((safeTime % IDLE_FULL_LOOP_SECONDS) + IDLE_FULL_LOOP_SECONDS) % IDLE_FULL_LOOP_SECONDS;
  const actionIndex = Math.min(
    IDLE_ACTIONS_PER_SET - 1,
    Math.floor(wrapped / IDLE_ACTION_SLOT_SECONDS)
  );
  const localT = wrapped - actionIndex * IDLE_ACTION_SLOT_SECONDS;
  const actionDef = setMeta.actions[actionIndex];

  if (reducedMotion || localT >= IDLE_ACTIVE_END_SECONDS) {
    return {
      setId: setMeta.id,
      actionIndex,
      actionId: actionDef.id,
      actionLabel: actionDef.label,
      isResting: true,
      envelope: 0,
      phase: 0,
      pose: { ...NEUTRAL_IDLE_POSE },
    };
  }

  let envelope = 1;
  if (localT < IDLE_EASE_IN_SECONDS) {
    envelope = smoothstep(0, IDLE_EASE_IN_SECONDS, localT);
  } else if (localT > IDLE_EASE_OUT_START_SECONDS) {
    envelope = 1 - smoothstep(IDLE_EASE_OUT_START_SECONDS, IDLE_ACTIVE_END_SECONDS, localT);
  }

  const phase = clamp01(localT / IDLE_ACTIVE_END_SECONDS);
  const pose = buildPoseForAction(setMeta.id, actionIndex, envelope, phase);

  return {
    setId: setMeta.id,
    actionIndex,
    actionId: actionDef.id,
    actionLabel: actionDef.label,
    isResting: false,
    envelope,
    phase,
    pose,
  };
}
