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

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function smin(a: number, b: number, k: number): number {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return b * (1 - h) + a * h - k * h * (1 - h);
}

function sdCircle(x: number, y: number, cx: number, cy: number, r: number): number {
  return Math.hypot(x - cx, y - cy) - r;
}

function sdEllipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number): number {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return (Math.hypot(dx, dy) - 1) * Math.min(rx, ry);
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
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay || 1), 0, 1);
  return Math.hypot(pax - bax * h, pay - bay * h) - r;
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
  innerEarDist?: number;
}

function evaluateFaceProfile(shape: BrailleShapeKind, x: number, y: number): AnimeFaceProfile {
  switch (shape) {
    case 'clover':
      return {
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
      };
    case 'star':
      return {
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
      };
    case 'ghost':
      return {
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
        innerEarDist: Math.min(
          sdTriangle(x, y, -0.45, -0.30, -0.50, -0.66, -0.22, -0.44),
          sdTriangle(x, y, 0.45, -0.30, 0.22, -0.44, 0.50, -0.66)
        ),
      };
    case 'heart':
      return {
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
        innerEarDist: Math.min(
          sdTriangle(x, y, -0.43, -0.22, -0.52, -0.68, -0.18, -0.36),
          sdTriangle(x, y, 0.43, -0.22, 0.18, -0.36, 0.52, -0.68)
        ),
      };
    case 'cloud':
      return {
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
        innerEarDist: Math.min(
          sdCapsule(x, y, -0.25, -0.36, -0.30, -0.68, 0.055),
          sdCapsule(x, y, 0.26, -0.35, 0.40, -0.62, 0.05)
        ),
      };
    case 'triangle':
      return {
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
      };
    case 'pebble':
      return {
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
      };
    case 'trapezoid':
      return {
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
      };
    case 'blob':
    default:
      return {
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
      };
  }
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
      const earL = sdTriangle(x, y, -0.52, -0.18, -0.55, -0.74, -0.14, -0.38) - 0.04;
      const earR = sdTriangle(x, y, 0.52, -0.18, 0.14, -0.38, 0.55, -0.74) - 0.04;
      const cheekL = sdCapsule(x, y, -0.44, 0.12, -0.52, 0.54, 0.14);
      const cheekR = sdCapsule(x, y, 0.44, 0.12, 0.52, 0.54, 0.14);
      return smin(head, smin(smin(earL, earR, 0.05), smin(cheekL, cheekR, 0.08), 0.08), 0.06);
    }
    case 'heart': {
      // Kitsune Shrine Fox: tall angled fox ears + swept cheek locks
      const head = sdEllipse(x, y, 0, 0.12, 0.50, 0.47);
      const earL = sdTriangle(x, y, -0.50, -0.12, -0.60, -0.78, -0.12, -0.32) - 0.035;
      const earR = sdTriangle(x, y, 0.50, -0.12, 0.12, -0.32, 0.60, -0.78) - 0.035;
      const ruffL = sdCapsule(x, y, -0.42, 0.18, -0.62, 0.52, 0.13);
      const ruffR = sdCapsule(x, y, 0.42, 0.18, 0.62, 0.52, 0.13);
      return smin(head, smin(smin(earL, earR, 0.05), smin(ruffL, ruffR, 0.08), 0.08), 0.06);
    }
    case 'cloud': {
      // Usagi Bunny: tall perky bunny ears (one playfully tilted) + soft bob
      const head = sdEllipse(x, y, 0, 0.16, 0.50, 0.44);
      const earL = sdCapsule(x, y, -0.22, -0.22, -0.32, -0.76, 0.13);
      const earR = sdCapsule(x, y, 0.22, -0.22, 0.44, -0.68, 0.125);
      const earTipR = sdCapsule(x, y, 0.44, -0.68, 0.60, -0.56, 0.10);
      const lockL = sdCircle(x, y, -0.45, 0.34, 0.16);
      const lockR = sdCircle(x, y, 0.45, 0.34, 0.16);
      return smin(
        smin(head, smin(lockL, lockR, 0.10), 0.08),
        smin(earL, smin(earR, earTipR, 0.06), 0.05),
        0.06
      );
    }
    case 'triangle': {
      // Mecha Fin Headset: upward cyber-ear fins + sharp anime hair silhouette
      const head = sdEllipse(x, y, 0, 0.10, 0.50, 0.47);
      const finL = sdTriangle(x, y, -0.52, 0.04, -0.66, -0.62, -0.34, -0.24) - 0.03;
      const finR = sdTriangle(x, y, 0.52, 0.04, 0.34, -0.24, 0.66, -0.62) - 0.03;
      const cupL = sdCapsule(x, y, -0.52, 0.02, -0.52, 0.24, 0.12);
      const cupR = sdCapsule(x, y, 0.52, 0.02, 0.52, 0.24, 0.12);
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
  } = params;

  const subW = cols * 2;
  const subH = rows * 4;
  const subLum = new Float32Array(subW * subH);
  const lines: string[] = new Array(rows);
  const cells = new Uint8Array(cols * rows);

  // Subtle alive breathing + drag/speak squash & stretch
  const breath = Math.sin(time * 2.2) * 0.025;
  const speakBounce = isSpeaking ? Math.sin(time * 13.5) * energy * 0.04 : 0;
  const dragLift = isDragging ? 0.04 : 0;
  const scaleX = 1 + breath * 0.5 - speakBounce * 0.45 + dragLift;
  const scaleY = 1 - breath * 0.7 + speakBounce * 0.85 - dragLift * 0.45;

  const gx = clamp(gazeX, -1, 1) * 0.032;
  const gy = clamp(gazeY, -1, 1) * 0.024;

  const mouthOpen =
    isSpeaking || viseme === 'wide' || viseme === 'round' || viseme === 'mid' || viseme === 'small'
      ? clamp(
          viseme === 'wide'
            ? 0.95
            : viseme === 'round'
            ? 0.72
            : viseme === 'mid'
            ? 0.56
            : viseme === 'small'
            ? 0.38
            : energy * 0.85,
          0,
          1
        )
      : 0;

  const eps = 0.022;

  for (let sy = 0; sy < subH; sy++) {
    const nyRaw = ((sy + 0.5) / subH) * 2 - 1;
    const ny = nyRaw / scaleY;
    const rowOff = sy * subW;

    for (let sx = 0; sx < subW; sx++) {
      const nxRaw = ((sx + 0.5) / subW) * 2 - 1;
      const nx = nxRaw / scaleX;

      const d = evaluateShapeSdf(shape, nx, ny);
      if (d > 0.032) {
        subLum[rowOff + sx] = 0;
        continue;
      }

      const edgeCov = clamp(1 - (d + 0.004) / 0.036, 0, 1);

      const dxGrad = evaluateShapeSdf(shape, nx + eps, ny) - evaluateShapeSdf(shape, nx - eps, ny);
      const dyGrad = evaluateShapeSdf(shape, nx, ny + eps) - evaluateShapeSdf(shape, nx, ny - eps);
      const gradLen = Math.hypot(dxGrad, dyGrad) || 1;
      const edgeWeight = clamp(1 + d * 2.2, 0, 1);
      const snx = (dxGrad / gradLen) * edgeWeight;
      const sny = (dyGrad / gradLen) * edgeWeight;
      const snz = Math.sqrt(Math.max(0.1, 1 - snx * snx - sny * sny));

      const keyDot = clamp(-0.38 * snx - 0.56 * sny + 0.72 * snz, 0, 1);
      const rim = Math.pow(1 - snz, 1.7) * 0.38;

      const profile = evaluateFaceProfile(shape, nx, ny);

      // Anime face oval & hair bangs partition (high-contrast like image_9fdb5ec4.png)
      const dFace = sdEllipse(
        nx - gx * 0.35,
        ny - gy * 0.25,
        profile.faceCx,
        profile.faceCy,
        profile.faceRx,
        profile.faceRy
      );

      let bangBottom = profile.bangHeight;
      if (profile.partType === 'center') {
        bangBottom += -0.05 * Math.exp(-Math.abs(nx) * 8) + 0.025 * Math.cos(nx * 14);
      } else if (profile.partType === 'side') {
        bangBottom += -0.04 * clamp(nx + 0.15, -0.4, 0.4) + 0.02 * Math.sin(nx * 13);
      } else if (profile.partType === 'wispy') {
        bangBottom += 0.03 * Math.cos(nx * 16) - 0.015;
      } else {
        // Straight notched bangs inspired by the main character
        bangBottom += 0.022 * Math.sin(nx * 18) + (Math.abs(nx) < 0.09 ? -0.035 : 0);
      }

      const inFace = dFace < 0 && ny > bangBottom;

      let lum: number;
      if (inFace) {
        // Bright anime porcelain face contrast against hair silhouette
        const faceShade = clamp(0.84 + keyDot * 0.14 - Math.max(0, dFace + 0.12) * 0.25, 0.62, 0.98);
        lum = faceShade * edgeCov;

        // Subtle shadow directly beneath bangs
        const underBang = ny - bangBottom;
        if (underBang >= 0 && underBang < 0.045) {
          lum *= 0.68 + (underBang / 0.045) * 0.32;
        }
      } else {
        // Rich dark anime hair with iconic zigzag hair sheen & rim highlight
        lum = (0.34 + keyDot * 0.26 + rim) * edgeCov;

        // Bright anime zigzag sheen band across bangs & crown (homage to main character portrait)
        const sheenWave = -0.18 + 0.035 * Math.sin(nx * 17 + 0.4);
        const sheenDist = Math.abs(ny - sheenWave);
        if (sheenDist < 0.048 && Math.abs(nx) < 0.46) {
          lum = Math.max(lum, (0.88 - (sheenDist / 0.048) * 0.35) * edgeCov);
        }

        // Main-character style curved cyber headband or mecha visor band
        if (profile.hasHeadband) {
          const bandCurve = -0.30 + (nx * nx) * 0.34;
          const bandDist = Math.abs(ny - bandCurve);
          if (bandDist < 0.055 && Math.abs(nx) < 0.48) {
            lum = 0.96 * edgeCov;
          }
        }

        // Floating golden/bright halo ring highlight
        if (profile.hasHalo && ny < -0.40) {
          lum = Math.max(lum, 0.94 * edgeCov);
        }

        // Inner cat/fox/bunny ear shading cutout so ears read immediately
        if (profile.innerEarDist !== undefined && profile.innerEarDist < 0) {
          lum *= 0.24;
        }
      }

      // Expressive anime eyes inside the face
      if (dFace < 0.04) {
        const eyeY = profile.eyeY + gy * 0.45;
        const leftEyeX = -profile.eyeSep + gx * 0.7;
        const rightEyeX = profile.eyeSep + gx * 0.7;
        const dxL = nx - leftEyeX;
        const dxR = nx - rightEyeX;
        const nearestDx = Math.abs(dxL) < Math.abs(dxR) ? dxL : dxR;
        const nearestEyeX = Math.abs(dxL) < Math.abs(dxR) ? leftEyeX : rightEyeX;
        const dyEye = ny - eyeY;

        if (eyeState === 'blink') {
          const archY = eyeY + 0.02 - (nearestDx * nearestDx) * 1.8;
          if (Math.abs(nearestDx) < profile.eyeRx * 1.15 && Math.abs(ny - archY) < 0.024) {
            lum = 0.04;
          }
        } else if (eyeState === 'sleepy') {
          // Serene half-lidded anime eyes: dark curved lash + hint of lower iris
          const lidY = eyeY - 0.005 + (nearestDx * nearestDx) * 1.3;
          if (Math.abs(nearestDx) < profile.eyeRx * 1.2 && Math.abs(ny - lidY) < 0.026) {
            lum = 0.04;
          } else if (
            ny > lidY &&
            Math.hypot(nearestDx / (profile.eyeRx * 0.85), (ny - (eyeY + 0.03)) / (profile.eyeRy * 0.6)) < 1
          ) {
            lum = 0.12;
          }
        } else if (eyeState === 'happy' && !isSpeaking) {
          // Cheerful anime ^ ^ arc eyes
          const happyY = eyeY + 0.02 + (nearestDx * nearestDx) * 3.0;
          if (Math.abs(nearestDx) < profile.eyeRx * 1.1 && Math.abs(ny - happyY) < 0.025) {
            lum = 0.04;
          }
        } else {
          const rx = eyeState === 'wide' ? profile.eyeRx * 1.12 : profile.eyeRx;
          const ry = eyeState === 'wide' ? profile.eyeRy * 1.12 : profile.eyeRy;
          const irisNorm = Math.hypot(nearestDx / rx, dyEye / ry);

          // Bold curved anime upper eyelash arch
          const lashCurve = eyeY - ry * 0.78 + (nearestDx * nearestDx) * 2.2;
          if (Math.abs(nearestDx) < rx * 1.32 && Math.abs(ny - lashCurve) < 0.025) {
            lum = 0.03;
          } else if (irisNorm < 1.0) {
            // Dual anime highlight catchlights (upper-left key sparkle + lower-right bounce sparkle)
            const glint1 = Math.hypot(
              nx - (nearestEyeX - rx * 0.28 + gx * 0.45),
              ny - (eyeY - ry * 0.28 + gy * 0.45)
            );
            const glint2 = Math.hypot(
              nx - (nearestEyeX + rx * 0.26 + gx * 0.3),
              ny - (eyeY + ry * 0.30 + gy * 0.3)
            );
            if (glint1 < rx * 0.34 || glint2 < rx * 0.19) {
              lum = 1.0;
            } else {
              lum = 0.04;
            }
          }
        }

        // Soft anime cheek blush under eyes
        if (mood === 'happy' || isSpeaking) {
          const blushL = Math.hypot((nx - (-profile.eyeSep - 0.06)) / 0.075, (ny - (eyeY + 0.13)) / 0.038);
          const blushR = Math.hypot((nx - (profile.eyeSep + 0.06)) / 0.075, (ny - (eyeY + 0.13)) / 0.038);
          if (Math.min(blushL, blushR) < 1.0) {
            lum *= 0.72;
          }
        }

        // Cute anime whiskers for Neko
        if (profile.hasWhiskers && Math.abs(nx) > 0.29 && Math.abs(nx) < 0.44) {
          const wy1 = Math.abs(ny - (eyeY + 0.10));
          const wy2 = Math.abs(ny - (eyeY + 0.16));
          if (wy1 < 0.015 || wy2 < 0.015) {
            lum = 0.12;
          }
        }

        // Anime mouth (dynamic open mouth on speech, cute smile or calm line otherwise)
        const mouthY = profile.mouthY + gy * 0.35;
        const mouthX = nx - gx * 0.3;
        if (mouthOpen > 0.12) {
          const mw = 0.055 + mouthOpen * 0.045;
          const mh = 0.025 + mouthOpen * 0.048;
          const md = Math.hypot(mouthX / mw, (ny - mouthY) / mh);
          if (md < 1.0) {
            lum = 0.05;
          }
        } else if (mood === 'happy') {
          const smileY = mouthY - (mouthX * mouthX) * 4.2;
          if (Math.abs(mouthX) < 0.065 && Math.abs(ny - smileY) < 0.017) {
            lum = 0.08;
          }
        } else {
          if (Math.abs(mouthX) < 0.048 && Math.abs(ny - mouthY) < 0.015) {
            lum = 0.10;
          }
        }
      }

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
          const thresh = 0.13 + BAYER_4X4[bayerRow + (sx & 3)] * 0.72;
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
