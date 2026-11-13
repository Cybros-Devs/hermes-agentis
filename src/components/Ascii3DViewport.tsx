import { useEffect, useRef } from 'react';
import type { ExpressionMood, EyeState, MouthViseme, PhosphorTheme } from '../types/hermes';
import {
  getPaletteColors,
  projectBasisAxes,
  renderAscii3DFrame,
  type AsciiShaderMode,
} from '../utils/ascii3dEngine';

interface Ascii3DViewportProps {
  mood: ExpressionMood;
  viseme: MouthViseme;
  eyeState: EyeState;
  energy: number;
  bands: number[];
  isSpeaking: boolean;
  isListening: boolean;
  phosphor: PhosphorTheme;
  shaderMode: AsciiShaderMode;
  autoOrbit: boolean;
  yaw: number;
  pitch: number;
  zoom: number;
  onCameraChange: (next: { yaw: number; pitch: number; zoom: number }) => void;
}

const COLS = 72;
const ROWS = 34;

export function Ascii3DViewport({
  mood,
  viseme,
  eyeState,
  energy,
  bands,
  isSpeaking,
  isListening,
  phosphor,
  shaderMode,
  autoOrbit,
  yaw,
  pitch,
  zoom,
  onCameraChange,
}: Ascii3DViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ active: boolean; x: number; y: number; yaw: number; pitch: number }>({
    active: false,
    x: 0,
    y: 0,
    yaw: 0,
    pitch: 0,
  });

  const stateRef = useRef({
    mood,
    viseme,
    eyeState,
    energy,
    bands,
    isSpeaking,
    isListening,
    phosphor,
    shaderMode,
    autoOrbit,
    yaw,
    pitch,
    zoom,
  });
  stateRef.current = {
    mood,
    viseme,
    eyeState,
    energy,
    bands,
    isSpeaking,
    isListening,
    phosphor,
    shaderMode,
    autoOrbit,
    yaw,
    pitch,
    zoom,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = 368;
    const height = 280;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cellW = width / COLS;
    const cellH = height / ROWS;
    const startTime = performance.now();

    const drawFrame = () => {
      const s = stateRef.current;
      const elapsed = (performance.now() - startTime) / 1000;
      const orbitOffset = s.autoOrbit ? Math.sin(elapsed * 0.65) * 0.24 : 0;
      const effectiveYaw = s.yaw + orbitOffset;
      const effectivePitch = s.pitch + (s.autoOrbit ? Math.cos(elapsed * 0.5) * 0.06 : 0);

      const frame = renderAscii3DFrame({
        cols: COLS,
        rows: ROWS,
        time: elapsed,
        yaw: effectiveYaw,
        pitch: effectivePitch,
        zoom: s.zoom,
        mood: s.mood,
        viseme: s.viseme,
        eyeState: s.eyeState,
        energy: s.energy,
        bands: s.bands,
        isSpeaking: s.isSpeaking,
        isListening: s.isListening,
        shaderMode: s.shaderMode,
      });

      const palette = getPaletteColors(s.phosphor);

      ctx.fillStyle = '#050609';
      ctx.fillRect(0, 0, width, height);

      ctx.font = '600 8.1px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const emissiveIndices: number[] = [];

      // Pass A: Crisp non-emissive 3D ASCII geometry & floor grid
      ctx.shadowBlur = 0;
      for (let r = 0; r < frame.rows; r++) {
        const y = r * cellH + cellH * 0.52;
        for (let c = 0; c < frame.cols; c++) {
          const idx = r * frame.cols + c;
          const cell = frame.cells[idx];
          if (cell.ch === ' ') continue;

          if (
            cell.material === 'eye' ||
            cell.material === 'visor' ||
            cell.material === 'orb' ||
            cell.material === 'pulse'
          ) {
            emissiveIndices.push(idx);
            continue;
          }

          const x = c * cellW + cellW * 0.5;
          let color = palette.primary;
          let alpha = cell.intensity;

          if (cell.rgb) {
            color = cell.rgb;
            alpha = 0.94;
          } else if (cell.material === 'mouth') {
            color = palette.bright;
            alpha = 0.96;
          } else if (cell.material === 'ring' || cell.material === 'pillar') {
            color = palette.accent;
            alpha = Math.min(1, 0.36 + cell.intensity * 0.64);
          } else if (cell.material === 'grid') {
            color = palette.dim;
            alpha = Math.min(0.88, cell.intensity * 1.18);
          } else if (cell.isEdge) {
            color = palette.bright;
            alpha = 0.92;
          } else if (cell.material === 'hair') {
            color = palette.primary;
            alpha = Math.min(0.88, 0.24 + cell.intensity * 0.62);
          } else if (cell.material === 'wing') {
            color = cell.intensity > 0.7 ? palette.bright : palette.primary;
            alpha = Math.min(1, 0.38 + cell.intensity * 0.62);
          } else if (cell.material === 'bg') {
            color = palette.dim;
            alpha = cell.intensity;
          } else {
            color = cell.intensity > 0.78 ? palette.bright : palette.primary;
            alpha = Math.min(1, 0.24 + cell.intensity * 0.76);
          }

          ctx.globalAlpha = alpha;
          ctx.fillStyle = color;
          ctx.fillText(cell.ch, x, y);
        }
      }

      // Pass B: Selective HDR Emissive Bloom for Eyes, Visor, Orbital Prisms & Acoustic Pulse
      if (emissiveIndices.length > 0) {
        ctx.shadowColor = palette.accent;
        ctx.shadowBlur = 5;
        for (let i = 0; i < emissiveIndices.length; i++) {
          const idx = emissiveIndices[i];
          const r = Math.floor(idx / frame.cols);
          const c = idx % frame.cols;
          const cell = frame.cells[idx];
          const x = c * cellW + cellW * 0.5;
          const y = r * cellH + cellH * 0.52;

          ctx.globalAlpha = cell.material === 'pulse' ? Math.min(0.95, cell.intensity) : 1;
          ctx.fillStyle =
            cell.rgb ?? (cell.material === 'orb' ? palette.bright : palette.accent);
          ctx.fillText(cell.ch, x, y);
        }
        ctx.shadowBlur = 0;
      }

      // Pass C: Live 3D Orientation Gizmo (X/Y/Z Axis Tripod) in bottom-right corner
      const gx = width - 25;
      const gy = height - 23;
      const axisLen = 12;
      const axes = projectBasisAxes(effectiveYaw, effectivePitch);

      ctx.globalAlpha = 0.88;
      ctx.lineWidth = 1.25;
      ctx.font = '700 7.5px "JetBrains Mono", monospace';
      for (let i = 0; i < axes.length; i++) {
        const ax = axes[i];
        const ex = gx + ax.x * axisLen;
        const ey = gy + ax.y * axisLen;
        ctx.strokeStyle = ax.color;
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.lineTo(ex, ey);
        ctx.stroke();

        ctx.fillStyle = ax.color;
        ctx.fillText(ax.label, gx + ax.x * (axisLen + 5.5), gy + ax.y * (axisLen + 5.5));
      }

      ctx.fillStyle = '#E2E8F0';
      ctx.beginPath();
      ctx.arc(gx, gy, 1.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 1;
    };

    drawFrame();
    const timer = window.setInterval(drawFrame, 42);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="relative flex justify-center items-center select-none">
      <canvas
        ref={canvasRef}
        data-testid="ascii-3d-canvas"
        aria-label={`Interactive 3D ASCII viewport of Hermes, expression ${mood}, mouth ${viseme}, shader ${shaderMode}. Drag to orbit camera.`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragRef.current = {
            active: true,
            x: e.clientX,
            y: e.clientY,
            yaw,
            pitch,
          };
        }}
        onPointerMove={(e) => {
          if (!dragRef.current.active) return;
          const dx = e.clientX - dragRef.current.x;
          const dy = e.clientY - dragRef.current.y;
          const nextYaw = dragRef.current.yaw - dx * 0.012;
          const nextPitch = Math.max(-0.55, Math.min(0.55, dragRef.current.pitch + dy * 0.009));
          onCameraChange({ yaw: nextYaw, pitch: nextPitch, zoom });
        }}
        onPointerUp={() => {
          dragRef.current.active = false;
        }}
        onPointerCancel={() => {
          dragRef.current.active = false;
        }}
        onWheel={(e) => {
          e.preventDefault();
          const nextZoom = Math.max(0.75, Math.min(1.5, zoom - e.deltaY * 0.001));
          onCameraChange({ yaw, pitch, zoom: nextZoom });
        }}
        className="w-full max-w-[368px] h-[280px] rounded-lg cursor-grab active:cursor-grabbing touch-none"
      />
    </div>
  );
}
