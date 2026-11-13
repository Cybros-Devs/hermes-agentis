import { useEffect, useRef, useState } from 'react';
import type { ExpressionMood, EyeState, MouthViseme } from '../types/hermes';
import {
  buildPortraitSourceFromRgba,
  renderHalftonePortrait,
  type DitherStyle,
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
  variant?: 'hero' | 'thumb';
  mood: ExpressionMood;
  viseme: MouthViseme;
  eyeState: EyeState;
  energy: number;
  isSpeaking: boolean;
  isListening: boolean;
  ditherStyle: DitherStyle;
  onClick?: () => void;
}

export function AsciiPortraitCanvas({
  variant = 'hero',
  mood,
  viseme,
  eyeState,
  energy,
  isSpeaking,
  isListening,
  ditherStyle,
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
    ditherStyle,
    sourceField,
  });
  stateRef.current = {
    mood,
    viseme,
    eyeState,
    energy,
    isSpeaking,
    isListening,
    ditherStyle,
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
    const cols = isThumb ? 22 : 62;
    const rows = isThumb ? 11 : 28;
    const width = isThumb ? 42 : 216;
    const height = isThumb ? 42 : 198;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cellW = width / cols;
    const cellH = height / rows;
    const dotW = cellW / 2;
    const dotH = cellH / 4;
    const dotRadius = isThumb ? 0.42 : Math.min(dotW, dotH) * 0.4;
    const fontSpec = isThumb
      ? '500 3.4px "JetBrains Mono", monospace'
      : '500 6.2px "JetBrains Mono", monospace';
    const startTime = performance.now();
    let smoothEnergy = stateRef.current.energy;
    let rafId = 0;
    let lastDraw = 0;

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

    const drawFrame = (now: number) => {
      const s = stateRef.current;
      smoothEnergy += (s.energy - smoothEnergy) * 0.32;
      const elapsed = isThumb ? 0.5 : (now - startTime) / 1000;
      const activeStyle = isThumb ? 'braille' : s.ditherStyle;

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
        style: activeStyle,
        sourceField: s.sourceField,
      });

      ctx.clearRect(0, 0, width, height);

      if (activeStyle === 'braille') {
        for (let r = 0; r < frame.rows; r++) {
          const line = frame.lines[r];
          const baseY = r * cellH;
          for (let c = 0; c < frame.cols; c++) {
            const ch = line[c];
            if (ch === ' ') continue;
            const bits = ch.charCodeAt(0) - 0x2800;
            if (bits <= 0 || bits > 0xff) continue;

            const bright = frame.cells[r * frame.cols + c] / 255;
            if (bright > 0.7) {
              ctx.fillStyle = '#FFFFFF';
              ctx.globalAlpha = 0.98;
            } else if (bright > 0.36) {
              ctx.fillStyle = '#E6F0EC';
              ctx.globalAlpha = 0.88;
            } else {
              ctx.fillStyle = s.isListening && !isThumb ? '#A7F3D0' : '#C2D4CE';
              ctx.globalAlpha = 0.62 + bright * 0.42;
            }

            const baseX = c * cellW;
            ctx.beginPath();
            for (let k = 0; k < 8; k++) {
              const [px, py, mask] = SUBPIXEL_BITS[k];
              if (bits & mask) {
                const cx = baseX + (px + 0.5) * dotW;
                const cy = baseY + (py + 0.5) * dotH;
                ctx.moveTo(cx + dotRadius, cy);
                ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2);
              }
            }
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
        return;
      }

      ctx.font = fontSpec;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let r = 0; r < frame.rows; r++) {
        const line = frame.lines[r];
        const y = r * cellH + cellH * 0.52;
        for (let c = 0; c < frame.cols; c++) {
          const ch = line[c];
          if (ch === ' ') continue;

          const bright = frame.cells[r * frame.cols + c] / 255;
          const x = c * cellW + cellW * 0.5;

          if (bright > 0.72) {
            ctx.fillStyle = '#FFFFFF';
            ctx.globalAlpha = 0.99;
          } else if (bright > 0.38) {
            ctx.fillStyle = '#E6F0EC';
            ctx.globalAlpha = 0.9;
          } else {
            ctx.fillStyle = s.isListening && !isThumb ? '#A7F3D0' : '#C2D4CE';
            ctx.globalAlpha = 0.64 + bright * 0.42;
          }
          ctx.fillText(ch, x, y);
        }
      }
      ctx.globalAlpha = 1;
    };

    drawFrame(startTime);
    if (isThumb) return;

    const loop = (now: number) => {
      if (now - lastDraw >= 32) {
        lastDraw = now;
        drawFrame(now);
      }
      rafId = window.requestAnimationFrame(loop);
    };

    rafId = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(rafId);
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

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Animated monochrome halftone ASCII portrait of Hermes, expression ${mood}, mouth ${viseme}, dither ${ditherStyle}. Click to cycle mood.`}
      className="group relative flex items-center justify-center rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#34D399] cursor-pointer"
    >
      <canvas
        ref={canvasRef}
        data-testid="ascii-portrait-canvas"
        className="w-[216px] h-[198px] block"
      />
    </button>
  );
}
