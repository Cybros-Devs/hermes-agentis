import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ExpressionMood, EyeState, MouthViseme } from '../../src/types/hermes';
import { amplitudeToViseme, resolveEyeState } from '../../src/utils/asciiCharacter';
import {
  buildPortraitSourceFromRgba,
  createPortraitAnimator,
  renderHalftonePortrait,
  type PortraitMotionState,
  type PortraitSourceField,
} from '../../src/utils/asciiPortraitEngine';
import * as fieldEngine from '../../src/utils/brailleFieldEngine';
import * as shapesEngine from '../../src/utils/brailleShapesEngine';
import type { BrailleShapeKind } from '../../src/utils/brailleShapesEngine';

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

  const stripPath = path.join(uiDir, `uphill-${label}-shapes.png`);
  writeStripPng(shapesRes.stripFrames, stripPath, 6);

  const report = {
    label,
    totalScore,
    maxScore: 100,
    breakdown: {
      portraitContinuity_20: portraitRes.continuityScore,
      portraitExpression_15: portraitRes.expressionScore,
      brailleShapesMotion_25: shapesRes.shapesScore,
      framingIntegrity_15: adjustedFramingScore,
      horizonFluidity_10: horizonRes.horizonScore,
      renderPerfBudget_15: perfScore,
    },
    details: {
      portrait: portraitRes.metrics,
      shapes: shapesRes.metrics,
      horizon: horizonRes.metrics,
    },
    stripPath,
  };

  const outPath = path.join(dataDir, `uphill-${label}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  let comparison: Record<string, unknown> | null = null;
  if (baselinePath && fs.existsSync(baselinePath)) {
    const base = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as typeof report;
    const deltaTotal = Number((totalScore - base.totalScore).toFixed(2));
    const breakdownDelta = {
      portraitContinuity: Number((report.breakdown.portraitContinuity_20 - base.breakdown.portraitContinuity_20).toFixed(2)),
      portraitExpression: Number((report.breakdown.portraitExpression_15 - base.breakdown.portraitExpression_15).toFixed(2)),
      brailleShapesMotion: Number((report.breakdown.brailleShapesMotion_25 - base.breakdown.brailleShapesMotion_25).toFixed(2)),
      framingIntegrity: Number((report.breakdown.framingIntegrity_15 - base.breakdown.framingIntegrity_15).toFixed(2)),
      horizonFluidity: Number((report.breakdown.horizonFluidity_10 - base.breakdown.horizonFluidity_10).toFixed(2)),
      renderPerfBudget: Number((report.breakdown.renderPerfBudget_15 - base.breakdown.renderPerfBudget_15).toFixed(2)),
    };
    const verdict = deltaTotal > 0.25 ? `UPHILL (+${deltaTotal}) -> KEEP` : `FLAT/REGRESSION (${deltaTotal}) -> REVERT`;
    comparison = { baseline: base.label, baseScore: base.totalScore, deltaTotal, breakdownDelta, verdict };
  }

  console.log(JSON.stringify({ reportPath: outPath, totalScore, breakdown: report.breakdown, details: report.details, comparison }, null, 2));
}

main();
