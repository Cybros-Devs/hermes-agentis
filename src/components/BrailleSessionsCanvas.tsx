import { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import type {
  ChannelId,
  HermesAgentSession,
  MouthViseme,
  TerminalEntry,
  VoiceState,
} from '../types/hermes';
import type { BrailleShapeKind, BrailleShapeTint } from '../utils/brailleShapesEngine';
import { clampCanvasPosition, type CanvasSession } from '../utils/canvasSessions';
import { AddSessionShapeModal } from './AddSessionShapeModal';
import { BrailleHorizonCanvas } from './BrailleHorizonCanvas';
import { CanvasSessionNode } from './CanvasSessionNode';

interface BrailleSessionsCanvasProps {
  sessions: CanvasSession[];
  hermesSessions: HermesAgentSession[];
  thinkingByChannel: Record<string, boolean>;
  speakingChannel: ChannelId | null;
  activeChannel: ChannelId;
  entries: TerminalEntry[];
  voiceState: VoiceState;
  viseme: MouthViseme;
  speedScale?: number;
  reducedMotionOverride?: boolean;
  onSelectSession: (session: CanvasSession) => void;
  onMoveSession: (id: string, xPct: number, yPct: number) => void;
  onAddSession: (payload: {
    name: string;
    topic: string;
    persona: string;
    shape: BrailleShapeKind;
    tint: BrailleShapeTint;
    eyeStyle: 'open' | 'sleepy';
  }) => void;
  onSubmitSessionMessage: (
    channelId: ChannelId,
    text: string,
    source: 'voice' | 'cli'
  ) => void;
  onToggleListening: () => void;
  onAutoArrange: () => void;
  onCycleSessionMood: (id: string) => void;
  onResetSession: (channelId: string) => void;
  onRemoveSession: (id: string) => void;
  onOpenSessionThread: (session: CanvasSession) => void;
}

export function BrailleSessionsCanvas({
  sessions,
  hermesSessions,
  thinkingByChannel,
  speakingChannel,
  activeChannel,
  entries,
  voiceState,
  viseme,
  speedScale = 1,
  reducedMotionOverride = false,
  onSelectSession,
  onMoveSession,
  onAddSession,
  onSubmitSessionMessage,
  onToggleListening,
  onAutoArrange,
  onCycleSessionMood,
  onResetSession,
  onRemoveSession,
  onOpenSessionThread,
}: BrailleSessionsCanvasProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const gazeRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const lookTargetRef = useRef<{ x: number; y: number } | null>(null);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [openChats, setOpenChats] = useState<Record<string, boolean>>({});
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

  const hermesByChannel = useMemo(() => {
    const map = new Map<string, HermesAgentSession>();
    for (const hs of hermesSessions) {
      map.set(hs.channelId, hs);
    }
    return map;
  }, [hermesSessions]);

  const entriesByChannel = useMemo(() => {
    const map = new Map<string, { entries: TerminalEntry[]; turnCount: number }>();
    for (const e of entries) {
      const bucket = map.get(e.channelId) ?? { entries: [], turnCount: 0 };
      bucket.entries.push(e);
      if (e.role === 'user' || e.role === 'command') {
        bucket.turnCount += 1;
      }
      map.set(e.channelId, bucket);
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
      setOpenChats((prev) => ({
        ...prev,
        [session.channelId]: !prev[session.channelId],
      }));
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

  const runningCount = sessions.filter((s) => Boolean(thinkingByChannel[s.channelId])).length;

  return (
    <div
      ref={stageRef}
      data-testid="braille-sessions-canvas"
      onPointerMove={handleStagePointerMove}
      onPointerLeave={handleStagePointerLeave}
      className="ui-view-enter relative flex-1 min-h-0 flex flex-col justify-between overflow-hidden select-none"
    >
      {/* Subtle Dot-Matrix Floor */}
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
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[42%] opacity-75"
        style={{
          background:
            'radial-gradient(ellipse 115% 85% at 50% 100%, rgba(18, 88, 68, 0.34) 0%, rgba(10, 28, 23, 0.14) 55%, transparent 82%)',
        }}
      />

      {/* Flowing Braille Wave Horizon along lower floor */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[112px] opacity-30 sm:opacity-60">
        <BrailleHorizonCanvas
          energy={activeSpeechEnergy}
          isActive={voiceState.isSpeaking || voiceState.isListening}
          frequencyBands={voiceState.frequencyBands}
          lookTargetRef={lookTargetRef}
          speedScale={speedScale}
          reducedMotionOverride={reducedMotionOverride}
        />
      </div>

      {/* Minimal Top Canvas Header & + Add Primary Action */}
      <div className="relative z-20 flex items-center justify-between gap-3 px-4 sm:px-6 pt-3 pb-2 shrink-0">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <h1 className="text-sm sm:text-base font-semibold text-white tracking-tight truncate">
            Hermes Sessions
          </h1>
          <span className="font-mono text-[11px] text-emerald-100/50 tabular-nums whitespace-nowrap">
            {sessions.length} parallel{runningCount > 0 ? ` · ${runningCount} running` : ''}
          </span>
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

      {/* Spatial Parallel Sessions Stage (2-col mobile grid, free spatial drag on sm+) */}
      <div className="relative z-10 flex-1 min-h-0 w-full overflow-y-auto sm:overflow-hidden cyber-scroll grid grid-cols-2 items-start justify-items-center gap-x-2.5 gap-y-5 px-3 pb-24 pt-1 sm:block sm:p-0">
        {/* Subtle Constellation Connection Filaments on sm+ */}
        <svg
          aria-hidden="true"
          className="hidden sm:block pointer-events-none absolute inset-0 w-full h-full z-0"
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
                    stroke="rgba(110, 231, 183, 0.14)"
                    strokeWidth="1"
                    strokeDasharray="4 6"
                    className="ui-constellation-line"
                  />
                );
              })}
        </svg>

        {sessions.length === 0 ? (
          <div className="sm:absolute sm:inset-0 flex flex-col items-center justify-center gap-3 text-center px-6 py-12">
            <p className="text-sm text-emerald-100/70">
              No isolated hermes-agent sessions on this canvas yet.
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
            const isChatOpen = Boolean(openChats[session.channelId]);
            const serverSession = hermesByChannel.get(session.channelId);
            const bucket = entriesByChannel.get(session.channelId);
            const isThinkingHere =
              Boolean(thinkingByChannel[session.channelId]) ||
              serverSession?.status === 'thinking';
            const isSpeakingHere =
              voiceState.isSpeaking &&
              (speakingChannel ?? activeChannel) === session.channelId;
            const isListeningHere =
              voiceState.isListening && session.channelId === activeChannel;
            const turnCount = Math.max(
              bucket?.turnCount ?? 0,
              serverSession?.turnCount ?? 0
            );

            return (
              <CanvasSessionNode
                key={session.id}
                session={session}
                index={idx}
                livePos={livePos}
                isSelected={isSelected}
                isChatOpen={isChatOpen}
                isDragged={isDragged}
                isThinking={isThinkingHere}
                isSpeaking={isSpeakingHere}
                isListeningHere={isListeningHere}
                viseme={viseme}
                energy={activeSpeechEnergy}
                entries={bucket?.entries ?? []}
                turnCount={turnCount}
                canRemove={sessions.length > 1}
                speedScale={speedScale}
                reducedMotionOverride={reducedMotionOverride}
                gazeRef={gazeRef}
                onPointerDown={(e) => handleCreaturePointerDown(e, session)}
                onPointerUp={(e) => handleCreaturePointerUp(e, session)}
                onKeyDown={(e) => handleCreatureKeyDown(e, session)}
                onSelect={() => onSelectSession(session)}
                onToggleChat={() => {
                  onSelectSession(session);
                  setOpenChats((prev) => ({
                    ...prev,
                    [session.channelId]: !prev[session.channelId],
                  }));
                }}
                onSendMessage={(text) => {
                  setOpenChats((prev) => ({
                    ...prev,
                    [session.channelId]: true,
                  }));
                  onSubmitSessionMessage(
                    session.channelId,
                    text,
                    text.startsWith('/') ? 'cli' : 'voice'
                  );
                }}
                onToggleVoice={() => {
                  onSelectSession(session);
                  onToggleListening();
                }}
                onCycleMood={() => onCycleSessionMood(session.id)}
                onResetSession={() => onResetSession(session.channelId)}
                onOpenThread={() => onOpenSessionThread(session)}
                onRemoveSession={() => onRemoveSession(session.id)}
              />
            );
          })
        )}
      </div>

      <AddSessionShapeModal
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onCreate={(payload) => {
          onAddSession(payload);
        }}
      />
    </div>
  );
}
