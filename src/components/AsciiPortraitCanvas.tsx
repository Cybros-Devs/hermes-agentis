import { useEffect, useRef, useState, type RefObject } from 'react';
import type { ExpressionMood, EyeState, MouthViseme } from '../types/hermes';
import {
  buildPortraitBankFromSpriteSheet,
  buildPortraitSourceFromRgba,
  createPortraitAnimator,
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
        const octx = offscreen.getContext('2d');
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
        const octx = offscreen.getContext('2d');
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
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cellW = width / cols;
    const cellH = height / rows;
    const dotW = cellW / 2;
    const dotH = cellH / 4;
    const dotRadius = isThumb ? 0.42 : Math.min(dotW, dotH) * (isStage ? 0.44 : 0.42);
    const startTime = performance.now();
    const animator = createPortraitAnimator();
    const systemReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let smoothEnergy = stateRef.current.energy;
    let rafId = 0;
    let lastDraw = startTime;
    let elapsedPhase = 0;

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

      ctx.clearRect(0, 0, width, height);

      const activeTint =
        !isThumb &&
        (isLoadingVisual || s.isListening || (s.isSpeaking && smoothEnergy > 0.35));

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

      const customTint = s.tintHex;
      const lowColor = customTint
        ? mixPortraitHex('#7E968F', customTint, activeTint ? 0.85 : 0.55)
        : activeTint
        ? '#A7F3D0'
        : '#C2D4CE';
      const midColor = customTint ? mixPortraitHex('#E6F0EC', customTint, 0.52) : '#E6F0EC';
      const highColor = customTint ? mixPortraitHex('#FFFFFF', customTint, 0.18) : '#FFFFFF';

      ctx.fillStyle = lowColor;
      ctx.globalAlpha = isLoadingVisual ? 0.56 : 0.72;
      ctx.fill(pLow);

      ctx.fillStyle = midColor;
      ctx.globalAlpha = isLoadingVisual ? 0.78 : 0.88;
      ctx.fill(pMid);

      ctx.fillStyle = highColor;
      ctx.globalAlpha = isLoadingVisual ? 0.94 : 0.98;
      ctx.fill(pHigh);

      ctx.globalAlpha = 1;
    };

    drawFrame(startTime);

    // Thumb stays static once real character finishes materializing,
    // but animates smoothly while loading!
    const thumbMaterialized =
      isThumb &&
      status === 'ready' &&
      (!startedWhileLoadingRef.current || readyAtMsRef.current === 0);
    if (thumbMaterialized) return;

    let timerId = 0;
    const minIntervalMs = isStage ? 28 : 24;

    const loop = (now: number) => {
      if (now - lastDraw >= minIntervalMs) {
        drawFrame(now);
      }
      if (isThumb && stateRef.current.status === 'ready') {
        const doneElapsed =
          readyAtMsRef.current && readyAtMsRef.current > 0
            ? (now - readyAtMsRef.current) / 1000
            : 10;
        if (doneElapsed > 0.5) {
          return;
        }
      }
      timerId = window.setTimeout(() => {
        rafId = window.requestAnimationFrame(loop);
      }, 16);
    };

    rafId = window.requestAnimationFrame(loop);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timerId);
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
        onClick={isError ? retryPortraitAssetsLoading : onClick}
        aria-busy={isLoading}
        aria-label={
          isLoading
            ? 'Loading Hermes character sprite rig'
            : isError
            ? 'Character signal failed to load. Click to retry.'
            : `Animated monochrome braille halftone portrait of Hermes, expression ${mood}, mouth ${viseme}. Click to cycle mood.`
        }
        className="group relative flex items-center justify-center rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#34D399] cursor-pointer"
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
            className="inline-block w-1.5 h-1.5 rounded-full bg-[#34D399] animate-pulse"
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
