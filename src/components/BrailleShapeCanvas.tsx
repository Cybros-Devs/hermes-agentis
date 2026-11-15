import { useEffect, useRef, type RefObject } from 'react';
import type { ExpressionMood, MouthViseme } from '../types/hermes';
import { evaluateNaturalBlinkCurve } from '../utils/asciiPortraitEngine';
import {
  resolveIdleSetForShape,
  type IdleAnimationSetId,
} from '../utils/brailleIdleLoops';
import {
  BRAILLE_TINT_PALETTE,
  createBrailleShapeAnimator,
  renderBrailleShape,
  type BrailleShapeKind,
  type BrailleShapeTint,
} from '../utils/brailleShapesEngine';
import {
  createRasterSurface,
  rasterizeTonalDotBucketsToSurface,
  type TonalDotBucketSpec,
} from '../utils/brailleCanvasRaster';

function mixShapeHex(hexA: string, hexB: string, t: number): string {
  const cleanA = hexA.replace('#', '');
  const cleanB = hexB.replace('#', '');
  if (cleanA.length !== 6 || cleanB.length !== 6) return hexA;
  const r1 = parseInt(cleanA.slice(0, 2), 16);
  const g1 = parseInt(cleanA.slice(2, 4), 16);
  const b1 = parseInt(cleanA.slice(4, 6), 16);
  const r2 = parseInt(cleanB.slice(0, 2), 16);
  const g2 = parseInt(cleanB.slice(2, 4), 16);
  const b2 = parseInt(cleanB.slice(4, 6), 16);
  const w = Math.max(0, Math.min(1, t));
  return `#${Math.round(r1 + (r2 - r1) * w)
    .toString(16)
    .padStart(2, '0')}${Math.round(g1 + (g2 - g1) * w)
    .toString(16)
    .padStart(2, '0')}${Math.round(b1 + (b2 - b1) * w)
    .toString(16)
    .padStart(2, '0')}`;
}

interface BrailleShapeCanvasProps {
  shape: BrailleShapeKind;
  tint: BrailleShapeTint;
  mood: ExpressionMood;
  eyeStyle?: 'open' | 'sleepy';
  idleSet?: IdleAnimationSetId;
  viseme?: MouthViseme;
  energy?: number;
  isSpeaking?: boolean;
  isThinking?: boolean;
  isDragging?: boolean;
  isHovered?: boolean;
  speedScale?: number;
  reducedMotionOverride?: boolean;
  variant?: 'creature' | 'preview';
  blinkPhaseOffset?: number;
  gazeRef?: RefObject<{ clientX: number; clientY: number } | null>;
  className?: string;
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

export function BrailleShapeCanvas({
  shape,
  tint,
  mood,
  eyeStyle = 'open',
  idleSet,
  viseme = 'closed',
  energy = 0.08,
  isSpeaking = false,
  isThinking = false,
  isDragging = false,
  isHovered = false,
  speedScale = 1,
  reducedMotionOverride = false,
  variant = 'creature',
  blinkPhaseOffset = 0,
  gazeRef,
  className = '',
}: BrailleShapeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const resolvedSet = idleSet ?? resolveIdleSetForShape(shape);

  const stateRef = useRef({
    shape,
    tint,
    mood,
    eyeStyle,
    idleSet: resolvedSet,
    viseme,
    energy,
    isSpeaking,
    isThinking,
    isDragging,
    isHovered,
    speedScale,
    reducedMotionOverride,
    blinkPhaseOffset,
    gazeRef,
  });
  stateRef.current = {
    shape,
    tint,
    mood,
    eyeStyle,
    idleSet: resolvedSet,
    viseme,
    energy,
    isSpeaking,
    isThinking,
    isDragging,
    isHovered,
    speedScale,
    reducedMotionOverride,
    blinkPhaseOffset,
    gazeRef,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isPreview = variant === 'preview';
    const cols = isPreview ? 26 : 46;
    const rows = isPreview ? 15 : 26;
    const width = isPreview ? 76 : 142;
    const height = isPreview ? 84 : 154;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const surface = createRasterSurface(ctx, canvas.width, canvas.height);

    const cellW = width / cols;
    const cellH = height / rows;
    const dotW = cellW / 2;
    const dotH = cellH / 4;
    const dotRadius = Math.min(dotW, dotH) * (isPreview ? 0.45 : 0.44);
    const dotDiameter = Math.max(1.05, dotRadius * 1.98);

    const systemReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const startTime = performance.now();
    const animator = createBrailleShapeAnimator();
    let lastDraw = startTime;
    let elapsedPhase = 0;
    let prevRectX: number | null = null;
    let prevRectY: number | null = null;
    let prevDragActive = false;
    let settleUntilMs = 0;
    let smoothEnergy = stateRef.current.energy;
    let activeIdleBusy = false;
    let activeBlinkBusy = false;
    let rafId = 0;
    let hiddenTimerId = 0;
    let lastReducedKey = '';

    const maxDots = cols * rows * 8;
    const b0XY = new Float32Array(maxDots * 2);
    const b1XY = new Float32Array(maxDots * 2);
    const b2XY = new Float32Array(maxDots * 2);
    const b3XY = new Float32Array(maxDots * 2);
    const b4XY = new Float32Array(maxDots * 2);
    const buckets: [
      TonalDotBucketSpec,
      TonalDotBucketSpec,
      TonalDotBucketSpec,
      TonalDotBucketSpec,
      TonalDotBucketSpec,
    ] = [
      { xy: b0XY, len: 0, hex: '#4D7C0F', alpha: 0.74, diameterScale: 0.76 },
      { xy: b1XY, len: 0, hex: '#84CC16', alpha: 0.86, diameterScale: 0.87 },
      { xy: b2XY, len: 0, hex: '#B9EA74', alpha: 0.93, diameterScale: 0.98 },
      { xy: b3XY, len: 0, hex: '#DCF7B4', alpha: 0.96, diameterScale: 1.07 },
      { xy: b4XY, len: 0, hex: '#ECFCCB', alpha: 0.99, diameterScale: 1.16 },
    ];

    const drawFrame = (now: number) => {
      const s = stateRef.current;
      const isReduced = Boolean(systemReduced || s.reducedMotionOverride);
      const speed = Math.max(0.25, Math.min(2.0, s.speedScale || 1));
      const rawDt = Math.min(0.16, Math.max(0.008, (now - lastDraw) / 1000));
      const dt = isReduced ? rawDt : rawDt * speed;
      lastDraw = now;
      if (!isReduced) {
        elapsedPhase += dt;
      }

      const elapsed = isReduced ? 0.5 : elapsedPhase;
      smoothEnergy += (s.energy - smoothEnergy) * (1 - Math.exp(-16 * dt));

      let targetGazeX: number | undefined;
      let targetGazeY: number | undefined;
      let dragVelX = 0;
      let dragVelY = 0;

      const ptr = s.gazeRef?.current;
      if ((ptr || s.isDragging) && !isPreview) {
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          if (ptr) {
            const cx = rect.left + rect.width * 0.5;
            const cy = rect.top + rect.height * 0.5;
            targetGazeX = Math.max(-1, Math.min(1, (ptr.clientX - cx) / 220));
            targetGazeY = Math.max(-1, Math.min(1, (ptr.clientY - cy) / 220));
          }
          if (s.isDragging && prevRectX !== null && prevRectY !== null) {
            dragVelX = (rect.left - prevRectX) / Math.max(0.016, dt) / 360;
            dragVelY = (rect.top - prevRectY) / Math.max(0.016, dt) / 360;
          }
          prevRectX = rect.left;
          prevRectY = rect.top;
        }
      } else {
        prevRectX = null;
        prevRectY = null;
      }

      const motion = isPreview
        ? null
        : animator.step(
            {
              time: elapsed,
              shape: s.shape,
              idleSetOverride: s.idleSet,
              mood: s.mood,
              eyeStyle: s.eyeStyle,
              viseme: s.viseme,
              energy: smoothEnergy,
              isSpeaking: s.isSpeaking,
              isThinking: s.isThinking,
              isDragging: s.isDragging,
              isHovered: s.isHovered,
              dragVelX,
              dragVelY,
              gazeX: targetGazeX,
              gazeY: targetGazeY,
              blinkPhaseOffset: s.blinkPhaseOffset,
            },
            dt,
            isReduced
          );

      if (motion) {
        activeIdleBusy = !motion.idle.isResting;
        activeBlinkBusy =
          motion.blink > 0.015 ||
          motion.idle.pose.blinkLeft > 0.05 ||
          motion.idle.pose.blinkRight > 0.05;
        canvas.dataset.blink = motion.blink.toFixed(2);
        if (canvas.dataset.animSet !== motion.idle.setId) {
          canvas.dataset.animSet = motion.idle.setId;
        }
        if (canvas.dataset.animAction !== motion.idle.actionId) {
          canvas.dataset.animAction = motion.idle.actionId;
          canvas.dataset.animIndex = String(motion.idle.actionIndex);
        }
      } else {
        activeIdleBusy = false;
        activeBlinkBusy = false;
        canvas.dataset.blink = '0.00';
      }

      const frame = renderBrailleShape({
        shape: s.shape,
        cols,
        rows,
        time: elapsed + s.blinkPhaseOffset * 0.7,
        mood: s.mood,
        eyeState: s.eyeStyle,
        viseme: s.viseme,
        energy: smoothEnergy,
        isSpeaking: s.isSpeaking,
        isThinking: s.isThinking,
        isDragging: s.isDragging,
        gazeX: motion ? motion.gazeX : 0,
        gazeY: motion ? motion.gazeY : 0,
        motion,
      });

      const palette = BRAILLE_TINT_PALETTE[s.tint];
      let len0 = 0;
      let len1 = 0;
      let len2 = 0;
      let len3 = 0;
      let len4 = 0;

      for (let r = 0; r < frame.rows; r++) {
        const line = frame.lines[r];
        const baseY = r * cellH;
        const rowOff = r * frame.cols;
        for (let c = 0; c < frame.cols; c++) {
          const ch = line[c];
          if (ch === ' ') continue;
          const bits = ch.charCodeAt(0) - 0x2800;
          if (bits <= 0 || bits > 0xff) continue;

          const bright = frame.cells[rowOff + c] / 255;
          const baseX = c * cellW;

          if (bright > 0.80) {
            for (let k = 0; k < 8; k++) {
              const [px, py, mask] = SUBPIXEL_BITS[k];
              if (bits & mask) {
                b4XY[len4++] = baseX + (px + 0.5) * dotW - dotRadius;
                b4XY[len4++] = baseY + (py + 0.5) * dotH - dotRadius;
              }
            }
          } else if (bright > 0.62) {
            for (let k = 0; k < 8; k++) {
              const [px, py, mask] = SUBPIXEL_BITS[k];
              if (bits & mask) {
                b3XY[len3++] = baseX + (px + 0.5) * dotW - dotRadius;
                b3XY[len3++] = baseY + (py + 0.5) * dotH - dotRadius;
              }
            }
          } else if (bright > 0.44) {
            for (let k = 0; k < 8; k++) {
              const [px, py, mask] = SUBPIXEL_BITS[k];
              if (bits & mask) {
                b2XY[len2++] = baseX + (px + 0.5) * dotW - dotRadius;
                b2XY[len2++] = baseY + (py + 0.5) * dotH - dotRadius;
              }
            }
          } else if (bright > 0.25) {
            for (let k = 0; k < 8; k++) {
              const [px, py, mask] = SUBPIXEL_BITS[k];
              if (bits & mask) {
                b1XY[len1++] = baseX + (px + 0.5) * dotW - dotRadius;
                b1XY[len1++] = baseY + (py + 0.5) * dotH - dotRadius;
              }
            }
          } else {
            for (let k = 0; k < 8; k++) {
              const [px, py, mask] = SUBPIXEL_BITS[k];
              if (bits & mask) {
                b0XY[len0++] = baseX + (px + 0.5) * dotW - dotRadius;
                b0XY[len0++] = baseY + (py + 0.5) * dotH - dotRadius;
              }
            }
          }
        }
      }

      buckets[0].len = len0;
      buckets[0].hex = palette.low;
      buckets[0].alpha = 0.74;

      buckets[1].len = len1;
      buckets[1].hex = mixShapeHex(palette.low, palette.mid, 0.58);
      buckets[1].alpha = 0.86;

      buckets[2].len = len2;
      buckets[2].hex = palette.mid;
      buckets[2].alpha = 0.93;

      buckets[3].len = len3;
      buckets[3].hex = mixShapeHex(palette.mid, palette.high, 0.55);
      buckets[3].alpha = 0.96;

      buckets[4].len = len4;
      buckets[4].hex = palette.high;
      buckets[4].alpha = 0.99;

      rasterizeTonalDotBucketsToSurface(surface, buckets, dpr, dotDiameter);
      ctx.putImageData(surface.imageData, 0, 0);
    };

    drawFrame(startTime);

    const scheduleNext = () => {
      rafId = window.requestAnimationFrame(loop);
    };

    const loop = (now: number) => {
      if (
        (typeof document !== 'undefined' && document.hidden) ||
        (canvas.offsetWidth === 0 && canvas.offsetHeight === 0)
      ) {
        lastDraw = now;
        hiddenTimerId = window.setTimeout(scheduleNext, 200);
        return;
      }

      const s = stateRef.current;
      const isReduced = Boolean(systemReduced || s.reducedMotionOverride);
      if (isReduced) {
        const reducedKey = `${s.shape}|${s.tint}|${s.mood}|${s.eyeStyle}|${s.viseme}|${Math.round(
          s.energy * 100
        )}|${s.isSpeaking}|${s.isThinking}|${s.isDragging}|${s.isHovered}`;
        if (reducedKey !== lastReducedKey) {
          lastReducedKey = reducedKey;
          drawFrame(now);
        }
        hiddenTimerId = window.setTimeout(scheduleNext, 200);
        return;
      }
      lastReducedKey = '';

      if (prevDragActive && !s.isDragging) {
        settleUntilMs = now + 900;
      }
      prevDragActive = s.isDragging;

      const blinkLookahead =
        evaluateNaturalBlinkCurve(elapsedPhase + 0.08, s.blinkPhaseOffset, 3) > 0.01;
      const fastMotion =
        s.isSpeaking ||
        s.isDragging ||
        now < settleUntilMs ||
        activeBlinkBusy ||
        blinkLookahead;
      const activeMotion =
        fastMotion ||
        s.isThinking ||
        s.isHovered ||
        activeIdleBusy;
      const minInterval = isPreview
        ? 36
        : fastMotion
        ? 16
        : activeMotion
        ? 20
        : 28;
      if (now - lastDraw >= minInterval) {
        drawFrame(now);
      }
      rafId = window.requestAnimationFrame(loop);
    };

    rafId = window.requestAnimationFrame(loop);
    return () => {
      window.cancelAnimationFrame(rafId);
      if (hiddenTimerId) window.clearTimeout(hiddenTimerId);
    };
  }, [variant]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-anim-set={resolvedSet}
      className={
        variant === 'preview'
          ? `block w-[76px] h-[84px] pointer-events-none ${className}`
          : `block w-[142px] h-[154px] pointer-events-none ${className}`
      }
    />
  );
}
