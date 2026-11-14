import type { ExpressionMood, EyeState, MouthViseme, PhosphorTheme } from '../types/hermes';

export type AsciiShaderMode = 'solid' | 'wire' | 'depth' | 'holo' | 'norm';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Ascii3DParams {
  cols: number;
  rows: number;
  time: number; // seconds
  yaw: number;  // radians
  pitch: number; // radians
  zoom: number; // 0.75..1.55
  mood: ExpressionMood;
  viseme: MouthViseme;
  eyeState: EyeState;
  energy: number; // 0..1 audio amplitude
  isSpeaking: boolean;
  isListening: boolean;
  shaderMode: AsciiShaderMode;
  bands?: number[]; // optional 12-band spectrum for 3D floor monoliths
}

export type AsciiMaterial =
  | 'bg'
  | 'grid'
  | 'ring'
  | 'body'
  | 'hair'
  | 'wing'
  | 'eye'
  | 'mouth'
  | 'visor'
  | 'pillar'
  | 'orb'
  | 'pulse';

export interface AsciiCell {
  ch: string;
  intensity: number; // 0..1
  material: AsciiMaterial;
  isEdge?: boolean;
  /** Optional RGB override used by Normal-buffer / HDR shader modes */
  rgb?: string;
}

export interface Ascii3DFrame {
  cols: number;
  rows: number;
  cells: AsciiCell[];
}

export interface GizmoAxis {
  label: 'X' | 'Y' | 'Z';
  x: number; // -1..1 screen projection
  y: number; // -1..1 screen projection
  z: number; // depth for draw ordering
  color: string;
}

// Smooth tonal ramp tuned for Bayer-dithered 3D shading + crisp facial clarity
const CLEAN_RAMP = ' .\'`^,:;~-+*oO0#%@';
const HOLO_RAMP = ' ·.:-=+*#%@';
const DEPTH_RAMP = ' ·.:░▒▓█';

// 4x4 Bayer ordered dithering matrix normalized to [-0.5, 0.5]
const BAYER_4X4 = [
  -0.46875, 0.03125, -0.34375, 0.15625,
  0.28125, -0.21875, 0.40625, -0.09375,
  -0.28125, 0.21875, -0.40625, 0.09375,
  0.46875, -0.03125, 0.34375, -0.15625,
];

const MAT_BG = 0;
const MAT_GRID = 1;
const MAT_RING = 2;
const MAT_BODY = 3;
const MAT_HAIR = 4;
const MAT_WING = 5;
const MAT_EYE = 6;
const MAT_MOUTH = 7;
const MAT_VISOR = 8;
const MAT_PILLAR = 9;
const MAT_ORB = 10;
const MAT_PULSE = 11;

const MAT_NAMES: AsciiMaterial[] = [
  'bg',
  'grid',
  'ring',
  'body',
  'hair',
  'wing',
  'eye',
  'mouth',
  'visor',
  'pillar',
  'orb',
  'pulse',
];

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function smin(a: number, b: number, k: number): number {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return b * (1 - h) + a * h - k * h * (1 - h);
}

function sdEllipsoid(x: number, y: number, z: number, rx: number, ry: number, rz: number): number {
  const k0 = Math.hypot(x / rx, y / ry, z / rz);
  if (k0 < 1e-6) return -Math.min(rx, ry, rz);
  const k1 = Math.hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  return (k0 * (k0 - 1)) / (k1 || 1);
}

function sdBox(x: number, y: number, z: number, bx: number, by: number, bz: number): number {
  const qx = Math.abs(x) - bx;
  const qy = Math.abs(y) - by;
  const qz = Math.abs(z) - bz;
  return (
    Math.hypot(qx > 0 ? qx : 0, qy > 0 ? qy : 0, qz > 0 ? qz : 0) +
    Math.min(Math.max(qx, Math.max(qy, qz)), 0)
  );
}

function sdCapsule(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  r: number
): number {
  const pax = px - ax;
  const pay = py - ay;
  const paz = pz - az;
  const bax = bx - ax;
  const bay = by - ay;
  const baz = bz - az;
  const denom = bax * bax + bay * bay + baz * baz || 1;
  const h = clamp((pax * bax + pay * bay + paz * baz) / denom, 0, 1);
  return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - r;
}

function sdTorus(x: number, y: number, z: number, majorR: number, minorR: number): number {
  const qx = Math.hypot(x, z) - majorR;
  return Math.hypot(qx, y) - minorR;
}

function sdOctahedron(x: number, y: number, z: number, s: number): number {
  const ax = x < 0 ? -x : x;
  const ay = y < 0 ? -y : y;
  const az = z < 0 ? -z : z;
  return (ax + ay + az - s) * 0.57735027;
}

interface FramePrecompute {
  time: number;
  breathY: number;
  cTilt: number;
  sTilt: number;
  cYaw: number;
  sYaw: number;
  cTalkX: number;
  sTalkX: number;
  mouthRx: number;
  mouthRy: number;
  mouthOpen: boolean;
  isSmile: boolean;
  viseme: MouthViseme;
  eyeScaleY: number;
  eyeGazeX: number;
  cBrow: number;
  sBrow: number;
  cWing: number;
  sWing: number;
  cR1Y: number;
  sR1Y: number;
  cR2Y: number;
  sR2Y: number;
  orb1X: number;
  orb1Y: number;
  orb1Z: number;
  orb2X: number;
  orb2Y: number;
  orb2Z: number;
  cOrbSpin: number;
  sOrbSpin: number;
  pulseRadius: number;
  pulseActive: boolean;
  isSpeaking: boolean;
  energy: number;
  pillarH0: number;
  pillarH1: number;
  pillarH2: number;
}

function getMouthOpening(viseme: MouthViseme, energy: number): { rx: number; ry: number } {
  const boost = energy * 0.048;
  switch (viseme) {
    case 'closed':
      return { rx: 0.145, ry: 0.02 };
    case 'smile':
      return { rx: 0.195, ry: 0.028 };
    case 'small':
      return { rx: 0.115, ry: 0.062 + boost };
    case 'mid':
      return { rx: 0.16, ry: 0.102 + boost };
    case 'round':
      return { rx: 0.112, ry: 0.125 + boost };
    case 'wide':
      return { rx: 0.225, ry: 0.14 + boost };
  }
}

function buildFramePrecompute(params: Ascii3DParams): FramePrecompute {
  const { time, mood, viseme, eyeState, energy, isSpeaking, isListening, bands } = params;
  const breathY = Math.sin(time * 2.1) * 0.025;
  const talkTilt = isSpeaking ? Math.sin(time * 6.5) * (0.04 + energy * 0.05) : 0;
  const moodTilt = mood === 'thinking' ? 0.14 : mood === 'happy' ? -0.05 : 0;
  const tilt = moodTilt + talkTilt * 0.5;
  const talkX = isSpeaking ? Math.sin(time * 9.0) * 0.03 * energy : 0;
  const headYaw =
    (mood === 'thinking' ? -0.18 : mood === 'listening' ? 0.12 : 0) +
    Math.sin(time * 0.78) * 0.11 +
    (isSpeaking ? Math.sin(time * 1.65) * 0.08 : 0);
  const mouth = getMouthOpening(viseme, energy);
  const browTilt = mood === 'alert' || mood === 'focused' ? -0.25 : mood === 'happy' ? 0.19 : 0;
  const wingFlap = 0.34 + Math.sin(time * (isSpeaking ? 5.4 : 2.3)) * (0.065 + energy * 0.09);
  const ringSpeed = isSpeaking || isListening ? 1.85 : 0.72;

  const b0 = bands?.[1] ?? energy * 0.7;
  const b1 = bands?.[4] ?? energy * 0.9;
  const b2 = bands?.[7] ?? energy * 0.6;

  // Compute world positions for 2 orbiting 3D octahedral satellite drones on ring 1
  const a1 = time * 1.45;
  const a2 = a1 + Math.PI;
  const rOrb = 1.42;
  const ox1 = Math.cos(a1) * rOrb;
  const oz1 = Math.sin(a1) * rOrb;
  const oy1 = 0.58 + oz1 * 0.34;
  const ox2 = Math.cos(a2) * rOrb;
  const oz2 = Math.sin(a2) * rOrb;
  const oy2 = 0.58 + oz2 * 0.34;

  const pulseCycle = (time * 1.35) % 1;
  const pulseActive = isSpeaking || isListening;

  return {
    time,
    breathY,
    cTilt: Math.cos(tilt),
    sTilt: Math.sin(tilt),
    cYaw: Math.cos(headYaw),
    sYaw: Math.sin(headYaw),
    cTalkX: Math.cos(talkX),
    sTalkX: Math.sin(talkX),
    mouthRx: mouth.rx,
    mouthRy: mouth.ry,
    mouthOpen: viseme !== 'closed' && viseme !== 'smile',
    isSmile: viseme === 'smile',
    viseme,
    eyeScaleY:
      eyeState === 'blink'
        ? 0.02
        : eyeState === 'half'
        ? 0.065
        : eyeState === 'wide'
        ? 0.135
        : 0.105,
    eyeGazeX: mood === 'thinking' ? Math.sin(time * 2.2) * 0.035 : 0,
    cBrow: Math.cos(browTilt),
    sBrow: Math.sin(browTilt),
    cWing: Math.cos(wingFlap),
    sWing: Math.sin(wingFlap),
    cR1Y: Math.cos(time * ringSpeed),
    sR1Y: Math.sin(time * ringSpeed),
    cR2Y: Math.cos(-time * ringSpeed * 0.75),
    sR2Y: Math.sin(-time * ringSpeed * 0.75),
    orb1X: ox1,
    orb1Y: oy1,
    orb1Z: oz1 * 0.94,
    orb2X: ox2,
    orb2Y: oy2,
    orb2Z: oz2 * 0.94,
    cOrbSpin: Math.cos(time * 2.8),
    sOrbSpin: Math.sin(time * 2.8),
    pulseRadius: 0.78 + pulseCycle * 0.95,
    pulseActive,
    isSpeaking,
    energy,
    pillarH0: 0.22 + b0 * 0.58,
    pillarH1: 0.3 + b1 * 0.68,
    pillarH2: 0.18 + b2 * 0.52,
  };
}

let lastHitMat = MAT_BG;

/**
 * Hierarchical conservative-bounded SDF evaluation:
 * Computes cheap bounding-sphere lower bounds for every sub-assembly first,
 * skipping exact primitive evaluations for sub-assemblies strictly farther than `minD`.
 * Far from all geometry (> 0.26), returns the exact conservative lower bound directly.
 */
function evalSdfFast(wx: number, wy: number, wz: number, fc: FramePrecompute, exactMode = false): number {
  const y0 = wy - fc.breathY;
  const px = wx * fc.cTilt - y0 * fc.sTilt;
  const py1 = wx * fc.sTilt + y0 * fc.cTilt;
  const py = py1 * fc.cTalkX - wz * fc.sTalkX;
  const pz = py1 * fc.sTalkX + wz * fc.cTalkX;
  const ax = px < 0 ? -px : px;
  const awx = wx < 0 ? -wx : wx;

  // Conservative spherical bounds for each sub-assembly
  const bHead = Math.hypot(px, py - 0.1, pz - 0.04) - 0.96;
  const bTorso = Math.hypot(px, py + 0.85, pz + 0.02) - 1.12;
  const bWing = Math.hypot(ax - 0.92, py - 0.32, pz + 0.04) - 0.78;
  const rLen = Math.hypot(wx, wy, wz);
  const bRings = Math.abs(rLen - 1.52) - 0.36;
  const bPillars = Math.hypot(awx - 1.56, wy + 0.98, wz + 0.68) - 0.75;

  let minBound = bHead;
  if (bTorso < minBound) minBound = bTorso;
  if (bWing < minBound) minBound = bWing;
  if (bRings < minBound) minBound = bRings;
  if (bPillars < minBound) minBound = bPillars;

  // Safe empty-space acceleration: when strictly outside all sub-assembly envelopes, step by minBound
  if (!exactMode && minBound > 0.22) {
    lastHitMat = MAT_BG;
    return minBound;
  }

  // Evaluate assembly bounds in strict tight-first check without allocating closures:
  // If we hit a tight bound first, `minD` drops immediately and skips all farther assemblies.
  let minD = 99;
  let mat = MAT_BG;

  // Stage 1: Evaluate the closest bounding assembly first
  let evaluated = 0; // bitmask: 1=head, 2=torso, 4=wing, 8=rings, 16=pillars
  if (bRings === minBound) {
    evaluated |= 8;
    const r1x = wx * fc.cR1Y + wz * fc.sR1Y;
    const r1z = -wx * fc.sR1Y + wz * fc.cR1Y;
    const r1y = wy * 0.94 - r1z * 0.34;
    const r1zz = wy * 0.34 + r1z * 0.94;
    const ring1 = sdTorus(r1x, r1y - 0.66, r1zz, 1.38, 0.028);
    if (ring1 < minD) { minD = ring1; mat = MAT_RING; }
    const r2x = wx * fc.cR2Y + wz * fc.sR2Y;
    const r2z = -wx * fc.sR2Y + wz * fc.cR2Y;
    const r2y = wy * 0.88 + r2z * 0.47;
    const r2zz = -wy * 0.47 + r2z * 0.88;
    const ring2 = sdTorus(r2x, r2y + 0.58, r2zz, 1.62, 0.022);
    if (ring2 < minD) { minD = ring2; mat = MAT_RING; }
    const o1dx = wx - fc.orb1X;
    const o1dz = wz - fc.orb1Z;
    const orb1 = sdOctahedron(o1dx * fc.cOrbSpin - o1dz * fc.sOrbSpin, wy - fc.orb1Y, o1dx * fc.sOrbSpin + o1dz * fc.cOrbSpin, 0.115);
    const o2dx = wx - fc.orb2X;
    const o2dz = wz - fc.orb2Z;
    const orb2 = sdOctahedron(o2dx * fc.cOrbSpin + o2dz * fc.sOrbSpin, wy - fc.orb2Y, -o2dx * fc.sOrbSpin + o2dz * fc.cOrbSpin, 0.115);
    const orbDist = orb1 < orb2 ? orb1 : orb2;
    if (orbDist < minD) { minD = orbDist; mat = MAT_ORB; }
    if (fc.pulseActive) {
      const pulseRing = sdTorus(wx, wy + 0.55, wz, fc.pulseRadius, 0.018 + fc.energy * 0.015);
      if (pulseRing < minD) { minD = pulseRing; mat = MAT_PULSE; }
    }
  } else if (bPillars === minBound) {
    evaluated |= 16;
    const pDist0 = sdBox(awx - 1.34, wy + 1.38 - fc.pillarH0, wz + 0.55, 0.075, fc.pillarH0, 0.075);
    const pDist1 = sdBox(awx - 1.56, wy + 1.38 - fc.pillarH1, wz + 0.68, 0.075, fc.pillarH1, 0.075);
    const pDist2 = sdBox(awx - 1.78, wy + 1.38 - fc.pillarH2, wz + 0.82, 0.075, fc.pillarH2, 0.075);
    const pillarDist = Math.min(pDist0, Math.min(pDist1, pDist2));
    if (pillarDist < minD) { minD = pillarDist; mat = MAT_PILLAR; }
  } else if (bWing === minBound) {
    evaluated |= 4;
    const wx0 = ax - 0.68;
    const wy0 = py - 0.38;
    const wbx = wx0 * fc.cWing - wy0 * fc.sWing;
    const wby = wx0 * fc.sWing + wy0 * fc.cWing;
    const wbz = pz + 0.04;
    const earCup = sdEllipsoid(ax - 0.65, py - 0.02, pz + 0.02, 0.11, 0.2, 0.16);
    const w1 = sdBox(wbx - 0.36, wby - 0.21, wbz, 0.44, 0.072, 0.055);
    const w2 = sdBox(wbx - 0.28, wby - 0.04, wbz, 0.35, 0.065, 0.05);
    const w3 = sdBox(wbx - 0.19, wby + 0.12, wbz, 0.26, 0.056, 0.046);
    const w4 = sdBox(wbx - 0.11, wby + 0.26, wbz, 0.17, 0.045, 0.04);
    const wingDist = Math.min(earCup, Math.min(Math.min(w1, w2), Math.min(w3, w4)));
    if (wingDist < minD) { minD = wingDist; mat = MAT_WING; }
  } else if (bTorso === minBound) {
    evaluated |= 2;
    const neck = sdCapsule(px, py, pz, 0, -0.45, -0.02, 0, -0.82, -0.04, 0.185);
    const shoulders = sdEllipsoid(px, py + 1.08, pz + 0.04, 0.95, 0.45, 0.44);
    const collar = sdTorus(px, py + 0.72, pz + 0.02, 0.33, 0.07);
    const torsoDist = smin(smin(neck, shoulders, 0.19), collar, 0.08);
    if (torsoDist < minD) { minD = torsoDist; mat = MAT_BODY; }
  }

  // Stage 2: Remaining assemblies only if their conservative bound < current minD
  if ((evaluated & 1) === 0 && bHead < minD) {
    const hpx = px * fc.cYaw + pz * fc.sYaw;
    const hpz = -px * fc.sYaw + pz * fc.cYaw;
    const hax = hpx < 0 ? -hpx : hpx;

    const cranium = sdEllipsoid(hpx, py - 0.13, hpz, 0.61, 0.68, 0.58);
    const chin = sdEllipsoid(hpx, py + 0.26, hpz - 0.09, 0.39, 0.43, 0.45);
    let headDist = smin(cranium, chin, 0.22);
    const nose = sdCapsule(hpx, py, hpz, 0, 0.07, 0.54, 0, -0.09, 0.62, 0.048);
    headDist = smin(headDist, nose, 0.05);
    const eyeSocket = sdEllipsoid(hax - 0.22, py - 0.08, hpz - 0.56, 0.135, 0.125, 0.08);
    headDist = Math.max(headDist, -eyeSocket * 0.65);
    const smileBend = fc.isSmile ? hpx * hpx * 0.42 : 0;
    const mouthCavity = sdEllipsoid(hpx, py + 0.27 - smileBend, hpz - 0.49, fc.mouthRx, fc.mouthRy, 0.16);
    headDist = Math.max(headDist, -mouthCavity);
    if (headDist < minD) { minD = headDist; mat = MAT_BODY; }

    if (fc.mouthOpen) {
      const vocalCore = sdEllipsoid(hpx, py + 0.27, hpz - 0.43, fc.mouthRx * 0.76, fc.mouthRy * 0.78, 0.09);
      if (vocalCore < minD) { minD = vocalCore; mat = MAT_MOUTH; }
    }

    const hairBack = sdEllipsoid(hpx, py - 0.16, hpz + 0.14, 0.71, 0.77, 0.64);
    const faceWindow = sdEllipsoid(hpx, py + 0.01, hpz - 0.36, 0.52, 0.56, 0.48);
    const hairShell = Math.max(hairBack, -faceWindow);
    const bangL = sdCapsule(hpx, py, hpz, -0.22, 0.72, 0.33, -0.56, -0.2, 0.36, 0.125);
    const bangR = sdCapsule(hpx, py, hpz, 0.22, 0.72, 0.33, 0.56, -0.2, 0.36, 0.125);
    const bangC = sdCapsule(hpx, py, hpz, 0.04, 0.76, 0.44, -0.06, 0.41, 0.52, 0.085);
    const hairDist = smin(Math.min(hairShell, Math.min(bangL, bangR)), bangC, 0.07);
    if (hairDist < minD) { minD = hairDist; mat = MAT_HAIR; }

    const eyeDist = sdEllipsoid(hax - 0.22 - fc.eyeGazeX, py - 0.08, hpz - 0.53, 0.115, fc.eyeScaleY, 0.09);
    if (eyeDist < minD) { minD = eyeDist; mat = MAT_EYE; }

    const bx0 = hax - 0.22;
    const by0 = py - 0.26;
    const browDist = sdBox(bx0 * fc.cBrow - by0 * fc.sBrow, bx0 * fc.sBrow + by0 * fc.cBrow, hpz - 0.54, 0.125, 0.024, 0.042);
    if (browDist < minD) { minD = browDist; mat = MAT_HAIR; }

    const vx0 = hpx;
    const vy0 = py - 0.54;
    const visorDist = sdBox((vx0 - vy0) * 0.7071, (vx0 + vy0) * 0.7071, hpz - 0.53, 0.085, 0.085, 0.052);
    if (visorDist < minD) { minD = visorDist; mat = MAT_VISOR; }
  }

  if ((evaluated & 2) === 0 && bTorso < minD) {
    const neck = sdCapsule(px, py, pz, 0, -0.45, -0.02, 0, -0.82, -0.04, 0.185);
    const shoulders = sdEllipsoid(px, py + 1.08, pz + 0.04, 0.95, 0.45, 0.44);
    const collar = sdTorus(px, py + 0.72, pz + 0.02, 0.33, 0.07);
    const torsoDist = smin(smin(neck, shoulders, 0.19), collar, 0.08);
    if (torsoDist < minD) { minD = torsoDist; mat = MAT_BODY; }
  }

  if ((evaluated & 4) === 0 && bWing < minD) {
    const wx0 = ax - 0.68;
    const wy0 = py - 0.38;
    const wbx = wx0 * fc.cWing - wy0 * fc.sWing;
    const wby = wx0 * fc.sWing + wy0 * fc.cWing;
    const wbz = pz + 0.04;
    const earCup = sdEllipsoid(ax - 0.65, py - 0.02, pz + 0.02, 0.11, 0.2, 0.16);
    const w1 = sdBox(wbx - 0.36, wby - 0.21, wbz, 0.44, 0.072, 0.055);
    const w2 = sdBox(wbx - 0.28, wby - 0.04, wbz, 0.35, 0.065, 0.05);
    const w3 = sdBox(wbx - 0.19, wby + 0.12, wbz, 0.26, 0.056, 0.046);
    const w4 = sdBox(wbx - 0.11, wby + 0.26, wbz, 0.17, 0.045, 0.04);
    const wingDist = Math.min(earCup, Math.min(Math.min(w1, w2), Math.min(w3, w4)));
    if (wingDist < minD) { minD = wingDist; mat = MAT_WING; }
  }

  if ((evaluated & 8) === 0 && bRings < minD) {
    const r1x = wx * fc.cR1Y + wz * fc.sR1Y;
    const r1z = -wx * fc.sR1Y + wz * fc.cR1Y;
    const r1y = wy * 0.94 - r1z * 0.34;
    const r1zz = wy * 0.34 + r1z * 0.94;
    const ring1 = sdTorus(r1x, r1y - 0.66, r1zz, 1.38, 0.028);
    if (ring1 < minD) { minD = ring1; mat = MAT_RING; }
    const r2x = wx * fc.cR2Y + wz * fc.sR2Y;
    const r2z = -wx * fc.sR2Y + wz * fc.cR2Y;
    const r2y = wy * 0.88 + r2z * 0.47;
    const r2zz = -wy * 0.47 + r2z * 0.88;
    const ring2 = sdTorus(r2x, r2y + 0.58, r2zz, 1.62, 0.022);
    if (ring2 < minD) { minD = ring2; mat = MAT_RING; }
    const o1dx = wx - fc.orb1X;
    const o1dz = wz - fc.orb1Z;
    const orb1 = sdOctahedron(o1dx * fc.cOrbSpin - o1dz * fc.sOrbSpin, wy - fc.orb1Y, o1dx * fc.sOrbSpin + o1dz * fc.cOrbSpin, 0.115);
    const o2dx = wx - fc.orb2X;
    const o2dz = wz - fc.orb2Z;
    const orb2 = sdOctahedron(o2dx * fc.cOrbSpin + o2dz * fc.sOrbSpin, wy - fc.orb2Y, -o2dx * fc.sOrbSpin + o2dz * fc.cOrbSpin, 0.115);
    const orbDist = orb1 < orb2 ? orb1 : orb2;
    if (orbDist < minD) { minD = orbDist; mat = MAT_ORB; }
    if (fc.pulseActive) {
      const pulseRing = sdTorus(wx, wy + 0.55, wz, fc.pulseRadius, 0.018 + fc.energy * 0.015);
      if (pulseRing < minD) { minD = pulseRing; mat = MAT_PULSE; }
    }
  }

  if ((evaluated & 16) === 0 && bPillars < minD) {
    const pDist0 = sdBox(awx - 1.34, wy + 1.38 - fc.pillarH0, wz + 0.55, 0.075, fc.pillarH0, 0.075);
    const pDist1 = sdBox(awx - 1.56, wy + 1.38 - fc.pillarH1, wz + 0.68, 0.075, fc.pillarH1, 0.075);
    const pDist2 = sdBox(awx - 1.78, wy + 1.38 - fc.pillarH2, wz + 0.82, 0.075, fc.pillarH2, 0.075);
    const pillarDist = Math.min(pDist0, Math.min(pDist1, pDist2));
    if (pillarDist < minD) { minD = pillarDist; mat = MAT_PILLAR; }
  }

  lastHitMat = mat;
  return minD;
}

export function evaluateSceneSdf(
  wp: Vec3,
  params: Ascii3DParams
): { dist: number; material: AsciiMaterial } {
  const fc = buildFramePrecompute(params);
  const dist = evalSdfFast(wp.x, wp.y, wp.z, fc, true);
  return { dist, material: MAT_NAMES[lastHitMat] };
}

export function calcSceneNormal(p: Vec3, params: Ascii3DParams): Vec3 {
  const fc = buildFramePrecompute(params);
  return calcNormalFast(p.x, p.y, p.z, fc);
}

function calcNormalFast(x: number, y: number, z: number, fc: FramePrecompute): Vec3 {
  const e = 0.008;
  const k1 = evalSdfFast(x + e, y - e, z - e, fc, true);
  const k2 = evalSdfFast(x - e, y - e, z + e, fc, true);
  const k3 = evalSdfFast(x - e, y + e, z - e, fc, true);
  const k4 = evalSdfFast(x + e, y + e, z + e, fc, true);
  const nx = k1 - k2 - k3 + k4;
  const ny = -k1 - k2 + k3 + k4;
  const nz = -k1 + k2 - k3 + k4;
  const l = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / l, y: ny / l, z: nz / l };
}

/**
 * Fast 2-tap SDF Ambient Occlusion for sculpted crevices.
 */
function calcAOFast(x: number, y: number, z: number, nx: number, ny: number, nz: number, fc: FramePrecompute): number {
  const d1 = evalSdfFast(x + nx * 0.09, y + ny * 0.09, z + nz * 0.09, fc, true);
  const d2 = evalSdfFast(x + nx * 0.22, y + ny * 0.22, z + nz * 0.22, fc, true);
  const occ = (0.09 - d1) * 1.4 + (0.22 - d2) * 0.7;
  return clamp(1 - occ * 1.35, 0.28, 1);
}

/**
 * Soft 6-tap SDF raymarched self-shadowing toward key light.
 */
function calcSoftShadow(
  ox: number,
  oy: number,
  oz: number,
  lx: number,
  ly: number,
  lz: number,
  fc: FramePrecompute
): number {
  let res = 1.0;
  let t = 0.1;
  for (let i = 0; i < 4; i++) {
    const h = evalSdfFast(ox + lx * t, oy + ly * t, oz + lz * t, fc);
    if (h < 0.014) return 0.36;
    const penumbra = (4.0 * h) / t;
    if (penumbra < res) res = penumbra;
    t += clamp(h, 0.1, 0.3);
    if (t > 1.05) break;
  }
  return clamp(res, 0.36, 1.0);
}

function mapLuminanceToChar(lum: number, ramp: string, dither: number): string {
  const dithered = clamp(lum + dither, 0, 1);
  const idx = clamp(Math.floor(dithered * (ramp.length - 1)), 0, ramp.length - 1);
  return ramp[idx];
}

function mapEdgeNormalToChar(nx: number, ny: number): string {
  if (ny > 0.72 || ny < -0.72) return '_';
  if (nx > 0.72 || nx < -0.72) return '|';
  return nx * ny > 0 ? '/' : '\\';
}

function mapVectorNormalToChar(nx: number, ny: number, nz: number): string {
  if (nz > 0.85) return '○';
  if (Math.abs(nx) > Math.abs(ny) * 1.6) return nx > 0 ? '→' : '←';
  if (Math.abs(ny) > Math.abs(nx) * 1.6) return ny > 0 ? '↑' : '↓';
  return nx * ny > 0 ? '/' : '\\';
}

/**
 * Projects 3D world-space X/Y/Z basis vectors into 2D viewport orientation for the corner 3D gizmo.
 */
export function projectBasisAxes(yaw: number, pitch: number): GizmoAxis[] {
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);

  // Camera view basis (matching renderAscii3DFrame camera orbit convention)
  const rightX = cy;
  const rightZ = -sy;

  const fwdX = -sy * cp;
  const fwdY = sp;
  const fwdZ = -cy * cp;

  const upX = -sy * sp;
  const upY = cp;
  const upZ = -cy * sp;

  const axes: Array<{ label: 'X' | 'Y' | 'Z'; vx: number; vy: number; vz: number; color: string }> = [
    { label: 'X', vx: 1, vy: 0, vz: 0, color: '#F43F5E' },
    { label: 'Y', vx: 0, vy: 1, vz: 0, color: '#22D3EE' },
    { label: 'Z', vx: 0, vy: 0, vz: 1, color: '#F5B800' },
  ];

  return axes
    .map((a) => ({
      label: a.label,
      x: a.vx * rightX + a.vz * rightZ,
      y: -(a.vx * upX + a.vy * upY + a.vz * upZ),
      z: a.vx * fwdX + a.vy * fwdY + a.vz * fwdZ,
      color: a.color,
    }))
    .sort((a, b) => b.z - a.z);
}

// Reusable typed buffers sized dynamically if grid grows
let bufSize = 0;
let depthBuf = new Float32Array(0);
let nxBuf = new Float32Array(0);
let nyBuf = new Float32Array(0);
let nzBuf = new Float32Array(0);
let matBuf = new Uint8Array(0);

function ensureBuffers(total: number) {
  if (total <= bufSize) return;
  bufSize = total;
  depthBuf = new Float32Array(total);
  nxBuf = new Float32Array(total);
  nyBuf = new Float32Array(total);
  nzBuf = new Float32Array(total);
  matBuf = new Uint8Array(total);
}

/**
 * Next-Gen 2-Pass 3D ASCII Rendering Engine:
 * Pass 1: Bounded-hierarchy 3D SDF Raymarching + 2-tap AO + 6-tap Soft SDF Shadows + Blinn-Phong + Bayer 4x4 Dithering + Perspective Floor Shadows & Acoustic Ripples.
 * Pass 2: Screen-space depth & normal crease contour detection (/ \ | _).
 */
export function renderAscii3DFrame(params: Ascii3DParams): Ascii3DFrame {
  const { cols, rows, yaw, pitch, zoom, time, energy, shaderMode, isSpeaking } = params;
  const fc = buildFramePrecompute(params);
  const total = cols * rows;
  ensureBuffers(total);

  const cells: AsciiCell[] = new Array(total);

  const camDist = 3.02 / clamp(zoom, 0.7, 1.55);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);

  const ry0 = 0.06 * cp - camDist * sp;
  const rz0 = 0.06 * sp + camDist * cp;

  const camX = rz0 * sy;
  const camY = ry0;
  const camZ = rz0 * cy;

  const fx = -camX;
  const fy = -0.1 - camY;
  const fz = -camZ;
  const fl = Math.hypot(fx, fy, fz) || 1;
  const fwdX = fx / fl;
  const fwdY = fy / fl;
  const fwdZ = fz / fl;

  const rl = Math.hypot(-fwdZ, fwdX) || 1;
  const rightX = -fwdZ / rl;
  const rightZ = fwdX / rl;

  const upX = -rightZ * fwdY;
  const upY = rightZ * fwdX - rightX * fwdZ;
  const upZ = rightX * fwdY;

  const keyX = 0.468;
  const keyY = 0.585;
  const keyZ = 0.663;
  const rimX = -0.808;
  const rimY = 0.303;
  const rimZ = -0.505;

  const aspect = (cols * 0.52) / Math.max(1, rows);
  const fovScale = 0.82;
  const boundR2 = 2.38 * 2.38;

  // PASS 1: 3D SDF Raymarch, AO, Soft Shadows & Lighting
  for (let r = 0; r < rows; r++) {
    const ndcY = 1 - (2 * (r + 0.5)) / rows;
    const bayerRow = (r & 3) * 4;
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const ndcX = ((2 * (c + 0.5)) / cols - 1) * aspect;
      const dither = BAYER_4X4[bayerRow + (c & 3)] * 0.055;

      const rdx0 = fwdX + rightX * ndcX * fovScale + upX * ndcY * fovScale;
      const rdy0 = fwdY + upY * ndcY * fovScale;
      const rdz0 = fwdZ + rightZ * ndcX * fovScale + upZ * ndcY * fovScale;
      const rdl = Math.hypot(rdx0, rdy0, rdz0) || 1;
      const rdx = rdx0 / rdl;
      const rdy = rdy0 / rdl;
      const rdz = rdz0 / rdl;

      const b = camX * rdx + (camY + 0.1) * rdy + camZ * rdz;
      const c2 = camX * camX + (camY + 0.1) * (camY + 0.1) + camZ * camZ - boundR2;
      const disc = b * b - c2;

      let hit = false;
      let t = 0.8;
      let hitMat = MAT_BG;

      if (disc >= 0) {
        const sqrtD = Math.sqrt(disc);
        const tStart = Math.max(0.4, -b - sqrtD);
        const tEnd = Math.min(6.4, -b + sqrtD);
        t = tStart;
        for (let step = 0; step < 32; step++) {
          const d = evalSdfFast(camX + rdx * t, camY + rdy * t, camZ + rdz * t, fc);
          if (d < 0.016) {
            hit = true;
            hitMat = lastHitMat;
            break;
          }
          t += d * 0.94;
          if (t > tEnd) break;
        }
      }

      if (hit) {
        const hx = camX + rdx * t;
        const hy = camY + rdy * t;
        const hz = camZ + rdz * t;
        const n = calcNormalFast(hx, hy, hz, fc);
        const matName = MAT_NAMES[hitMat];

        depthBuf[idx] = t;
        nxBuf[idx] = n.x;
        nyBuf[idx] = n.y;
        nzBuf[idx] = n.z;
        matBuf[idx] = hitMat;

        if (shaderMode === 'depth') {
          const depthFactor = clamp(1 - (t - 1.45) / 3.4, 0.14, 1);
          cells[idx] = {
            ch: mapLuminanceToChar(depthFactor, DEPTH_RAMP, dither * 0.5),
            intensity: depthFactor,
            material: matName,
          };
          continue;
        }

        if (shaderMode === 'norm') {
          const rCh = Math.round(clamp(n.x * 0.5 + 0.5, 0.12, 1) * 255);
          const gCh = Math.round(clamp(n.y * 0.5 + 0.5, 0.12, 1) * 255);
          const bCh = Math.round(clamp(n.z * 0.5 + 0.5, 0.18, 1) * 255);
          const ch =
            hitMat === MAT_EYE
              ? '◉'
              : hitMat === MAT_VISOR
              ? '◈'
              : hitMat === MAT_MOUTH
              ? 'O'
              : mapVectorNormalToChar(n.x, n.y, n.z);
          cells[idx] = {
            ch,
            intensity: 0.92,
            material: matName,
            rgb: `rgb(${rCh}, ${gCh}, ${bCh})`,
          };
          continue;
        }

        const ndotv = Math.abs(-(n.x * rdx + n.y * rdy + n.z * rdz));

        if (shaderMode === 'wire') {
          const isEdge =
            ndotv < 0.43 ||
            hitMat === MAT_EYE ||
            hitMat === MAT_MOUTH ||
            hitMat === MAT_VISOR ||
            hitMat === MAT_PILLAR ||
            hitMat === MAT_ORB ||
            hitMat === MAT_PULSE;
          if (isEdge) {
            const ch =
              hitMat === MAT_EYE
                ? '◉'
                : hitMat === MAT_MOUTH
                ? 'O'
                : hitMat === MAT_VISOR
                ? '◈'
                : hitMat === MAT_ORB
                ? '◆'
                : mapEdgeNormalToChar(n.x, n.y);
            cells[idx] = {
              ch,
              intensity: clamp(0.68 + (1 - ndotv) * 0.32, 0.54, 1),
              material: matName,
              isEdge: true,
            };
          } else {
            cells[idx] = {
              ch: (r + c) % 4 === 0 ? '·' : ' ',
              intensity: 0.22,
              material: matName,
            };
          }
          continue;
        }

        if (shaderMode === 'holo') {
          const scanWave = 0.62 + 0.38 * Math.sin(hy * 14 - time * 7.2);
          const fresnel = Math.pow(1 - clamp(ndotv, 0, 1), 1.55);
          const holoLum = clamp(
            (0.24 + fresnel * 0.76) * scanWave + (hitMat === MAT_EYE || hitMat === MAT_ORB ? 0.38 : 0),
            0.12,
            1
          );
          const ch =
            hitMat === MAT_EYE
              ? '◉'
              : hitMat === MAT_VISOR
              ? '◈'
              : hitMat === MAT_ORB
              ? '◆'
              : hitMat === MAT_MOUTH
              ? fc.viseme === 'round'
                ? 'o'
                : 'O'
              : r % 2 === 0
              ? mapLuminanceToChar(holoLum, HOLO_RAMP, dither * 0.4)
              : '·';
          cells[idx] = {
            ch,
            intensity: holoLum,
            material: matName,
          };
          continue;
        }

        // SOLID shader: Key light + 2-tap AO + 4-tap Soft SDF Shadow + Rim Fresnel + Specular
        const ao = calcAOFast(hx, hy, hz, n.x, n.y, n.z, fc);
        const diffRaw = Math.max(0, n.x * keyX + n.y * keyY + n.z * keyZ);
        const shadow =
          diffRaw > 0.12 && (hitMat === MAT_BODY || hitMat === MAT_HAIR)
            ? calcSoftShadow(hx, hy, hz, keyX, keyY, keyZ, fc)
            : 1.0;
        const diff = diffRaw * shadow;
        const rim = Math.pow(1 - clamp(ndotv, 0, 1), 2.0) * (0.52 + energy * 0.48);
        const rimBack = Math.max(0, n.x * rimX + n.y * rimY + n.z * rimZ) * 0.4;
        const hxV = keyX - rdx;
        const hyV = keyY - rdy;
        const hzV = keyZ - rdz;
        const hl = Math.hypot(hxV, hyV, hzV) || 1;
        const ndoth = Math.max(0, (n.x * hxV + n.y * hyV + n.z * hzV) / hl);
        const spec = Math.pow(ndoth, 22) * 0.62 * shadow;

        let lum = (0.14 + diff * 0.66) * ao + rim * 0.4 + rimBack + spec;
        if (hitMat === MAT_EYE || hitMat === MAT_VISOR) {
          lum = clamp(0.88 + energy * 0.12, 0.86, 1);
        } else if (hitMat === MAT_MOUTH) {
          lum = clamp(0.68 + (isSpeaking ? energy * 0.32 : 0.12), 0.62, 1);
        } else if (hitMat === MAT_RING || hitMat === MAT_PILLAR || hitMat === MAT_ORB || hitMat === MAT_PULSE) {
          lum = clamp(0.56 + diffRaw * 0.36 + energy * 0.28, 0.44, 1);
        } else if (hitMat === MAT_HAIR) {
          lum *= 0.8;
        } else if (hitMat === MAT_WING) {
          lum = clamp(lum + 0.1 + energy * 0.18, 0.22, 1);
        }

        lum = clamp(lum, 0.08, 1);
        const ch =
          hitMat === MAT_EYE
            ? '◉'
            : hitMat === MAT_VISOR
            ? '◈'
            : hitMat === MAT_ORB
            ? '◆'
            : hitMat === MAT_PULSE
            ? '~'
            : hitMat === MAT_MOUTH
            ? fc.viseme === 'round'
              ? 'o'
              : 'O'
            : mapLuminanceToChar(lum, CLEAN_RAMP, dither);

        cells[idx] = {
          ch,
          intensity: lum,
          material: matName,
        };
        continue;
      }

      depthBuf[idx] = 99;
      nxBuf[idx] = 0;
      nyBuf[idx] = 0;
      nzBuf[idx] = 1;
      matBuf[idx] = MAT_BG;

      // 3D Perspective Cyber-Grid Floor with Ground Contact Shadow & Audio Ripple (y = -1.42)
      if (rdy < -0.04) {
        const floorT = (-1.42 - camY) / rdy;
        if (floorT > 0.5 && floorT < 16) {
          const fxW = camX + rdx * floorT;
          const fzW = camZ + rdz * floorT;
          const fzScroll = fzW - time * 1.1;
          const gx = Math.abs(fxW - Math.round(fxW));
          const gz = Math.abs(fzScroll - Math.round(fzScroll));

          // Ground contact shadow beneath Hermes bust
          const radialDist = Math.hypot(fxW * 0.85, fzW + 0.1);
          const shadowMask = radialDist < 1.25 ? 0.38 + (radialDist / 1.25) * 0.62 : 1.0;

          // Expanding 3D acoustic shockwave ripple on floor plane
          const rippleWave =
            isSpeaking || energy > 0.15
              ? Math.sin(radialDist * 5.2 - time * 8.5) * 0.5 + 0.5
              : 0;
          const isRipple =
            (isSpeaking || energy > 0.18) &&
            radialDist > 0.9 &&
            radialDist < 4.5 &&
            rippleWave > 0.86;

          if (isRipple) {
            const fade = clamp((1 - floorT / 14) * (0.45 + energy * 0.55), 0.15, 0.85);
            cells[idx] = {
              ch: '~',
              intensity: fade,
              material: 'pulse',
            };
            continue;
          }

          if (gx < 0.055 || gz < 0.055) {
            const fade = clamp((1 - floorT / 15) * shadowMask, 0.06, 0.72);
            cells[idx] = {
              ch: gx < 0.055 && gz < 0.055 ? '+' : gx < 0.055 ? '|' : '-',
              intensity: fade,
              material: 'grid',
            };
            continue;
          }
        }
      }

      const starHash = Math.sin(c * 12.9898 + r * 78.233) * 43758.5453;
      const frac = starHash - Math.floor(starHash);
      if (frac > 0.9935) {
        cells[idx] = {
          ch: '·',
          intensity: 0.25 + 0.2 * Math.sin(time * 3 + c + r),
          material: 'bg',
        };
      } else {
        cells[idx] = {
          ch: ' ',
          intensity: 0,
          material: 'bg',
        };
      }
    }
  }

  // PASS 2: Screen-Space 3D Depth & Normal Crease Contour Outlines (SOLID & HOLO)
  if (shaderMode === 'solid' || shaderMode === 'holo') {
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        const idx = r * cols + c;
        const m = matBuf[idx];
        if (m === MAT_BG || m === MAT_EYE || m === MAT_MOUTH || m === MAT_VISOR || m === MAT_ORB || m === MAT_PULSE) {
          continue;
        }

        const dC = depthBuf[idx];
        const dR = depthBuf[idx + 1];
        const dD = depthBuf[idx + cols];
        const depthJump = Math.abs(dC - dR) > 0.4 || Math.abs(dC - dD) > 0.4;

        const nDotR =
          nxBuf[idx] * nxBuf[idx + 1] +
          nyBuf[idx] * nyBuf[idx + 1] +
          nzBuf[idx] * nzBuf[idx + 1];
        const nDotD =
          nxBuf[idx] * nxBuf[idx + cols] +
          nyBuf[idx] * nyBuf[idx + cols] +
          nzBuf[idx] * nzBuf[idx + cols];

        const crease =
          matBuf[idx + 1] !== m || matBuf[idx + cols] !== m || nDotR < 0.56 || nDotD < 0.56;

        if (depthJump || crease) {
          cells[idx] = {
            ch: mapEdgeNormalToChar(nxBuf[idx], nyBuf[idx]),
            intensity: Math.max(cells[idx].intensity, 0.8),
            material: MAT_NAMES[m],
            isEdge: true,
          };
        }
      }
    }
  }

  return { cols, rows, cells };
}

export function getPaletteColors(theme: PhosphorTheme): {
  primary: string;
  bright: string;
  accent: string;
  dim: string;
  glow: string;
} {
  switch (theme) {
    case 'cyan':
      return {
        primary: '#22D3EE',
        bright: '#ECFEFF',
        accent: '#F5B800',
        dim: '#1E3A4C',
        glow: 'rgba(34, 211, 238, 0.55)',
      };
    case 'mono':
      return {
        primary: '#E2E8F0',
        bright: '#FFFFFF',
        accent: '#38BDF8',
        dim: '#334155',
        glow: 'rgba(226, 232, 240, 0.35)',
      };
    case 'gold':
    default:
      return {
        primary: '#F5B800',
        bright: '#FFF6CC',
        accent: '#22D3EE',
        dim: '#4A3808',
        glow: 'rgba(245, 184, 0, 0.55)',
      };
  }
}
