import { useEffect, useRef, type RefObject } from 'react';
import type { LookTarget } from '../utils/asciiPortraitEngine';
import { renderBrailleHorizon } from '../utils/brailleFieldEngine';

interface BrailleHorizonCanvasProps {
  energy: number;
  isActive: boolean;
  frequencyBands: number[];
  lookTargetRef?: RefObject<LookTarget | null>;
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

export function BrailleHorizonCanvas({
  energy,
  isActive,
  frequencyBands,
  lookTargetRef,
  className = '',
}: BrailleHorizonCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({ energy, isActive, frequencyBands, lookTargetRef });
  stateRef.current = { energy, isActive, frequencyBands, lookTargetRef };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let width = 1280;
    let height = 190;
    let cols = 148;
    const rows = 14;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 40 && rect.height > 40) {
        width = Math.round(rect.width);
        height = Math.round(rect.height);
        cols = Math.max(64, Math.min(180, Math.round(width / 9)));
      }
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    const startTime = performance.now();
    let lastDraw = startTime;
    let smoothEnergy = stateRef.current.energy;
    let smoothPtrX = 0;
    let smoothPtrY = 0;
    let rafId = 0;

    const drawFrame = (now: number) => {
      const s = stateRef.current;
      const dt = Math.min(0.06, Math.max(0.008, (now - lastDraw) / 1000));
      lastDraw = now;

      const factor = 1 - Math.exp(-8 * dt);
      smoothEnergy += (s.energy - smoothEnergy) * factor;
      const look = s.lookTargetRef?.current;
      const tx = look ? look.x : 0;
      const ty = look ? look.y : 0;
      smoothPtrX += (tx - smoothPtrX) * factor;
      smoothPtrY += (ty - smoothPtrY) * factor;

      const elapsed = reducedMotion ? 0.6 : (now - startTime) / 1000;
      const frame = renderBrailleHorizon({
        cols,
        rows,
        time: elapsed,
        energy: smoothEnergy,
        pointerX: smoothPtrX,
        pointerY: smoothPtrY,
        bands: s.frequencyBands,
      });

      ctx.clearRect(0, 0, width, height);

      const cellW = width / frame.cols;
      const cellH = height / frame.rows;
      const dotW = cellW / 2;
      const dotH = cellH / 4;
      const dotRadius = Math.max(0.7, Math.min(dotW, dotH) * 0.36);

      const pHigh = new Path2D();
      const pMid = new Path2D();
      const pLow = new Path2D();

      const dotDiameter = Math.max(1.2, dotRadius * 1.9);

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
          const targetPath = bright > 0.62 ? pHigh : bright > 0.32 ? pMid : pLow;
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

      ctx.fillStyle = '#94B8AE';
      ctx.globalAlpha = 0.32;
      ctx.fill(pLow);

      ctx.fillStyle = s.isActive ? '#6EE7B7' : '#A7F3D0';
      ctx.globalAlpha = 0.48;
      ctx.fill(pMid);

      ctx.fillStyle = s.isActive ? '#A7F3D0' : '#E6F0EC';
      ctx.globalAlpha = 0.74;
      ctx.fill(pHigh);

      ctx.globalAlpha = 1;
    };

    drawFrame(startTime);
    if (reducedMotion) {
      return () => window.removeEventListener('resize', resize);
    }

    let timerId = 0;
    const loop = (now: number) => {
      if (now - lastDraw >= 34) {
        drawFrame(now);
      }
      timerId = window.setTimeout(() => {
        rafId = window.requestAnimationFrame(loop);
      }, 26);
    };

    rafId = window.requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('resize', resize);
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timerId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="braille-horizon-canvas"
      className={`block w-full h-full pointer-events-none ${className}`}
    />
  );
}
