import { useEffect, useRef, type RefObject } from 'react';
import type { LookTarget } from '../utils/asciiPortraitEngine';
import { createHorizonAnimator, renderBrailleHorizon } from '../utils/brailleFieldEngine';
import {
  createRasterSurface,
  rasterizeDotBucketsToSurface,
  type BrailleRasterSurface,
  type DotBucketSpec,
} from '../utils/brailleCanvasRaster';

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
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    let cols = 148;
    const rows = 14;
    let surface: BrailleRasterSurface | null = null;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 40 && rect.height > 40) {
        width = Math.round(rect.width);
        height = Math.round(rect.height);
        cols = Math.max(64, Math.min(180, Math.round(width / 9)));
      }
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      surface = createRasterSurface(ctx, canvas.width, canvas.height);
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
    let hiddenTimerId = 0;
    let lastReducedKey = '';
    let lowXY = new Float32Array(180 * rows * 16);
    let midXY = new Float32Array(180 * rows * 16);
    let highXY = new Float32Array(180 * rows * 16);
    const buckets: [DotBucketSpec, DotBucketSpec, DotBucketSpec] = [
      { xy: lowXY, len: 0, hex: cachedLow, alpha: 0.32 },
      { xy: midXY, len: 0, hex: cachedAccent, alpha: 0.44 },
      { xy: highXY, len: 0, hex: '#E6F0EC', alpha: 0.74 },
    ];

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

      if (themeFrameCounter % 36 === 0 && typeof document !== 'undefined') {
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

      const cellW = width / frame.cols;
      const cellH = height / frame.rows;
      const dotW = cellW / 2;
      const dotH = cellH / 4;
      const dotRadius = Math.max(0.7, Math.min(dotW, dotH) * 0.36);

      let lowLen = 0;
      let midLen = 0;
      let highLen = 0;

      const dotDiameter = Math.max(1.2, dotRadius * 1.9);
      const needed = frame.cols * frame.rows * 16;
      if (lowXY.length < needed) {
        lowXY = new Float32Array(needed);
        midXY = new Float32Array(needed);
        highXY = new Float32Array(needed);
        buckets[0].xy = lowXY;
        buckets[1].xy = midXY;
        buckets[2].xy = highXY;
      }

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

          if (bright > 0.62) {
            for (let k = 0; k < 8; k++) {
              const [px, py, mask] = SUBPIXEL_BITS[k];
              if (bits & mask) {
                highXY[highLen++] = baseX + (px + 0.5) * dotW - dotRadius;
                highXY[highLen++] = baseY + (py + 0.5) * dotH - dotRadius;
              }
            }
          } else if (bright > 0.32) {
            for (let k = 0; k < 8; k++) {
              const [px, py, mask] = SUBPIXEL_BITS[k];
              if (bits & mask) {
                midXY[midLen++] = baseX + (px + 0.5) * dotW - dotRadius;
                midXY[midLen++] = baseY + (py + 0.5) * dotH - dotRadius;
              }
            }
          } else {
            for (let k = 0; k < 8; k++) {
              const [px, py, mask] = SUBPIXEL_BITS[k];
              if (bits & mask) {
                lowXY[lowLen++] = baseX + (px + 0.5) * dotW - dotRadius;
                lowXY[lowLen++] = baseY + (py + 0.5) * dotH - dotRadius;
              }
            }
          }
        }
      }

      if (!surface || surface.width !== canvas.width || surface.height !== canvas.height) {
        surface = createRasterSurface(ctx, canvas.width, canvas.height);
      }
      buckets[0].len = lowLen;
      buckets[0].hex = cachedLow;
      buckets[0].alpha = 0.32;
      buckets[1].len = midLen;
      buckets[1].hex = cachedAccent;
      buckets[1].alpha = s.isActive ? 0.56 : 0.44;
      buckets[2].len = highLen;
      buckets[2].hex = s.isActive ? cachedAccentHigh : '#E6F0EC';
      buckets[2].alpha = 0.74;

      rasterizeDotBucketsToSurface(surface, buckets, dpr, dotDiameter);
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
      const look = s.lookTargetRef?.current;
      if (isReduced) {
        const reducedKey = `${width}x${height}|${s.isActive}|${Math.round(s.energy * 100)}|${
          look ? `${look.x.toFixed(2)},${look.y.toFixed(2)}` : ''
        }`;
        if (reducedKey !== lastReducedKey) {
          lastReducedKey = reducedKey;
          drawFrame(now);
        }
        hiddenTimerId = window.setTimeout(scheduleNext, 200);
        return;
      }
      lastReducedKey = '';

      const active = s.isActive;
      const hasPointer = Boolean(look);
      const interval = active || hasPointer ? 22 : 33;
      if (now - lastDraw >= interval) {
        drawFrame(now);
      }
      rafId = window.requestAnimationFrame(loop);
    };

    rafId = window.requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('resize', resize);
      window.cancelAnimationFrame(rafId);
      if (hiddenTimerId) window.clearTimeout(hiddenTimerId);
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
