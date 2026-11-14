import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  LayoutGrid,
  MessageSquareText,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  ChannelId,
  ExpressionMood,
  MouthViseme,
  TerminalEntry,
  VoiceState,
} from '../types/hermes';
import {
  BRAILLE_TINT_PALETTE,
  type BrailleShapeKind,
  type BrailleShapeTint,
} from '../utils/brailleShapesEngine';
import { clampCanvasPosition, type CanvasSession } from '../utils/canvasSessions';
import { AddSessionShapeModal } from './AddSessionShapeModal';
import { BrailleHorizonCanvas } from './BrailleHorizonCanvas';
import { BrailleShapeCanvas } from './BrailleShapeCanvas';
import { DecodedText } from './DecodedText';

interface BrailleSessionsCanvasProps {
  sessions: CanvasSession[];
  activeChannel: ChannelId;
  entries: TerminalEntry[];
  voiceState: VoiceState;
  viseme: MouthViseme;
  lastSpokenLine: string;
  onSelectSession: (session: CanvasSession) => void;
  onMoveSession: (id: string, xPct: number, yPct: number) => void;
  onAddSession: (payload: {
    name: string;
    topic: string;
    shape: BrailleShapeKind;
    tint: BrailleShapeTint;
    eyeStyle: 'open' | 'sleepy';
  }) => void;
  onAutoArrange: () => void;
  onCycleSessionMood: (id: string) => void;
  onRemoveSession: (id: string) => void;
  onOpenSessionThread: (session: CanvasSession) => void;
}

export function BrailleSessionsCanvas({
  sessions,
  activeChannel,
  entries,
  voiceState,
  viseme,
  lastSpokenLine,
  onSelectSession,
  onMoveSession,
  onAddSession,
  onAutoArrange,
  onCycleSessionMood,
  onRemoveSession,
  onOpenSessionThread,
}: BrailleSessionsCanvasProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const gazeRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const lookTargetRef = useRef<{ x: number; y: number } | null>(null);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<{ id: string; xPct: number; yPct: number } | null>(
    null
  );

  const dragMetaRef = useRef<{
    id: string;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    origXPct: number;
    origYPct: number;
    moved: boolean;
  } | null>(null);

  const selectedSession = useMemo(
    () => sessions.find((s) => s.channelId === activeChannel) ?? sessions[0] ?? null,
    [sessions, activeChannel]
  );

  const latestByChannel = useMemo(() => {
    const map = new Map<string, string>();
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      if (e.role === 'hermes' && e.text.trim() && !map.has(e.channelId)) {
        map.set(e.channelId, e.text.trim());
      }
    }
    return map;
  }, [entries]);

  useEffect(() => {
    const onWindowPointerUp = () => {
      if (dragMetaRef.current) {
        dragMetaRef.current = null;
        setDraggingId(null);
        setDragPreview(null);
      }
    };
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerUp);
    return () => {
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerUp);
    };
  }, []);

  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    gazeRef.current = { clientX: e.clientX, clientY: e.clientY };

    const rect = stageRef.current?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) {
      lookTargetRef.current = {
        x: Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1)),
        y: Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height) * 2 - 1)),
      };
    }

    const drag = dragMetaRef.current;
    if (!drag || !rect || rect.width <= 0 || rect.height <= 0) return;

    const dxPx = e.clientX - drag.startClientX;
    const dyPx = e.clientY - drag.startClientY;
    if (!drag.moved && Math.hypot(dxPx, dyPx) >= 5) {
      drag.moved = true;
      setDraggingId(drag.id);
    }

    if (drag.moved) {
      const nextRawX = drag.origXPct + (dxPx / rect.width) * 100;
      const nextRawY = drag.origYPct + (dyPx / rect.height) * 100;
      const clamped = clampCanvasPosition(nextRawX, nextRawY);
      setDragPreview({ id: drag.id, ...clamped });
    }
  };

  const handleStagePointerLeave = () => {
    gazeRef.current = null;
    lookTargetRef.current = null;
  };

  const handleCreaturePointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    session: CanvasSession
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragMetaRef.current = {
      id: session.id,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origXPct: session.xPct,
      origYPct: session.yPct,
      moved: false,
    };
  };

  const handleCreaturePointerUp = (
    e: React.PointerEvent<HTMLButtonElement>,
    session: CanvasSession
  ) => {
    const drag = dragMetaRef.current;
    if (!drag || drag.id !== session.id) return;
    e.stopPropagation();
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore if already released
    }

    if (drag.moved && dragPreview && dragPreview.id === session.id) {
      onMoveSession(session.id, dragPreview.xPct, dragPreview.yPct);
    } else {
      onSelectSession(session);
    }
    dragMetaRef.current = null;
    setDraggingId(null);
    setDragPreview(null);
  };

  const handleCreatureKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    session: CanvasSession
  ) => {
    const step = e.shiftKey ? 6 : 2.5;
    let dx = 0;
    let dy = 0;
    if (e.key === 'ArrowLeft') dx = -step;
    else if (e.key === 'ArrowRight') dx = step;
    else if (e.key === 'ArrowUp') dy = -step;
    else if (e.key === 'ArrowDown') dy = step;
    else return;

    e.preventDefault();
    const clamped = clampCanvasPosition(session.xPct + dx, session.yPct + dy);
    onMoveSession(session.id, clamped.xPct, clamped.yPct);
  };

  const activeSpeechEnergy = voiceState.isSpeaking
    ? Math.max(0.2, voiceState.outputLevel)
    : voiceState.isListening
    ? Math.max(0.15, voiceState.inputLevel)
    : 0.08;

  const selectedReplyText = selectedSession
    ? latestByChannel.get(selectedSession.channelId) ??
      (selectedSession.channelId === activeChannel ? lastSpokenLine : selectedSession.topic)
    : '';

  return (
    <div
      ref={stageRef}
      data-testid="braille-sessions-canvas"
      onPointerMove={handleStagePointerMove}
      onPointerLeave={handleStagePointerLeave}
      className="relative flex-1 min-h-0 flex flex-col justify-between overflow-hidden select-none"
    >
      {/* Immersive Dots-inspired Smoked-Emerald Horizon & Subtle Dot-Matrix Floor */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(167, 243, 208, 0.08) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          maskImage: 'radial-gradient(ellipse 85% 78% at 50% 48%, black 35%, transparent 100%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 85% 78% at 50% 48%, black 35%, transparent 100%)',
        }}
      />

      {/* Rolling Horizon Ground Plane */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[44%] opacity-75"
        style={{
          background:
            'radial-gradient(ellipse 115% 85% at 50% 100%, rgba(18, 88, 68, 0.34) 0%, rgba(10, 28, 23, 0.14) 55%, transparent 82%)',
        }}
      />

      {/* Flowing Braille Wave Horizon along lower floor */}
      <div className="pointer-events-none absolute inset-x-0 bottom-14 h-[140px] opacity-65">
        <BrailleHorizonCanvas
          energy={activeSpeechEnergy}
          isActive={voiceState.isSpeaking || voiceState.isListening}
          frequencyBands={voiceState.frequencyBands}
          lookTargetRef={lookTargetRef}
        />
      </div>

      {/* Top Canvas Header & + Add Primary Action */}
      <div className="relative z-20 flex items-center justify-between gap-3 px-4 sm:px-6 pt-3 pb-2 shrink-0">
        <div className="min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2.5">
            <h1 className="text-sm sm:text-lg font-semibold text-white tracking-tight truncate">
              Braille Sessions Canvas
            </h1>
            <span className="font-mono text-[11px] sm:text-xs text-emerald-100/55 tabular-nums whitespace-nowrap">
              {sessions.length} active
              <span className="hidden sm:inline"> · drag to arrange</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onAutoArrange}
            aria-label="Auto arrange sessions on canvas"
            className="px-3 py-1.5 rounded-lg border border-white/12 bg-white/[0.04] hover:bg-white/[0.09] hover:border-white/25 text-xs font-medium text-emerald-50/85 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Arrange</span>
          </button>

          <button
            type="button"
            onClick={() => setIsAddOpen(true)}
            data-testid="canvas-add-button"
            className="px-3.5 py-1.5 rounded-lg bg-[#34D399] hover:bg-[#6EE7B7] text-[#05140E] text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>+ Add</span>
          </button>
        </div>
      </div>

      {/* Spatial Constellation Stage */}
      <div className="relative flex-1 min-h-0 w-full">
        {/* Subtle Constellation Connection Filaments */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 w-full h-full z-0"
          preserveAspectRatio="none"
        >
          {selectedSession &&
            sessions
              .filter((s) => s.id !== selectedSession.id)
              .map((other) => {
                const sPos =
                  dragPreview && dragPreview.id === selectedSession.id
                    ? dragPreview
                    : selectedSession;
                const oPos =
                  dragPreview && dragPreview.id === other.id ? dragPreview : other;
                return (
                  <line
                    key={other.id}
                    x1={`${sPos.xPct}%`}
                    y1={`${sPos.yPct}%`}
                    x2={`${oPos.xPct}%`}
                    y2={`${oPos.yPct}%`}
                    stroke="rgba(110, 231, 183, 0.10)"
                    strokeWidth="1"
                    strokeDasharray="3 5"
                  />
                );
              })}
        </svg>

        {sessions.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6">
            <p className="text-sm text-emerald-100/70">
              No Braille sessions on this canvas yet.
            </p>
            <button
              type="button"
              onClick={() => setIsAddOpen(true)}
              className="px-4 py-2 rounded-lg bg-[#34D399] text-[#05140E] text-xs font-semibold cursor-pointer"
            >
              + Add first session
            </button>
          </div>
        ) : (
          sessions.map((session, idx) => {
            const isDragged = draggingId === session.id;
            const livePos =
              dragPreview && dragPreview.id === session.id
                ? dragPreview
                : { xPct: session.xPct, yPct: session.yPct };

            const isSelected = session.channelId === activeChannel;
            const isSpeakingHere = isSelected && voiceState.isSpeaking;
            const isThinkingHere = isSelected && voiceState.isThinking;
            const palette = BRAILLE_TINT_PALETTE[session.tint];

            const effectiveMood: ExpressionMood = isThinkingHere
              ? 'thinking'
              : isSpeakingHere
              ? 'speaking'
              : session.mood;

            return (
              <div
                key={session.id}
                data-testid={`canvas-session-${session.channelId}`}
                data-shape={session.shape}
                data-x={livePos.xPct}
                data-y={livePos.yPct}
                style={{
                  left: `${livePos.xPct}%`,
                  top: `${livePos.yPct}%`,
                  zIndex: isDragged ? 30 : isSelected ? 20 : 10,
                }}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center touch-none"
              >
                <button
                  type="button"
                  onPointerDown={(e) => handleCreaturePointerDown(e, session)}
                  onPointerUp={(e) => handleCreaturePointerUp(e, session)}
                  onDoubleClick={() => onOpenSessionThread(session)}
                  onKeyDown={(e) => handleCreatureKeyDown(e, session)}
                  aria-label={`Session #${session.name}, ${session.shape} shape, ${effectiveMood} mood. Drag to move or press Enter to focus.`}
                  aria-pressed={isSelected}
                  className={`group relative flex flex-col items-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#34D399] rounded-2xl transition-transform duration-150 ${
                    isDragged
                      ? 'scale-110 -translate-y-2 cursor-grabbing'
                      : isSelected
                      ? 'scale-105 cursor-grab hover:scale-110'
                      : 'cursor-grab hover:scale-105'
                  }`}
                >
                  {/* Ambient Soft Tint Halo when active/selected */}
                  <div
                    aria-hidden="true"
                    className={`pointer-events-none absolute -inset-3 rounded-full transition-opacity duration-200 ${
                      isSelected || isDragged ? 'opacity-100' : 'opacity-0 group-hover:opacity-70'
                    }`}
                    style={{
                      background: `radial-gradient(circle, ${palette.glow} 0%, transparent 72%)`,
                    }}
                  />

                  <div className="relative z-10 scale-[0.76] sm:scale-100 origin-bottom">
                    <BrailleShapeCanvas
                      shape={session.shape}
                      tint={session.tint}
                      mood={effectiveMood}
                      eyeStyle={session.eyeStyle}
                      viseme={isSpeakingHere ? viseme : 'closed'}
                      energy={isSpeakingHere ? activeSpeechEnergy : 0.08}
                      isSpeaking={isSpeakingHere}
                      isThinking={isThinkingHere}
                      isDragging={isDragged}
                      blinkPhaseOffset={idx * 1.15}
                      gazeRef={gazeRef}
                    />
                  </div>

                  {/* Soft Ground Contact Shadow matching Dots reference */}
                  <div
                    aria-hidden="true"
                    className={`pointer-events-none rounded-full transition-all duration-150 -mt-1 ${
                      isDragged ? 'w-14 h-2 opacity-35 blur-[3px]' : 'w-20 h-3 opacity-60 blur-[2px]'
                    }`}
                    style={{
                      background:
                        'radial-gradient(ellipse at center, rgba(0, 0, 0, 0.72) 0%, transparent 75%)',
                    }}
                  />

                  {/* Crisp Unboxed Session Label */}
                  <div className="relative z-10 mt-1.5 flex items-center gap-1.5 text-xs whitespace-nowrap">
                    <span
                      className={`font-mono font-semibold ${
                        isSelected ? 'text-white' : 'text-emerald-50/85 group-hover:text-white'
                      }`}
                    >
                      #{session.name}
                    </span>
                    {(isSpeakingHere || isThinkingHere) && (
                      <span
                        className="font-mono text-[10.5px]"
                        style={{ color: palette.mid }}
                      >
                        · {isSpeakingHere ? 'speaking' : 'thinking'}
                      </span>
                    )}
                  </div>
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Selected Session Inspector Dock (Zero-pill clean footer strip) */}
      {selectedSession && (
        <div className="relative z-20 mx-4 sm:mx-8 mb-1 px-4 py-2.5 rounded-xl bg-[#07120F]/82 border border-white/10 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-emerald-100/60">
              <span className="font-mono font-semibold text-white">
                #{selectedSession.name}
              </span>
              <span aria-hidden="true">·</span>
              <span className="capitalize">{selectedSession.shape}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-[11px]">{selectedSession.mood}</span>
            </div>
            <p className="text-xs text-emerald-50/85 truncate mt-0.5">
              <DecodedText text={selectedReplyText} animate={false} />
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onCycleSessionMood(selectedSession.id)}
              className="px-2.5 py-1.5 rounded-lg border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] text-xs text-emerald-50/85 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Mood</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenSessionThread(selectedSession)}
              className="px-2.5 py-1.5 rounded-lg border border-[#34D399]/40 bg-[#34D399]/12 hover:bg-[#34D399]/22 text-xs font-medium text-[#6EE7B7] flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <MessageSquareText className="w-3.5 h-3.5" />
              <span>Open Thread</span>
            </button>

            {sessions.length > 1 && !selectedSession.isCore && (
              <button
                type="button"
                onClick={() => onRemoveSession(selectedSession.id)}
                aria-label={`Remove session #${selectedSession.name}`}
                className="w-8 h-8 rounded-lg border border-white/12 bg-white/[0.04] hover:border-rose-400/50 hover:bg-rose-500/15 text-emerald-100/60 hover:text-rose-200 flex items-center justify-center transition-colors cursor-pointer shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      <AddSessionShapeModal
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onCreate={onAddSession}
      />
    </div>
  );
}
