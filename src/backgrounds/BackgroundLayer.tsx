import { memo, useEffect, useMemo, useRef } from 'react';
import { getPresetById } from './presets';
import type { BackgroundCustomSlot, BackgroundPresetKind } from './types';

interface BackgroundLayerProps {
  activeId: string;
  customSlot?: BackgroundCustomSlot | null;
}

const BRAILLE_CASCADE = ['⣿', '⣾', '⣷', '⣶', '⣦', '⣤', '⣄', '⡀', '⠁'];
const BRAILLE_CASCADE_ALT = ['⣿', '⠿', '⠟', '⠏', '⠇', '⠃', '⠁'];
const cachedBackdropBitmaps = new Map<string, string>();

function drawRadialEllipse(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  stops: Array<[number, string]>
) {
  ctx.save();
  ctx.translate(cx * w, cy * h);
  ctx.scale(rx * w, ry * h);
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [offset, color] of stops) {
    grad.addColorStop(offset, color);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(-1.1, -1.1, 2.2, 2.2);
  ctx.restore();
}

function getCachedBackdropBitmap(
  kind: 'aurora-drift' | 'mesh-gradient' | 'horizon-wave-a' | 'horizon-wave-b'
): string | null {
  const existing = cachedBackdropBitmaps.get(kind);
  if (existing) return existing;
  if (typeof document === 'undefined') return null;

  try {
    const w = 256;
    const h = 144;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    if (kind === 'aurora-drift') {
      drawRadialEllipse(ctx, w, h, 0.22, 0.26, 0.42, 0.42, [
        [0, 'rgba(22, 114, 86, 0.58)'],
        [0.66, 'rgba(22, 114, 86, 0)'],
      ]);
      drawRadialEllipse(ctx, w, h, 0.78, 0.76, 0.4, 0.42, [
        [0, 'rgba(20, 88, 96, 0.52)'],
        [0.66, 'rgba(20, 88, 96, 0)'],
      ]);
      drawRadialEllipse(ctx, w, h, 0.52, 0.52, 0.34, 0.34, [
        [0, 'rgba(120, 76, 28, 0.34)'],
        [0.64, 'rgba(120, 76, 28, 0)'],
      ]);
    } else if (kind === 'mesh-gradient') {
      drawRadialEllipse(ctx, w, h, 0.18, 0.22, 0.42, 0.46, [
        [0, 'rgba(22, 98, 76, 0.56)'],
        [0.62, 'rgba(22, 98, 76, 0)'],
      ]);
      drawRadialEllipse(ctx, w, h, 0.82, 0.24, 0.42, 0.46, [
        [0, 'rgba(24, 68, 94, 0.50)'],
        [0.62, 'rgba(24, 68, 94, 0)'],
      ]);
      drawRadialEllipse(ctx, w, h, 0.8, 0.8, 0.44, 0.48, [
        [0, 'rgba(48, 84, 52, 0.46)'],
        [0.64, 'rgba(48, 84, 52, 0)'],
      ]);
      drawRadialEllipse(ctx, w, h, 0.2, 0.8, 0.42, 0.46, [
        [0, 'rgba(92, 60, 28, 0.38)'],
        [0.62, 'rgba(92, 60, 28, 0)'],
      ]);
    } else if (kind === 'horizon-wave-a') {
      drawRadialEllipse(ctx, w, h, 0.5, 0.45, 0.62, 0.52, [
        [0, 'rgba(24, 118, 88, 0.52)'],
        [0.6, 'rgba(14, 64, 52, 0.24)'],
        [0.9, 'rgba(14, 64, 52, 0)'],
      ]);
    } else {
      drawRadialEllipse(ctx, w, h, 0.42, 0.48, 0.56, 0.48, [
        [0, 'rgba(118, 78, 30, 0.34)'],
        [0.55, 'rgba(16, 86, 72, 0.22)'],
        [0.9, 'rgba(16, 86, 72, 0)'],
      ]);
    }

    const url = canvas.toDataURL('image/png');
    cachedBackdropBitmaps.set(kind, url);
    return url;
  } catch {
    return null;
  }
}

function hash2d(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function valueNoise2d(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2d(xi, yi);
  const b = hash2d(xi + 1, yi);
  const c = hash2d(xi, yi + 1);
  const d = hash2d(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm2d(x: number, y: number): number {
  return valueNoise2d(x, y) * 0.65 + valueNoise2d(x * 2.03 + 11.7, y * 2.03 - 5.3) * 0.35;
}

interface RainColumn {
  x: number;
  y: number;
  speedPx: number;
  length: number;
  seed: number;
  depth: 0 | 1;
}

interface StarNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
}

function createRainColumns(width: number, height: number): RainColumn[] {
  const colSpacing = 22;
  const count = Math.max(10, Math.ceil(width / colSpacing));
  const cols: RainColumn[] = [];
  for (let i = 0; i < count; i++) {
    const r1 = hash2d(i, 1.3);
    const r2 = hash2d(i, 4.7);
    const r3 = hash2d(i, 9.1);
    const isNear: 0 | 1 = i % 3 === 0 ? 1 : 0;
    cols.push({
      x: i * colSpacing + colSpacing * 0.5,
      y: r1 * (height + 160),
      speedPx: isNear ? 22 + r2 * 16 : 12 + r2 * 14, // 12..38 px/s (strictly <= 40 px/s)
      length: isNear ? 7 + Math.floor(r3 * 5) : 5 + Math.floor(r3 * 4),
      seed: Math.floor(r1 * 100),
      depth: isNear,
    });
  }
  return cols;
}

function createStarNodes(width: number, height: number): StarNode[] {
  const count = 42;
  const nodes: StarNode[] = [];
  for (let i = 0; i < count; i++) {
    const rx = hash2d(i, 2.1);
    const ry = hash2d(i, 5.9);
    const angle = hash2d(i, 8.3) * Math.PI * 2;
    const speed = 8 + hash2d(i, 11.4) * 14; // 8..22 px/s (strictly <= 40 px/s)
    nodes.push({
      x: rx * width,
      y: ry * height,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 1.1 + hash2d(i, 14.2) * 1.4,
      alpha: 0.16 + hash2d(i, 17.8) * 0.24,
    });
  }
  return nodes;
}

export const BackgroundLayer = memo(function BackgroundLayer({
  activeId,
  customSlot,
}: BackgroundLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const preset = !customSlot ? getPresetById(activeId) : undefined;
  const activeCanvasKindRef = useRef<BackgroundPresetKind | null>(
    preset?.engine === 'canvas' ? preset.id : null
  );
  activeCanvasKindRef.current = preset?.engine === 'canvas' ? preset.id : null;

  const bitmapUrls = useMemo(() => {
    if (customSlot || preset?.engine === 'canvas') return null;
    if (preset?.id === 'aurora-drift') {
      return { primary: getCachedBackdropBitmap('aurora-drift'), secondary: null };
    }
    if (preset?.id === 'horizon-tide') {
      return {
        primary: getCachedBackdropBitmap('horizon-wave-a'),
        secondary: getCachedBackdropBitmap('horizon-wave-b'),
      };
    }
    if (preset?.id === 'mesh-gradient' || !preset) {
      return { primary: getCachedBackdropBitmap('mesh-gradient'), secondary: null };
    }
    return null;
  }, [customSlot, preset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const kind = activeCanvasKindRef.current;
    if (!kind) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = motionQuery.matches;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let columns: RainColumn[] = [];
    let nodes: StarNode[] = [];
    let elapsedSec = 12; // non-zero start so static/reduced-motion frame looks rich

    // Low-res offscreen buffer for 60fps integrated-graphics Nebula clouds
    const nebulaOffscreen = document.createElement('canvas');
    nebulaOffscreen.width = 144;
    nebulaOffscreen.height = 84;
    const nebulaCtx = nebulaOffscreen.getContext('2d');
    const nebulaImg = nebulaCtx
      ? nebulaCtx.createImageData(nebulaOffscreen.width, nebulaOffscreen.height)
      : null;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, window.innerWidth);
      height = Math.max(1, window.innerHeight);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      columns = createRainColumns(width, height);
      nodes = createStarNodes(width, height);
    };

    const drawBrailleRain = (dt: number) => {
      ctx.fillStyle = '#071310';
      ctx.fillRect(0, 0, width, height);

      // Subtle mid-tone emerald ambient wash so no pure-black void dominates
      const grad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.45,
        width * 0.05,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.72
      );
      grad.addColorStop(0, 'rgba(18, 68, 55, 0.36)');
      grad.addColorStop(1, 'rgba(7, 19, 16, 0.08)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const stepY = 17;
      for (let i = 0; i < columns.length; i++) {
        const col = columns[i];
        col.y += col.speedPx * dt;
        const wrapH = height + col.length * stepY;
        if (col.y > wrapH) col.y -= wrapH;

        const isNear = col.depth === 1;
        ctx.font = isNear
          ? '14px "JetBrains Mono", ui-monospace, monospace'
          : '12px "JetBrains Mono", ui-monospace, monospace';

        // Soft glowing lead micro-halo behind foreground droplets
        if (isNear && col.y >= -stepY && col.y <= height + stepY) {
          ctx.fillStyle = 'rgba(167, 243, 208, 0.20)';
          ctx.beginPath();
          ctx.arc(col.x, col.y, 7.5, 0, Math.PI * 2);
          ctx.fill();
        }

        const cascade = (col.seed & 1) === 0 ? BRAILLE_CASCADE : BRAILLE_CASCADE_ALT;
        const cascadeMax = cascade.length - 1;
        for (let k = 0; k < col.length; k++) {
          const py = col.y - k * stepY;
          if (py < -stepY || py > height + stepY) continue;
          const tailPos = k / Math.max(1, col.length - 1);
          const fade = Math.pow(1 - tailPos, 1.25);
          const baseAlpha = isNear ? 0.12 + fade * 0.32 : 0.07 + fade * 0.18;

          // Progressive Braille density decay down the trail with gentle shimmer
          const shimmerOffset =
            k === 0 && ((Math.floor(elapsedSec * 2.4 + col.seed) & 3) === 0) ? 1 : 0;
          const tierIdx = Math.min(
            cascadeMax,
            Math.max(0, Math.round(tailPos * cascadeMax) + shimmerOffset)
          );
          const glyph = cascade[tierIdx];

          ctx.fillStyle =
            k === 0
              ? `rgba(209, 250, 229, ${Math.min(0.54, baseAlpha + 0.11).toFixed(3)})`
              : isNear
              ? `rgba(110, 231, 183, ${baseAlpha.toFixed(3)})`
              : `rgba(52, 211, 153, ${baseAlpha.toFixed(3)})`;
          ctx.fillText(glyph, col.x, py);
        }
      }
    };

    const drawNebula = () => {
      if (!nebulaCtx || !nebulaImg) return;
      const nw = nebulaOffscreen.width;
      const nh = nebulaOffscreen.height;
      const data = nebulaImg.data;
      const slowDriftX = elapsedSec * 0.018;
      const slowDriftY = elapsedSec * 0.011;
      const fastDriftX = -elapsedSec * 0.029;
      const fastDriftY = elapsedSec * 0.016;

      for (let py = 0; py < nh; py++) {
        const ny = (py / nh) * 3.1;
        for (let px = 0; px < nw; px++) {
          const nx = (px / nw) * 3.6;
          const layerA = fbm2d(nx + slowDriftX, ny + slowDriftY);
          const layerB = fbm2d(nx * 1.4 + fastDriftX + 4.2, ny * 1.4 + fastDriftY - 2.1);
          const cloud = Math.max(0, Math.min(1, layerA * 0.58 + layerB * 0.42));

          const idx = (py * nw + px) * 4;
          // Controlled mid-dark emerald/slate/indigo palette (avoids pure #000 and #fff)
          data[idx] = Math.round(10 + cloud * 26);
          data[idx + 1] = Math.round(22 + cloud * 68);
          data[idx + 2] = Math.round(24 + cloud * 62 + layerB * 18);
          data[idx + 3] = 255;
        }
      }

      nebulaCtx.putImageData(nebulaImg, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(nebulaOffscreen, 0, 0, width, height);
    };

    const drawConstellation = (dt: number) => {
      ctx.fillStyle = '#071311';
      ctx.fillRect(0, 0, width, height);

      const glow = ctx.createRadialGradient(
        width * 0.35,
        height * 0.4,
        10,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.75
      );
      glow.addColorStop(0, 'rgba(18, 72, 58, 0.32)');
      glow.addColorStop(1, 'rgba(10, 26, 32, 0.14)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        if (n.x < -16) n.x = width + 16;
        else if (n.x > width + 16) n.x = -16;
        if (n.y < -16) n.y = height + 16;
        else if (n.y > height + 16) n.y = -16;
      }

      ctx.lineWidth = 1;
      const linkDistSq = 155 * 155;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < linkDistSq) {
            const strength = 1 - d2 / linkDistSq;
            ctx.strokeStyle = `rgba(110, 231, 183, ${(strength * 0.11).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        ctx.fillStyle = `rgba(167, 243, 208, ${n.alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const renderFrame = (dt: number) => {
      const activeKind = activeCanvasKindRef.current;
      if (activeKind === 'braille-rain') drawBrailleRain(dt);
      else if (activeKind === 'nebula') drawNebula();
      else if (activeKind === 'constellation-drift') drawConstellation(dt);
    };

    resize();
    // Always paint an immediate deterministic frame before rAF ticks
    renderFrame(0);

    let rafId = 0;
    let lastTs = 0;

    const tick = (ts: number) => {
      if (document.hidden || reducedMotion || !activeCanvasKindRef.current) {
        rafId = 0;
        return;
      }
      if (!lastTs) lastTs = ts;
      const dt = Math.min(0.05, Math.max(0, (ts - lastTs) / 1000));
      lastTs = ts;
      elapsedSec += dt;
      renderFrame(dt);
      rafId = window.requestAnimationFrame(tick);
    };

    const syncLoopState = () => {
      if (document.hidden || reducedMotion || !activeCanvasKindRef.current) {
        if (rafId) {
          window.cancelAnimationFrame(rafId);
          rafId = 0;
        }
        return;
      }
      if (!rafId) {
        lastTs = 0;
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const handleVisibility = () => syncLoopState();
    const handleMotionChange = (e: MediaQueryListEvent) => {
      reducedMotion = e.matches;
      renderFrame(0);
      syncLoopState();
    };

    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', handleVisibility);
    motionQuery.addEventListener('change', handleMotionChange);
    syncLoopState();

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', handleVisibility);
      motionQuery.removeEventListener('change', handleMotionChange);
    };
  }, [preset?.id, preset?.engine, customSlot]);

  // Keep custom video paused on reduced-motion or hidden tab
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || customSlot?.mediaType !== 'video') return;
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncVideo = () => {
      if (document.hidden || motionQuery.matches) {
        vid.pause();
      } else {
        void vid.play().catch(() => {});
      }
    };
    syncVideo();
    document.addEventListener('visibilitychange', syncVideo);
    motionQuery.addEventListener('change', syncVideo);
    return () => {
      document.removeEventListener('visibilitychange', syncVideo);
      motionQuery.removeEventListener('change', syncVideo);
    };
  }, [customSlot]);

  return (
    <div
      aria-hidden="true"
      data-testid="glass-background-layer"
      data-preset={customSlot ? `custom:${customSlot.id}` : activeId}
      className="fixed inset-0 -z-10 pointer-events-none overflow-hidden bg-[#050c0a]"
    >
      <div className="absolute inset-0">
        {customSlot ? (
          customSlot.mediaType === 'video' ? (
            <video
              ref={videoRef}
              src={customSlot.src}
              muted
              loop
              autoPlay
              playsInline
              className="w-full h-full object-cover glass-bg-layer-opacity"
            />
          ) : (
            <img
              src={customSlot.src}
              alt=""
              className="w-full h-full object-cover glass-bg-layer-opacity"
            />
          )
        ) : preset?.engine === 'canvas' ? (
          <canvas ref={canvasRef} className="block w-full h-full glass-bg-layer-opacity" />
        ) : preset?.id === 'aurora-drift' ? (
          <div className="glass-bg-aurora">
            <div
              className="glass-bg-aurora-layer"
              style={
                bitmapUrls?.primary
                  ? { backgroundImage: `url(${bitmapUrls.primary})`, backgroundSize: '100% 100%' }
                  : undefined
              }
            />
          </div>
        ) : preset?.id === 'scanline-shimmer' ? (
          <div className="glass-bg-scanline">
            <div className="glass-bg-scanline-band" />
          </div>
        ) : preset?.id === 'horizon-tide' ? (
          <div className="glass-bg-horizon">
            <div
              className="glass-bg-horizon-wave-a"
              style={
                bitmapUrls?.primary
                  ? { backgroundImage: `url(${bitmapUrls.primary})`, backgroundSize: '100% 100%' }
                  : undefined
              }
            />
            <div
              className="glass-bg-horizon-wave-b"
              style={
                bitmapUrls?.secondary
                  ? { backgroundImage: `url(${bitmapUrls.secondary})`, backgroundSize: '100% 100%' }
                  : undefined
              }
            />
          </div>
        ) : (
          <div className={preset?.cssClass ?? 'glass-bg-mesh'}>
            <div
              className="glass-bg-mesh-layer"
              style={
                bitmapUrls?.primary
                  ? { backgroundImage: `url(${bitmapUrls.primary})`, backgroundSize: '100% 100%' }
                  : undefined
              }
            />
          </div>
        )}
      </div>
    </div>
  );
});
