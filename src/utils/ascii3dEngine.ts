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
// index 1 in MAT_NAMES is reserved for 'grid'
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

const BG_EMPTY_CELL: AsciiCell = Object.freeze({
  ch: ' ',
  intensity: 0,
  material: 'bg',
});

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
  const x0 = x / rx;
  const y0 = y / ry;
  const z0 = z / rz;
  const k0 = Math.sqrt(x0 * x0 + y0 * y0 + z0 * z0);
  if (k0 < 1e-6) return -(rx < ry ? (rx < rz ? rx : rz) : ry < rz ? ry : rz);
  const x1 = x0 / rx;
  const y1 = y0 / ry;
  const z1 = z0 / rz;
  const k1 = Math.sqrt(x1 * x1 + y1 * y1 + z1 * z1) || 1;
  return (k0 * (k0 - 1)) / k1;
}

function sdEllipsoidInv(
  x: number,
  y: number,
  z: number,
  irx: number,
  iry: number,
  irz: number,
  minR: number
): number {
  const x0 = x * irx;
  const y0 = y * iry;
  const z0 = z * irz;
  const k0 = Math.sqrt(x0 * x0 + y0 * y0 + z0 * z0);
  if (k0 < 1e-6) return -minR;
  const x1 = x0 * irx;
  const y1 = y0 * iry;
  const z1 = z0 * irz;
  const k1 = Math.sqrt(x1 * x1 + y1 * y1 + z1 * z1) || 1;
  return (k0 * (k0 - 1)) / k1;
}

function sdBox(x: number, y: number, z: number, bx: number, by: number, bz: number): number {
  const qx = (x < 0 ? -x : x) - bx;
  const qy = (y < 0 ? -y : y) - by;
  const qz = (z < 0 ? -z : z) - bz;
  const px = qx > 0 ? qx : 0;
  const py = qy > 0 ? qy : 0;
  const pz = qz > 0 ? qz : 0;
  const m = qy > qz ? qy : qz;
  return Math.sqrt(px * px + py * py + pz * pz) + Math.min(qx > m ? qx : m, 0);
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
  const dx = pax - bax * h;
  const dy = pay - bay * h;
  const dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}

function sdTorus(x: number, y: number, z: number, majorR: number, minorR: number): number {
  const qx = Math.sqrt(x * x + z * z) - majorR;
  return Math.sqrt(qx * qx + y * y) - minorR;
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
    case 'rest':
      return { rx: 0.15, ry: 0.032 };
    case 'mbp':
      return { rx: 0.165, ry: 0.016 };
    case 'fv':
      return { rx: 0.16, ry: 0.048 + boost * 0.4 };
    case 'lth':
      return { rx: 0.17, ry: 0.085 + boost * 0.7 };
    case 'smile':
      return { rx: 0.195, ry: 0.028 };
    case 'small':
      return { rx: 0.135, ry: 0.062 + boost };
    case 'mid':
      return { rx: 0.165, ry: 0.102 + boost };
    case 'round':
      return { rx: 0.112, ry: 0.125 + boost };
    case 'ee':
      return { rx: 0.235, ry: 0.095 + boost * 0.75 };
    case 'wide':
      return { rx: 0.21, ry: 0.148 + boost };
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
    mouthOpen: viseme !== 'closed' && viseme !== 'smile' && viseme !== 'mbp',
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
let sdfBestD = 99;
let sdfBestMat = MAT_BG;

function evalHeadAssembly(px: number, py: number, pz: number, fc: FramePrecompute): void {
  const hpx = px * fc.cYaw + pz * fc.sYaw;
  const hpz = -px * fc.sYaw + pz * fc.cYaw;
  const hax = hpx < 0 ? -hpx : hpx;

  const cranium = sdEllipsoidInv(hpx, py - 0.13, hpz, 1.6393443, 1.4705882, 1.7241379, 0.58);
  const chin = py < 0.38 ? sdEllipsoidInv(hpx, py + 0.26, hpz - 0.09, 2.5641026, 2.3255814, 2.2222222, 0.39) : 99;
  let headDist = smin(cranium, chin, 0.22);
  if (hpz > 0.24 && hax < 0.32 && py > -0.35 && py < 0.32) {
    const nose = sdCapsule(hpx, py, hpz, 0, 0.07, 0.54, 0, -0.09, 0.62, 0.048);
    headDist = smin(headDist, nose, 0.05);
  }
  if (hpz > 0.40 && hax < 0.42 && py > -0.10 && py < 0.26) {
    const eyeSocket = sdEllipsoidInv(hax - 0.22, py - 0.08, hpz - 0.56, 7.4074074, 8.0, 12.5, 0.08);
    if (eyeSocket < 0) headDist = Math.max(headDist, -eyeSocket * 0.65);
  }
  if (hpz > 0.26 && hax < 0.34 && py > -0.48 && py < -0.02) {
    const smileBend = fc.isSmile ? hpx * hpx * 0.42 : 0;
    const mouthCavity = sdEllipsoid(hpx, py + 0.27 - smileBend, hpz - 0.49, fc.mouthRx, fc.mouthRy, 0.16);
    if (mouthCavity < 0) headDist = Math.max(headDist, -mouthCavity);
  }
  if (headDist < sdfBestD) {
    sdfBestD = headDist;
    sdfBestMat = MAT_BODY;
  }

  if (fc.mouthOpen && hpz > 0.10 && hax < 0.42 && py > -0.58 && py < 0.08) {
    const vocalCore = sdEllipsoid(hpx, py + 0.27, hpz - 0.43, fc.mouthRx * 0.76, fc.mouthRy * 0.78, 0.09);
    if (vocalCore < sdfBestD) {
      sdfBestD = vocalCore;
      sdfBestMat = MAT_MOUTH;
    }
  }

  const hairBack = sdEllipsoidInv(hpx, py - 0.16, hpz + 0.14, 1.4084507, 1.2987013, 1.5625, 0.64);
  let hairShell = hairBack;
  if (hpz > -0.20) {
    const faceWindow = sdEllipsoidInv(hpx, py + 0.01, hpz - 0.36, 1.9230769, 1.7857143, 2.0833333, 0.48);
    if (-faceWindow > hairShell) hairShell = -faceWindow;
  }
  const bangL = hpx < 0.06 && hpz > 0.04 && py > -0.45 ? sdCapsule(hpx, py, hpz, -0.22, 0.72, 0.33, -0.56, -0.2, 0.36, 0.125) : 99;
  const bangR = hpx > -0.06 && hpz > 0.04 && py > -0.45 ? sdCapsule(hpx, py, hpz, 0.22, 0.72, 0.33, 0.56, -0.2, 0.36, 0.125) : 99;
  const bangC = hax < 0.28 && hpz > 0.18 && py > 0.15 ? sdCapsule(hpx, py, hpz, 0.04, 0.76, 0.44, -0.06, 0.41, 0.52, 0.085) : 99;
  const hairMin = hairShell < bangL ? (hairShell < bangR ? hairShell : bangR) : (bangL < bangR ? bangL : bangR);
  const hairDist = smin(hairMin, bangC, 0.07);
  if (hairDist < sdfBestD) {
    sdfBestD = hairDist;
    sdfBestMat = MAT_HAIR;
  }

  if (hpz > 0.18 && py > -0.22 && py < 0.38 && hax < 0.50) {
    const eyeDist = sdEllipsoid(hax - 0.22 - fc.eyeGazeX, py - 0.08, hpz - 0.53, 0.115, fc.eyeScaleY, 0.09);
    if (eyeDist < sdfBestD) {
      sdfBestD = eyeDist;
      sdfBestMat = MAT_EYE;
    }
  }

  if (hpz > 0.22 && py > 0.05 && py < 0.48 && hax < 0.50) {
    const bx0 = hax - 0.22;
    const by0 = py - 0.26;
    const browDist = sdBox(bx0 * fc.cBrow - by0 * fc.sBrow, bx0 * fc.sBrow + by0 * fc.cBrow, hpz - 0.54, 0.125, 0.024, 0.042);
    if (browDist < sdfBestD) {
      sdfBestD = browDist;
      sdfBestMat = MAT_HAIR;
    }
  }

  if (hpz > 0.20 && py > 0.30 && py < 0.80 && hax < 0.36) {
    const vx0 = hpx;
    const vy0 = py - 0.54;
    const visorDist = sdBox((vx0 - vy0) * 0.7071, (vx0 + vy0) * 0.7071, hpz - 0.53, 0.085, 0.085, 0.052);
    if (visorDist < sdfBestD) {
      sdfBestD = visorDist;
      sdfBestMat = MAT_VISOR;
    }
  }
}

function evalRingsAssembly(wx: number, wy: number, wz: number, fc: FramePrecompute): void {
  const r1x = wx * fc.cR1Y + wz * fc.sR1Y;
  const r1z = -wx * fc.sR1Y + wz * fc.cR1Y;
  const r1y = wy * 0.94 - r1z * 0.34;
  const r1zz = wy * 0.34 + r1z * 0.94;
  const ring1 = sdTorus(r1x, r1y - 0.66, r1zz, 1.38, 0.028);
  if (ring1 < sdfBestD) {
    sdfBestD = ring1;
    sdfBestMat = MAT_RING;
  }
  const r2x = wx * fc.cR2Y + wz * fc.sR2Y;
  const r2z = -wx * fc.sR2Y + wz * fc.cR2Y;
  const r2y = wy * 0.88 + r2z * 0.47;
  const r2zz = -wy * 0.47 + r2z * 0.88;
  const ring2 = sdTorus(r2x, r2y + 0.58, r2zz, 1.62, 0.022);
  if (ring2 < sdfBestD) {
    sdfBestD = ring2;
    sdfBestMat = MAT_RING;
  }
  const o1dx = wx - fc.orb1X;
  const o1dz = wz - fc.orb1Z;
  const orb1 = sdOctahedron(o1dx * fc.cOrbSpin - o1dz * fc.sOrbSpin, wy - fc.orb1Y, o1dx * fc.sOrbSpin + o1dz * fc.cOrbSpin, 0.115);
  const o2dx = wx - fc.orb2X;
  const o2dz = wz - fc.orb2Z;
  const orb2 = sdOctahedron(o2dx * fc.cOrbSpin + o2dz * fc.sOrbSpin, wy - fc.orb2Y, -o2dx * fc.sOrbSpin + o2dz * fc.cOrbSpin, 0.115);
  const orbDist = orb1 < orb2 ? orb1 : orb2;
  if (orbDist < sdfBestD) {
    sdfBestD = orbDist;
    sdfBestMat = MAT_ORB;
  }
  if (fc.pulseActive) {
    const pulseRing = sdTorus(wx, wy + 0.55, wz, fc.pulseRadius, 0.018 + fc.energy * 0.015);
    if (pulseRing < sdfBestD) {
      sdfBestD = pulseRing;
      sdfBestMat = MAT_PULSE;
    }
  }
}

function evalTorsoAssembly(px: number, py: number, pz: number): void {
  const neck = sdCapsule(px, py, pz, 0, -0.45, -0.02, 0, -0.82, -0.04, 0.185);
  const shoulders = sdEllipsoidInv(px, py + 1.08, pz + 0.04, 1.0526316, 2.2222222, 2.2727273, 0.44);
  const collar = sdTorus(px, py + 0.72, pz + 0.02, 0.33, 0.07);
  const torsoDist = smin(smin(neck, shoulders, 0.19), collar, 0.08);
  if (torsoDist < sdfBestD) {
    sdfBestD = torsoDist;
    sdfBestMat = MAT_BODY;
  }
}

function evalWingAssembly(ax: number, py: number, pz: number, fc: FramePrecompute): void {
  const wx0 = ax - 0.68;
  const wy0 = py - 0.38;
  const wbx = wx0 * fc.cWing - wy0 * fc.sWing;
  const wby = wx0 * fc.sWing + wy0 * fc.cWing;
  const wbz = pz + 0.04;
  const earCup = sdEllipsoidInv(ax - 0.65, py - 0.02, pz + 0.02, 9.0909091, 5.0, 6.25, 0.11);
  const w1 = sdBox(wbx - 0.36, wby - 0.21, wbz, 0.44, 0.072, 0.055);
  const w2 = sdBox(wbx - 0.28, wby - 0.04, wbz, 0.35, 0.065, 0.05);
  const w3 = sdBox(wbx - 0.19, wby + 0.12, wbz, 0.26, 0.056, 0.046);
  const w4 = sdBox(wbx - 0.11, wby + 0.26, wbz, 0.17, 0.045, 0.04);
  const wingDist = Math.min(earCup, Math.min(Math.min(w1, w2), Math.min(w3, w4)));
  if (wingDist < sdfBestD) {
    sdfBestD = wingDist;
    sdfBestMat = MAT_WING;
  }
}

function evalPillarAssembly(awx: number, wy: number, wz: number, fc: FramePrecompute): void {
  const p0 = sdBox(awx - 1.34, wy + 1.38 - fc.pillarH0, wz + 0.55, 0.075, fc.pillarH0, 0.075);
  const p1 = sdBox(awx - 1.56, wy + 1.38 - fc.pillarH1, wz + 0.68, 0.075, fc.pillarH1, 0.075);
  const p2 = sdBox(awx - 1.78, wy + 1.38 - fc.pillarH2, wz + 0.82, 0.075, fc.pillarH2, 0.075);
  const pillarDist = p0 < p1 ? (p0 < p2 ? p0 : p2) : (p1 < p2 ? p1 : p2);
  if (pillarDist < sdfBestD) {
    sdfBestD = pillarDist;
    sdfBestMat = MAT_PILLAR;
  }
}

/**
 * Hierarchical conservative-bounded SDF evaluation:
 * Computes cheap bounding-sphere lower bounds for every sub-assembly first,
 * skipping exact primitive evaluations for sub-assemblies strictly farther than `sdfBestD`.
 */
function evalSdfFast(wx: number, wy: number, wz: number, fc: FramePrecompute, exactMode = false): number {
  const y0 = wy - fc.breathY;
  const px = wx * fc.cTilt - y0 * fc.sTilt;
  const py1 = wx * fc.sTilt + y0 * fc.cTilt;
  const py = py1 * fc.cTalkX - wz * fc.sTalkX;
  const pz = py1 * fc.sTalkX + wz * fc.cTalkX;
  const ax = px < 0 ? -px : px;
  const awx = wx < 0 ? -wx : wx;
  const awy = wy < 0 ? -wy : wy;
  const awz = wz < 0 ? -wz : wz;

  const bHead = (ax + Math.abs(py - 0.1) + Math.abs(pz - 0.04)) * 0.57735026 - 0.96;
  const bTorso = (ax + Math.abs(py + 0.85) + Math.abs(pz + 0.02)) * 0.57735026 - 1.12;
  const bWing =
    py < -0.55 || ax < 0.10
      ? 99
      : (Math.abs(ax - 0.92) + Math.abs(py - 0.32) + Math.abs(pz + 0.04)) * 0.57735026 - 0.78;
  const r2 = wx * wx + wy * wy + wz * wz;
  let bRings: number;
  if (r2 >= 3.5344) {
    bRings = (awx + awy + awz) * 0.57735026 - 1.88;
  } else if (r2 <= 1.3456) {
    const rUpper = awx + awy + awz;
    bRings = rUpper < 1.16 ? 1.16 - rUpper : Math.abs(Math.sqrt(r2) - 1.52) - 0.36;
  } else {
    bRings = Math.abs(Math.sqrt(r2) - 1.52) - 0.36;
  }
  const bPillars =
    wy > -0.10 || awx < 0.78
      ? 99
      : (Math.abs(awx - 1.56) + Math.abs(wy + 0.98) + Math.abs(wz + 0.68)) * 0.57735026 - 0.75;

  let minBound = bHead;
  if (bTorso < minBound) minBound = bTorso;
  if (bWing < minBound) minBound = bWing;
  if (bRings < minBound) minBound = bRings;
  if (bPillars < minBound) minBound = bPillars;

  if (!exactMode && minBound > 0.08) {
    lastHitMat = MAT_BG;
    return minBound;
  }

  sdfBestD = 99;
  sdfBestMat = MAT_BG;
  let evaluated = 0;

  if (bHead === minBound) {
    evaluated = 1;
    evalHeadAssembly(px, py, pz, fc);
  } else if (bRings === minBound) {
    evaluated = 8;
    evalRingsAssembly(wx, wy, wz, fc);
  } else if (bPillars === minBound) {
    evaluated = 16;
    evalPillarAssembly(awx, wy, wz, fc);
  } else if (bWing === minBound) {
    evaluated = 4;
    evalWingAssembly(ax, py, pz, fc);
  } else {
    evaluated = 2;
    evalTorsoAssembly(px, py, pz);
  }

  if ((evaluated & 1) === 0 && bHead < sdfBestD) evalHeadAssembly(px, py, pz, fc);
  if ((evaluated & 2) === 0 && bTorso < sdfBestD) evalTorsoAssembly(px, py, pz);
  if ((evaluated & 4) === 0 && bWing < sdfBestD) evalWingAssembly(ax, py, pz, fc);
  if ((evaluated & 8) === 0 && bRings < sdfBestD) evalRingsAssembly(wx, wy, wz, fc);
  if ((evaluated & 16) === 0 && bPillars < sdfBestD) evalPillarAssembly(awx, wy, wz, fc);

  lastHitMat = sdfBestMat;
  return sdfBestD;
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

let normX = 0;
let normY = 0;
let normZ = 1;

function evalRingsDistOnly(wx: number, wy: number, wz: number, fc: FramePrecompute): number {
  sdfBestD = 99;
  sdfBestMat = MAT_BG;
  evalRingsAssembly(wx, wy, wz, fc);
  return sdfBestD;
}

function evalPillarDistOnly(wx: number, wy: number, wz: number, fc: FramePrecompute): number {
  const awx = wx < 0 ? -wx : wx;
  const p0 = sdBox(awx - 1.34, wy + 1.38 - fc.pillarH0, wz + 0.55, 0.075, fc.pillarH0, 0.075);
  const p1 = sdBox(awx - 1.56, wy + 1.38 - fc.pillarH1, wz + 0.68, 0.075, fc.pillarH1, 0.075);
  const p2 = sdBox(awx - 1.78, wy + 1.38 - fc.pillarH2, wz + 0.82, 0.075, fc.pillarH2, 0.075);
  return p0 < p1 ? (p0 < p2 ? p0 : p2) : (p1 < p2 ? p1 : p2);
}

function calcNormalFastVoid(x: number, y: number, z: number, fc: FramePrecompute, hintMat = -1): void {
  const e = 0.008;
  let k1: number;
  let k2: number;
  let k3: number;
  let k4: number;
  if (hintMat === MAT_RING || hintMat === MAT_ORB || hintMat === MAT_PULSE) {
    k1 = evalRingsDistOnly(x + e, y - e, z - e, fc);
    k2 = evalRingsDistOnly(x - e, y - e, z + e, fc);
    k3 = evalRingsDistOnly(x - e, y + e, z - e, fc);
    k4 = evalRingsDistOnly(x + e, y + e, z + e, fc);
  } else if (hintMat === MAT_PILLAR) {
    k1 = evalPillarDistOnly(x + e, y - e, z - e, fc);
    k2 = evalPillarDistOnly(x - e, y - e, z + e, fc);
    k3 = evalPillarDistOnly(x - e, y + e, z - e, fc);
    k4 = evalPillarDistOnly(x + e, y + e, z + e, fc);
  } else {
    k1 = evalSdfFast(x + e, y - e, z - e, fc, true);
    k2 = evalSdfFast(x - e, y - e, z + e, fc, true);
    k3 = evalSdfFast(x - e, y + e, z - e, fc, true);
    k4 = evalSdfFast(x + e, y + e, z + e, fc, true);
  }
  const nx = k1 - k2 - k3 + k4;
  const ny = -k1 - k2 + k3 + k4;
  const nz = -k1 + k2 - k3 + k4;
  const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  normX = nx / l;
  normY = ny / l;
  normZ = nz / l;
}

function calcNormalFast(x: number, y: number, z: number, fc: FramePrecompute): Vec3 {
  calcNormalFastVoid(x, y, z, fc);
  return { x: normX, y: normY, z: normZ };
}

/**
 * Fast 2-tap SDF Ambient Occlusion for sculpted crevices.
 */
function calcAOFast(x: number, y: number, z: number, nx: number, ny: number, nz: number, fc: FramePrecompute): number {
  const d1 = evalSdfFast(x + nx * 0.12, y + ny * 0.12, z + nz * 0.12, fc, false);
  const occ = Math.max(0, 0.12 - d1) * 1.95;
  return clamp(0.86 + ny * 0.14 - occ * 1.45, 0.30, 1);
}

/**
 * Fast 2-tap SDF raymarched self-shadowing toward key light.
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
  let t = 0.15;
  for (let i = 0; i < 2; i++) {
    const h = evalSdfFast(ox + lx * t, oy + ly * t, oz + lz * t, fc);
    if (h < 0.015) return 0.38;
    const penumbra = (3.8 * h) / t;
    if (penumbra < res) res = penumbra;
    t += clamp(h, 0.20, 0.40);
  }
  return clamp(res, 0.38, 1.0);
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

function shadeHitCell(
  shaderMode: AsciiShaderMode,
  hitMat: number,
  matName: AsciiMaterial,
  _t: number,
  hx: number,
  hy: number,
  hz: number,
  rdx: number,
  rdy: number,
  rdz: number,
  nX: number,
  nY: number,
  nZ: number,
  r: number,
  c: number,
  dither: number,
  fc: FramePrecompute
): AsciiCell {
  if (shaderMode === 'norm') {
    const rCh = Math.round(clamp(nX * 0.5 + 0.5, 0.12, 1) * 255);
    const gCh = Math.round(clamp(nY * 0.5 + 0.5, 0.12, 1) * 255);
    const bCh = Math.round(clamp(nZ * 0.5 + 0.5, 0.18, 1) * 255);
    const ch =
      hitMat === MAT_EYE
        ? '◉'
        : hitMat === MAT_VISOR
        ? '◈'
        : hitMat === MAT_MOUTH
        ? 'O'
        : mapVectorNormalToChar(nX, nY, nZ);
    return {
      ch,
      intensity: 0.92,
      material: matName,
      rgb: `rgb(${rCh}, ${gCh}, ${bCh})`,
    };
  }

  const ndotv = Math.abs(-(nX * rdx + nY * rdy + nZ * rdz));

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
          : mapEdgeNormalToChar(nX, nY);
      return {
        ch,
        intensity: clamp(0.68 + (1 - ndotv) * 0.32, 0.54, 1),
        material: matName,
        isEdge: true,
      };
    }
    return {
      ch: (r + c) % 4 === 0 ? '·' : ' ',
      intensity: 0.22,
      material: matName,
    };
  }

  if (shaderMode === 'holo') {
    const scanWave = 0.62 + 0.38 * Math.sin(hy * 14 - fc.time * 7.2);
    const glintWave = 0.88 + 0.12 * Math.sin((hx + hy) * 9 - fc.time * 4.2);
    const oneMinusNdv = 1 - clamp(ndotv, 0, 1);
    const fresnel = oneMinusNdv * Math.sqrt(oneMinusNdv);
    const holoLum = clamp(
      (0.24 + fresnel * 0.78) * scanWave * glintWave + (hitMat === MAT_EYE || hitMat === MAT_ORB ? 0.38 : 0),
      0.14,
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
    return { ch, intensity: holoLum, material: matName };
  }

  // Fast exit for self-illuminated materials (zero wasted AO / shadow raymarch taps)
  if (hitMat === MAT_EYE) {
    return { ch: '◉', intensity: clamp(0.90 + fc.energy * 0.10, 0.88, 1), material: matName };
  }
  if (hitMat === MAT_VISOR) {
    return { ch: '◈', intensity: clamp(0.90 + fc.energy * 0.10, 0.88, 1), material: matName };
  }
  if (hitMat === MAT_MOUTH) {
    return {
      ch: fc.viseme === 'round' ? 'o' : 'O',
      intensity: clamp(0.68 + (fc.isSpeaking ? fc.energy * 0.32 : 0.12), 0.62, 1),
      material: matName,
    };
  }
  const keyX = 0.468;
  const keyY = 0.585;
  const keyZ = 0.663;
  const diffRaw = Math.max(0, nX * keyX + nY * keyY + nZ * keyZ);
  if (hitMat === MAT_RING || hitMat === MAT_PILLAR || hitMat === MAT_ORB || hitMat === MAT_PULSE) {
    const lum = clamp(0.56 + diffRaw * 0.36 + fc.energy * 0.28, 0.44, 1);
    const ch =
      hitMat === MAT_ORB
        ? '◆'
        : hitMat === MAT_PULSE
        ? '~'
        : mapLuminanceToChar(lum, CLEAN_RAMP, dither);
    return { ch, intensity: lum, material: matName };
  }

  // SOLID sculpted body/hair/wing: 1-tap AO + 2-tap Soft Shadow + Rim Fresnel + Blinn-Phong
  const ao = calcAOFast(hx, hy, hz, nX, nY, nZ, fc);
  const shadow =
    diffRaw > 0.16 && ao > 0.42 && (hitMat === MAT_BODY || hitMat === MAT_HAIR)
      ? calcSoftShadow(hx, hy, hz, keyX, keyY, keyZ, fc)
      : 1.0;
  const diff = diffRaw * shadow;
  const oneMinusNdv = 1 - clamp(ndotv, 0, 1);
  const rim = oneMinusNdv * oneMinusNdv * (0.54 + fc.energy * 0.46);
  const rimBack = Math.max(0, nX * -0.808 + nY * 0.303 + nZ * -0.505) * 0.42;
  const hxV = keyX - rdx;
  const hyV = keyY - rdy;
  const hzV = keyZ - rdz;
  const hl = Math.sqrt(hxV * hxV + hyV * hyV + hzV * hzV) || 1;
  const ndoth = Math.max(0, (nX * hxV + nY * hyV + nZ * hzV) / hl);
  const nd2 = ndoth * ndoth;
  const nd4 = nd2 * nd2;
  const nd8 = nd4 * nd4;
  const nd16 = nd8 * nd8;
  const spec = nd16 * nd4 * nd2 * 0.64 * shadow;

  let lum = (0.14 + diff * 0.66) * ao + rim * 0.42 + rimBack + spec;
  if (hitMat === MAT_HAIR) {
    lum = clamp(lum * 0.80 + rim * 0.10, 0.08, 1);
  } else if (hitMat === MAT_WING) {
    lum = clamp(lum + 0.1 + fc.energy * 0.18, 0.22, 1);
  } else {
    lum = clamp(lum, 0.08, 1);
  }

  return { ch: mapLuminanceToChar(lum, CLEAN_RAMP, dither), intensity: lum, material: matName };
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

  const aspect = (cols * 0.52) / Math.max(1, rows);
  const fovScale = 0.82;
  const boundR2 = 2.26 * 2.26;
  const camYPlus = camY + 0.1;
  const camC2Base = camX * camX + camYPlus * camYPlus + camZ * camZ - boundR2;

  // PASS 1: 3D SDF Raymarch, AO, Soft Shadows & Lighting
  for (let r = 0; r < rows; r++) {
    const ndcY = 1 - (2 * (r + 0.5)) / rows;
    const bayerRow = (r & 3) * 4;
    const upYTerm = upY * ndcY * fovScale;
    const upXTerm = upX * ndcY * fovScale;
    const upZTerm = upZ * ndcY * fovScale;
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const ndcX = ((2 * (c + 0.5)) / cols - 1) * aspect;
      const dither = BAYER_4X4[bayerRow + (c & 3)] * 0.055;

      const rdx0 = fwdX + rightX * ndcX * fovScale + upXTerm;
      const rdy0 = fwdY + upYTerm;
      const rdz0 = fwdZ + rightZ * ndcX * fovScale + upZTerm;
      const rdl = Math.sqrt(rdx0 * rdx0 + rdy0 * rdy0 + rdz0 * rdz0) || 1;
      const rdx = rdx0 / rdl;
      const rdy = rdy0 / rdl;
      const rdz = rdz0 / rdl;

      const b = camX * rdx + camYPlus * rdy + camZ * rdz;
      const disc = b * b - camC2Base;

      let hit = false;
      let t = 0.8;
      let hitMat = MAT_BG;

      if (disc >= 0) {
        const sqrtD = Math.sqrt(disc);
        let tStart = Math.max(0.4, -b - sqrtD);
        let tEnd = Math.min(6.4, -b + sqrtD);
        if (rdy > 1e-4) {
          tStart = Math.max(tStart, (-1.52 - camY) / rdy);
          tEnd = Math.min(tEnd, (1.25 - camY) / rdy);
        } else if (rdy < -1e-4) {
          tStart = Math.max(tStart, (1.25 - camY) / rdy);
          tEnd = Math.min(tEnd, (-1.52 - camY) / rdy);
        } else if (camY < -1.52 || camY > 1.25) {
          tEnd = tStart - 1;
        }
        if (tStart <= tEnd) {
          t = tStart;
          for (let step = 0; step < 16; step++) {
            const d = evalSdfFast(camX + rdx * t, camY + rdy * t, camZ + rdz * t, fc);
            if (d < 0.019) {
              hit = true;
              hitMat = lastHitMat;
              break;
            }
            t += d * 0.99;
            if (t > tEnd) break;
          }
        }
      }

      if (hit) {
        const matName = MAT_NAMES[hitMat];
        depthBuf[idx] = t;
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

        if (shaderMode === 'solid' && (hitMat === MAT_EYE || hitMat === MAT_VISOR || hitMat === MAT_MOUTH)) {
          nxBuf[idx] = 0;
          nyBuf[idx] = 0;
          nzBuf[idx] = 1;
          cells[idx] =
            hitMat === MAT_EYE
              ? { ch: '◉', intensity: clamp(0.90 + fc.energy * 0.10, 0.88, 1), material: matName }
              : hitMat === MAT_VISOR
              ? { ch: '◈', intensity: clamp(0.90 + fc.energy * 0.10, 0.88, 1), material: matName }
              : {
                  ch: fc.viseme === 'round' ? 'o' : 'O',
                  intensity: clamp(0.68 + (fc.isSpeaking ? fc.energy * 0.32 : 0.12), 0.62, 1),
                  material: matName,
                };
          continue;
        }

        const hx = camX + rdx * t;
        const hy = camY + rdy * t;
        const hz = camZ + rdz * t;
        calcNormalFastVoid(hx, hy, hz, fc, hitMat);
        const nX = normX;
        const nY = normY;
        const nZ = normZ;

        nxBuf[idx] = nX;
        nyBuf[idx] = nY;
        nzBuf[idx] = nZ;

        cells[idx] = shadeHitCell(
          shaderMode,
          hitMat,
          matName,
          t,
          hx,
          hy,
          hz,
          rdx,
          rdy,
          rdz,
          nX,
          nY,
          nZ,
          r,
          c,
          dither,
          fc
        );
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
          const fzP = fzW + 0.1;
          const radialDist = Math.sqrt(fxW * fxW * 0.7225 + fzP * fzP);
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

      let sh = (c * 374761393 + r * 668265263) | 0;
      sh = Math.imul(sh ^ (sh >>> 13), 1274126177);
      const frac = ((sh >>> 0) & 0xffff) / 65536;
      if (frac > 0.9935) {
        cells[idx] = {
          ch: '·',
          intensity: 0.25 + 0.2 * Math.sin(time * 3 + c + r),
          material: 'bg',
        };
      } else {
        cells[idx] = BG_EMPTY_CELL;
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
