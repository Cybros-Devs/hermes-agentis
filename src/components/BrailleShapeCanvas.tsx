import { useEffect, useRef, type RefObject } from 'react';
import type { ExpressionMood, MouthViseme } from '../types/hermes';
import {
  BRAILLE_TINT_PALETTE,
  createBrailleShapeAnimator,
  renderBrailleShape,
  type BrailleShapeKind,
  type BrailleShapeTint,
} from '../utils/brailleShapesEngine';

interface BrailleShapeCanvasProps {
  shape: BrailleShapeKind;
  tint: BrailleShapeTint;
  mood: ExpressionMood;
  eyeStyle?: 'open' | 'sleepy';
  viseme?: MouthViseme;
  energy?: number;
  isSpeaking?: boolean;
  isThinking?: boolean;
  isDragging?: boolean;
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
  viseme = 'closed',
  energy = 0.08,
  isSpeaking = false,
  isThinking = false,
  isDragging = false,
  variant = 'creature',
  blinkPhaseOffset = 0,
  gazeRef,
  className = '',
}: BrailleShapeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({
    shape,
    tint,
    mood,
    eyeStyle,
    viseme,
    energy,
    isSpeaking,
    isThinking,
    isDragging,
    blinkPhaseOffset,
    gazeRef,
  });
  stateRef.current = {
    shape,
    tint,
    mood,
    eyeStyle,
    viseme,
    energy,
    isSpeaking,
    isThinking,
    isDragging,
    blinkPhaseOffset,
    gazeRef,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isPreview = variant === 'preview';
    const cols = isPreview ? 20 : 34;
    const rows = isPreview ? 10 : 17;
    const width = isPreview ? 68 : 124;
    const height = isPreview ? 58 : 108;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cellW = width / cols;
    const cellH = height / rows;
    const dotW = cellW / 2;
    const dotH = cellH / 4;
    const dotRadius = Math.min(dotW, dotH) * (isPreview ? 0.44 : 0.43);
    const dotDiameter = Math.max(1.0, dotRadius * 1.9);

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const startTime = performance.now();
    const animator = createBrailleShapeAnimator();
    let lastDraw = startTime;
    let prevRectX: number | null = null;
    let prevRectY: number | null = null;
    let prevDragActive = false;
    let settleUntilMs = 0;
    let smoothEnergy = stateRef.current.energy;
    let rafId = 0;
    let timerId = 0;

    const drawFrame = (now: number) => {
      const s = stateRef.current;
      const dt = Math.min(0.06, Math.max(0.008, (now - lastDraw) / 1000));
      lastDraw = now;

      const elapsed = reducedMotion ? 0.5 : (now - startTime) / 1000;
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
              mood: s.mood,
              eyeStyle: s.eyeStyle,
              viseme: s.viseme,
              energy: smoothEnergy,
              isSpeaking: s.isSpeaking,
              isThinking: s.isThinking,
              isDragging: s.isDragging,
              dragVelX,
              dragVelY,
              gazeX: targetGazeX,
              gazeY: targetGazeY,
              blinkPhaseOffset: s.blinkPhaseOffset,
            },
            dt,
            reducedMotion
          );

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
        isDragging: s.isDragging,
        gazeX: motion ? motion.gazeX : 0,
        gazeY: motion ? motion.gazeY : 0,
        motion,
      });

      ctx.clearRect(0, 0, width, height);

      const palette = BRAILLE_TINT_PALETTE[s.tint];
      const pHigh = new Path2D();
      const pMid = new Path2D();
      const pLow = new Path2D();

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
          const targetPath = bright > 0.64 ? pHigh : bright > 0.36 ? pMid : pLow;
          const baseX = c * cellW;

          for (let k = 0; k < 8; k++) {
            const [px, py, mask] = SUBPIXEL_BITS[k];
            if (bits & mask) {
              const cx = baseX + (px + 0.5) * dotW - dotRadius;
              const cy = baseY + (py + 0.5) * dotH - dotRadius;
              targetPath.rect(cx, cy, dotDiameter, dotDiameter);
            }
          }
        }
      }

      ctx.fillStyle = palette.low;
      ctx.globalAlpha = 0.78;
      ctx.fill(pLow);

      ctx.fillStyle = palette.mid;
      ctx.globalAlpha = 0.92;
      ctx.fill(pMid);

      ctx.fillStyle = palette.high;
      ctx.globalAlpha = 0.98;
      ctx.fill(pHigh);

      ctx.globalAlpha = 1;
    };

    drawFrame(startTime);
    if (reducedMotion || isPreview) return;

    const loop = (now: number) => {
      const s = stateRef.current;
      if (prevDragActive && !s.isDragging) {
        settleUntilMs = now + 850;
      }
      prevDragActive = s.isDragging;

      const elapsed = (now - startTime) / 1000;
      const cyclePos = ((elapsed + s.blinkPhaseOffset) / 4.2) % 1;
      const activeMotion =
        s.isSpeaking ||
        s.isThinking ||
        s.isDragging ||
        now < settleUntilMs ||
        cyclePos > 0.80;
      const minInterval = activeMotion ? 32 : 52;
      if (now - lastDraw >= minInterval) {
        drawFrame(now);
      }
      timerId = window.setTimeout(() => {
        rafId = window.requestAnimationFrame(loop);
      }, activeMotion ? 22 : 44);
    };

    rafId = window.requestAnimationFrame(loop);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timerId);
    };
  }, [variant]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={
        variant === 'preview'
          ? `block w-[68px] h-[58px] pointer-events-none ${className}`
          : `block w-[124px] h-[108px] pointer-events-none ${className}`
      }
    />
  );
}
