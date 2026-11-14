import { useEffect, useRef, useState, type RefObject } from 'react';
import type { ExpressionMood, EyeState, MouthViseme } from '../types/hermes';
import {
  buildPortraitSourceFromRgba,
  createPortraitAnimator,
  renderHalftonePortrait,
  type LookTarget,
  type PortraitSourceField,
} from '../utils/asciiPortraitEngine';

const REFERENCE_PORTRAIT_URL = '/assets/aistudio/image_9fdb5ec4.png';
let cachedPortraitSource: PortraitSourceField | null = null;
let portraitLoadPromise: Promise<PortraitSourceField | null> | null = null;

function loadReferencePortraitField(): Promise<PortraitSourceField | null> {
  if (cachedPortraitSource) return Promise.resolve(cachedPortraitSource);
  if (portraitLoadPromise) return portraitLoadPromise;

  portraitLoadPromise = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const size = 160;
        const offscreen = document.createElement('canvas');
        offscreen.width = size;
        offscreen.height = size;
        const octx = offscreen.getContext('2d');
        if (!octx) {
          resolve(null);
          return;
        }
        octx.drawImage(img, 0, 0, size, size);
        const rgba = octx.getImageData(0, 0, size, size).data;
        cachedPortraitSource = buildPortraitSourceFromRgba(rgba, size, size);
        resolve(cachedPortraitSource);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = REFERENCE_PORTRAIT_URL;
  });

  return portraitLoadPromise;
}

interface AsciiPortraitCanvasProps {
  variant?: 'hero' | 'thumb' | 'stage';
  mood: ExpressionMood;
  viseme: MouthViseme;
  eyeState: EyeState;
  energy: number;
  isSpeaking: boolean;
  isListening: boolean;
  lookTarget?: LookTarget | null;
  lookTargetRef?: RefObject<LookTarget | null>;
  onClick?: () => void;
}

// Bitmask lookup order matching standard Unicode Braille U+2800..U+28FF
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

export function AsciiPortraitCanvas({
  variant = 'hero',
  mood,
  viseme,
  eyeState,
  energy,
  isSpeaking,
  isListening,
  lookTarget,
  lookTargetRef,
  onClick,
}: AsciiPortraitCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [sourceField, setSourceField] = useState<PortraitSourceField | null>(cachedPortraitSource);

  const stateRef = useRef({
    mood,
    viseme,
    eyeState,
    energy,
    isSpeaking,
    isListening,
    lookTarget,
    lookTargetRef,
    sourceField,
  });
  stateRef.current = {
    mood,
    viseme,
    eyeState,
    energy,
    isSpeaking,
    isListening,
    lookTarget,
    lookTargetRef,
    sourceField,
  };

  useEffect(() => {
    let mounted = true;
    if (!cachedPortraitSource) {
      loadReferencePortraitField().then((loaded) => {
        if (mounted && loaded) {
          setSourceField(loaded);
        }
      });
    }
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isThumb = variant === 'thumb';
    const isStage = variant === 'stage';
    const cols = isThumb ? 22 : isStage ? 82 : 62;
    const rows = isThumb ? 11 : isStage ? 37 : 28;
    const width = isThumb ? 42 : isStage ? 360 : 216;
    const height = isThumb ? 42 : isStage ? 330 : 198;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cellW = width / cols;
    const cellH = height / rows;
    const dotW = cellW / 2;
    const dotH = cellH / 4;
    const dotRadius = isThumb ? 0.42 : Math.min(dotW, dotH) * (isStage ? 0.44 : 0.42);
    const startTime = performance.now();
    const animator = createPortraitAnimator();
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let smoothEnergy = stateRef.current.energy;
    let rafId = 0;
    let lastDraw = startTime;

    const drawFrame = (now: number) => {
      const s = stateRef.current;
      const dt = Math.min(0.06, Math.max(0.008, (now - lastDraw) / 1000));
      lastDraw = now;

      smoothEnergy += (s.energy - smoothEnergy) * (1 - Math.exp(-16 * dt));
      const elapsed = isThumb ? 0.5 : (now - startTime) / 1000;
      const activeLook = s.lookTargetRef?.current ?? s.lookTarget ?? null;

      const motion = isThumb
        ? null
        : animator.step(
            {
              time: elapsed,
              mood: s.mood,
              viseme: s.viseme,
              eyeState: s.eyeState,
              energy: smoothEnergy,
              isSpeaking: s.isSpeaking,
              isListening: s.isListening,
            },
            dt,
            reducedMotion,
            activeLook
          );

      const frame = renderHalftonePortrait({
        cols,
        rows,
        time: elapsed,
        mood: s.mood,
        viseme: isThumb ? 'closed' : s.viseme,
        eyeState: isThumb ? 'open' : s.eyeState,
        energy: isThumb ? 0.1 : smoothEnergy,
        isSpeaking: isThumb ? false : s.isSpeaking,
        isListening: isThumb ? false : s.isListening,
        style: 'braille',
        sourceField: s.sourceField,
        motion,
      });

      ctx.clearRect(0, 0, width, height);

      const activeTint = !isThumb && (s.isListening || (motion?.listenPulse ?? 0) > 0.35);

      const pHigh = new Path2D();
      const pMid = new Path2D();
      const pLow = new Path2D();

      const dotDiameter = Math.max(1.1, dotRadius * 1.9);

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
          const targetPath = bright > 0.7 ? pHigh : bright > 0.36 ? pMid : pLow;
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

      ctx.fillStyle = activeTint ? '#A7F3D0' : '#C2D4CE';
      ctx.globalAlpha = 0.72;
      ctx.fill(pLow);

      ctx.fillStyle = '#E6F0EC';
      ctx.globalAlpha = 0.88;
      ctx.fill(pMid);

      ctx.fillStyle = '#FFFFFF';
      ctx.globalAlpha = 0.98;
      ctx.fill(pHigh);

      ctx.globalAlpha = 1;
    };

    drawFrame(startTime);
    if (isThumb) return;

    let timerId = 0;
    const minIntervalMs = isStage ? 32 : 26;

    const loop = (now: number) => {
      if (now - lastDraw >= minIntervalMs) {
        drawFrame(now);
      }
      timerId = window.setTimeout(() => {
        rafId = window.requestAnimationFrame(loop);
      }, 24);
    };

    rafId = window.requestAnimationFrame(loop);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timerId);
    };
  }, [variant, sourceField]);

  if (variant === 'thumb') {
    return (
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="w-[42px] h-[42px] rounded-md bg-black/35 shrink-0"
      />
    );
  }

  const isStage = variant === 'stage';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Animated monochrome braille halftone portrait of Hermes, expression ${mood}, mouth ${viseme}. Click to cycle mood.`}
      className="group relative flex items-center justify-center rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#34D399] cursor-pointer"
    >
      <canvas
        ref={canvasRef}
        data-testid="ascii-portrait-canvas"
        className={
          isStage
            ? 'w-[240px] h-[220px] sm:w-[310px] sm:h-[284px] lg:w-[350px] lg:h-[321px] xl:w-[370px] xl:h-[340px] block'
            : 'w-[216px] h-[198px] block'
        }
      />
    </button>
  );
}
