import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ExpressionMood, EyeState, MouthViseme } from '../../src/types/hermes';
import {
  renderAscii3DFrame,
  type AsciiShaderMode,
} from '../../src/utils/ascii3dEngine';
import { amplitudeToViseme, resolveEyeState } from '../../src/utils/asciiCharacter';
import {
  buildPortraitSourceFromRgba,
  createPortraitAnimator,
  renderHalftonePortrait,
  type PortraitMotionState,
  type PortraitSourceField,
} from '../../src/utils/asciiPortraitEngine';
import * as fieldEngine from '../../src/utils/brailleFieldEngine';
import {
  IDLE_ACTION_SLOT_SECONDS,
  IDLE_ACTIVE_END_SECONDS,
  IDLE_ANIMATION_SETS,
  IDLE_SET_ORDER,
  evaluateIdleActionStep,
} from '../../src/utils/brailleIdleLoops';
import * as shapesEngine from '../../src/utils/brailleShapesEngine';
import type { BrailleShapeKind } from '../../src/utils/brailleShapesEngine';
import {
  blendLoadingToPortraitFrame,
  computeMaterializeProgress,
  renderPortraitLoadingFrame,
} from '../../src/utils/portraitLoadingEngine';
import {
  computeDecodeFrame,
  getDecodeDurationMs,
} from '../../src/utils/textDecodeEngine';

interface ShapeAnimatorLike {
  step: (
    input: {
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
    },
    dt: number,
    reducedMotion?: boolean
  ) => Record<string, number | string>;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

function decodeReferencePortrait(pngPath: string, size = 160): PortraitSourceField {
  const raw = execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', pngPath, '-vf', `scale=${size}:${size}`, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'],
    { maxBuffer: 16 * 1024 * 1024 }
  );
  return buildPortraitSourceFromRgba(new Uint8ClampedArray(raw), size, size);
}

function cellsMeanAbsDiff(a: Uint8Array, b: Uint8Array): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    sum += Math.abs(a[i] - b[i]);
  }
  return sum / Math.max(1, len);
}

function lineSignatureDiff(aLines: string[], bLines: string[]): number {
  let diff = 0;
  let total = 0;
  for (let r = 0; r < aLines.length; r++) {
    const la = aLines[r];
    const lb = bLines[r] ?? '';
    for (let c = 0; c < la.length; c++) {
      total++;
      if (la[c] !== lb[c]) diff++;
    }
  }
  return diff / Math.max(1, total);
}

function computeJerkMetrics(series: number[]) {
  if (series.length < 3) {
    return { mean: 0, max: 0, p95: 0, jerkRatio: 0, deadRatio: 1, spikeRatio: 0 };
  }
  const sorted = [...series].sort((a, b) => a - b);
  const mean = series.reduce((acc, v) => acc + v, 0) / series.length;
  const max = sorted[sorted.length - 1];
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  let secondDiffSq = 0;
  for (let i = 2; i < series.length; i++) {
    const d2 = series[i] - 2 * series[i - 1] + series[i - 2];
    secondDiffSq += d2 * d2;
  }
  const rmsJerk = Math.sqrt(secondDiffSq / (series.length - 2));
  const jerkRatio = mean > 1e-4 ? rmsJerk / mean : 10;
  const deadCount = series.filter((v) => v < 0.08).length;
  const spikeCount = series.filter((v) => v > Math.max(8, mean * 3.2)).length;
  return {
    mean: Number(mean.toFixed(3)),
    max: Number(max.toFixed(3)),
    p95: Number(p95.toFixed(3)),
    jerkRatio: Number(jerkRatio.toFixed(3)),
    deadRatio: Number((deadCount / series.length).toFixed(3)),
    spikeRatio: Number((spikeCount / series.length).toFixed(3)),
  };
}

function countBoundaryTouches(lines: string[], rows: number, cols: number): number {
  let touches = 0;
  for (let c = 0; c < cols; c++) {
    if (lines[0]?.[c] && lines[0][c] !== ' ') touches++;
  }
  for (let r = 0; r < rows; r++) {
    if (lines[r]?.[0] && lines[r][0] !== ' ') touches++;
    if (lines[r]?.[cols - 1] && lines[r][cols - 1] !== ' ') touches++;
  }
  return touches;
}

function writeStripPng(
  frames: Array<{ cells: Uint8Array; cols: number; rows: number; lines: string[] }>,
  outPath: string,
  cellPx = 6
) {
  if (frames.length === 0) return;
  const pad = 8;
  const cols = frames[0].cols;
  const rows = frames[0].rows;
  const panelW = cols * 2 * cellPx;
  const panelH = rows * 4 * cellPx;
  const totalW = frames.length * panelW + (frames.length + 1) * pad;
  const totalH = panelH + pad * 2;
  const rgba = new Uint8Array(totalW * totalH * 4);
  for (let i = 0; i < totalW * totalH; i++) {
    rgba[i * 4] = 7;
    rgba[i * 4 + 1] = 17;
    rgba[i * 4 + 2] = 14;
    rgba[i * 4 + 3] = 255;
  }

  const bitsMap: Array<[number, number, number]> = [
    [0, 0, 0x01],
    [1, 0, 0x08],
    [0, 1, 0x02],
    [1, 1, 0x10],
    [0, 2, 0x04],
    [1, 2, 0x20],
    [0, 3, 0x40],
    [1, 3, 0x80],
  ];

  for (let fIdx = 0; fIdx < frames.length; fIdx++) {
    const f = frames[fIdx];
    const ox = pad + fIdx * (panelW + pad);
    const oy = pad;
    for (let r = 0; r < f.rows; r++) {
      const line = f.lines[r];
      for (let c = 0; c < f.cols; c++) {
        const ch = line[c];
        if (ch === ' ') continue;
        const bits = ch.charCodeAt(0) - 0x2800;
        const br = f.cells[r * f.cols + c] / 255;
        const cr = br > 0.65 ? 245 : br > 0.35 ? 175 : 95;
        const cg = br > 0.65 ? 255 : br > 0.35 ? 245 : 210;
        const cb = br > 0.65 ? 248 : br > 0.35 ? 215 : 170;
        for (const [px, py, mask] of bitsMap) {
          if (!(bits & mask)) continue;
          const bx = ox + (c * 2 + px) * cellPx;
          const by = oy + (r * 4 + py) * cellPx;
          for (let dy = 0; dy < Math.max(1, cellPx - 1); dy++) {
            for (let dx = 0; dx < Math.max(1, cellPx - 1); dx++) {
              const p = ((by + dy) * totalW + (bx + dx)) * 4;
              rgba[p] = cr;
              rgba[p + 1] = cg;
              rgba[p + 2] = cb;
              rgba[p + 3] = 255;
            }
          }
        }
      }
    }
  }

  execFileSync(
    'ffmpeg',
    ['-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${totalW}x${totalH}`, '-i', '-', '-frames:v', '1', outPath],
    { input: Buffer.from(rgba) }
  );
}

function evaluateMainPortrait(sourceField: PortraitSourceField) {
  const dt = 1 / 30;

  // 1. Idle + natural blink + saccade trajectory (120 frames = 4.0s at 30fps)
  const idleAnim = createPortraitAnimator();
  const idleStates: PortraitMotionState[] = [];
  const idleCellDiffs: number[] = [];
  let prevIdleCells: Uint8Array | null = null;
  let idleClips = 0;

  for (let i = 0; i < 120; i++) {
    const t = i * dt;
    const eyeState: EyeState = resolveEyeState('neutral', Math.floor(t * 4.5), false);
    const m = idleAnim.step(
      {
        time: t,
        mood: 'neutral',
        viseme: 'closed',
        eyeState,
        energy: 0.08,
        isSpeaking: false,
        isListening: false,
      },
      dt
    );
    idleStates.push(m);
    const frame = renderHalftonePortrait({
      cols: 62,
      rows: 28,
      time: t,
      mood: 'neutral',
      viseme: 'closed',
      eyeState,
      energy: 0.08,
      isSpeaking: false,
      isListening: false,
      sourceField,
      motion: m,
    });
    if (i % 6 === 0) {
      idleClips += countBoundaryTouches(frame.lines, 28, 62);
    }
    if (prevIdleCells) {
      idleCellDiffs.push(cellsMeanAbsDiff(prevIdleCells, frame.cells));
    }
    prevIdleCells = frame.cells;
  }

  // Blink envelope & half-lid continuity
  const halfLidFrames = idleStates.filter((s) => s.blink > 0.14 && s.blink < 0.86).length;
  const maxBlink = Math.max(...idleStates.map((s) => s.blink));
  let blinkCloseSlope = 0;
  let blinkOpenSlope = 0;
  for (let i = 1; i < idleStates.length; i++) {
    const d = idleStates[i].blink - idleStates[i - 1].blink;
    if (d > blinkCloseSlope) blinkCloseSlope = d;
    if (-d > blinkOpenSlope) blinkOpenSlope = -d;
  }
  const blinkAsymmetric = blinkCloseSlope > blinkOpenSlope * 1.08;

  // Gaze natural fixation vs pure sinusoidal swimming:
  // Natural micro-saccades have brief low-velocity dwell windows (|dgaze/dt| low) + crisp shifts (maxSpeed > 2.2 * medianSpeed)
  const gazeSpeeds: number[] = [];
  for (let i = 1; i < idleStates.length; i++) {
    const dx = idleStates[i].gazeX - idleStates[i - 1].gazeX;
    const dy = idleStates[i].gazeY - idleStates[i - 1].gazeY;
    gazeSpeeds.push(Math.hypot(dx, dy) / dt);
  }
  const sortedGaze = [...gazeSpeeds].sort((a, b) => a - b);
  const medianGazeSpeed = sortedGaze[Math.floor(sortedGaze.length * 0.5)] || 0.001;
  const maxGazeSpeed = sortedGaze[sortedGaze.length - 1];
  const gazeKurtosisProxy = maxGazeSpeed / Math.max(0.02, medianGazeSpeed);
  const gazeFixationShare = gazeSpeeds.filter((v) => v < 0.14).length / Math.max(1, gazeSpeeds.length);

  // 2. Speech phrase + mood transition + secondary hair lag (90 frames = 3.0s at 30fps)
  const speakAnim = createPortraitAnimator();
  const speakStates: PortraitMotionState[] = [];
  const speakCellDiffs: number[] = [];
  let prevSpeakCells: Uint8Array | null = null;
  const phrase = 'Two mcp duet gates queued cleanly for release review.';
  const hitVisemes = new Set<MouthViseme>();

  for (let i = 0; i < 90; i++) {
    const t = i * dt;
    const isSpeaking = i >= 6 && i < 72;
    const mood: ExpressionMood = i < 6 ? 'listening' : isSpeaking ? 'speaking' : 'happy';
    const energy = isSpeaking
      ? clamp01(0.24 + 0.66 * Math.abs(Math.sin(t * 7.4)) * (0.65 + 0.35 * Math.cos(t * 3.1)))
      : 0.1;
    const tick = Math.floor(t * (isSpeaking ? 24 : 8));
    const viseme = amplitudeToViseme(energy, mood, tick, isSpeaking, undefined, phrase);
    if (isSpeaking) hitVisemes.add(viseme);
    const eyeState = resolveEyeState(mood, tick, isSpeaking);
    const look = i > 30 && i < 60 ? { x: Math.sin((i - 30) * 0.15) * 0.75, y: -0.25 } : null;

    const m = speakAnim.step(
      { time: t, mood, viseme, eyeState, energy, isSpeaking, isListening: i < 6 },
      dt,
      false,
      look
    );
    speakStates.push(m);

    const frame = renderHalftonePortrait({
      cols: 62,
      rows: 28,
      time: t,
      mood,
      viseme,
      eyeState,
      energy,
      isSpeaking,
      isListening: i < 6,
      sourceField,
      motion: m,
    });
    if (prevSpeakCells) {
      speakCellDiffs.push(cellsMeanAbsDiff(prevSpeakCells, frame.cells));
    }
    prevSpeakCells = frame.cells;
  }

  // Verify secondary hair lag independence & non-locking
  let maxHairLagDelta = 0;
  let maxMouthStepJump = 0;
  for (let i = 1; i < speakStates.length; i++) {
    maxHairLagDelta = Math.max(maxHairLagDelta, Math.abs(speakStates[i].hairLagX - speakStates[i - 1].hairLagX));
    maxMouthStepJump = Math.max(maxMouthStepJump, Math.abs(speakStates[i].mouthOpen - speakStates[i - 1].mouthOpen));
  }
  const hairRange =
    Math.max(...speakStates.map((s) => s.hairLagX)) - Math.min(...speakStates.map((s) => s.hairLagX));

  const idleJerk = computeJerkMetrics(idleCellDiffs);
  const speakJerk = computeJerkMetrics(speakCellDiffs);

  // Performance benchmark: 62x28 hero + 92x42 stage
  const tHero0 = performance.now();
  for (let i = 0; i < 40; i++) {
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
      sourceField,
    });
  }
  const heroAvgMs = (performance.now() - tHero0) / 40;

  const tStage0 = performance.now();
  for (let i = 0; i < 20; i++) {
    renderHalftonePortrait({
      cols: 92,
      rows: 42,
      time: i * 0.033,
      mood: 'speaking',
      viseme: 'wide',
      eyeState: 'open',
      energy: 0.72,
      isSpeaking: true,
      isListening: false,
      sourceField,
    });
  }
  const stageAvgMs = (performance.now() - tStage0) / 20;

  // Sub-scores
  // 1. Portrait Continuity & Kinematics (max 20)
  const idleSmoothScore =
    clamp01(1 - Math.max(0, idleJerk.jerkRatio - 0.35) / 1.1) * 5 * (1 - idleJerk.deadRatio * 0.8);
  const speakSmoothScore =
    clamp01(1 - Math.max(0, speakJerk.jerkRatio - 0.35) / 1.1) * 5 * (1 - speakJerk.spikeRatio * 2);
  const blinkScore =
    (maxBlink > 0.75 ? 2 : 0.5) +
    clamp01(halfLidFrames / 4) * 2 +
    (blinkAsymmetric ? 1.5 : 0.3);
  const hairScore = clamp01(hairRange / 0.025) * 2.5 + clamp01(1 - Math.max(0, maxHairLagDelta - 0.015) / 0.03) * 2.0;
  const continuityScore = clamp(idleSmoothScore + speakSmoothScore + blinkScore + hairScore, 0, 20);

  // 2. Portrait Talking & Gaze Expression (max 15)
  const visemeRangeScore = clamp01(hitVisemes.size / 6) * 5;
  const mouthSmoothScore = clamp01(1 - Math.max(0, maxMouthStepJump - 0.12) / 0.25) * 4;
  // Real gaze fixations: ~35%-75% dwell periods + crisp saccade peaks (gazeKurtosisProxy >= 2.6)
  const gazeFixScore =
    clamp01(gazeFixationShare / 0.35) * 3 +
    clamp01((gazeKurtosisProxy - 1.5) / 1.8) * 3;
  const expressionScore = clamp(visemeRangeScore + mouthSmoothScore + gazeFixScore, 0, 15);

  return {
    continuityScore: Number(continuityScore.toFixed(2)),
    expressionScore: Number(expressionScore.toFixed(2)),
    metrics: {
      idleJerk,
      speakJerk,
      halfLidFrames,
      maxBlink: Number(maxBlink.toFixed(3)),
      blinkAsymmetric,
      hairRange: Number(hairRange.toFixed(4)),
      maxMouthStepJump: Number(maxMouthStepJump.toFixed(4)),
      distinctSpeakingVisemes: hitVisemes.size,
      gazeFixationShare: Number(gazeFixationShare.toFixed(3)),
      gazeKurtosisProxy: Number(gazeKurtosisProxy.toFixed(3)),
      idleClips,
      heroAvgMs: Number(heroAvgMs.toFixed(2)),
      stageAvgMs: Number(stageAvgMs.toFixed(2)),
    },
  };
}

function createFallbackShapeAnimator(): ShapeAnimatorLike {
  let smoothGazeX = 0;
  let smoothGazeY = 0;
  return {
    step(input, dt) {
      const gazeFactor = 1 - Math.exp(-10 * dt);
      const tx = input.gazeX ?? (input.isThinking ? Math.sin(input.time * 2.4) * 0.55 : 0);
      const ty = input.gazeY ?? (input.isThinking ? -0.35 : 0);
      smoothGazeX += (tx - smoothGazeX) * gazeFactor;
      smoothGazeY += (ty - smoothGazeY) * gazeFactor;
      const blinkCycle = (input.time + (input.blinkPhaseOffset ?? 0)) % 4.4;
      const isBlinking = blinkCycle > 4.22;
      const eyeState: EyeState | 'sleepy' = isBlinking
        ? 'blink'
        : input.mood === 'alert'
        ? 'wide'
        : input.mood === 'focused'
        ? 'sleepy'
        : input.eyeStyle;
      return {
        eyeState,
        blink: isBlinking ? 1 : 0,
        mouthOpen: input.isSpeaking ? input.energy * 0.85 : 0,
        gazeX: smoothGazeX,
        gazeY: smoothGazeY,
        dragTilt: 0,
        hairLag: 0,
        dragLift: input.isDragging ? 0.04 : 0,
      };
    },
  };
}

function evaluateBrailleShapes() {
  const hasStatefulAnimator = typeof (shapesEngine as Record<string, unknown>).createBrailleShapeAnimator === 'function';
  const makeAnimator = (): ShapeAnimatorLike =>
    hasStatefulAnimator
      ? ((shapesEngine as unknown as { createBrailleShapeAnimator: () => ShapeAnimatorLike }).createBrailleShapeAnimator())
      : createFallbackShapeAnimator();

  // 1. Evaluate blink interpolation, drag-and-drop settle physics, and speech transitions across representative shapes
  const probeShapes: BrailleShapeKind[] = ['clover', 'star', 'ghost', 'heart', 'cloud'];
  const dt = 1 / 30;

  let totalHalfBlinkFrames = 0;
  let totalMaxMouthJump = 0;
  let totalDragTiltRange = 0;
  let totalHairLagRange = 0;
  let totalSettleOvershootOrDecay = 0;
  let totalClips = 0;
  const allDiffs: number[] = [];
  const stripFrames: Array<{ cells: Uint8Array; cols: number; rows: number; lines: string[] }> = [];

  for (let sIdx = 0; sIdx < probeShapes.length; sIdx++) {
    const shape = probeShapes[sIdx];
    const anim = makeAnimator();
    const animStates: Array<Record<string, number | string>> = [];
    let prevCells: Uint8Array | null = null;
    const diffs: number[] = [];

    // 140 frames = 4.67s covering idle + blink + drag move + drop settle + speaking burst
    for (let i = 0; i < 140; i++) {
      const t = i * dt;
      const isDragging = i >= 35 && i < 65;
      const dragVelX = isDragging ? Math.sin((i - 35) * 0.25) * 1.4 : 0;
      const dragVelY = isDragging ? Math.cos((i - 35) * 0.2) * 0.5 : 0;
      const isThinking = i >= 78 && i < 95;
      const isSpeaking = i >= 95 && i < 128;
      const mood: ExpressionMood = isThinking ? 'thinking' : isSpeaking ? 'speaking' : 'happy';
      const energy = isSpeaking ? clamp01(0.3 + 0.65 * Math.abs(Math.sin((i - 95) * 0.35))) : 0.08;
      const viseme = amplitudeToViseme(energy, mood, i, isSpeaking);

      const st = anim.step(
        {
          time: t,
          mood,
          eyeStyle: 'open',
          viseme,
          energy,
          isSpeaking,
          isThinking,
          isDragging,
          dragVelX,
          dragVelY,
          blinkPhaseOffset: 0,
        },
        dt
      );
      animStates.push(st);

      const frame = shapesEngine.renderBrailleShape({
        shape,
        cols: 34,
        rows: 17,
        time: t,
        mood,
        eyeState: (st.eyeState as EyeState | 'sleepy') ?? 'open',
        viseme,
        energy,
        isSpeaking,
        isDragging,
        gazeX: Number(st.gazeX ?? 0),
        gazeY: Number(st.gazeY ?? 0),
        ...(hasStatefulAnimator ? { motion: st } : {}),
      } as shapesEngine.BrailleShapeRenderParams);

      if (sIdx === 0 && (i === 10 || i === 42 || i === 66 || i === 105 || i === 128 || i === 134)) {
        stripFrames.push(frame);
      }
      if (i % 10 === 0) {
        totalClips += countBoundaryTouches(frame.lines, 17, 34);
      }
      if (prevCells) {
        const d = cellsMeanAbsDiff(prevCells, frame.cells);
        diffs.push(d);
        allDiffs.push(d);
      }
      prevCells = frame.cells;
    }

    // Measure blink interpolation smoothness across all frames
    const halfBlink = animStates.filter((s) => {
      const b = Number(s.blink ?? 0);
      return b > 0.12 && b < 0.88;
    }).length;
    totalHalfBlinkFrames += halfBlink;

    // Mouth continuity
    let maxMouthJump = 0;
    for (let i = 1; i < animStates.length; i++) {
      maxMouthJump = Math.max(maxMouthJump, Math.abs(Number(animStates[i].mouthOpen ?? 0) - Number(animStates[i - 1].mouthOpen ?? 0)));
    }
    totalMaxMouthJump += maxMouthJump;

    // Drag tilt & settle bounce after drop (frames 65..76)
    const tilts = animStates.map((s) => Number(s.dragTilt ?? 0));
    totalDragTiltRange += Math.max(...tilts) - Math.min(...tilts);
    const lags = animStates.map((s) => Number(s.hairLag ?? 0));
    totalHairLagRange += Math.max(...lags) - Math.min(...lags);

    const dropSettling = animStates.slice(65, 76).map((s) => Number(s.dragLift ?? 0));
    let dropSmoothChanges = 0;
    for (let i = 1; i < dropSettling.length; i++) {
      if (Math.abs(dropSettling[i] - dropSettling[i - 1]) > 0.001) dropSmoothChanges++;
    }
    totalSettleOvershootOrDecay += dropSmoothChanges;
  }

  // Verify all 9 shapes remain distinct & zero severe clipping
  const sigSet = new Set<string>();
  let catalogClips = 0;
  for (const meta of shapesEngine.BRAILLE_SHAPE_CATALOG) {
    const f = shapesEngine.renderBrailleShape({
      shape: meta.kind,
      cols: 34,
      rows: 17,
      time: 0.4,
      mood: 'happy',
      eyeState: meta.defaultEyeStyle,
      viseme: 'closed',
      energy: 0.1,
    });
    sigSet.add(f.lines.join('\n'));
    catalogClips += countBoundaryTouches(f.lines, 17, 34);
  }

  // Render performance benchmark for shape (34x17)
  const tShape0 = performance.now();
  for (let i = 0; i < 80; i++) {
    shapesEngine.renderBrailleShape({
      shape: shapesEngine.BRAILLE_SHAPE_CATALOG[i % 9].kind,
      cols: 34,
      rows: 17,
      time: i * 0.033,
      mood: 'speaking',
      eyeState: 'open',
      viseme: 'mid',
      energy: 0.65,
      isSpeaking: true,
    });
  }
  const shapeAvgMs = (performance.now() - tShape0) / 80;

  const avgHalfBlink = totalHalfBlinkFrames / probeShapes.length;
  const avgMaxMouthJump = totalMaxMouthJump / probeShapes.length;
  const avgDragTiltRange = totalDragTiltRange / probeShapes.length;
  const avgHairLagRange = totalHairLagRange / probeShapes.length;
  const avgDropSmoothSteps = totalSettleOvershootOrDecay / probeShapes.length;
  const shapeJerk = computeJerkMetrics(allDiffs);

  // Score out of 25 for Anime Braille Shapes motion quality
  const blinkSmoothScore = clamp01(avgHalfBlink / 4) * 6;
  const dragPhysicsScore =
    clamp01(avgDragTiltRange / 0.14) * 3.5 +
    clamp01(avgDropSmoothSteps / 4) * 3.5;
  const secondaryLagScore = clamp01(avgHairLagRange / 0.04) * 4;
  const mouthContinuityScore = clamp01(1 - Math.max(0, avgMaxMouthJump - 0.14) / 0.45) * 4;
  const trajFluidScore = clamp01(1 - Math.max(0, shapeJerk.jerkRatio - 0.5) / 1.4) * 4;
  const shapesScore = clamp(
    blinkSmoothScore + dragPhysicsScore + secondaryLagScore + mouthContinuityScore + trajFluidScore,
    0,
    25
  );

  // Silhouette & Framing score (max 15 across both portrait & shapes)
  const distinctScore = (sigSet.size / 9) * 8;
  const clipPenalty = Math.min(7, (totalClips + catalogClips) * 0.35);
  const framingScore = clamp(distinctScore + (7 - clipPenalty), 0, 15);

  return {
    shapesScore: Number(shapesScore.toFixed(2)),
    framingScore: Number(framingScore.toFixed(2)),
    stripFrames,
    metrics: {
      hasStatefulAnimator,
      avgHalfBlinkFrames: Number(avgHalfBlink.toFixed(2)),
      avgMaxMouthJump: Number(avgMaxMouthJump.toFixed(3)),
      avgDragTiltRange: Number(avgDragTiltRange.toFixed(4)),
      avgHairLagRange: Number(avgHairLagRange.toFixed(4)),
      avgDropSmoothSteps: Number(avgDropSmoothSteps.toFixed(2)),
      shapeJerk,
      distinctShapes: sigSet.size,
      totalClips,
      catalogClips,
      shapeAvgMs: Number(shapeAvgMs.toFixed(2)),
    },
  };
}

function evaluateHorizonField() {
  const diffs: number[] = [];
  let prevCells: Uint8Array | null = null;
  let lowEnergyLines: string[] = [];
  let highEnergyLines: string[] = [];
  let leftPtrLines: string[] = [];
  let rightPtrLines: string[] = [];

  const createAnimFn = (fieldEngine as Record<string, unknown>).createHorizonAnimator as
    | (() => {
        step: (input: {
          energy: number;
          pointerX: number;
          pointerY: number;
          bands?: number[];
        }, dt: number) => {
          energy: number;
          pointerX: number;
          pointerY: number;
          bands: number[];
        };
      })
    | undefined;
  const animator = typeof createAnimFn === 'function' ? createAnimFn() : null;
  const dt = 1 / 30;

  for (let i = 0; i < 45; i++) {
    const t = i * dt;
    const energy = i < 15 ? 0.08 : i < 30 ? 0.82 : 0.35;
    const pointerX = Math.sin(i * 0.12) * 0.85;
    const bands = Array.from({ length: 12 }, (_, b) =>
      clamp01(energy * (0.4 + 0.6 * Math.sin(t * 9 + b * 0.6)))
    );
    const motion = animator
      ? animator.step({ energy, pointerX, pointerY: 0, bands }, dt)
      : null;

    const frame = fieldEngine.renderBrailleHorizon({
      cols: 120,
      rows: 14,
      time: t,
      energy: motion ? motion.energy : energy,
      pointerX: motion ? motion.pointerX : pointerX,
      pointerY: motion ? motion.pointerY : 0,
      bands: motion ? motion.bands : bands,
      ...(motion ? { motion } : {}),
    } as fieldEngine.BrailleHorizonParams);

    if (i === 5) lowEnergyLines = frame.lines;
    if (i === 22) highEnergyLines = frame.lines;
    if (i === 10) leftPtrLines = frame.lines;
    if (i === 35) rightPtrLines = frame.lines;
    if (prevCells) {
      diffs.push(cellsMeanAbsDiff(prevCells, frame.cells));
    }
    prevCells = frame.cells;
  }

  const jerk = computeJerkMetrics(diffs);
  const energyResp = lineSignatureDiff(lowEnergyLines, highEnergyLines);
  const ptrResp = lineSignatureDiff(leftPtrLines, rightPtrLines);

  const smoothScore = clamp01(1 - Math.max(0, jerk.jerkRatio - 0.35) / 1.0) * 5;
  const respScore = clamp01(energyResp / 0.18) * 3 + clamp01(ptrResp / 0.12) * 2;
  const horizonScore = clamp(smoothScore + respScore, 0, 10);

  return {
    horizonScore: Number(horizonScore.toFixed(2)),
    metrics: {
      jerk,
      energyResp: Number(energyResp.toFixed(3)),
      ptrResp: Number(ptrResp.toFixed(3)),
    },
  };
}

function evaluatePerfBudget(heroAvgMs: number, stageAvgMs: number, shapeAvgMs: number) {
  // Target: hero < 2.2ms, stage < 5.0ms, shape < 0.55ms (total 15 pts)
  const heroScore = clamp01((7.5 - heroAvgMs) / (7.5 - 2.2)) * 6;
  const stageScore = clamp01((16.0 - stageAvgMs) / (16.0 - 5.0)) * 5;
  const shapeScore = clamp01((1.6 - shapeAvgMs) / (1.6 - 0.55)) * 4;
  return Number(clamp(heroScore + stageScore + shapeScore, 0, 15).toFixed(2));
}

export interface ComponentEvaluatorResult {
  id: string;
  score: number;
  maxScore: number;
  metrics: Record<string, unknown>;
}

export interface ComponentEvaluatorContext {
  repoRoot: string;
  sourceField: PortraitSourceField;
}

export interface ComponentEvaluator {
  id: string;
  maxScore: number;
  evaluate: (ctx: ComponentEvaluatorContext) => ComponentEvaluatorResult;
}

function evalAllBrailleShapes(): ComponentEvaluatorResult {
  const catalog = shapesEngine.BRAILLE_SHAPE_CATALOG;
  const makeAnimator = () => shapesEngine.createBrailleShapeAnimator();
  const dt = 1 / 30;
  const signatures = new Map<BrailleShapeKind, string>();
  const shapeJerks: number[] = [];
  let totalClips = 0;

  for (const meta of catalog) {
    const anim = makeAnimator();
    let prevCells: Uint8Array | null = null;
    const diffs: number[] = [];

    for (let i = 0; i < 60; i++) {
      const t = i * dt;
      const isSpeaking = i >= 30 && i < 50;
      const isDragging = i >= 12 && i < 24;
      const mood: ExpressionMood = isSpeaking ? 'speaking' : 'happy';
      const energy = isSpeaking ? 0.55 : 0.08;
      const viseme = amplitudeToViseme(energy, mood, i, isSpeaking);
      const st = anim.step(
        {
          time: t,
          mood,
          eyeStyle: meta.defaultEyeStyle,
          viseme,
          energy,
          isSpeaking,
          isThinking: false,
          isDragging,
          dragVelX: isDragging ? Math.sin(i * 0.4) * 1.1 : 0,
          dragVelY: 0,
        },
        dt
      );
      const frame = shapesEngine.renderBrailleShape({
        shape: meta.kind,
        cols: 34,
        rows: 17,
        time: t,
        mood,
        eyeState: st.blink > 0.72 ? 'blink' : meta.defaultEyeStyle,
        viseme,
        energy,
        isSpeaking,
        isDragging,
        gazeX: st.gazeX,
        gazeY: st.gazeY,
        motion: st,
      });
      if (i === 5) {
        signatures.set(meta.kind, frame.lines.join('\n'));
      }
      if (i % 15 === 0) {
        totalClips += countBoundaryTouches(frame.lines, 17, 34);
      }
      if (prevCells) diffs.push(cellsMeanAbsDiff(prevCells, frame.cells));
      prevCells = frame.cells;
    }
    shapeJerks.push(computeJerkMetrics(diffs).jerkRatio);
  }

  // Pairwise silhouette uniqueness across all N shapes
  const sigArr = [...signatures.values()];
  let pairCount = 0;
  let distinctPairs = 0;
  for (let a = 0; a < sigArr.length; a++) {
    for (let b = a + 1; b < sigArr.length; b++) {
      pairCount++;
      if (sigArr[a] !== sigArr[b]) distinctPairs++;
    }
  }
  const uniquenessRatio = pairCount > 0 ? distinctPairs / pairCount : 1;
  const meanJerk = shapeJerks.reduce((a, b) => a + b, 0) / Math.max(1, shapeJerks.length);
  const clipPenalty = Math.min(4, totalClips * 0.2);
  const score = clamp(uniquenessRatio * 10 + clamp01(1 - Math.max(0, meanJerk - 0.55) / 1.2) * 6 + (4 - clipPenalty), 0, 20);

  return {
    id: 'brailleShapesAll9',
    score: Number(score.toFixed(2)),
    maxScore: 20,
    metrics: {
      shapeCount: catalog.length,
      distinctPairs,
      pairCount,
      meanJerkRatio: Number(meanJerk.toFixed(3)),
      totalClips,
    },
  };
}

function evalAllIdleLoops(): ComponentEvaluatorResult {
  let actionCount = 0;
  let smoothEaseInOutCount = 0;
  let calmRestCount = 0;
  let reducedZeroCount = 0;
  let smoothMotionCount = 0;

  for (const setId of IDLE_SET_ORDER) {
    const meta = IDLE_ANIMATION_SETS[setId];
    for (let idx = 0; idx < meta.actions.length; idx++) {
      actionCount++;
      const baseT = idx * IDLE_ACTION_SLOT_SECONDS;
      const fStart = evaluateIdleActionStep(setId, baseT + 0.01);
      const fPeak = evaluateIdleActionStep(setId, baseT + 1.55);
      const fEnd = evaluateIdleActionStep(setId, baseT + IDLE_ACTIVE_END_SECONDS - 0.02);
      const fRest = evaluateIdleActionStep(setId, baseT + IDLE_ACTIVE_END_SECONDS + 0.25);
      const fReduced = evaluateIdleActionStep(setId, baseT + 1.55, true);

      if (fStart.envelope < 0.15 && fPeak.envelope > 0.95 && fEnd.envelope < 0.15) {
        smoothEaseInOutCount++;
      }
      if (
        fRest.isResting &&
        Math.abs(fRest.pose.headX) < 1e-6 &&
        Math.abs(fRest.pose.tilt) < 1e-6 &&
        fRest.pose.hand === 'none'
      ) {
        calmRestCount++;
      }
      if (fReduced.isResting && fReduced.envelope === 0 && Math.abs(fReduced.pose.tilt) < 1e-6) {
        reducedZeroCount++;
      }

      // Check step continuity across active phase
      let maxTiltJump = 0;
      let prevTilt = 0;
      for (let s = 0; s <= 15; s++) {
        const st = evaluateIdleActionStep(setId, baseT + s * 0.2);
        if (s > 0) maxTiltJump = Math.max(maxTiltJump, Math.abs(st.pose.tilt - prevTilt));
        prevTilt = st.pose.tilt;
      }
      if (maxTiltJump < 0.12) smoothMotionCount++;
    }
  }

  const totalRatio =
    (smoothEaseInOutCount + calmRestCount + reducedZeroCount + smoothMotionCount) /
    Math.max(1, actionCount * 4);
  const score = clamp(totalRatio * 15, 0, 15);

  return {
    id: 'brailleIdleLoops36',
    score: Number(score.toFixed(2)),
    maxScore: 15,
    metrics: {
      setCount: IDLE_SET_ORDER.length,
      actionCount,
      smoothEaseInOutCount,
      calmRestCount,
      reducedZeroCount,
      smoothMotionCount,
    },
  };
}

function evalAscii3dViewport(): ComponentEvaluatorResult {
  const modes: AsciiShaderMode[] = ['solid', 'wire', 'depth', 'holo', 'norm'];
  const modeSignatures = new Set<string>();
  const perfTimes: number[] = [];

  for (const shaderMode of modes) {
    const t0 = performance.now();
    const f = renderAscii3DFrame({
      cols: 60,
      rows: 26,
      time: 0.85,
      yaw: 0.25,
      pitch: 0.1,
      zoom: 1,
      mood: 'speaking',
      viseme: 'mid',
      eyeState: 'open',
      energy: 0.65,
      isSpeaking: true,
      isListening: false,
      shaderMode,
    });
    perfTimes.push(performance.now() - t0);
    const nonSpace = f.cells.filter((c) => c.ch !== ' ').length;
    if (nonSpace > 60) {
      modeSignatures.add(f.cells.map((c) => c.ch).join(''));
    }
  }

  // Orbit yaw continuity across 16 steps
  const yawDiffs: number[] = [];
  let prevStr = '';
  for (let i = 0; i < 16; i++) {
    const f = renderAscii3DFrame({
      cols: 48,
      rows: 22,
      time: i * 0.033,
      yaw: -0.4 + i * 0.055,
      pitch: 0.08,
      zoom: 1,
      mood: 'happy',
      viseme: 'closed',
      eyeState: 'open',
      energy: 0.2,
      isSpeaking: false,
      isListening: false,
      shaderMode: 'solid',
    });
    const cur = f.cells.map((c) => c.ch).join('');
    if (prevStr) {
      let diff = 0;
      for (let k = 0; k < cur.length; k++) if (cur[k] !== prevStr[k]) diff++;
      yawDiffs.push(diff / Math.max(1, cur.length));
    }
    prevStr = cur;
  }

  const meanModeMs = perfTimes.reduce((a, b) => a + b, 0) / Math.max(1, perfTimes.length);
  const jerk = computeJerkMetrics(yawDiffs);
  const distinctScore = (modeSignatures.size / modes.length) * 8;
  const smoothScore = clamp01(1 - Math.max(0, jerk.jerkRatio - 0.35) / 1.2) * 6;
  const perfScore = clamp01((24 - meanModeMs) / (24 - 6)) * 6;
  const score = clamp(distinctScore + smoothScore + perfScore, 0, 20);

  return {
    id: 'ascii3dEngine',
    score: Number(score.toFixed(2)),
    maxScore: 20,
    metrics: {
      modesTested: modes.length,
      distinctModes: modeSignatures.size,
      meanModeMs: Number(meanModeMs.toFixed(2)),
      orbitJerkRatio: jerk.jerkRatio,
    },
  };
}

function evalPortraitLoadingAndBlend(ctx: ComponentEvaluatorContext): ComponentEvaluatorResult {
  const readyPortrait = renderHalftonePortrait({
    cols: 48,
    rows: 22,
    time: 0.5,
    mood: 'happy',
    viseme: 'closed',
    eyeState: 'open',
    energy: 0.1,
    isSpeaking: false,
    isListening: false,
    sourceField: ctx.sourceField,
  });

  const l0 = renderPortraitLoadingFrame({ cols: 48, rows: 22, time: 0.1, variant: 'stage', status: 'loading' });
  const l1 = renderPortraitLoadingFrame({ cols: 48, rows: 22, time: 0.45, variant: 'stage', status: 'loading' });
  const err = renderPortraitLoadingFrame({ cols: 48, rows: 22, time: 0.1, variant: 'stage', status: 'error' });

  const animatesOverTime = lineSignatureDiff(l0.lines, l1.lines) > 0.02;
  const distinctError = lineSignatureDiff(l0.lines, err.lines) > 0.04;

  // Monotonic materialization curve + immediate reduced motion reveal
  const pMid = computeMaterializeProgress(0.21, false);
  const pDone = computeMaterializeProgress(0.5, false);
  const pReduced = computeMaterializeProgress(0.01, true);
  const monotonicOk = pMid > 0.4 && pMid < 0.99 && pDone === 1 && pReduced === 1;

  // Blend dissolves smoothly without snapping prematurely
  const bMid = blendLoadingToPortraitFrame(l0, readyPortrait, 0.5);
  const diffFromLoader = lineSignatureDiff(l0.lines, bMid.lines);
  const diffFromFinal = lineSignatureDiff(readyPortrait.lines, bMid.lines);
  const blendSmooth = diffFromLoader > 0.05 && diffFromFinal > 0.05;

  const score =
    (animatesOverTime ? 4 : 0) +
    (distinctError ? 3 : 0) +
    (monotonicOk ? 4 : 0) +
    (blendSmooth ? 4 : 0);

  return {
    id: 'portraitLoading',
    score: Number(score.toFixed(2)),
    maxScore: 15,
    metrics: {
      animatesOverTime,
      distinctError,
      monotonicOk,
      blendSmooth,
      diffFromLoader: Number(diffFromLoader.toFixed(3)),
      diffFromFinal: Number(diffFromFinal.toFixed(3)),
    },
  };
}

function evalTextDecodeEngine(): ComponentEvaluatorResult {
  const sample = 'Routing request cleanly\nacross active session lanes.';
  const dur = getDecodeDurationMs(sample);
  const fStart = computeDecodeFrame(sample, 0.1, 1);
  const fMid = computeDecodeFrame(sample, 0.55, 2);
  const fMid2 = computeDecodeFrame(sample, 0.55, 5);
  const fEnd = computeDecodeFrame(sample, 1.0, 9);

  const monotonicSettled = fStart.settled.length < fMid.settled.length && fEnd.settled === sample && fEnd.done;
  const frontierMutates = fMid.frontier.length > 0 && fMid.frontier !== fMid2.frontier;
  const newlinesPreserved =
    fMid.settled.includes('\n') || fMid.frontier.includes('\n') || !sample.slice(0, fMid.settled.length).includes('\n');
  const durationBounded = dur >= 380 && dur <= 1150;

  const score =
    (monotonicSettled ? 3 : 0) +
    (frontierMutates ? 3 : 0) +
    (newlinesPreserved ? 2 : 0) +
    (durationBounded ? 2 : 0);

  return {
    id: 'textDecode',
    score: Number(score.toFixed(2)),
    maxScore: 10,
    metrics: {
      durMs: dur,
      monotonicSettled,
      frontierMutates,
      newlinesPreserved,
      durationBounded,
    },
  };
}

function evalCssAndComponentAudit(ctx: ComponentEvaluatorContext): ComponentEvaluatorResult {
  const cssFiles = [
    path.join(ctx.repoRoot, 'src', 'index.css'),
    path.join(ctx.repoRoot, 'src', 'backgrounds', 'backgrounds.css'),
    path.join(ctx.repoRoot, 'src', 'onboarding', 'onboarding.css'),
  ];
  let reducedMediaCount = 0;
  let dataUiReducedCount = 0;
  let paintHeavyMesh = 0;
  let viewEnterFast = false;

  for (const f of cssFiles) {
    if (!fs.existsSync(f)) continue;
    const raw = fs.readFileSync(f, 'utf8');
    if (raw.includes('prefers-reduced-motion: reduce')) reducedMediaCount++;
    if (raw.includes('data-ui-motion="reduced"')) dataUiReducedCount++;
    if (raw.includes('background-position') && raw.includes('glassMeshDrift')) paintHeavyMesh++;
    const viewEnterMatch = raw.match(/@keyframes\s+uiViewEnter\s*\{[\s\S]*?\n\}/);
    if (viewEnterMatch && !viewEnterMatch[0].includes('opacity: 0;')) viewEnterFast = true;
  }

  const componentsDir = path.join(ctx.repoRoot, 'src', 'components');
  const compFiles = fs.existsSync(componentsDir)
    ? fs.readdirSync(componentsDir).filter((n) => n.endsWith('.tsx'))
    : [];

  let blur2xlHits = 0;
  let transitionWidthHeightHits = 0;
  let unguardedPulseSpinHits = 0;
  let interactiveComponentCount = 0;

  for (const name of compFiles) {
    const raw = fs.readFileSync(path.join(componentsDir, name), 'utf8');
    if (raw.includes('<button') || raw.includes('<dialog') || raw.includes('<canvas')) {
      interactiveComponentCount++;
    }
    const b2Matches = raw.match(/backdrop-blur-2xl/g);
    if (b2Matches) blur2xlHits += b2Matches.length;

    // Detect transition-all on elements that bind width/height inline style
    if (/transition-all[\s\S]{0,160}style=\{\{\s*(width|height):/.test(raw)) {
      transitionWidthHeightHits++;
    }
    // Check animate-pulse or animate-spin without motion-safe-only
    for (const line of raw.split('\n')) {
      if ((line.includes('animate-pulse') || line.includes('animate-spin')) && !line.includes('motion-safe-only')) {
        unguardedPulseSpinHits++;
      }
    }
  }

  const reducedCoverageScore =
    (reducedMediaCount / 3) * 4 + (dataUiReducedCount / 3) * 5 + (viewEnterFast ? 2 : 0);
  const gpuCleanScore = clamp(
    9 -
      blur2xlHits * 3 -
      transitionWidthHeightHits * 2 -
      unguardedPulseSpinHits * 1.5 -
      paintHeavyMesh * 2,
    0,
    9
  );
  const score = clamp(reducedCoverageScore + gpuCleanScore, 0, 20);

  return {
    id: 'cssAndComponentAudit',
    score: Number(score.toFixed(2)),
    maxScore: 20,
    metrics: {
      cssFilesAudited: cssFiles.length,
      componentFilesAudited: compFiles.length,
      interactiveComponentCount,
      reducedMediaCount,
      dataUiReducedCount,
      blur2xlHits,
      transitionWidthHeightHits,
      unguardedPulseSpinHits,
      paintHeavyMesh,
      viewEnterFast,
    },
  };
}

export const COMPONENT_EVALUATORS: ComponentEvaluator[] = [
  { id: 'brailleShapesAll9', maxScore: 20, evaluate: () => evalAllBrailleShapes() },
  { id: 'brailleIdleLoops36', maxScore: 15, evaluate: () => evalAllIdleLoops() },
  { id: 'ascii3dEngine', maxScore: 20, evaluate: () => evalAscii3dViewport() },
  { id: 'portraitLoading', maxScore: 15, evaluate: (ctx) => evalPortraitLoadingAndBlend(ctx) },
  { id: 'textDecode', maxScore: 10, evaluate: () => evalTextDecodeEngine() },
  { id: 'cssAndComponentAudit', maxScore: 20, evaluate: (ctx) => evalCssAndComponentAudit(ctx) },
];

export function evaluateExtendedComponents(ctx: ComponentEvaluatorContext) {
  const results = COMPONENT_EVALUATORS.map((ev) => ev.evaluate(ctx));
  const rawTotal = results.reduce((acc, r) => acc + r.score, 0);
  const rawMax = results.reduce((acc, r) => acc + r.maxScore, 0);
  const extendedScore = rawMax > 0 ? Number(((rawTotal / rawMax) * 100).toFixed(2)) : 0;
  return { extendedScore, maxExtendedScore: 100, results };
}

function main() {
  const args = process.argv.slice(2);
  let label = 'gen';
  let baselinePath: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--label' && args[i + 1]) label = args[++i];
    else if (args[i] === '--baseline' && args[i + 1]) baselinePath = args[++i];
  }

  const repoRoot = process.cwd();
  const dataDir = path.join(repoRoot, 'blueprint-out', 'data');
  const uiDir = path.join(repoRoot, 'blueprint-out', 'ui');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uiDir, { recursive: true });

  const portraitPath = path.join(repoRoot, 'public', 'assets', 'aistudio', 'image_9fdb5ec4.png');
  const sourceField = decodeReferencePortrait(portraitPath, 160);

  const portraitRes = evaluateMainPortrait(sourceField);
  const shapesRes = evaluateBrailleShapes();
  const horizonRes = evaluateHorizonField();
  const perfScore = evaluatePerfBudget(
    portraitRes.metrics.heroAvgMs,
    portraitRes.metrics.stageAvgMs,
    shapesRes.metrics.shapeAvgMs
  );

  // Subtract framing clipping from portrait idleClips too
  const portraitClipPenalty = Math.min(3, portraitRes.metrics.idleClips * 0.15);
  const adjustedFramingScore = Number(Math.max(0, shapesRes.framingScore - portraitClipPenalty).toFixed(2));

  const totalScore = Number(
    (
      portraitRes.continuityScore +
      portraitRes.expressionScore +
      shapesRes.shapesScore +
      adjustedFramingScore +
      horizonRes.horizonScore +
      perfScore
    ).toFixed(2)
  );

  const extended = evaluateExtendedComponents({ repoRoot, sourceField });

  const stripPath = path.join(uiDir, `uphill-${label}-shapes.png`);
  writeStripPng(shapesRes.stripFrames, stripPath, 6);

  const report = {
    label,
    totalScore,
    maxScore: 100,
    extendedScore: extended.extendedScore,
    maxExtendedScore: extended.maxExtendedScore,
    breakdown: {
      portraitContinuity_20: portraitRes.continuityScore,
      portraitExpression_15: portraitRes.expressionScore,
      brailleShapesMotion_25: shapesRes.shapesScore,
      framingIntegrity_15: adjustedFramingScore,
      horizonFluidity_10: horizonRes.horizonScore,
      renderPerfBudget_15: perfScore,
    },
    extendedBreakdown: Object.fromEntries(extended.results.map((r) => [`${r.id}_${r.maxScore}`, r.score])),
    details: {
      portrait: portraitRes.metrics,
      shapes: shapesRes.metrics,
      horizon: horizonRes.metrics,
      components: extended.results,
    },
    stripPath,
  };

  const outPath = path.join(dataDir, `uphill-${label}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  let comparison: Record<string, unknown> | null = null;
  if (baselinePath && fs.existsSync(baselinePath)) {
    const base = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as typeof report;
    const deltaTotal = Number((totalScore - base.totalScore).toFixed(2));
    const deltaExtended =
      typeof base.extendedScore === 'number'
        ? Number((extended.extendedScore - base.extendedScore).toFixed(2))
        : null;
    const breakdownDelta = {
      portraitContinuity: Number((report.breakdown.portraitContinuity_20 - base.breakdown.portraitContinuity_20).toFixed(2)),
      portraitExpression: Number((report.breakdown.portraitExpression_15 - base.breakdown.portraitExpression_15).toFixed(2)),
      brailleShapesMotion: Number((report.breakdown.brailleShapesMotion_25 - base.breakdown.brailleShapesMotion_25).toFixed(2)),
      framingIntegrity: Number((report.breakdown.framingIntegrity_15 - base.breakdown.framingIntegrity_15).toFixed(2)),
      horizonFluidity: Number((report.breakdown.horizonFluidity_10 - base.breakdown.horizonFluidity_10).toFixed(2)),
      renderPerfBudget: Number((report.breakdown.renderPerfBudget_15 - base.breakdown.renderPerfBudget_15).toFixed(2)),
    };
    const verdict = deltaTotal > 0.25 ? `UPHILL (+${deltaTotal}) -> KEEP` : `FLAT/REGRESSION (${deltaTotal}) -> REVERT`;
    comparison = { baseline: base.label, baseScore: base.totalScore, deltaTotal, deltaExtended, breakdownDelta, verdict };
  }

  console.log(
    JSON.stringify(
      {
        reportPath: outPath,
        totalScore,
        extendedScore: extended.extendedScore,
        breakdown: report.breakdown,
        extendedBreakdown: report.extendedBreakdown,
        details: report.details,
        comparison,
      },
      null,
      2
    )
  );
}

const isDirectCli =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1]?.endsWith('eval-uphill.ts');

if (isDirectCli) {
  main();
}

