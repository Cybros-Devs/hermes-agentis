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
  defaultTint: BrailleShapeTint;
  defaultEyeStyle: 'open' | 'sleepy';
  tagline: string;
}

export const BRAILLE_SHAPE_CATALOG: BrailleShapeMeta[] = [
  {
    kind: 'clover',
    label: 'Clover',
    defaultTint: 'lime',
    defaultEyeStyle: 'open',
    tagline: 'Core strategist',
  },
  {
    kind: 'star',
    label: 'Star',
    defaultTint: 'pink',
    defaultEyeStyle: 'open',
    tagline: 'Launch runner',
  },
  {
    kind: 'ghost',
    label: 'Phantom',
    defaultTint: 'lavender',
    defaultEyeStyle: 'open',
    tagline: 'Silent daemon',
  },
  {
    kind: 'heart',
    label: 'Heart',
    defaultTint: 'coral',
    defaultEyeStyle: 'open',
    tagline: 'Care & triage',
  },
  {
    kind: 'cloud',
    label: 'Cloud',
    defaultTint: 'orange',
    defaultEyeStyle: 'open',
    tagline: 'Memory synth',
  },
  {
    kind: 'triangle',
    label: 'Prism',
    defaultTint: 'cyan',
    defaultEyeStyle: 'open',
    tagline: 'Code reviewer',
  },
  {
    kind: 'pebble',
    label: 'Pebble',
    defaultTint: 'periwinkle',
    defaultEyeStyle: 'sleepy',
    tagline: 'Deep-work lane',
  },
  {
    kind: 'trapezoid',
    label: 'Chime',
    defaultTint: 'amber',
    defaultEyeStyle: 'sleepy',
    tagline: 'Brief keeper',
  },
  {
    kind: 'blob',
    label: 'Mochi',
    defaultTint: 'magenta',
    defaultEyeStyle: 'open',
    tagline: 'Sandbox bot',
  },
];

export const BRAILLE_TINT_PALETTE: Record<
  BrailleShapeTint,
  { label: string; low: string; mid: string; high: string; glow: string }
> = {
  lime: {
    label: 'Meadow',
    low: '#65A30D',
    mid: '#A3E635',
    high: '#ECFCCB',
    glow: 'rgba(163, 230, 53, 0.24)',
  },
  pink: {
    label: 'Blossom',
    low: '#DB2777',
    mid: '#F472B6',
    high: '#FCE7F3',
    glow: 'rgba(244, 114, 182, 0.24)',
  },
  lavender: {
    label: 'Iris',
    low: '#7C3AED',
    mid: '#A78BFA',
    high: '#EDE9FE',
    glow: 'rgba(167, 139, 250, 0.24)',
  },
  coral: {
    label: 'Coral',
    low: '#EA580C',
    mid: '#FB7185',
    high: '#FFE4E6',
    glow: 'rgba(251, 113, 133, 0.24)',
  },
  orange: {
    label: 'Tangerine',
    low: '#EA580C',
    mid: '#FB923C',
    high: '#FFEDD5',
    glow: 'rgba(251, 146, 60, 0.24)',
  },
  cyan: {
    label: 'Glacier',
    low: '#0284C7',
    mid: '#38BDF8',
    high: '#E0F2FE',
    glow: 'rgba(56, 189, 248, 0.24)',
  },
  periwinkle: {
    label: 'Periwinkle',
    low: '#4F46E5',
    mid: '#818CF8',
    high: '#E0E7FF',
    glow: 'rgba(129, 140, 248, 0.24)',
  },
  amber: {
    label: 'Honey',
    low: '#D97706',
    mid: '#FBBF24',
    high: '#FEF3C7',
    glow: 'rgba(251, 191, 36, 0.24)',
  },
  magenta: {
    label: 'Berry',
    low: '#BE185D',
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
  gazeX?: number; // -1..1
  gazeY?: number; // -1..1
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

function sdRoundedBox(x: number, y: number, bx: number, by: number, r: number): number {
  const dx = Math.abs(x) - bx + r;
  const dy = Math.abs(y) - by + r;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
}

function sdEquilateralTriangle(x: number, y: number, r: number): number {
  const k = Math.sqrt(3);
  let px = Math.abs(x) - r;
  let py = y + r / k;
  if (px + k * py > 0) {
    const nx = (px - k * py) / 2;
    const ny = (-k * px - py) / 2;
    px = nx;
    py = ny;
  }
  px -= clamp(px, -2 * r, 0);
  return -Math.hypot(px, py) * Math.sign(py);
}

function sdHeart(x: number, y: number): number {
  // Upright plump heart centered near origin
  const px = Math.abs(x);
  const py = -y + 0.56;
  if (py + px > 1.0) {
    return Math.hypot(px - 0.25, py - 0.75) - Math.SQRT2 / 4;
  }
  const d1 = Math.hypot(px, py - 1.0);
  const t = 0.5 * Math.max(px + py, 0);
  const d2 = Math.hypot(px - t, py - t);
  return Math.sqrt(Math.min(d1 * d1, d2 * d2)) * Math.sign(px - py);
}

function sdStar5(x: number, y: number, rOuter: number, rInner: number, roundR: number): number {
  const sector = Math.PI / 5;
  let ang = Math.atan2(Math.abs(x), -y);
  ang = ((ang % (2 * sector)) + 2 * sector) % (2 * sector);
  if (ang > sector) ang = 2 * sector - ang;

  const dist = Math.hypot(x, y);
  const px = dist * Math.sin(ang);
  const py = dist * Math.cos(ang);

  const ax = 0;
  const ay = rOuter;
  const bx = rInner * Math.sin(sector);
  const by = rInner * Math.cos(sector);

  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const t = clamp((apx * abx + apy * aby) / (abx * abx + aby * aby), 0, 1);
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  const segDist = Math.hypot(px - cx, py - cy);
  const cross = abx * apy - aby * apx;
  return (cross >= 0 ? segDist : -segDist) - roundR;
}

/**
 * Signed distance for each of the 9 Dots-inspired shapes in normalized [-1, 1] space.
 */
export function evaluateShapeSdf(shape: BrailleShapeKind, x: number, y: number): number {
  switch (shape) {
    case 'clover': {
      const horiz = sdRoundedBox(x, y, 0.76, 0.38, 0.36);
      const vert = sdRoundedBox(x, y, 0.38, 0.76, 0.36);
      return smin(horiz, vert, 0.16);
    }
    case 'star': {
      // Plump 5-point star with top tip pointing up
      return sdStar5(x, y - 0.04, 0.72, 0.41, 0.10);
    }
    case 'ghost': {
      // Dome head + wavy scalloped bottom skirt
      const body = sdRoundedBox(x, y + 0.04, 0.60, 0.68, 0.54);
      const skirtWave = 0.54 + 0.09 * Math.cos(x * 11.0);
      const bottomCut = y - skirtWave;
      return Math.max(body, bottomCut);
    }
    case 'heart': {
      return sdHeart(x * 0.98, y * 1.0 - 0.03) - 0.05;
    }
    case 'cloud': {
      const base = sdRoundedBox(x, y - 0.18, 0.68, 0.24, 0.22);
      const cLeft = sdCircle(x, y, -0.34, 0.06, 0.33);
      const cTop = sdCircle(x, y, -0.02, -0.16, 0.41);
      const cRight = sdCircle(x, y, 0.36, 0.06, 0.31);
      return smin(base, smin(smin(cLeft, cTop, 0.12), cRight, 0.12), 0.10);
    }
    case 'triangle': {
      // Upward-pointing rounded pyramid/prism matching reference
      return sdEquilateralTriangle(x * 1.15, -(y - 0.14) * 1.05, 0.66) - 0.14;
    }
    case 'pebble': {
      // Squishy slightly wider-at-bottom bean/pebble
      const taper = 1 - 0.08 * y;
      return sdRoundedBox(x * taper, y - 0.04, 0.70, 0.54, 0.46);
    }
    case 'trapezoid': {
      // Gumdrop trapezoid: narrower top, wider soft base
      const halfW = 0.44 + clamp((y + 0.55) / 1.1, 0, 1) * 0.24;
      const dx = Math.abs(x) - halfW + 0.18;
      const dy = Math.abs(y - 0.04) - 0.52 + 0.18;
      return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - 0.18;
    }
    case 'blob': {
      // Cute cozy mochi mound (flat bottom, plump dome top, tiny side dimple)
      const dome = sdCircle(x, y, 0.02, 0.06, 0.58);
      const leftHip = sdCircle(x, y, -0.26, 0.18, 0.36);
      const rightHip = sdCircle(x, y, 0.28, 0.16, 0.37);
      const mound = smin(dome, smin(leftHip, rightHip, 0.18), 0.16);
      const flatBase = y - 0.50;
      return smin(mound, -Math.min(0, -flatBase), 0.02) > 0
        ? Math.max(mound, flatBase)
        : Math.max(mound, flatBase);
    }
  }
}

function getFaceAnchor(shape: BrailleShapeKind): { yOffset: number; eyeSep: number; eyeSize: number } {
  switch (shape) {
    case 'triangle':
      return { yOffset: 0.22, eyeSep: 0.17, eyeSize: 0.095 };
    case 'heart':
      return { yOffset: -0.06, eyeSep: 0.21, eyeSize: 0.10 };
    case 'ghost':
      return { yOffset: -0.10, eyeSep: 0.20, eyeSize: 0.105 };
    case 'cloud':
      return { yOffset: 0.06, eyeSep: 0.19, eyeSize: 0.095 };
    case 'star':
      return { yOffset: 0.05, eyeSep: 0.19, eyeSize: 0.105 };
    case 'trapezoid':
      return { yOffset: 0.04, eyeSep: 0.20, eyeSize: 0.105 };
    case 'pebble':
      return { yOffset: 0.02, eyeSep: 0.22, eyeSize: 0.11 };
    case 'blob':
      return { yOffset: 0.10, eyeSep: 0.19, eyeSize: 0.10 };
    case 'clover':
    default:
      return { yOffset: 0.0, eyeSep: 0.21, eyeSize: 0.11 };
  }
}

/**
 * Renders an expressive, clay-shaded Dots-inspired character in 2x4 Unicode Braille.
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

  // Subtle breathing + drag/speak squash & stretch
  const breath = Math.sin(time * 2.2) * 0.028;
  const speakBounce = isSpeaking ? Math.sin(time * 13.5) * energy * 0.045 : 0;
  const dragLift = isDragging ? 0.045 : 0;
  const scaleX = 1 + breath * 0.6 - speakBounce * 0.5 + dragLift;
  const scaleY = 1 - breath * 0.8 + speakBounce * 0.9 - dragLift * 0.5;

  const anchor = getFaceAnchor(shape);
  const gx = clamp(gazeX, -1, 1) * 0.032;
  const gy = clamp(gazeY, -1, 1) * 0.028;

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

  const eps = 0.02;

  for (let sy = 0; sy < subH; sy++) {
    const nyRaw = ((sy + 0.5) / subH) * 2 - 1;
    const ny = nyRaw / scaleY;
    const rowOff = sy * subW;

    for (let sx = 0; sx < subW; sx++) {
      const nxRaw = ((sx + 0.5) / subW) * 2 - 1;
      const nx = nxRaw / scaleX;

      const d = evaluateShapeSdf(shape, nx, ny);
      if (d > 0.035) {
        subLum[rowOff + sx] = 0;
        continue;
      }

      // Soft anti-aliased edge silhouette coverage
      const edgeCov = clamp(1 - (d + 0.005) / 0.04, 0, 1);

      // Finite difference SDF gradient for 3D clay-dome normal & directional key lighting
      const dxGrad = evaluateShapeSdf(shape, nx + eps, ny) - evaluateShapeSdf(shape, nx - eps, ny);
      const dyGrad = evaluateShapeSdf(shape, nx, ny + eps) - evaluateShapeSdf(shape, nx, ny - eps);
      const gradLen = Math.hypot(dxGrad, dyGrad) || 1;
      const edgeWeight = clamp(1 + d * 2.4, 0, 1);
      const snx = (dxGrad / gradLen) * edgeWeight;
      const sny = (dyGrad / gradLen) * edgeWeight;
      const snz = Math.sqrt(Math.max(0.08, 1 - snx * snx - sny * sny));

      // Top-left key light + warm bottom-right bounce + subtle rim highlight
      const keyDot = clamp(-0.42 * snx - 0.58 * sny + 0.70 * snz, 0, 1);
      const rim = Math.pow(1 - snz, 1.8) * 0.28;
      let lum = clamp((0.36 + keyDot * 0.58 + rim) * edgeCov, 0, 1);

      // Expressive face (eyes + optional speaking mouth)
      const faceY = anchor.yOffset + gy * 0.45;
      const eyeY = faceY;
      const leftEyeX = -anchor.eyeSep + gx * 0.65;
      const rightEyeX = anchor.eyeSep + gx * 0.65;

      const dLeft = Math.hypot((nx - leftEyeX) * 1.15, (ny - eyeY) * 0.85);
      const dRight = Math.hypot((nx - rightEyeX) * 1.15, (ny - eyeY) * 0.85);
      const eyeDist = Math.min(dLeft, dRight);
      const nearestEyeX = dLeft < dRight ? leftEyeX : rightEyeX;

      const resolvedEye =
        mood === 'happy' && eyeState === 'open' && !isSpeaking ? 'open' : eyeState;

      if (resolvedEye === 'blink') {
        const lineDist = Math.max(Math.abs(nx - nearestEyeX) - anchor.eyeSize * 0.9, Math.abs(ny - eyeY) - 0.022);
        if (lineDist < 0.015) {
          lum *= 0.08;
        }
      } else if (resolvedEye === 'sleepy') {
        // Cozy downward curved crescent eyes matching the reference amber trapezoid & blue pebble
        const ex = nx - nearestEyeX;
        const curveY = eyeY + 0.025 - (ex * ex) * 2.4;
        const arcDist = Math.abs(ny - curveY);
        if (Math.abs(ex) < anchor.eyeSize * 1.15 && arcDist < 0.028) {
          lum *= 0.06;
        }
      } else if (resolvedEye === 'happy') {
        // Cheerful upward curved arcs
        const ex = nx - nearestEyeX;
        const curveY = eyeY - 0.02 + (ex * ex) * 2.4;
        const arcDist = Math.abs(ny - curveY);
        if (Math.abs(ex) < anchor.eyeSize * 1.1 && arcDist < 0.028) {
          lum *= 0.06;
        }
      } else {
        const rEye = resolvedEye === 'wide' ? anchor.eyeSize * 1.15 : anchor.eyeSize;
        if (eyeDist < rEye) {
          // Specular eye catchlight glint inside dark eye oval
          const glintDist = Math.hypot(
            nx - (nearestEyeX - rEye * 0.28 + gx * 0.45),
            ny - (eyeY - rEye * 0.28 + gy * 0.45)
          );
          if (glintDist < rEye * 0.34) {
            lum = 1.0;
          } else {
            lum *= 0.04;
          }
        }
      }

      // Cute subtle speaking mouth below eyes when active
      if (mouthOpen > 0.12) {
        const mouthY = faceY + anchor.eyeSize * 1.85;
        const mw = 0.065 + mouthOpen * 0.055;
        const mh = 0.025 + mouthOpen * 0.055;
        const md = Math.hypot((nx - gx * 0.3) / mw, (ny - mouthY) / mh);
        if (md < 1.0) {
          lum *= 0.08;
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
          const thresh = 0.14 + BAYER_4X4[bayerRow + (sx & 3)] * 0.72;
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
