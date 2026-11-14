import { useEffect, useRef, type RefObject } from 'react';
import type { ExpressionMood, MouthViseme } from '../types/hermes';
import {
  BRAILLE_TINT_PALETTE,
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
    let lastDraw = startTime;
    let smoothGazeX = 0;
    let smoothGazeY = 0;
    let rafId = 0;
    let timerId = 0;

    const drawFrame = (now: number) => {
      const s = stateRef.current;
      const dt = Math.min(0.06, Math.max(0.008, (now - lastDraw) / 1000));
      lastDraw = now;

      const elapsed = reducedMotion ? 0.5 : (now - startTime) / 1000;

      let targetGazeX = 0;
      let targetGazeY = 0;
      const ptr = s.gazeRef?.current;
      if (ptr && !isPreview) {
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const cx = rect.left + rect.width * 0.5;
          const cy = rect.top + rect.height * 0.5;
          targetGazeX = Math.max(-1, Math.min(1, (ptr.clientX - cx) / 220));
          targetGazeY = Math.max(-1, Math.min(1, (ptr.clientY - cy) / 220));
        }
      } else if (s.isThinking) {
        targetGazeX = Math.sin(elapsed * 2.4) * 0.55;
        targetGazeY = -0.35;
      }

      const gazeFactor = 1 - Math.exp(-10 * dt);
      smoothGazeX += (targetGazeX - smoothGazeX) * gazeFactor;
      smoothGazeY += (targetGazeY - smoothGazeY) * gazeFactor;

      // Natural periodic blink staggered per creature
      const blinkCycle = (elapsed + s.blinkPhaseOffset) % 4.4;
      const isBlinking = !isPreview && !reducedMotion && blinkCycle > 4.22;

      const resolvedEye = isBlinking
        ? 'blink'
        : s.mood === 'alert'
        ? 'wide'
        : s.mood === 'happy' && s.eyeStyle === 'open' && s.isSpeaking
        ? 'open'
        : s.mood === 'focused'
        ? 'sleepy'
        : s.eyeStyle;

      const frame = renderBrailleShape({
        shape: s.shape,
        cols,
        rows,
        time: elapsed + s.blinkPhaseOffset * 0.7,
        mood: s.mood,
        eyeState: resolvedEye,
        viseme: s.viseme,
        energy: s.energy,
        isSpeaking: s.isSpeaking,
        isDragging: s.isDragging,
        gazeX: smoothGazeX,
        gazeY: smoothGazeY,
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
      const elapsed = (now - startTime) / 1000;
      const blinkCycle = (elapsed + s.blinkPhaseOffset) % 4.4;
      const activeMotion = s.isSpeaking || s.isThinking || s.isDragging || blinkCycle > 4.15;
      const minInterval = activeMotion ? 36 : 95;
      if (now - lastDraw >= minInterval) {
        drawFrame(now);
      }
      timerId = window.setTimeout(() => {
        rafId = window.requestAnimationFrame(loop);
      }, activeMotion ? 28 : 88);
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
