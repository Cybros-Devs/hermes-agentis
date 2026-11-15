import { useEffect, useRef, useState, type RefObject } from 'react';
import type { ExpressionMood, EyeState, MouthViseme } from '../types/hermes';
import {
  buildPortraitBankFromSpriteSheet,
  buildPortraitSourceFromRgba,
  createPortraitAnimator,
  evaluateNaturalBlinkCurve,
  renderHalftonePortrait,
  type LookTarget,
  type PortraitSourceField,
} from '../utils/asciiPortraitEngine';
import {
  blendLoadingToPortraitFrame,
  computeMaterializeProgress,
  renderPortraitLoadingFrame,
  type PortraitAssetStatus,
} from '../utils/portraitLoadingEngine';
import {
  createRasterSurface,
  rasterizeTonalDotBucketsToSurface,
  type TonalDotBucketSpec,
} from '../utils/brailleCanvasRaster';

const REFERENCE_PORTRAIT_URL = '/assets/aistudio/image_9fdb5ec4.png';
const REFERENCE_SPRITE_SHEET_URL = '/assets/aistudio/image_f0b5dc2e.png';

let cachedPortraitSource: PortraitSourceField | null = null;
let portraitLoadPromise: Promise<PortraitSourceField | null> | null = null;
let cachedSpriteBank: PortraitSourceField[] | null = null;
let spriteBankLoadPromise: Promise<PortraitSourceField[] | null> | null = null;
let portraitAssetStatus: PortraitAssetStatus = 'loading';
let portraitLoadGeneration = 0;

const assetListeners = new Set<() => void>();

function notifyAssetListeners() {
  for (const listener of assetListeners) {
    listener();
  }
}

function loadReferencePortraitField(): Promise<PortraitSourceField | null> {
  if (cachedPortraitSource) return Promise.resolve(cachedPortraitSource);
  if (portraitLoadPromise) return portraitLoadPromise;

  const gen = portraitLoadGeneration;
  portraitLoadPromise = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (gen !== portraitLoadGeneration) {
        resolve(null);
        return;
      }
      try {
        const size = 160;
        const offscreen = document.createElement('canvas');
        offscreen.width = size;
        offscreen.height = size;
        const octx = offscreen.getContext('2d', { willReadFrequently: true }) || offscreen.getContext('2d');
        if (!octx) {
          resolve(null);
          return;
        }
        octx.drawImage(img, 0, 0, size, size);
        const rgba = octx.getImageData(0, 0, size, size).data;
        cachedPortraitSource = buildPortraitSourceFromRgba(rgba, size, size);
        portraitAssetStatus = 'ready';
        notifyAssetListeners();
        resolve(cachedPortraitSource);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => {
      if (gen === portraitLoadGeneration) {
        portraitLoadPromise = null;
      }
      resolve(null);
    };
    img.src = REFERENCE_PORTRAIT_URL;
  });

  return portraitLoadPromise;
}

function loadReferenceSpriteBank(): Promise<PortraitSourceField[] | null> {
  if (cachedSpriteBank) return Promise.resolve(cachedSpriteBank);
  if (spriteBankLoadPromise) return spriteBankLoadPromise;

  const gen = portraitLoadGeneration;
  spriteBankLoadPromise = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (gen !== portraitLoadGeneration) {
        resolve(null);
        return;
      }
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) {
          resolve(null);
          return;
        }
        const offscreen = document.createElement('canvas');
        offscreen.width = w;
        offscreen.height = h;
        const octx = offscreen.getContext('2d', { willReadFrequently: true }) || offscreen.getContext('2d');
        if (!octx) {
          resolve(null);
          return;
        }
        octx.drawImage(img, 0, 0, w, h);
        const rgba = octx.getImageData(0, 0, w, h).data;
        const bank = buildPortraitBankFromSpriteSheet(rgba, w, h, 160);
        if (bank.length >= 12) {
          cachedSpriteBank = bank;
          portraitAssetStatus = 'ready';
          notifyAssetListeners();
          resolve(bank);
        } else {
          resolve(null);
        }
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => {
      if (gen === portraitLoadGeneration) {
        spriteBankLoadPromise = null;
      }
      resolve(null);
    };
    img.src = REFERENCE_SPRITE_SHEET_URL;
  });

  return spriteBankLoadPromise;
}

function ensurePortraitAssetsLoading(): void {
  if (cachedSpriteBank || cachedPortraitSource) {
    portraitAssetStatus = 'ready';
    return;
  }
  portraitAssetStatus = 'loading';
  const spritePromise = loadReferenceSpriteBank();
  const basePromise = loadReferencePortraitField();
  void Promise.all([spritePromise, basePromise]).then(([bank, base]) => {
    if (!bank && !base && !cachedSpriteBank && !cachedPortraitSource) {
      portraitAssetStatus = 'error';
      notifyAssetListeners();
    } else if (bank || base) {
      portraitAssetStatus = 'ready';
      notifyAssetListeners();
    }
  });
}

function retryPortraitAssetsLoading(): void {
  portraitLoadGeneration += 1;
  portraitLoadPromise = null;
  spriteBankLoadPromise = null;
  portraitAssetStatus = 'loading';
  notifyAssetListeners();
  ensurePortraitAssetsLoading();
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
  tintHex?: string | null;
  speedScale?: number;
  reducedMotionOverride?: boolean;
  showLoadingLabel?: boolean;
  onStatusChange?: (status: PortraitAssetStatus) => void;
  onClick?: () => void;
}

function mixPortraitHex(hexA: string, hexB: string, t: number): string {
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
  const r = Math.round(r1 + (r2 - r1) * w);
  const g = Math.round(g1 + (g2 - g1) * w);
  const b = Math.round(b1 + (b2 - b1) * w);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
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
  tintHex = null,
  speedScale = 1,
  reducedMotionOverride = false,
  showLoadingLabel,
  onStatusChange,
  onClick,
}: AsciiPortraitCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [sourceField, setSourceField] = useState<PortraitSourceField | null>(() => cachedPortraitSource);
  const [spriteBank, setSpriteBank] = useState<PortraitSourceField[] | null>(() => cachedSpriteBank);
  const [status, setStatus] = useState<PortraitAssetStatus>(() =>
    cachedSpriteBank || cachedPortraitSource ? 'ready' : portraitAssetStatus
  );

  // Track whether this component actually witnessed loading before becoming ready,
  // so tab switches when already cached render immediately without re-wiping.
  const startedWhileLoadingRef = useRef<boolean>(!(cachedSpriteBank || cachedPortraitSource));
  const readyAtMsRef = useRef<number | null>(
    cachedSpriteBank || cachedPortraitSource ? 0 : null
  );
  const animatorRef = useRef<ReturnType<typeof createPortraitAnimator> | null>(null);
  const isHoveredRef = useRef(false);
  const isBlinkingRef = useRef(false);

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
    spriteBank,
    status,
    tintHex,
    speedScale,
    reducedMotionOverride,
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
    spriteBank,
    status,
    tintHex,
    speedScale,
    reducedMotionOverride,
  };

  useEffect(() => {
    const sync = () => {
      setSourceField(cachedPortraitSource);
      setSpriteBank(cachedSpriteBank);
      const nextStatus: PortraitAssetStatus =
        cachedSpriteBank || cachedPortraitSource ? 'ready' : portraitAssetStatus;
      if (nextStatus === 'ready' && readyAtMsRef.current === null) {
        readyAtMsRef.current = performance.now();
      } else if (nextStatus === 'loading') {
        startedWhileLoadingRef.current = true;
        readyAtMsRef.current = null;
      }
      setStatus(nextStatus);
    };

    assetListeners.add(sync);
    ensurePortraitAssetsLoading();
    sync();

    return () => {
      assetListeners.delete(sync);
    };
  }, []);

  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isThumb = variant === 'thumb';
    const isStage = variant === 'stage';
    const cols = isThumb ? 22 : isStage ? 92 : 62;
    const rows = isThumb ? 11 : isStage ? 42 : 28;
    const width = isThumb ? 42 : isStage ? 360 : 216;
    const height = isThumb ? 42 : isStage ? 330 : 198;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const surface = createRasterSurface(ctx, canvas.width, canvas.height);

    const cellW = width / cols;
    const cellH = height / rows;
    const dotW = cellW / 2;
    const dotH = cellH / 4;
    const dotRadius = isThumb ? 0.42 : Math.min(dotW, dotH) * (isStage ? 0.44 : 0.42);
    const startTime = performance.now();
    const animator = createPortraitAnimator();
    animatorRef.current = animator;
    const systemReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let smoothEnergy = stateRef.current.energy;
    let rafId = 0;
    let hiddenTimerId = 0;
    let lastDraw = startTime;
    let elapsedPhase = 0;
    let lastReducedKey = '';

    // Reusable XY coordinate buffers across 5 tonal tiers for variable-size halftone dots
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
      { xy: b0XY, len: 0, hex: '#8FA69E', alpha: 0.48, diameterScale: 0.72 },
      { xy: b1XY, len: 0, hex: '#B9CCC5', alpha: 0.68, diameterScale: 0.85 },
      { xy: b2XY, len: 0, hex: '#DCE8E3', alpha: 0.84, diameterScale: 0.96 },
      { xy: b3XY, len: 0, hex: '#F1F7F4', alpha: 0.94, diameterScale: 1.07 },
      { xy: b4XY, len: 0, hex: '#FFFFFF', alpha: 0.99, diameterScale: 1.18 },
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

      smoothEnergy += (s.energy - smoothEnergy) * (1 - Math.exp(-16 * dt));
      const elapsed = isReduced ? 0.6 : elapsedPhase;
      const hasRealCharacter = Boolean(
        (s.spriteBank && s.spriteBank.length >= 12) || s.sourceField
      );

      let frame;
      let isLoadingVisual = false;

      if (!hasRealCharacter) {
        // Never render mathematical mock character data while real character artwork loads or errors
        isLoadingVisual = true;
        frame = renderPortraitLoadingFrame({
          cols,
          rows,
          time: elapsed,
          variant,
          status: s.status === 'error' ? 'error' : 'loading',
          reducedMotion: isReduced,
        });
      } else {
        const portraitElapsed = isThumb ? 0.5 : elapsed;
        const activeLook = s.lookTargetRef?.current ?? s.lookTarget ?? null;
        const motion = isThumb
          ? null
          : animator.step(
              {
                time: portraitElapsed,
                mood: s.mood,
                viseme: s.viseme,
                eyeState: s.eyeState,
                energy: smoothEnergy,
                isSpeaking: s.isSpeaking,
                isListening: s.isListening,
              },
              dt,
              isReduced,
              activeLook
            );

        if (!isThumb) {
          isBlinkingRef.current = Boolean(motion && motion.blink > 0.015);
          canvas.dataset.blink = motion ? motion.blink.toFixed(2) : '0.00';
        }

        const portraitFrame = renderHalftonePortrait({
          cols,
          rows,
          time: portraitElapsed,
          mood: s.mood,
          viseme: isThumb ? 'closed' : s.viseme,
          eyeState: isThumb ? 'open' : s.eyeState,
          energy: isThumb ? 0.1 : smoothEnergy,
          isSpeaking: isThumb ? false : s.isSpeaking,
          isListening: isThumb ? false : s.isListening,
          style: 'braille',
          sourceField: s.sourceField,
          spriteBank: s.spriteBank,
          motion,
        });

        const readyElapsed =
          startedWhileLoadingRef.current && readyAtMsRef.current !== null && readyAtMsRef.current > 0
            ? (now - readyAtMsRef.current) / 1000
            : 10;
        const matProgress = computeMaterializeProgress(readyElapsed, isReduced);

        if (matProgress < 0.995) {
          const loadingFrame = renderPortraitLoadingFrame({
            cols,
            rows,
            time: elapsed,
            variant,
            status: 'loading',
            reducedMotion: isReduced,
          });
          frame = blendLoadingToPortraitFrame(loadingFrame, portraitFrame, matProgress);
        } else {
          frame = portraitFrame;
        }
      }

      const activeTint =
        !isThumb &&
        (isLoadingVisual || s.isListening || (s.isSpeaking && smoothEnergy > 0.35));

      let len0 = 0;
      let len1 = 0;
      let len2 = 0;
      let len3 = 0;
      let len4 = 0;

      const dotDiameter = Math.max(1.15, dotRadius * 2.02);

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

          if (bright > 0.82) {
            for (let k = 0; k < 8; k++) {
              const [px, py, mask] = SUBPIXEL_BITS[k];
              if (bits & mask) {
                b4XY[len4++] = baseX + (px + 0.5) * dotW - dotRadius;
                b4XY[len4++] = baseY + (py + 0.5) * dotH - dotRadius;
              }
            }
          } else if (bright > 0.64) {
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
          } else if (bright > 0.24) {
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

      const customTint = s.tintHex;
      const tintWeight = activeTint ? 0.85 : 0.52;
      const baseLowHex = customTint
        ? mixPortraitHex('#738C84', customTint, tintWeight)
        : activeTint
        ? '#6EE7B7'
        : '#8FA69E';
      const baseMidLowHex = customTint
        ? mixPortraitHex('#ADC2BB', customTint, tintWeight * 0.85)
        : activeTint
        ? '#A7F3D0'
        : '#B9CCC5';
      const baseMidHex = customTint ? mixPortraitHex('#DCE8E3', customTint, 0.52) : '#DCE8E3';
      const baseMidHighHex = customTint ? mixPortraitHex('#F1F7F4', customTint, 0.34) : '#F1F7F4';
      const baseHighHex = customTint ? mixPortraitHex('#FFFFFF', customTint, 0.16) : '#FFFFFF';

      buckets[0].len = len0;
      buckets[0].hex = baseLowHex;
      buckets[0].alpha = isLoadingVisual ? 0.42 : 0.48;

      buckets[1].len = len1;
      buckets[1].hex = baseMidLowHex;
      buckets[1].alpha = isLoadingVisual ? 0.58 : 0.68;

      buckets[2].len = len2;
      buckets[2].hex = baseMidHex;
      buckets[2].alpha = isLoadingVisual ? 0.74 : 0.84;

      buckets[3].len = len3;
      buckets[3].hex = baseMidHighHex;
      buckets[3].alpha = isLoadingVisual ? 0.86 : 0.94;

      buckets[4].len = len4;
      buckets[4].hex = baseHighHex;
      buckets[4].alpha = isLoadingVisual ? 0.95 : 0.99;

      rasterizeTonalDotBucketsToSurface(surface, buckets, dpr, dotDiameter);
      ctx.putImageData(surface.imageData, 0, 0);
    };

    drawFrame(startTime);

    // Thumb stays static once real character finishes materializing,
    // but animates smoothly while loading!
    const thumbMaterialized =
      isThumb &&
      status === 'ready' &&
      (!startedWhileLoadingRef.current || readyAtMsRef.current === 0);
    if (thumbMaterialized) return;

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
      const activeLook = s.lookTargetRef?.current ?? s.lookTarget ?? null;
      const hasRealCharacter = Boolean(
        (s.spriteBank && s.spriteBank.length >= 12) || s.sourceField
      );
      const readyElapsed =
        startedWhileLoadingRef.current && readyAtMsRef.current !== null && readyAtMsRef.current > 0
          ? (now - readyAtMsRef.current) / 1000
          : 10;
      const isMaterializing = readyElapsed < 1.25;

      if (isReduced && hasRealCharacter && !isMaterializing) {
        const reducedKey = `${s.mood}|${s.viseme}|${s.eyeState}|${s.isSpeaking}|${s.isListening}|${Math.round(
          s.energy * 100
        )}|${s.tintHex ?? ''}|${s.status}|${
          activeLook ? `${activeLook.x.toFixed(2)},${activeLook.y.toFixed(2)}` : ''
        }`;
        if (reducedKey !== lastReducedKey) {
          lastReducedKey = reducedKey;
          drawFrame(now);
        }
        hiddenTimerId = window.setTimeout(scheduleNext, 180);
        return;
      }
      lastReducedKey = '';

      const blinkLookahead = evaluateNaturalBlinkCurve(elapsedPhase + 0.08, 0, 4) > 0.01;
      const activeMotion =
        s.status !== 'ready' ||
        isMaterializing ||
        s.isSpeaking ||
        s.isListening ||
        s.mood === 'thinking' ||
        isHoveredRef.current ||
        activeLook !== null ||
        isBlinkingRef.current ||
        blinkLookahead;

      // Fluid VSync cadence (~60fps active/materialize, ~45fps calm idle)
      const minIntervalMs = isReduced ? 220 : isMaterializing ? 18 : activeMotion ? 16 : 22;
      if (now - lastDraw >= minIntervalMs) {
        drawFrame(now);
      }
      if (isThumb && s.status === 'ready') {
        const doneElapsed =
          readyAtMsRef.current && readyAtMsRef.current > 0
            ? (now - readyAtMsRef.current) / 1000
            : 10;
        if (doneElapsed > 0.5) {
          animatorRef.current = null;
          return;
        }
      }
      rafId = window.requestAnimationFrame(loop);
    };

    rafId = window.requestAnimationFrame(loop);
    return () => {
      window.cancelAnimationFrame(rafId);
      if (hiddenTimerId) window.clearTimeout(hiddenTimerId);
      animatorRef.current = null;
    };
  }, [variant, sourceField, spriteBank, status]);

  if (variant === 'thumb') {
    return (
      <canvas
        ref={canvasRef}
        data-portrait-status={status}
        aria-hidden="true"
        className="w-[42px] h-[42px] rounded-md bg-black/35 shrink-0"
      />
    );
  }

  const isStage = variant === 'stage';
  const showBadge = showLoadingLabel ?? isStage;
  const isError = status === 'error';
  const isLoading = status === 'loading';

  return (
    <div className="relative flex flex-col items-center justify-center">
      <button
        type="button"
        onMouseEnter={() => {
          isHoveredRef.current = true;
        }}
        onMouseLeave={() => {
          isHoveredRef.current = false;
        }}
        onClick={() => {
          if (isError) {
            retryPortraitAssetsLoading();
            return;
          }
          animatorRef.current?.triggerImpulse('tap');
          onClick?.();
        }}
        aria-busy={isLoading}
        aria-label={
          isLoading
            ? 'Loading Hermes character sprite rig'
            : isError
            ? 'Character signal failed to load. Click to retry.'
            : `Animated monochrome braille halftone portrait of Hermes, expression ${mood}, mouth ${viseme}. Click to cycle mood.`
        }
        className="group relative flex items-center justify-center rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#34D399] transition-transform duration-200 ease-out active:scale-[0.97] hover:scale-[1.015] cursor-pointer"
      >
        <canvas
          ref={canvasRef}
          data-testid="ascii-portrait-canvas"
          data-portrait-status={status}
          className={
            isStage
              ? 'block w-[clamp(230px,38vmin,540px)] aspect-[12/11]'
              : 'w-[216px] h-[198px] block'
          }
        />
      </button>

      {isLoading && showBadge && (
        <div
          data-testid="portrait-loading-indicator"
          aria-live="polite"
          className="pointer-events-none -mt-2 mb-1 inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/55 backdrop-blur-md px-3 py-1 font-mono text-[10.5px] text-[#6EE7B7] shadow-[0_6px_20px_rgba(0,0,0,0.45)]"
        >
          <span
            aria-hidden="true"
            className="inline-block w-1.5 h-1.5 rounded-full bg-[#34D399] animate-pulse motion-safe-only"
          />
          <span>Calibrating halftone rig…</span>
        </div>
      )}

      {isError && showBadge && (
        <button
          type="button"
          onClick={retryPortraitAssetsLoading}
          data-testid="portrait-retry-btn"
          className="-mt-1 mb-1 inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-500/12 hover:bg-rose-500/20 px-3 py-1 font-mono text-[10.5px] text-rose-200 transition-colors cursor-pointer"
        >
          <span>Signal unavailable · Retry</span>
        </button>
      )}
    </div>
  );
}
