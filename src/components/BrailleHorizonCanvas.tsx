import { useEffect, useRef, type RefObject } from 'react';
import type { LookTarget } from '../utils/asciiPortraitEngine';
import { createHorizonAnimator, renderBrailleHorizon } from '../utils/brailleFieldEngine';

interface BrailleHorizonCanvasProps {
  energy: number;
  isActive: boolean;
  frequencyBands: number[];
  lookTargetRef?: RefObject<LookTarget | null>;
  speedScale?: number;
  reducedMotionOverride?: boolean;
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

function blendHorizonHex(hexA: string, hexB: string, t: number): string {
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

export function BrailleHorizonCanvas({
  energy,
  isActive,
  frequencyBands,
  lookTargetRef,
  speedScale = 1,
  reducedMotionOverride = false,
  className = '',
}: BrailleHorizonCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({
    energy,
    isActive,
    frequencyBands,
    lookTargetRef,
    speedScale,
    reducedMotionOverride,
  });
  stateRef.current = {
    energy,
    isActive,
    frequencyBands,
    lookTargetRef,
    speedScale,
    reducedMotionOverride,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const systemReduced =
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
    let elapsedPhase = 0;
    let cachedAccent = '#6EE7B7';
    let cachedAccentHigh = '#A7F3D0';
    let cachedLow = '#94B8AE';
    let themeFrameCounter = 0;
    const animator = createHorizonAnimator();
    let rafId = 0;

    const drawFrame = (now: number) => {
      const s = stateRef.current;
      const isReduced = Boolean(systemReduced || s.reducedMotionOverride);
      const speed = Math.max(0.25, Math.min(2.0, s.speedScale || 1));
      const rawDt = Math.min(0.06, Math.max(0.008, (now - lastDraw) / 1000));
      const dt = isReduced ? rawDt : rawDt * speed;
      lastDraw = now;
      if (!isReduced) {
        elapsedPhase += dt;
      }

      if (themeFrameCounter % 12 === 0 && typeof document !== 'undefined') {
        const styles = getComputedStyle(document.documentElement);
        const uiAccent = styles.getPropertyValue('--ui-accent').trim() || '#34D399';
        const uiSoft = styles.getPropertyValue('--ui-accent-soft').trim() || '#6EE7B7';
        if (uiSoft.startsWith('#') && uiSoft.length === 7) {
          cachedAccent = uiSoft;
          cachedAccentHigh = blendHorizonHex(uiSoft, '#FFFFFF', 0.42);
        }
        if (uiAccent.startsWith('#') && uiAccent.length === 7) {
          cachedLow = blendHorizonHex('#6E8580', uiAccent, 0.35);
        }
      }
      themeFrameCounter++;

      const look = s.lookTargetRef?.current;
      const motion = animator.step(
        {
          energy: s.energy,
          pointerX: look ? look.x : 0,
          pointerY: look ? look.y : 0,
          bands: s.frequencyBands,
        },
        dt,
        isReduced
      );

      const elapsed = isReduced ? 0.6 : elapsedPhase;
      const frame = renderBrailleHorizon({
        cols,
        rows,
        time: elapsed,
        energy: motion.energy,
        pointerX: motion.pointerX,
        pointerY: motion.pointerY,
        bands: motion.bands,
        motion,
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

      ctx.fillStyle = cachedLow;
      ctx.globalAlpha = 0.32;
      ctx.fill(pLow);

      ctx.fillStyle = cachedAccent;
      ctx.globalAlpha = s.isActive ? 0.56 : 0.44;
      ctx.fill(pMid);

      ctx.fillStyle = s.isActive ? cachedAccentHigh : '#E6F0EC';
      ctx.globalAlpha = 0.74;
      ctx.fill(pHigh);

      ctx.globalAlpha = 1;
    };

    drawFrame(startTime);

    const loop = (now: number) => {
      const active = stateRef.current.isActive;
      const isReduced = Boolean(systemReduced || stateRef.current.reducedMotionOverride);
      const hasPointer = Boolean(stateRef.current.lookTargetRef?.current);
      const interval = isReduced ? 220 : active || hasPointer ? 14 : 30;
      if (now - lastDraw >= interval) {
        drawFrame(now);
      }
      rafId = window.requestAnimationFrame(loop);
    };

    rafId = window.requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('resize', resize);
      window.cancelAnimationFrame(rafId);
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
