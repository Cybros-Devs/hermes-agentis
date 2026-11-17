import { useEffect, useRef, type RefObject } from 'react';
import type { LookTarget } from '../utils/asciiPortraitEngine';
import {
  createHorizonAnimator,
  renderBrailleHorizon,
  type BrailleHorizonStyle,
} from '../utils/brailleFieldEngine';
import {
  createRasterSurface,
  mixHexColors,
  rasterizeTonalDotBucketsToSurface,
  type BrailleDotProfile,
  type BrailleRasterSurface,
  type TonalDotBucketSpec,
} from '../utils/brailleCanvasRaster';

interface BrailleHorizonCanvasProps {
  energy: number;
  isActive: boolean;
  frequencyBands: number[];
  lookTargetRef?: RefObject<LookTarget | null>;
  dotProfile?: BrailleDotProfile;
  bloom?: number;
  horizonStyle?: BrailleHorizonStyle;
  speedScale?: number;
  reducedMotionOverride?: boolean;
  tintHex?: string | null;
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
  dotProfile = 'balanced',
  bloom = 0.75,
  horizonStyle = 'silk',
  speedScale = 1,
  reducedMotionOverride = false,
  tintHex = null,
  className = '',
}: BrailleHorizonCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({
    energy,
    isActive,
    frequencyBands,
    lookTargetRef,
    dotProfile,
    bloom,
    horizonStyle,
    speedScale,
    reducedMotionOverride,
    tintHex,
  });
  stateRef.current = {
    energy,
    isActive,
    frequencyBands,
    lookTargetRef,
    dotProfile,
    bloom,
    horizonStyle,
    speedScale,
    reducedMotionOverride,
    tintHex,
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
    let height = 260;
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    let rows = 28;
    let cols = 220;
    let surface: BrailleRasterSurface | null = null;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 40 && rect.height > 16) {
        width = Math.round(rect.width);
        height = Math.round(rect.height);
      }
      rows = height < 64 ? 6 : Math.max(15, Math.min(36, Math.round(height / 8.4)));
      const dotPitch = Math.max(1.95, height / (rows * 4));
      cols = Math.max(76, Math.min(300, Math.round(width / (dotPitch * 2))));
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
    let cachedAccent = '#CBD5E1';
    let cachedAccentHigh = '#E2E8F0';
    let cachedLow = '#94A3B8';
    let themeFrameCounter = 0;
    const animator = createHorizonAnimator();
    let rafId = 0;
    let hiddenTimerId = 0;
    let lastReducedKey = '';
    let b0XY = new Float32Array(300 * rows * 16);
    let b1XY = new Float32Array(300 * rows * 16);
    let b2XY = new Float32Array(300 * rows * 16);
    let b3XY = new Float32Array(300 * rows * 16);
    let b4XY = new Float32Array(300 * rows * 16);
    const buckets: [
      TonalDotBucketSpec,
      TonalDotBucketSpec,
      TonalDotBucketSpec,
      TonalDotBucketSpec,
      TonalDotBucketSpec,
    ] = [
      { xy: b0XY, len: 0, hex: cachedLow, alpha: 0.30, diameterScale: 0.62 },
      { xy: b1XY, len: 0, hex: cachedLow, alpha: 0.48, diameterScale: 0.74 },
      { xy: b2XY, len: 0, hex: cachedAccent, alpha: 0.58, diameterScale: 0.84 },
      { xy: b3XY, len: 0, hex: cachedAccentHigh, alpha: 0.78, diameterScale: 0.96 },
      { xy: b4XY, len: 0, hex: '#F8FAFC', alpha: 0.94, diameterScale: 1.06 },
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
        const uiAccent = styles.getPropertyValue('--ui-accent').trim() || '#94A3B8';
        const uiSoft = styles.getPropertyValue('--ui-accent-soft').trim() || '#CBD5E1';
        if (uiSoft.startsWith('#') && uiSoft.length === 7) {
          cachedAccent = uiSoft;
          cachedAccentHigh = mixHexColors(uiSoft, '#FFFFFF', 0.42);
        }
        if (uiAccent.startsWith('#') && uiAccent.length === 7) {
          cachedLow = mixHexColors('#64748B', uiAccent, 0.35);
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
        style: s.horizonStyle,
      });

      const cellW = width / frame.cols;
      const cellH = height / frame.rows;
      const dotW = cellW / 2;
      const dotH = cellH / 4;
      const dotRadius = Math.max(0.64, Math.min(dotW, dotH) * 0.35);

      let len0 = 0;
      let len1 = 0;
      let len2 = 0;
      let len3 = 0;
      let len4 = 0;

      const dotDiameter = Math.max(1.10, dotRadius * 1.88);
      const needed = frame.cols * frame.rows * 16;
      if (b0XY.length < needed) {
        b0XY = new Float32Array(needed);
        b1XY = new Float32Array(needed);
        b2XY = new Float32Array(needed);
        b3XY = new Float32Array(needed);
        b4XY = new Float32Array(needed);
        buckets[0].xy = b0XY;
        buckets[1].xy = b1XY;
        buckets[2].xy = b2XY;
        buckets[3].xy = b3XY;
        buckets[4].xy = b4XY;
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

          if (bright > 0.74) {
            for (let k = 0; k < 8; k++) {
              const [px, py, mask] = SUBPIXEL_BITS[k];
              if (bits & mask) {
                b4XY[len4++] = baseX + (px + 0.5) * dotW - dotRadius;
                b4XY[len4++] = baseY + (py + 0.5) * dotH - dotRadius;
              }
            }
          } else if (bright > 0.56) {
            for (let k = 0; k < 8; k++) {
              const [px, py, mask] = SUBPIXEL_BITS[k];
              if (bits & mask) {
                b3XY[len3++] = baseX + (px + 0.5) * dotW - dotRadius;
                b3XY[len3++] = baseY + (py + 0.5) * dotH - dotRadius;
              }
            }
          } else if (bright > 0.38) {
            for (let k = 0; k < 8; k++) {
              const [px, py, mask] = SUBPIXEL_BITS[k];
              if (bits & mask) {
                b2XY[len2++] = baseX + (px + 0.5) * dotW - dotRadius;
                b2XY[len2++] = baseY + (py + 0.5) * dotH - dotRadius;
              }
            }
          } else if (bright > 0.20) {
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

      if (!surface || surface.width !== canvas.width || surface.height !== canvas.height) {
        surface = createRasterSurface(ctx, canvas.width, canvas.height);
      }
      const overrideHex = s.tintHex && s.tintHex.startsWith('#') && s.tintHex.length === 7 ? s.tintHex : null;
      const baseAccent = overrideHex ? mixHexColors(cachedAccent, overrideHex, 0.85) : cachedAccent;
      const baseLow = overrideHex ? mixHexColors('#6E7B85', overrideHex, 0.42) : cachedLow;
      const highHex = overrideHex ? mixHexColors(overrideHex, '#FFFFFF', 0.45) : cachedAccentHigh;
      const midHex = mixHexColors(baseLow, baseAccent, 0.52);
      const highGlowHex = s.isActive ? highHex : mixHexColors(baseAccent, '#FFFFFF', 0.32);

      buckets[0].len = len0;
      buckets[0].hex = baseLow;
      buckets[0].alpha = 0.30;

      buckets[1].len = len1;
      buckets[1].hex = midHex;
      buckets[1].alpha = s.isActive ? 0.52 : 0.46;

      buckets[2].len = len2;
      buckets[2].hex = baseAccent;
      buckets[2].alpha = s.isActive ? 0.64 : 0.54;

      buckets[3].len = len3;
      buckets[3].hex = highGlowHex;
      buckets[3].alpha = s.isActive ? 0.82 : 0.72;

      buckets[4].len = len4;
      buckets[4].hex = s.isActive ? '#FFFFFF' : '#F8FAFC';
      buckets[4].alpha = s.isActive ? 0.96 : 0.88;

      rasterizeTonalDotBucketsToSurface(surface, buckets, dpr, dotDiameter, {
        dotProfile: s.dotProfile,
        bloom: s.bloom * 0.34,
      });
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
        const reducedKey = `${width}x${height}|${s.isActive}|${s.horizonStyle}|${s.dotProfile}|${s.tintHex ?? ''}|${s.bloom.toFixed(2)}|${Math.round(s.energy * 100)}|${
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
      const interval = active || hasPointer ? 16 : 48;
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
