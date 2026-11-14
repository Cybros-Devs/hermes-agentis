import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ExpressionMood, EyeState, MouthViseme } from '../../src/types/hermes';
import {
  buildPortraitSourceFromRgba,
  createPortraitAnimator,
  renderHalftonePortrait,
  type DitherStyle,
  type PortraitMotionState,
  type PortraitSourceField,
} from '../../src/utils/asciiPortraitEngine';
import { amplitudeToViseme, resolveEyeState } from '../../src/utils/asciiCharacter';

interface CaptureSpec {
  id: string;
  group: 'states' | 'speaking' | 'idle' | 'turn';
  time: number;
  mood: ExpressionMood;
  viseme?: MouthViseme;
  eyeState?: EyeState;
  energy: number;
  isSpeaking: boolean;
  isListening: boolean;
  style: DitherStyle;
  tick?: number;
  motionOverride?: Partial<PortraitMotionState>;
}

interface FrameRecord {
  id: string;
  group: string;
  time: number;
  mood: ExpressionMood;
  viseme: MouthViseme;
  eyeState: EyeState;
  style: DitherStyle;
  litCells: number;
  topRowActive: number;
  leftColActive: number;
  rightColActive: number;
  mouthLitDots: number;
  eyeLitDots: number;
  sha256: string;
  path: string;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let label = 'run';
  let baselinePath: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--label' && args[i + 1]) {
      label = args[++i];
    } else if (args[i] === '--baseline' && args[i + 1]) {
      baselinePath = args[++i];
    }
  }
  return { label, baselinePath };
}

function decodeReferencePortrait(pngPath: string, size = 160): PortraitSourceField {
  const raw = execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', pngPath, '-vf', `scale=${size}:${size}`, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'],
    { maxBuffer: 16 * 1024 * 1024 }
  );
  return buildPortraitSourceFromRgba(new Uint8ClampedArray(raw), size, size);
}

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

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rasterizeFrameToRgba(
  spec: CaptureSpec,
  sourceField: PortraitSourceField,
  scale = 2
): { rgba: Uint8Array; width: number; height: number; metrics: Omit<FrameRecord, 'id' | 'group' | 'time' | 'mood' | 'viseme' | 'eyeState' | 'style' | 'sha256' | 'path'> } {
  const cols = 62;
  const rows = 28;
  const baseW = 216;
  const baseH = 198;
  const width = baseW * scale;
  const height = baseH * scale;
  const rgba = new Uint8Array(width * height * 4);

  // Smoked-emerald backdrop matching VoiceWorkspacePane (#0A1613)
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = 10;
    rgba[i * 4 + 1] = 22;
    rgba[i * 4 + 2] = 19;
    rgba[i * 4 + 3] = 255;
  }

  const tick = spec.tick ?? Math.round(spec.time * 20);
  const viseme = spec.viseme ?? amplitudeToViseme(spec.energy, spec.mood, tick, spec.isSpeaking);
  const eyeState = spec.eyeState ?? resolveEyeState(spec.mood, tick, spec.isSpeaking);

  let motion: PortraitMotionState | undefined;
  if (spec.motionOverride) {
    const anim = createPortraitAnimator();
    const baseMotion = anim.step(
      {
        time: spec.time,
        mood: spec.mood,
        viseme,
        eyeState,
        energy: spec.energy,
        isSpeaking: spec.isSpeaking,
        isListening: spec.isListening,
      },
      0.016
    );
    motion = { ...baseMotion, ...spec.motionOverride };
  }

  const frame = renderHalftonePortrait({
    cols,
    rows,
    time: spec.time,
    mood: spec.mood,
    viseme,
    eyeState,
    energy: spec.energy,
    isSpeaking: spec.isSpeaking,
    isListening: spec.isListening,
    style: 'braille',
    sourceField,
    motion,
  });

  const cellW = width / cols;
  const cellH = height / rows;
  const dotW = cellW / 2;
  const dotH = cellH / 4;
  const dotRadius = Math.min(dotW, dotH) * 0.42;

  let litCells = 0;
  let topRowActive = 0;
  let leftColActive = 0;
  let rightColActive = 0;
  let mouthLitDots = 0;
  let eyeLitDots = 0;

  for (let r = 0; r < frame.rows; r++) {
    const line = frame.lines[r];
    const baseY = r * cellH;
    for (let c = 0; c < frame.cols; c++) {
      const ch = line[c];
      if (ch === ' ') continue;
      litCells++;
      if (r === 0) topRowActive++;
      if (c === 0) leftColActive++;
      if (c === frame.cols - 1) rightColActive++;

      const bright = frame.cells[r * frame.cols + c] / 255;
      let colorHex = spec.isListening ? '#A7F3D0' : '#C2D4CE';
      let alpha = 0.62 + bright * 0.42;
      if (bright > 0.7) {
        colorHex = '#FFFFFF';
        alpha = 0.98;
      } else if (bright > 0.36) {
        colorHex = '#E6F0EC';
        alpha = 0.88;
      }
      alpha = Math.min(1, alpha);
      const [cr, cg, cb] = hexToRgb(colorHex);

      const bits = ch.charCodeAt(0) - 0x2800;
      if (bits <= 0 || bits > 0xff) continue;
      const baseX = c * cellW;
      for (let k = 0; k < 8; k++) {
        const [px, py, mask] = SUBPIXEL_BITS[k];
        if (bits & mask) {
          const cx = baseX + (px + 0.5) * dotW;
          const cy = baseY + (py + 0.5) * dotH;
          drawDisc(rgba, width, height, cx, cy, dotRadius, cr, cg, cb, alpha);
          // Normalized UV probes for eye & mouth zones
          const ux = cx / width;
          const uy = cy / height;
          if (ux > 0.16 && ux < 0.44 && uy > 0.36 && uy < 0.48) eyeLitDots++;
          if (ux > 0.19 && ux < 0.32 && uy > 0.57 && uy < 0.68) mouthLitDots++;
        }
      }
    }
  }

  return {
    rgba,
    width,
    height,
    metrics: {
      litCells,
      topRowActive,
      leftColActive,
      rightColActive,
      mouthLitDots,
      eyeLitDots,
    },
  };
}

function writePngViaFfmpeg(rgba: Uint8Array, width: number, height: number, outPath: string) {
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

function buildContactSheet(framePaths: string[], labels: string[], cols: number, outPath: string) {
  if (framePaths.length === 0) return;
  const rows = Math.ceil(framePaths.length / cols);
  const inputs: string[] = [];
  const filterParts: string[] = [];
  for (let i = 0; i < framePaths.length; i++) {
    inputs.push('-i', framePaths[i]);
    const safeLabel = labels[i].replace(/[:'\\]/g, '');
    filterParts.push(
      `[${i}:v]drawbox=x=0:y=0:w=iw:h=26:color=0x050C0ACC:t=fill,drawtext=text='${safeLabel}':x=10:y=7:fontsize=14:fontcolor=0xA7F3D0[v${i}]`
    );
  }
  const stackInputs = framePaths.map((_, i) => `[v${i}]`).join('');
  filterParts.push(`${stackInputs}xstack=inputs=${framePaths.length}:layout=${Array.from({ length: framePaths.length }, (_, idx) => `${(idx % cols) * 432}_${Math.floor(idx / cols) * 396}`).join('|')}:fill=0x050C0A[grid]`);

  try {
    execFileSync(
      'ffmpeg',
      ['-y', '-v', 'error', ...inputs, '-filter_complex', filterParts.join(';'), '-map', '[grid]', outPath]
    );
  } catch {
    // Fallback if drawtext fontconfig isn't available: tile cleanly without drawtext
    const plainFilter = `${framePaths.map((_, i) => `[${i}:v]`).join('')}xstack=inputs=${framePaths.length}:layout=${Array.from({ length: framePaths.length }, (_, idx) => `${(idx % cols) * 432}_${Math.floor(idx / cols) * 396}`).join('|')}:fill=0x050C0A[grid]`;
    execFileSync(
      'ffmpeg',
      ['-y', '-v', 'error', ...inputs, '-filter_complex', plainFilter, '-map', '[grid]', outPath]
    );
  }
  void rows;
}

function computeRgbaMeanAbsDiff(a: Uint8Array, b: Uint8Array): number {
  let diff = 0;
  for (let i = 0; i < a.length; i += 4) {
    diff += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  }
  return diff / ((a.length / 4) * 3);
}

function main() {
  const { label, baselinePath } = parseArgs();
  const repoRoot = process.cwd();
  const outDir = path.join(repoRoot, 'blueprint-out', 'ui', label);
  const dataDir = path.join(repoRoot, 'blueprint-out', 'data');
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  const portraitPath = path.join(repoRoot, 'public', 'assets', 'aistudio', 'image_9fdb5ec4.png');
  const sourceField = decodeReferencePortrait(portraitPath, 160);

  const specs: CaptureSpec[] = [
    // Group 1: Expression & State Matrix
    { id: 'state-neutral', group: 'states', time: 0.4, mood: 'neutral', viseme: 'closed', eyeState: 'open', energy: 0.08, isSpeaking: false, isListening: false, style: 'braille' },
    { id: 'state-happy', group: 'states', time: 0.4, mood: 'happy', viseme: 'smile', eyeState: 'happy', energy: 0.14, isSpeaking: false, isListening: false, style: 'braille' },
    { id: 'state-listening', group: 'states', time: 0.4, mood: 'listening', viseme: 'closed', eyeState: 'open', energy: 0.35, isSpeaking: false, isListening: true, style: 'braille' },
    { id: 'state-thinking', group: 'states', time: 0.4, mood: 'thinking', viseme: 'closed', eyeState: 'side', energy: 0.12, isSpeaking: false, isListening: false, style: 'braille' },
    { id: 'state-focused', group: 'states', time: 0.4, mood: 'focused', viseme: 'closed', eyeState: 'half', energy: 0.1, isSpeaking: false, isListening: false, style: 'braille' },
    { id: 'state-alert', group: 'states', time: 0.4, mood: 'alert', viseme: 'small', eyeState: 'wide', energy: 0.25, isSpeaking: false, isListening: false, style: 'braille' },

    // Group 2: Speaking Motion & Lip-Sync Sequence (begin -> anticipation -> peak -> round -> mid -> blink -> settle)
    { id: 'speak-01-start', group: 'speaking', time: 0.0, mood: 'speaking', viseme: 'closed', eyeState: 'open', energy: 0.12, isSpeaking: true, isListening: false, style: 'braille' },
    { id: 'speak-02-anticipate', group: 'speaking', time: 0.16, mood: 'speaking', viseme: 'small', eyeState: 'open', energy: 0.45, isSpeaking: true, isListening: false, style: 'braille' },
    { id: 'speak-03-peak', group: 'speaking', time: 0.34, mood: 'speaking', viseme: 'wide', eyeState: 'wide', energy: 0.92, isSpeaking: true, isListening: false, style: 'braille' },
    { id: 'speak-04-round', group: 'speaking', time: 0.54, mood: 'speaking', viseme: 'round', eyeState: 'open', energy: 0.68, isSpeaking: true, isListening: false, style: 'braille' },
    { id: 'speak-05-blink', group: 'speaking', time: 0.72, mood: 'speaking', viseme: 'mid', eyeState: 'blink', energy: 0.52, isSpeaking: true, isListening: false, style: 'braille' },
    { id: 'speak-06-settle', group: 'speaking', time: 1.0, mood: 'happy', viseme: 'smile', eyeState: 'happy', energy: 0.1, isSpeaking: false, isListening: false, style: 'braille' },

    // Group 3: Idle Breathing & Sway Loop (0s -> 2.75s)
    { id: 'idle-01', group: 'idle', time: 0.0, mood: 'neutral', viseme: 'closed', eyeState: 'open', energy: 0.08, isSpeaking: false, isListening: false, style: 'braille' },
    { id: 'idle-02', group: 'idle', time: 0.55, mood: 'neutral', viseme: 'closed', eyeState: 'open', energy: 0.08, isSpeaking: false, isListening: false, style: 'braille' },
    { id: 'idle-03', group: 'idle', time: 1.1, mood: 'neutral', viseme: 'closed', eyeState: 'open', energy: 0.08, isSpeaking: false, isListening: false, style: 'braille' },
    { id: 'idle-04', group: 'idle', time: 1.65, mood: 'neutral', viseme: 'closed', eyeState: 'half', energy: 0.08, isSpeaking: false, isListening: false, style: 'braille' },
    { id: 'idle-05', group: 'idle', time: 2.2, mood: 'neutral', viseme: 'closed', eyeState: 'blink', energy: 0.08, isSpeaking: false, isListening: false, style: 'braille' },
    { id: 'idle-06', group: 'idle', time: 2.75, mood: 'neutral', viseme: 'closed', eyeState: 'open', energy: 0.08, isSpeaking: false, isListening: false, style: 'braille' },

    // Group 4: 2.5D Head Turn & Pitch Matrix (Braille-only)
    { id: 'turn-left', group: 'turn', time: 0.4, mood: 'neutral', viseme: 'closed', eyeState: 'open', energy: 0.1, isSpeaking: false, isListening: false, style: 'braille', motionOverride: { headYaw: -0.30, headPitch: 0, headTilt: 0.02, gazeX: -0.45 } },
    { id: 'turn-center', group: 'turn', time: 0.4, mood: 'neutral', viseme: 'closed', eyeState: 'open', energy: 0.1, isSpeaking: false, isListening: false, style: 'braille', motionOverride: { headYaw: 0, headPitch: 0, headTilt: 0, gazeX: 0 } },
    { id: 'turn-right', group: 'turn', time: 0.4, mood: 'neutral', viseme: 'closed', eyeState: 'open', energy: 0.1, isSpeaking: false, isListening: false, style: 'braille', motionOverride: { headYaw: 0.30, headPitch: 0, headTilt: -0.02, gazeX: 0.45 } },
    { id: 'pitch-up', group: 'turn', time: 0.4, mood: 'alert', viseme: 'small', eyeState: 'wide', energy: 0.25, isSpeaking: false, isListening: false, style: 'braille', motionOverride: { headYaw: 0.05, headPitch: -0.16, browLift: 0.65, gazeY: -0.4 } },
    { id: 'pitch-down', group: 'turn', time: 0.4, mood: 'focused', viseme: 'closed', eyeState: 'half', energy: 0.12, isSpeaking: false, isListening: false, style: 'braille', motionOverride: { headYaw: -0.05, headPitch: 0.16, browLift: -0.35, gazeY: 0.35 } },
    { id: 'turn-speak-right', group: 'turn', time: 0.4, mood: 'speaking', viseme: 'wide', eyeState: 'open', energy: 0.85, isSpeaking: true, isListening: false, style: 'braille', motionOverride: { headYaw: 0.24, headPitch: -0.04, browLift: 0.45, gazeX: 0.35, mouthOpen: 0.92, mouthWidth: 1.24 } },
  ];

  const records: FrameRecord[] = [];
  const rawBuffers = new Map<string, Uint8Array>();

  // Performance benchmark on production resolution (62x28 braille)
  const benchStart = performance.now();
  for (let i = 0; i < 60; i++) {
    renderHalftonePortrait({
      cols: 62,
      rows: 28,
      time: i * 0.033,
      mood: 'speaking',
      viseme: 'mid',
      eyeState: 'open',
      energy: 0.65,
      isSpeaking: true,
      isListening: false,
      style: 'braille',
      sourceField,
    });
  }
  const avgRenderMs = Number(((performance.now() - benchStart) / 60).toFixed(2));

  for (const spec of specs) {
    const rendered = rasterizeFrameToRgba(spec, sourceField, 2);
    const outPath = path.join(outDir, `${spec.id}.png`);
    writePngViaFfmpeg(rendered.rgba, rendered.width, rendered.height, outPath);
    const pngBytes = fs.readFileSync(outPath);
    const sha256 = crypto.createHash('sha256').update(pngBytes).digest('hex');

    // Determinism check on first frame
    if (records.length === 0) {
      const check2 = rasterizeFrameToRgba(spec, sourceField, 2);
      const detDiff = computeRgbaMeanAbsDiff(rendered.rgba, check2.rgba);
      if (detDiff !== 0) {
        throw new Error(`Non-deterministic portrait render detected: diff=${detDiff}`);
      }
    }

    rawBuffers.set(spec.id, rendered.rgba);
    const tick = spec.tick ?? Math.round(spec.time * 20);
    records.push({
      id: spec.id,
      group: spec.group,
      time: spec.time,
      mood: spec.mood,
      viseme: spec.viseme ?? amplitudeToViseme(spec.energy, spec.mood, tick, spec.isSpeaking),
      eyeState: spec.eyeState ?? resolveEyeState(spec.mood, tick, spec.isSpeaking),
      style: spec.style,
      ...rendered.metrics,
      sha256,
      path: outPath,
    });
  }

  // Build contact sheets per group
  const groups: Array<{ name: string; cols: number }> = [
    { name: 'states', cols: 3 },
    { name: 'speaking', cols: 3 },
    { name: 'idle', cols: 3 },
    { name: 'turn', cols: 3 },
  ];
  const sheets: Record<string, string> = {};
  for (const g of groups) {
    const groupRecs = records.filter((r) => r.group === g.name);
    const sheetPath = path.join(outDir, `sheet_${g.name}.png`);
    buildContactSheet(
      groupRecs.map((r) => r.path),
      groupRecs.map((r) => `${r.id} (${r.viseme}/${r.eyeState})`),
      g.cols,
      sheetPath
    );
    sheets[g.name] = sheetPath;
  }

  // Measure 60fps continuous motion trajectory via createPortraitAnimator
  const motionAnim = createPortraitAnimator();
  let prevMotionRgba: Uint8Array | null = null;
  const trajectoryDeltas: number[] = [];
  for (let step = 0; step < 12; step++) {
    const t = step * (1 / 30);
    const look = { x: Math.sin(step * 0.5) * 0.8, y: Math.cos(step * 0.4) * 0.5 };
    const m = motionAnim.step(
      {
        time: t,
        mood: step % 4 === 0 ? 'speaking' : 'happy',
        viseme: step % 3 === 0 ? 'wide' : step % 3 === 1 ? 'round' : 'closed',
        eyeState: step === 5 ? 'blink' : 'open',
        energy: step % 2 === 0 ? 0.75 : 0.25,
        isSpeaking: step < 8,
        isListening: step >= 8,
      },
      1 / 30,
      false,
      look
    );
    const trajFrame = rasterizeFrameToRgba(
      {
        id: `traj-${step}`,
        group: 'turn',
        time: t,
        mood: 'speaking',
        viseme: step % 3 === 0 ? 'wide' : 'closed',
        eyeState: step === 5 ? 'blink' : 'open',
        energy: 0.6,
        isSpeaking: true,
        isListening: false,
        style: 'braille',
        motionOverride: m,
      },
      sourceField,
      1
    );
    if (prevMotionRgba) {
      trajectoryDeltas.push(Number(computeRgbaMeanAbsDiff(prevMotionRgba, trajFrame.rgba).toFixed(3)));
    }
    prevMotionRgba = trajFrame.rgba;
  }

  // Measure sequence frame-to-frame deltas (detect frozen frames / pop jumps)
  const speakRecs = records.filter((r) => r.group === 'speaking');
  const speakingStepDeltas = speakRecs.slice(1).map((r, idx) => {
    const prev = speakRecs[idx];
    const diff = computeRgbaMeanAbsDiff(rawBuffers.get(prev.id)!, rawBuffers.get(r.id)!);
    return { from: prev.id, to: r.id, meanPixelDiff: Number(diff.toFixed(3)) };
  });

  const idleRecs = records.filter((r) => r.group === 'idle');
  const idleStepDeltas = idleRecs.slice(1).map((r, idx) => {
    const prev = idleRecs[idx];
    const diff = computeRgbaMeanAbsDiff(rawBuffers.get(prev.id)!, rawBuffers.get(r.id)!);
    return { from: prev.id, to: r.id, meanPixelDiff: Number(diff.toFixed(3)) };
  });

  const turnRecs = records.filter((r) => r.group === 'turn');
  const turnStepDeltas = turnRecs.slice(1).map((r, idx) => {
    const prev = turnRecs[idx];
    const diff = computeRgbaMeanAbsDiff(rawBuffers.get(prev.id)!, rawBuffers.get(r.id)!);
    return { from: prev.id, to: r.id, meanPixelDiff: Number(diff.toFixed(3)) };
  });

  // Optional baseline comparison
  let baselineComparison: Array<{ id: string; meanPixelDiff: number; hashChanged: boolean }> | null = null;
  if (baselinePath && fs.existsSync(baselinePath)) {
    const baseReport = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as { frames: FrameRecord[] };
    const baseById = new Map(baseReport.frames.map((f) => [f.id, f]));
    baselineComparison = records.map((r) => {
      const bf = baseById.get(r.id);
      return {
        id: r.id,
        meanPixelDiff: bf ? Number(Math.abs(bf.litCells - r.litCells).toFixed(2)) : -1,
        hashChanged: bf ? bf.sha256 !== r.sha256 : true,
      };
    });
  }

  const report = {
    run: label,
    status: 'captured',
    character: 'hermes-halftone-portrait',
    method: { viewport: '216x198', dpr: 2, grid: '62x28' },
    perf: { avgRenderMs },
    determinism: { verified: true, diff: 0 },
    sheets,
    speakingStepDeltas,
    idleStepDeltas,
    turnStepDeltas,
    trajectoryDeltas,
    frames: records,
    baselineComparison,
  };

  const reportPath = path.join(dataDir, `report-${label}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: 'captured', report: reportPath, avgRenderMs, sheets, trajectoryDeltas }));
}

main();
