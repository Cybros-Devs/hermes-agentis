import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ExpressionMood, EyeState, MouthViseme } from '../../src/types/hermes';
import { amplitudeToViseme, textToVisemeTimeline } from '../../src/utils/asciiCharacter';
import {
  buildPortraitSourceFromRgba,
  createPortraitAnimator,
  renderHalftonePortrait,
  type PortraitSourceField,
} from '../../src/utils/asciiPortraitEngine';

interface TalkPanelSpec {
  id: string;
  label: string;
  viseme: MouthViseme;
  mood: ExpressionMood;
  eyeState: EyeState;
  energy: number;
  isSpeaking: boolean;
  refBox: { x0: number; y0: number; x1: number; y1: number };
}

const TALK_PANELS: TalkPanelSpec[] = [
  { id: '01-closed', label: 'Closed', viseme: 'closed', mood: 'neutral', eyeState: 'open', energy: 0.08, isSpeaking: false, refBox: { x0: 20, y0: 40, x1: 245, y1: 252 } },
  { id: '02-ah-uh', label: 'Slightly Open (Ah/Uh)', viseme: 'small', mood: 'speaking', eyeState: 'open', energy: 0.36, isSpeaking: true, refBox: { x0: 275, y0: 40, x1: 505, y1: 252 } },
  { id: '03-a-ha', label: 'Wide Open (A/Ha)', viseme: 'wide', mood: 'speaking', eyeState: 'open', energy: 0.92, isSpeaking: true, refBox: { x0: 535, y0: 40, x1: 765, y1: 252 } },
  { id: '04-oh', label: 'Rounded / Oh (O/Oo)', viseme: 'round', mood: 'speaking', eyeState: 'open', energy: 0.72, isSpeaking: true, refBox: { x0: 795, y0: 40, x1: 1022, y1: 252 } },
  { id: '05-oo', label: 'Rouh / Oo', viseme: 'round', mood: 'speaking', eyeState: 'open', energy: 0.25, isSpeaking: true, refBox: { x0: 40, y0: 319, x1: 310, y1: 537 } },
  { id: '06-ee', label: 'Wide / Ee (E/I)', viseme: 'ee', mood: 'speaking', eyeState: 'open', energy: 0.68, isSpeaking: true, refBox: { x0: 385, y0: 319, x1: 660, y1: 537 } },
  { id: '07-l-th', label: 'L / Th', viseme: 'lth', mood: 'speaking', eyeState: 'open', energy: 0.56, isSpeaking: true, refBox: { x0: 730, y0: 319, x1: 1005, y1: 537 } },
  { id: '08-f-v', label: 'F / V', viseme: 'fv', mood: 'speaking', eyeState: 'open', energy: 0.44, isSpeaking: true, refBox: { x0: 40, y0: 614, x1: 320, y1: 835 } },
  { id: '09-rest', label: 'Natural/Rest', viseme: 'rest', mood: 'neutral', eyeState: 'open', energy: 0.12, isSpeaking: false, refBox: { x0: 385, y0: 614, x1: 670, y1: 835 } },
  { id: '10-m-b-p', label: 'M / B / P', viseme: 'mbp', mood: 'speaking', eyeState: 'open', energy: 0.22, isSpeaking: true, refBox: { x0: 730, y0: 614, x1: 1015, y1: 835 } },
];

const SUBPIXEL_BITS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0x01],
  [1, 0, 0x08],
  [0, 1, 0x02],
  [1, 1, 0x10],
  [0, 2, 0x04],
  [1, 2, 0x20],
  [0, 3, 0x40],
  [1, 3, 0x80],
];

function decodeImageRgba(pngPath: string): { rgba: Uint8ClampedArray; width: number; height: number } {
  const dims = execFileSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', pngPath],
    { encoding: 'utf8' }
  ).trim();
  const [width, height] = dims.split(',').map(Number);
  const raw = execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', pngPath, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'],
    { maxBuffer: 32 * 1024 * 1024 }
  );
  return { rgba: new Uint8ClampedArray(raw), width, height };
}

function decodeReferencePortrait(pngPath: string, size = 160): PortraitSourceField {
  const raw = execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', pngPath, '-vf', `scale=${size}:${size}`, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'],
    { maxBuffer: 16 * 1024 * 1024 }
  );
  return buildPortraitSourceFromRgba(new Uint8ClampedArray(raw), size, size);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function blendPixel(
  buf: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number
) {
  if (x < 0 || y < 0 || x >= w || y >= h || a <= 0) return;
  const idx = (y * w + x) * 4;
  const inv = 1 - a;
  buf[idx] = Math.round(buf[idx] * inv + r * a);
  buf[idx + 1] = Math.round(buf[idx + 1] * inv + g * a);
  buf[idx + 2] = Math.round(buf[idx + 2] * inv + b * a);
  buf[idx + 3] = 255;
}

function drawDisc(
  buf: Uint8Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  radius: number,
  r: number,
  g: number,
  b: number,
  alpha: number
) {
  const minX = Math.max(0, Math.floor(cx - radius - 1));
  const maxX = Math.min(w - 1, Math.ceil(cx + radius + 1));
  const minY = Math.max(0, Math.floor(cy - radius - 1));
  const maxY = Math.min(h - 1, Math.ceil(cy + radius + 1));
  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      const dist = Math.hypot(px + 0.5 - cx, py + 0.5 - cy);
      const cov = Math.max(0, Math.min(1, radius + 0.55 - dist));
      if (cov > 0) {
        blendPixel(buf, w, h, px, py, r, g, b, alpha * cov);
      }
    }
  }
}

interface MouthZoneStats {
  grid: Uint8Array;
  brightGrid: Float32Array;
  normPatch: Float32Array; // 24x16 downsampled luminance patch for reference comparison
  gridW: number;
  gridH: number;
  cavityDarkDots: number; // strictly dark oral interior (excluding bright cheek/teeth)
  upperTeethLit: number;
  lowerTeethOrCushionLit: number;
  centerTongueLit: number;
  leftPocketDark: number;
  rightPocketDark: number;
  lowerRimLit: number;
  chinLowestUy: number;
  spanX: number;
  spanY: number;
  refSimilarity: number;
}

function sampleRegion24x16(
  lumAt: (ux: number, uy: number) => number,
  rx0: number,
  ry0: number,
  rx1: number,
  ry1: number
): Float32Array {
  const outW = 24;
  const outH = 16;
  const out = new Float32Array(outW * outH);
  for (let gy = 0; gy < outH; gy++) {
    const ty0 = ry0 + (gy / outH) * (ry1 - ry0);
    const ty1 = ry0 + ((gy + 1) / outH) * (ry1 - ry0);
    for (let gx = 0; gx < outW; gx++) {
      const tx0 = rx0 + (gx / outW) * (rx1 - rx0);
      const tx1 = rx0 + ((gx + 1) / outW) * (rx1 - rx0);
      let sum = 0;
      for (let sy = 0; sy < 3; sy++) {
        const py = ty0 + ((sy + 0.5) / 3) * (ty1 - ty0);
        for (let sx = 0; sx < 3; sx++) {
          const px = tx0 + ((sx + 0.5) / 3) * (tx1 - tx0);
          sum += lumAt(px, py);
        }
      }
      out[gy * outW + gx] = sum / 9;
    }
  }
  return out;
}

function blur24x16(src: Float32Array): Float32Array {
  const w = 24;
  const h = 16;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let wt = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = Math.max(0, Math.min(h - 1, y + dy));
        for (let dx = -1; dx <= 1; dx++) {
          const nx = Math.max(0, Math.min(w - 1, x + dx));
          const k = dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1;
          sum += src[ny * w + nx] * k;
          wt += k;
        }
      }
      out[y * w + x] = sum / wt;
    }
  }
  return out;
}

function zeroMeanCosine(aRaw: Float32Array, bRaw: Float32Array): number {
  const a = blur24x16(aRaw);
  const b = blur24x16(bRaw);
  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < a.length; i++) {
    meanA += a[i];
    meanB += b[i];
  }
  meanA /= a.length;
  meanB /= b.length;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    dot += da * db;
    na += da * da;
    nb += db * db;
  }
  if (na <= 1e-8 || nb <= 1e-8) return 0;
  return dot / Math.sqrt(na * nb);
}

function extractRefMouthPatch(
  refImg: { rgba: Uint8ClampedArray; width: number; height: number },
  box: { x0: number; y0: number; x1: number; y1: number }
): Float32Array {
  const { rgba, width } = refImg;
  const lumPixel = (x: number, y: number) => {
    const cx = Math.max(0, Math.min(width - 1, Math.round(x)));
    const cy = Math.max(0, Math.min(refImg.height - 1, Math.round(y)));
    const i = (cy * width + cx) * 4;
    return (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) / 255;
  };
  // Align to each panel's left cheek edge just above upper lip (immune to mouth opening)
  const h = box.y1 - box.y0;
  const midY = Math.round(box.y0 + h * 0.60);
  let cheekX = box.x0;
  for (let x = box.x0 + 25; x < box.x1; x++) {
    if (lumPixel(x, midY) > 0.52 && lumPixel(x + 1, midY) > 0.52) {
      cheekX = x;
      break;
    }
  }
  const rx0 = cheekX + Math.round(h * 0.012);
  const rx1 = cheekX + Math.round(h * 0.188);
  const ry0 = box.y0 + h * 0.618;
  const ry1 = box.y0 + h * 0.775;
  return sampleRegion24x16(lumPixel, rx0, ry0, rx1, ry1);
}

function renderPanel(
  spec: TalkPanelSpec,
  sourceField: PortraitSourceField,
  closedGridRef: Uint8Array | null,
  refPatch: Float32Array,
  cols = 92,
  rows = 42,
  width = 360,
  height = 330
) {
  const frame = renderHalftonePortrait({
    cols,
    rows,
    time: 0.4,
    mood: spec.mood,
    viseme: spec.viseme,
    eyeState: spec.eyeState,
    energy: spec.energy,
    isSpeaking: spec.isSpeaking,
    isListening: false,
    style: 'braille',
    sourceField,
  });

  const subW = cols * 2;
  const subH = rows * 4;
  const subLit = new Uint8Array(subW * subH);
  const subBright = new Float32Array(subW * subH);

  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = 8;
    rgba[i * 4 + 1] = 28;
    rgba[i * 4 + 2] = 22;
    rgba[i * 4 + 3] = 255;
  }

  const cellW = width / cols;
  const cellH = height / rows;
  const dotW = cellW / 2;
  const dotH = cellH / 4;
  const dotRadius = Math.min(dotW, dotH) * 0.44;

  for (let r = 0; r < frame.rows; r++) {
    const line = frame.lines[r];
    const baseY = r * cellH;
    for (let c = 0; c < frame.cols; c++) {
      const ch = line[c];
      const cellBr = frame.cells[r * frame.cols + c] / 255;
      if (ch === ' ') continue;
      const bits = ch.charCodeAt(0) - 0x2800;
      if (bits <= 0 || bits > 0xff) continue;

      let colorHex = '#C2D4CE';
      let alpha = 0.72;
      if (cellBr > 0.7) {
        colorHex = '#FFFFFF';
        alpha = 0.98;
      } else if (cellBr > 0.36) {
        colorHex = '#E6F0EC';
        alpha = 0.88;
      }
      const [cr, cg, cb] = hexToRgb(colorHex);
      const baseX = c * cellW;

      for (let k = 0; k < 8; k++) {
        const [px, py, mask] = SUBPIXEL_BITS[k];
        if (bits & mask) {
          const sx = c * 2 + px;
          const sy = r * 4 + py;
          subLit[sy * subW + sx] = 1;
          subBright[sy * subW + sx] = cellBr;
          const cx = baseX + (px + 0.5) * dotW;
          const cy = baseY + (py + 0.5) * dotH;
          drawDisc(rgba, width, height, cx, cy, dotRadius, cr, cg, cb, alpha);
        }
      }
    }
  }

  // Exact mouth box in rendered subpixel UV (strictly inside face/cheek >= 0.288, down to 0.720 for jaw drop)
  const mx0 = Math.floor(0.280 * subW);
  const mx1 = Math.ceil(0.376 * subW);
  const my0 = Math.floor(0.615 * subH);
  const my1 = Math.ceil(0.725 * subH);
  const gridW = mx1 - mx0 + 1;
  const gridH = my1 - my0 + 1;
  const grid = new Uint8Array(gridW * gridH);
  const brightGrid = new Float32Array(gridW * gridH);

  let cavityDarkDots = 0;
  let upperTeethLit = 0;
  let lowerTeethOrCushionLit = 0;
  let centerTongueLit = 0;
  let leftPocketDark = 0;
  let rightPocketDark = 0;
  let lowerRimLit = 0;
  let minSpanX = gridW;
  let maxSpanX = -1;
  let minSpanY = gridH;
  let maxSpanY = -1;

  for (let gy = 0; gy < gridH; gy++) {
    const sy = my0 + gy;
    const uy = (sy + 0.5) / subH;
    for (let gx = 0; gx < gridW; gx++) {
      const sx = mx0 + gx;
      const ux = (sx + 0.5) / subW;
      const lit = subLit[sy * subW + sx];
      const r = Math.floor(sy / 4);
      const c = Math.floor(sx / 2);
      const cellBright = frame.cells[r * frame.cols + c] / 255;

      grid[gy * gridW + gx] = lit;
      brightGrid[gy * gridW + gx] = lit ? cellBright : 0;

      // Deep oral cavity darkness strictly inside mouth area (ux: 0.292..0.356, uy: 0.630..0.702 excluding chin edge)
      if (ux >= 0.292 && ux <= 0.356 && uy >= 0.630 && uy <= 0.702) {
        if (!lit && cellBright < 0.34) {
          cavityDarkDots++;
        }
      }

      // True mouth bounding box: solid dark oral cavity OR solid contiguous teeth bar inside lip zone (excluding chin outline >= 0.703)
      const inLipBox = ux >= 0.290 && ux <= 0.362 && uy >= 0.630 && uy <= 0.702;
      const isDeepCavity = inLipBox && !lit && cellBright < 0.30;
      const hasHorizNeighborsLit =
        lit &&
        subLit[sy * subW + Math.max(0, sx - 1)] === 1 &&
        subLit[sy * subW + Math.min(subW - 1, sx + 1)] === 1;
      const isSolidTeethRun = inLipBox && hasHorizNeighborsLit && cellBright > 0.42 && uy >= 0.634 && uy <= 0.694;
      if (isDeepCavity || (spec.viseme === 'ee' && isSolidTeethRun)) {
        if (gx < minSpanX) minSpanX = gx;
        if (gx > maxSpanX) maxSpanX = gx;
        if (gy < minSpanY) minSpanY = gy;
        if (gy > maxSpanY) maxSpanY = gy;
      }

      // Upper teeth zone
      if (ux >= 0.292 && ux <= 0.362 && uy >= 0.630 && uy <= 0.665 && lit && cellBright > 0.50) {
        upperTeethLit++;
      }
      // Lower teeth / tongue / raised F/V lower lip cushion zone
      if (ux >= 0.292 && ux <= 0.362 && uy >= 0.654 && uy <= 0.705 && lit && cellBright > 0.40) {
        lowerTeethOrCushionLit++;
      }
      // Center tongue tip zone (L/Th)
      if (ux >= 0.306 && ux <= 0.338 && uy >= 0.644 && uy <= 0.678 && lit) {
        centerTongueLit++;
      }
      // Left/right dark pockets around tongue (L/Th)
      if (ux >= 0.292 && ux <= 0.312 && uy >= 0.640 && uy <= 0.680 && !lit && cellBright < 0.38) {
        leftPocketDark++;
      }
      if (ux >= 0.334 && ux <= 0.358 && uy >= 0.640 && uy <= 0.680 && !lit && cellBright < 0.38) {
        rightPocketDark++;
      }
      // Lower lip rim highlight
      if (ux >= 0.295 && ux <= 0.350 && uy >= 0.676 && uy <= 0.718 && lit) {
        lowerRimLit++;
      }
    }
  }

  let chinLowestUy = 0;
  for (let sy = Math.floor(0.71 * subH); sy <= Math.ceil(0.82 * subH); sy++) {
    const uy = (sy + 0.5) / subH;
    for (let sx = Math.floor(0.28 * subW); sx <= Math.ceil(0.38 * subW); sx++) {
      if (subLit[sy * subW + sx] && uy > chinLowestUy) {
        chinLowestUy = uy;
      }
    }
  }

  // Detect left cheek edge at upper cheek row (0.60 * height, immune to mouth opening)
  let renderedCheekX = Math.round(0.285 * width);
  const midRowY = Math.round(0.600 * height);
  for (let x = Math.round(0.23 * width); x < Math.round(0.34 * width); x++) {
    const idx = (midRowY * width + x) * 4;
    const l0 = (0.299 * rgba[idx] + 0.587 * rgba[idx + 1] + 0.114 * rgba[idx + 2]) / 255;
    if (l0 > 0.45) {
      renderedCheekX = x;
      break;
    }
  }

  // Canonical 24x16 rendered luminance crop aligned via local translational registration
  const lumRenderAt = (x: number, y: number) => {
    const rx = Math.max(0, Math.min(width - 1, Math.round(x)));
    const ry = Math.max(0, Math.min(height - 1, Math.round(y)));
    const idx = (ry * width + rx) * 4;
    return (0.299 * rgba[idx] + 0.587 * rgba[idx + 1] + 0.114 * rgba[idx + 2]) / 255;
  };
  let bestSim = -1;
  let normPatch = sampleRegion24x16(
    lumRenderAt,
    renderedCheekX + 3,
    0.620 * height,
    renderedCheekX + 35,
    0.704 * height
  );
  for (let dy = -8; dy <= 12; dy += 2) {
    for (let dx = -6; dx <= 8; dx += 2) {
      const candidate = sampleRegion24x16(
        lumRenderAt,
        renderedCheekX + 3 + dx,
        0.620 * height + dy,
        renderedCheekX + 35 + dx,
        0.704 * height + dy
      );
      const sim = zeroMeanCosine(candidate, refPatch);
      if (sim > bestSim) {
        bestSim = sim;
        normPatch = candidate;
      }
    }
  }
  const refSimilarity = Number(bestSim.toFixed(4));

  return {
    rgba,
    width,
    height,
    stats: {
      grid,
      brightGrid,
      normPatch,
      gridW,
      gridH,
      cavityDarkDots,
      upperTeethLit,
      lowerTeethOrCushionLit,
      centerTongueLit,
      leftPocketDark,
      rightPocketDark,
      lowerRimLit,
      chinLowestUy: Number(chinLowestUy.toFixed(4)),
      spanX: maxSpanX >= minSpanX ? maxSpanX - minSpanX + 1 : 0,
      spanY: maxSpanY >= minSpanY ? maxSpanY - minSpanY + 1 : 0,
      refSimilarity,
    } satisfies MouthZoneStats,
  };
}

function writePng(rgba: Uint8Array, width: number, height: number, outPath: string) {
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-v',
      'error',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgba',
      '-s',
      `${width}x${height}`,
      '-i',
      '-',
      '-frames:v',
      '1',
      outPath,
    ],
    { input: Buffer.from(rgba) }
  );
}

function buildContactSheet(paths: string[], labels: string[], outPath: string, w = 360, h = 330) {
  const cols = 4;
  const inputs: string[] = [];
  const filterParts: string[] = [];
  for (let i = 0; i < paths.length; i++) {
    inputs.push('-i', paths[i]);
    const safeLabel = labels[i].replace(/[:'\\]/g, '');
    filterParts.push(
      `[${i}:v]drawbox=x=0:y=0:w=iw:h=26:color=0x050C0ACC:t=fill,drawtext=text='${safeLabel}':x=10:y=7:fontsize=14:fontcolor=0xA7F3D0[v${i}]`
    );
  }
  const stackInputs = paths.map((_, i) => `[v${i}]`).join('');
  const layouts = paths
    .map((_, idx) => `${(idx % cols) * w}_${Math.floor(idx / cols) * h}`)
    .join('|');
  filterParts.push(`${stackInputs}xstack=inputs=${paths.length}:layout=${layouts}:fill=0x050C0A[grid]`);
  try {
    execFileSync('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', filterParts.join(';'), '-map', '[grid]', outPath]);
  } catch {
    const plain = `${paths.map((_, i) => `[${i}:v]`).join('')}xstack=inputs=${paths.length}:layout=${layouts}:fill=0x050C0A[grid]`;
    execFileSync('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', plain, '-map', '[grid]', outPath]);
  }
}

function mouthZoneDiff(a: MouthZoneStats, b: MouthZoneStats): number {
  let diff = 0;
  for (let i = 0; i < a.grid.length; i++) {
    if (a.grid[i] !== b.grid[i]) diff++;
  }
  return diff / a.grid.length;
}

function main() {
  const labelArgIdx = process.argv.indexOf('--label');
  const label = labelArgIdx >= 0 && process.argv[labelArgIdx + 1] ? process.argv[labelArgIdx + 1] : 'eval';
  const repoRoot = process.cwd();
  const outDir = path.join(repoRoot, 'blueprint-out', 'ui', label);
  const dataDir = path.join(repoRoot, 'blueprint-out', 'data');
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  const portraitPath = path.join(repoRoot, 'public', 'assets', 'aistudio', 'image_9fdb5ec4.png');
  const refSheetPath = path.join(repoRoot, 'public', 'assets', 'aistudio', 'image_a1b64471.png');
  const sourceField = decodeReferencePortrait(portraitPath, 160);
  const refImg = decodeImageRgba(refSheetPath);

  const panelResults: Array<{
    id: string;
    label: string;
    viseme: MouthViseme;
    path: string;
    stats: Omit<MouthZoneStats, 'grid' | 'brightGrid' | 'normPatch' | 'gridW' | 'gridH'>;
  }> = [];
  const statsById = new Map<string, MouthZoneStats>();
  const paths: string[] = [];

  let closedGridRef: Uint8Array | null = null;
  for (const spec of TALK_PANELS) {
    const refPatch = extractRefMouthPatch(refImg, spec.refBox);
    const res = renderPanel(spec, sourceField, closedGridRef, refPatch, 92, 42, 360, 330);
    if (spec.id === '01-closed') closedGridRef = res.stats.grid;
    const outPath = path.join(outDir, `talk_${spec.id}.png`);
    writePng(res.rgba, res.width, res.height, outPath);
    paths.push(outPath);
    statsById.set(spec.id, res.stats);
    const { grid: _g, brightGrid: _bg, normPatch: _np, gridW: _gw, gridH: _gh, ...summaryStats } = res.stats;
    panelResults.push({
      id: spec.id,
      label: spec.label,
      viseme: spec.viseme,
      path: outPath,
      stats: summaryStats,
    });
  }

  const sheetPath = path.join(outDir, 'sheet_talking_ref_match.png');
  buildContactSheet(
    paths,
    TALK_PANELS.map((p) => p.label),
    sheetPath,
    360,
    330
  );

  let minPairDiff = 1;
  let minPair: [string, string] = ['', ''];
  let totalDiff = 0;
  let pairCount = 0;
  for (let i = 0; i < TALK_PANELS.length; i++) {
    for (let j = i + 1; j < TALK_PANELS.length; j++) {
      const a = statsById.get(TALK_PANELS[i].id)!;
      const b = statsById.get(TALK_PANELS[j].id)!;
      const d = mouthZoneDiff(a, b);
      totalDiff += d;
      pairCount++;
      if (d < minPairDiff) {
        minPairDiff = d;
        minPair = [TALK_PANELS[i].id, TALK_PANELS[j].id];
      }
    }
  }
  const meanPairDiff = totalDiff / Math.max(1, pairCount);
  const meanRefSim =
    panelResults.reduce((acc, p) => acc + p.stats.refSimilarity, 0) / panelResults.length;

  const sClosed = statsById.get('01-closed')!;
  const sAhUh = statsById.get('02-ah-uh')!;
  const sAHa = statsById.get('03-a-ha')!;
  const sOh = statsById.get('04-oh')!;
  const sOo = statsById.get('05-oo')!;
  const sEe = statsById.get('06-ee')!;
  const sLth = statsById.get('07-l-th')!;
  const sFv = statsById.get('08-f-v')!;
  const sRest = statsById.get('09-rest')!;
  const sMbp = statsById.get('10-m-b-p')!;

  const checks: Array<{ name: string; pass: boolean; detail: string; weight: number }> = [
    {
      name: '10-panel pairwise separation',
      pass: minPairDiff >= 0.012,
      detail: `min=${minPairDiff.toFixed(4)} (${minPair.join(' vs ')}), mean=${meanPairDiff.toFixed(4)}`,
      weight: 12,
    },
    {
      name: 'Direct reference pattern alignment (image_a1b64471.png)',
      pass: meanRefSim >= 0.42,
      detail: `meanRefCosine=${meanRefSim.toFixed(4)}`,
      weight: 12,
    },
    {
      name: 'Wide Open (A/Ha) jaw drop > Closed',
      pass: sAHa.chinLowestUy > sClosed.chinLowestUy,
      detail: `closedChin=${sClosed.chinLowestUy}, wideChin=${sAHa.chinLowestUy}`,
      weight: 10,
    },
    {
      name: 'Wide Open (A/Ha) deep cavity + upper teeth + floor tongue',
      pass: sAHa.cavityDarkDots > sAhUh.cavityDarkDots && sAHa.upperTeethLit >= 4 && sAHa.spanY >= sAhUh.spanY,
      detail: `dark=${sAHa.cavityDarkDots} (ah=${sAhUh.cavityDarkDots}), spanY=${sAHa.spanY} (ah=${sAhUh.spanY}), teeth=${sAHa.upperTeethLit}`,
      weight: 12,
    },
    {
      name: 'Slightly Open (Ah/Uh) crisp teeth slit smaller vertically than A/Ha',
      pass: sAhUh.upperTeethLit >= 3 && sAhUh.cavityDarkDots > sClosed.cavityDarkDots && sAhUh.spanY < sAHa.spanY,
      detail: `dark=${sAhUh.cavityDarkDots}, spanX=${sAhUh.spanX}, spanY=${sAhUh.spanY}, upperTeeth=${sAhUh.upperTeethLit}`,
      weight: 10,
    },
    {
      name: 'Rounded O/Oo narrower than Wide/Ee & Oo tighter than Oh',
      pass: sOh.spanX < sEe.spanX && sOo.cavityDarkDots <= sOh.cavityDarkDots && sOh.cavityDarkDots > sClosed.cavityDarkDots,
      detail: `ohSpanX=${sOh.spanX} eeSpanX=${sEe.spanX}, ohDark=${sOh.cavityDarkDots} ooDark=${sOo.cavityDarkDots}`,
      weight: 12,
    },
    {
      name: 'Wide / Ee widest spread with upper + lower teeth bars',
      pass: sEe.spanX >= sAHa.spanX && sEe.upperTeethLit >= 5 && sEe.lowerTeethOrCushionLit >= 4,
      detail: `eeSpanX=${sEe.spanX} (aha=${sAHa.spanX}), upperTeeth=${sEe.upperTeethLit}, lowerTeeth=${sEe.lowerTeethOrCushionLit}`,
      weight: 12,
    },
    {
      name: 'L / Th shows raised center tongue + dark side pockets',
      pass: sLth.centerTongueLit >= 3 && sLth.leftPocketDark + sLth.rightPocketDark >= 6,
      detail: `centerTongue=${sLth.centerTongueLit}, pockets=${sLth.leftPocketDark}+${sLth.rightPocketDark}`,
      weight: 8,
    },
    {
      name: 'F / V shows upper teeth resting on raised lower lip',
      pass: sFv.upperTeethLit >= 4 && sFv.lowerTeethOrCushionLit >= 4 && sFv.cavityDarkDots < sAHa.cavityDarkDots,
      detail: `upperTeeth=${sFv.upperTeethLit}, raisedLower=${sFv.lowerTeethOrCushionLit}, dark=${sFv.cavityDarkDots} (aha=${sAHa.cavityDarkDots})`,
      weight: 6,
    },
    {
      name: 'M / B / P pressed seal distinct from Closed & Natural/Rest',
      pass: mouthZoneDiff(sMbp, sClosed) >= 0.01 && mouthZoneDiff(sMbp, sRest) >= 0.01 && sMbp.cavityDarkDots < sAhUh.cavityDarkDots,
      detail: `mbpVsClosed=${mouthZoneDiff(sMbp, sClosed).toFixed(4)}, mbpVsRest=${mouthZoneDiff(sMbp, sRest).toFixed(4)}`,
      weight: 6,
    },
  ];

  const score = checks.reduce((acc, c) => acc + (c.pass ? c.weight : 0), 0);

  // Also test hero resolution (62x28) distinctness across all 10 visemes
  const heroSignatures = new Set(
    TALK_PANELS.map((spec) =>
      renderHalftonePortrait({
        cols: 62,
        rows: 28,
        time: 0.4,
        mood: spec.mood,
        viseme: spec.viseme,
        eyeState: spec.eyeState,
        energy: spec.energy,
        isSpeaking: spec.isSpeaking,
        isListening: false,
        style: 'braille',
        sourceField,
      }).lines.join('\n')
    )
  );

  // Simulate speech sentence phoneme diversity & 60fps smoothness
  const sampleSpeech = 'Two mcp duet approval gates are waiting for your morning brief.';
  const timeline = textToVisemeTimeline(sampleSpeech);
  const hitVisemes = new Set<MouthViseme>();
  const anim = createPortraitAnimator();
  let prevState = anim.step(
    { time: 0, mood: 'speaking', viseme: 'closed', eyeState: 'open', energy: 0.1, isSpeaking: true, isListening: false },
    1 / 30
  );
  let maxMouthJump = 0;
  for (let i = 1; i <= 48; i++) {
    const energy = 0.25 + 0.65 * Math.abs(Math.sin(i * 0.42));
    const bands = Array.from({ length: 12 }, (_, b) =>
      Math.max(0.05, Math.min(1, energy * (0.5 + 0.5 * Math.sin(i * 0.6 + b * 0.7))))
    );
    const v = amplitudeToViseme(energy, 'speaking', i, true, bands, sampleSpeech);
    hitVisemes.add(v);
    const nextState = anim.step(
      { time: i / 30, mood: 'speaking', viseme: v, eyeState: 'open', energy, isSpeaking: true, isListening: false },
      1 / 30
    );
    maxMouthJump = Math.max(maxMouthJump, Math.abs(nextState.mouthOpen - prevState.mouthOpen));
    prevState = nextState;
  }

  const report = {
    label,
    score,
    maxScore: 100,
    sheetPath,
    meanRefSimilarity: Number(meanRefSim.toFixed(4)),
    heroDistinctCount: heroSignatures.size,
    minPairDiff: Number(minPairDiff.toFixed(4)),
    minPair,
    meanPairDiff: Number(meanPairDiff.toFixed(4)),
    checks,
    speechSimulation: {
      timelineSample: timeline.slice(0, 16),
      distinctVisemesHit: Array.from(hitVisemes),
      distinctCount: hitVisemes.size,
      maxMouthOpenJumpPerFrame: Number(maxMouthJump.toFixed(4)),
    },
    panels: panelResults,
  };

  const reportPath = path.join(dataDir, `talking-eval-${label}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    label,
    score,
    sheetPath,
    reportPath,
    meanRefSimilarity: report.meanRefSimilarity,
    heroDistinctCount: report.heroDistinctCount,
    minPairDiff: report.minPairDiff,
    minPair: report.minPair,
    meanPairDiff: report.meanPairDiff,
    distinctVisemesHit: report.speechSimulation.distinctVisemesHit,
    failedChecks: checks.filter((c) => !c.pass),
    panelSims: panelResults.map((p) => ({ id: p.id, sim: p.stats.refSimilarity, dark: p.stats.cavityDarkDots, span: [p.stats.spanX, p.stats.spanY], teeth: [p.stats.upperTeethLit, p.stats.lowerTeethOrCushionLit] })),
  }, null, 2));
}

main();
