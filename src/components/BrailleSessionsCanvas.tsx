import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText,
  FolderGit2,
  LayoutGrid,
  Maximize2,
  Orbit,
  Pin,
  Sparkles,
  StickyNote,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  ApprovalCard,
  ChannelId,
  HermesAgentSession,
  MouthViseme,
  TerminalEntry,
  VoiceState,
} from '../types/hermes';
import type { BrailleDotProfile } from '../utils/brailleCanvasRaster';
import type { BrailleHorizonStyle } from '../utils/brailleFieldEngine';
import {
  CANVAS_ZOOM_BOUNDS,
  DEFAULT_CANVAS_VIEWPORT,
  arrangeSessionsFormation,
  clampCanvasPan,
  clampCanvasPosition,
  clampPinPosition,
  filterCanvasSessions,
  findOpenPinSpot,
  isDotAutonomous,
  zoomViewportAroundPoint,
  type CanvasFormationPreset,
  type CanvasPin,
  type CanvasPinKind,
  type CanvasSession,
  type CanvasSessionFilter,
  type CanvasViewport,
} from '../utils/canvasSessions';
import { AddSessionShapeModal, type CreateDotSessionPayload } from './AddSessionShapeModal';
import { BrailleHorizonCanvas } from './BrailleHorizonCanvas';
import { CanvasSessionNode } from './CanvasSessionNode';
import { EmptyState } from './ui';

interface BrailleSessionsCanvasProps {
  sessions: CanvasSession[];
  pins: CanvasPin[];
  hermesSessions: HermesAgentSession[];
  approvals?: ApprovalCard[];
  thinkingByChannel: Record<string, boolean>;
  speakingChannel: ChannelId | null;
  activeChannel: ChannelId;
  entries: TerminalEntry[];
  voiceState: VoiceState;
  viseme: MouthViseme;
  dotProfile?: BrailleDotProfile;
  bloom?: number;
  horizonStyle?: BrailleHorizonStyle;
  speedScale?: number;
  reducedMotionOverride?: boolean;
  onSelectSession: (session: CanvasSession) => void;
  onMoveSession: (id: string, xPct: number, yPct: number) => void;
  onAddSession: (payload: CreateDotSessionPayload) => void;
  onUpdateDotConfig?: (
    id: string,
    patch: Partial<Pick<CanvasSession, 'autonomyMode' | 'scheduleLabel' | 'autonomyPaused' | 'skills'>>
  ) => void;
  onAddPin: (pin: Omit<CanvasPin, 'id'>) => void;
  onMovePin: (id: string, xPct: number, yPct: number) => void;
  onRemovePin: (id: string) => void;
  onSubmitSessionMessage: (
    channelId: ChannelId,
    text: string,
    source: 'voice' | 'cli'
  ) => void;
  onToggleListening: () => void;
  onArrangeFormation: (formation: CanvasFormationPreset) => void;
  onCycleSessionMood: (id: string) => void;
  onResetSession: (channelId: string) => void;
  onRemoveSession: (id: string) => void;
  onOpenSessionThread: (session: CanvasSession) => void;
}

const PIN_ICON: Record<CanvasPinKind, typeof StickyNote> = {
  repo: FolderGit2,
  brief: FileText,
  note: StickyNote,
  skill: Sparkles,
};

export function BrailleSessionsCanvas({
  sessions,
  pins,
  hermesSessions,
  approvals = [],
  thinkingByChannel,
  speakingChannel,
  activeChannel,
  entries,
  voiceState,
  viseme,
  dotProfile = 'balanced',
  bloom = 0.75,
  horizonStyle = 'silk',
  speedScale = 1,
  reducedMotionOverride = false,
  onSelectSession,
  onMoveSession,
  onAddSession,
  onUpdateDotConfig,
  onAddPin,
  onMovePin,
  onRemovePin,
  onSubmitSessionMessage,
  onToggleListening,
  onArrangeFormation,
  onCycleSessionMood,
  onResetSession,
  onRemoveSession,
  onOpenSessionThread,
}: BrailleSessionsCanvasProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const gazeRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const lookTargetRef = useRef<{ x: number; y: number } | null>(null);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isPinComposerOpen, setIsPinComposerOpen] = useState(false);
  const [pinTitle, setPinTitle] = useState('');
  const [pinDetail, setPinDetail] = useState('');
  const [pinKind, setPinKind] = useState<CanvasPinKind>('note');
  const [filterMode, setFilterMode] = useState<CanvasSessionFilter>('chats');
  const [activeFormation, setActiveFormation] = useState<CanvasFormationPreset>('constellation');
  const [viewport, setViewport] = useState<CanvasViewport>(DEFAULT_CANVAS_VIEWPORT);
  const [isPanning, setIsPanning] = useState(false);

  const [openChats, setOpenChats] = useState<Record<string, boolean>>({});
  const [movedFilterPos, setMovedFilterPos] = useState<Record<string, { xPct: number; yPct: number }>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<{ id: string; xPct: number; yPct: number } | null>(
    null
  );
  const [dragPinPreview, setDragPinPreview] = useState<{ id: string; xPct: number; yPct: number } | null>(
    null
  );

  const dragMetaRef = useRef<{
    kind: 'session' | 'pin';
    id: string;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    origXPct: number;
    origYPct: number;
    moved: boolean;
  } | null>(null);

  const panMetaRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    origPanX: number;
    origPanY: number;
    moved: boolean;
  } | null>(null);

  const hermesByChannel = useMemo(() => {
    const map = new Map<string, HermesAgentSession>();
    for (const hs of hermesSessions) {
      map.set(hs.channelId, hs);
    }
    return map;
  }, [hermesSessions]);

  const hermesStatusMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const hs of hermesSessions) {
      map.set(hs.channelId, hs.status);
    }
    return map;
  }, [hermesSessions]);

  const pendingApprovalsByChannel = useMemo(() => {
    const map = new Map<string, number>();
    for (const card of approvals) {
      if (card.status === 'pending') {
        map.set(card.channelId, (map.get(card.channelId) ?? 0) + 1);
      }
    }
    return map;
  }, [approvals]);

  const chatSessions = useMemo(
    () =>
      filterCanvasSessions(
        sessions,
        'chats',
        thinkingByChannel,
        hermesStatusMap,
        hermesByChannel
      ),
    [sessions, thinkingByChannel, hermesStatusMap, hermesByChannel]
  );

  const effectiveFilterMode: CanvasSessionFilter =
    filterMode === 'chats' && sessions.length > 0 && chatSessions.length === 0
      ? 'all'
      : filterMode;

  const visibleSessions = useMemo(
    () =>
      effectiveFilterMode === 'chats'
        ? chatSessions
        : filterCanvasSessions(
            sessions,
            effectiveFilterMode,
            thinkingByChannel,
            hermesStatusMap,
            hermesByChannel
          ),
    [sessions, chatSessions, effectiveFilterMode, thinkingByChannel, hermesStatusMap, hermesByChannel]
  );

  const isFilteredSubset =
    effectiveFilterMode !== 'all' &&
    visibleSessions.length > 0 &&
    visibleSessions.length < sessions.length;

  const filterPosMap = useMemo(() => {
    if (!isFilteredSubset) return null;
    const arranged = arrangeSessionsFormation(visibleSessions, activeFormation);
    return new Map(arranged.map((s) => [s.id, { xPct: s.xPct, yPct: s.yPct }]));
  }, [isFilteredSubset, visibleSessions, activeFormation]);

  const resolveSessionPos = (session: CanvasSession): { xPct: number; yPct: number } => {
    if (dragPreview && dragPreview.id === session.id) {
      return { xPct: dragPreview.xPct, yPct: dragPreview.yPct };
    }
    if (isFilteredSubset) {
      return (
        movedFilterPos[session.id] ??
        filterPosMap?.get(session.id) ?? { xPct: session.xPct, yPct: session.yPct }
      );
    }
    return { xPct: session.xPct, yPct: session.yPct };
  };

  const compactNodes = visibleSessions.length > 6;
  const estRows =
    visibleSessions.length <= 6
      ? 2
      : Math.ceil(visibleSessions.length / (visibleSessions.length <= 9 ? 3 : 4));
  const minStagePx = estRows >= 3 ? estRows * 290 : undefined;

  const selectedSession = useMemo(
    () =>
      visibleSessions.find((s) => s.channelId === activeChannel) ??
      visibleSessions[0] ??
      sessions[0] ??
      null,
    [visibleSessions, sessions, activeChannel]
  );

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
        setDragPinPreview(null);
      }
      if (panMetaRef.current) {
        panMetaRef.current = null;
        setIsPanning(false);
      }
    };
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerUp);
    return () => {
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerUp);
    };
  }, []);

  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || typeof window === 'undefined' || window.innerWidth < 640) return;
    // Ignore clicks on interactive controls/inputs inside stage
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, input, textarea, form, [role="dialog"]')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    panMetaRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origPanX: viewport.panX,
      origPanY: viewport.panY,
      moved: false,
    };
  };

  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    gazeRef.current = { clientX: e.clientX, clientY: e.clientY };

    const rect = stageRef.current?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) {
      lookTargetRef.current = {
        x: Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1)),
        y: Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height) * 2 - 1)),
      };
    }

    const pan = panMetaRef.current;
    if (pan) {
      const dx = e.clientX - pan.startClientX;
      const dy = e.clientY - pan.startClientY;
      if (!pan.moved && Math.hypot(dx, dy) >= 4) {
        pan.moved = true;
        setIsPanning(true);
      }
      if (pan.moved) {
        const clamped = clampCanvasPan(pan.origPanX + dx, pan.origPanY + dy, viewport.zoom);
        setViewport((prev) => ({ ...prev, panX: clamped.panX, panY: clamped.panY }));
      }
      return;
    }

    const drag = dragMetaRef.current;
    if (!drag || !rect || rect.width <= 0 || rect.height <= 0) return;

    const dxPx = (e.clientX - drag.startClientX) / viewport.zoom;
    const dyPx = (e.clientY - drag.startClientY) / viewport.zoom;
    if (!drag.moved && Math.hypot(dxPx, dyPx) >= 5) {
      drag.moved = true;
      setDraggingId(drag.id);
    }

    if (drag.moved) {
      const nextRawX = drag.origXPct + (dxPx / rect.width) * 100;
      const nextRawY = drag.origYPct + (dyPx / rect.height) * 100;
      if (drag.kind === 'session') {
        const clamped = clampCanvasPosition(nextRawX, nextRawY);
        setDragPreview({ id: drag.id, ...clamped });
      } else {
        const clamped = clampPinPosition(nextRawX, nextRawY);
        setDragPinPreview({ id: drag.id, ...clamped });
      }
    }
  };

  const handleStagePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const pan = panMetaRef.current;
    if (pan) {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // ignore
      }
      panMetaRef.current = null;
      setIsPanning(false);
    }
  };

  const handleStagePointerLeave = () => {
    gazeRef.current = null;
    lookTargetRef.current = null;
  };

  const handleStageWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (typeof window !== 'undefined' && window.innerWidth < 640) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    const nextZoom = viewport.zoom * factor;
    setViewport((prev) =>
      zoomViewportAroundPoint(
        prev,
        nextZoom,
        e.clientX - rect.left,
        e.clientY - rect.top,
        rect.width,
        rect.height
      )
    );
  };

  const handleStepZoom = (delta: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    const w = rect?.width || 1000;
    const h = rect?.height || 640;
    setViewport((prev) =>
      zoomViewportAroundPoint(prev, prev.zoom + delta, w * 0.5, h * 0.5, w, h)
    );
  };

  const handleCreaturePointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    session: CanvasSession
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const startPos = resolveSessionPos(session);
    dragMetaRef.current = {
      kind: 'session',
      id: session.id,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origXPct: startPos.xPct,
      origYPct: startPos.yPct,
      moved: false,
    };
  };

  const handleCreaturePointerUp = (
    e: React.PointerEvent<HTMLButtonElement>,
    session: CanvasSession
  ) => {
    const drag = dragMetaRef.current;
    if (!drag || drag.kind !== 'session' || drag.id !== session.id) return;
    e.stopPropagation();
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore if already released
    }

    if (drag.moved && dragPreview && dragPreview.id === session.id) {
      if (isFilteredSubset) {
        setMovedFilterPos((prev) => ({
          ...prev,
          [session.id]: { xPct: dragPreview.xPct, yPct: dragPreview.yPct },
        }));
      }
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

  const handlePinPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    pin: CanvasPin
  ) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('button')) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragMetaRef.current = {
      kind: 'pin',
      id: pin.id,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origXPct: pin.xPct,
      origYPct: pin.yPct,
      moved: false,
    };
  };

  const handlePinPointerUp = (
    e: React.PointerEvent<HTMLDivElement>,
    pin: CanvasPin
  ) => {
    const drag = dragMetaRef.current;
    if (!drag || drag.kind !== 'pin' || drag.id !== pin.id) return;
    e.stopPropagation();
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }
    if (drag.moved && dragPinPreview && dragPinPreview.id === pin.id) {
      onMovePin(pin.id, dragPinPreview.xPct, dragPinPreview.yPct);
    }
    dragMetaRef.current = null;
    setDraggingId(null);
    setDragPinPreview(null);
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
    const cur = resolveSessionPos(session);
    const clamped = clampCanvasPosition(cur.xPct + dx, cur.yPct + dy);
    if (isFilteredSubset) {
      setMovedFilterPos((prev) => ({ ...prev, [session.id]: clamped }));
    }
    onMoveSession(session.id, clamped.xPct, clamped.yPct);
  };

  const handleDropPinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const title = pinTitle.trim();
    if (!title) return;
    const spot = findOpenPinSpot(sessions, pins);
    onAddPin({
      kind: pinKind,
      title,
      detail: pinDetail.trim() || `Shared spatial note linked to #${activeChannel}.`,
      meta: `Pinned · #${activeChannel}`,
      xPct: spot.xPct,
      yPct: spot.yPct,
      linkedChannelId: activeChannel,
    });
    setPinTitle('');
    setPinDetail('');
    setIsPinComposerOpen(false);
  };

  const activeSpeechEnergy = voiceState.isSpeaking
    ? Math.max(0.2, voiceState.outputLevel)
    : voiceState.isListening
    ? Math.max(0.15, voiceState.inputLevel)
    : 0.08;

  const runningCount = sessions.filter((s) => Boolean(thinkingByChannel[s.channelId])).length;
  const autonomousCount = sessions.filter((s) => isDotAutonomous(s)).length;
  const isViewportModified =
    Math.abs(viewport.zoom - 1) > 0.01 ||
    Math.abs(viewport.panX) > 2 ||
    Math.abs(viewport.panY) > 2;

  // Build deduplicated optical constellation edges (selected node star + explicit connectedTo collaborators)
  const constellationEdges = useMemo(() => {
    const byChannel = new Map(visibleSessions.map((s) => [s.channelId, s]));
    const edges: Array<{ key: string; a: CanvasSession; b: CanvasSession; kind: 'focus' | 'collab' }> = [];
    const seen = new Set<string>();

    for (const s of visibleSessions) {
      for (const targetCh of s.connectedTo ?? []) {
        const target = byChannel.get(targetCh);
        if (!target) continue;
        const pair = [s.channelId, target.channelId].sort().join('::');
        if (seen.has(pair)) continue;
        seen.add(pair);
        edges.push({ key: `collab-${pair}`, a: s, b: target, kind: 'collab' });
      }
    }

    if (selectedSession) {
      for (const other of visibleSessions) {
        if (other.id === selectedSession.id) continue;
        const pair = [selectedSession.channelId, other.channelId].sort().join('::');
        if (seen.has(pair)) continue;
        seen.add(pair);
        edges.push({ key: `focus-${pair}`, a: selectedSession, b: other, kind: 'focus' });
      }
    }

    return edges;
  }, [visibleSessions, selectedSession]);

  return (
    <div
      ref={stageRef}
      data-testid="braille-sessions-canvas"
      onPointerDown={handleStagePointerDown}
      onPointerMove={handleStagePointerMove}
      onPointerUp={handleStagePointerUp}
      onPointerLeave={handleStagePointerLeave}
      onWheel={handleStageWheel}
      className={`ui-view-enter relative flex-1 min-h-0 flex flex-col justify-between overflow-hidden select-none ${
        isPanning ? 'cursor-grabbing' : 'sm:cursor-grab'
      }`}
    >
      {/* Subtle Pan/Zoom Responsive Dot-Matrix Spatial Grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(167, 243, 208, 0.10) 1px, transparent 1px)',
          backgroundSize: `${Math.round(28 * viewport.zoom)}px ${Math.round(28 * viewport.zoom)}px`,
          backgroundPosition: `${Math.round(viewport.panX)}px ${Math.round(viewport.panY)}px`,
          maskImage: 'radial-gradient(ellipse 90% 84% at 50% 48%, black 42%, transparent 100%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 90% 84% at 50% 48%, black 42%, transparent 100%)',
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
          dotProfile={dotProfile}
          bloom={bloom}
          horizonStyle={horizonStyle}
          speedScale={speedScale}
          reducedMotionOverride={reducedMotionOverride}
        />
      </div>

      {/* Block Berd × OpenAI Dots Spatial Toolbar */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className="relative z-20 flex items-center justify-between gap-3 px-4 sm:px-6 pt-3 pb-2 shrink-0"
      >
        <div className="flex items-baseline gap-2.5 min-w-0">
          <h1 className="text-sm sm:text-base font-semibold text-white tracking-tight truncate">
            Hermes Dots
          </h1>
          <span className="font-mono text-[11px] text-emerald-100/55 tabular-nums whitespace-nowrap">
            {sessions.length} {sessions.length === 1 ? 'dot' : 'dots'}
            {autonomousCount > 0 ? ` · ${autonomousCount} auto` : ''}
            {runningCount > 0 ? ` · ${runningCount} running` : ''}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {sessions.length > 0 && (
            <>
              {/* Status Filter Segment (Chats | All | Auto | Live) */}
              <div className="hidden sm:flex items-center p-0.5 rounded-lg border border-white/10 bg-white/[0.03]">
                {(
                  [
                    { id: 'chats', label: `Chats ${chatSessions.length}` },
                    { id: 'all', label: `All ${sessions.length}` },
                    { id: 'autonomous', label: 'Auto' },
                    { id: 'live', label: 'Live' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    data-testid={`canvas-filter-${opt.id}`}
                    onClick={() => {
                      setMovedFilterPos({});
                      setFilterMode(opt.id);
                    }}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium tabular-nums transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      effectiveFilterMode === opt.id
                        ? 'bg-[#34D399]/18 text-[#6EE7B7]'
                        : 'text-emerald-100/60 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Formation Switcher (Constellation | Orbit | Grid) */}
              <div className="hidden md:flex items-center p-0.5 rounded-lg border border-white/10 bg-white/[0.03]">
                {(
                  [
                    { id: 'constellation', label: 'Constellation', icon: Sparkles },
                    { id: 'orbit', label: 'Orbit', icon: Orbit },
                    { id: 'grid', label: 'Grid', icon: LayoutGrid },
                  ] as const
                ).map((fmt) => {
                  const Icon = fmt.icon;
                  const active = activeFormation === fmt.id;
                  return (
                    <button
                      key={fmt.id}
                      type="button"
                      data-testid={`canvas-arrange-${fmt.id}`}
                      onClick={() => {
                        setMovedFilterPos({});
                        setActiveFormation(fmt.id);
                        onArrangeFormation(fmt.id);
                      }}
                      aria-label={`Arrange dots in ${fmt.label} formation`}
                      className={`px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-white/12 text-white'
                          : 'text-emerald-100/60 hover:text-white'
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      <span>{fmt.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Mobile/Compact Arrange Button */}
              <button
                type="button"
                onClick={() => {
                  setMovedFilterPos({});
                  onArrangeFormation(activeFormation);
                }}
                aria-label="Auto arrange sessions on canvas"
                className="md:hidden ui-tactile px-2.5 py-1.5 rounded-lg border border-white/12 bg-white/[0.04] hover:bg-white/[0.09] text-xs font-medium text-emerald-50/85 hover:text-white flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>

              {/* Pan & Zoom Controls (sm+) */}
              <div className="hidden sm:flex items-center rounded-lg border border-white/10 bg-white/[0.03] px-1 py-0.5 gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleStepZoom(-CANVAS_ZOOM_BOUNDS.step)}
                  aria-label="Zoom out canvas"
                  title="Zoom out"
                  className="p-1 rounded text-emerald-100/65 hover:text-white hover:bg-white/8 transition-colors cursor-pointer shrink-0"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  data-testid="canvas-zoom-reset"
                  onClick={() => setViewport(DEFAULT_CANVAS_VIEWPORT)}
                  aria-label="Reset canvas pan and zoom"
                  title="Reset view to 100%"
                  className={`px-1.5 py-0.5 rounded font-mono text-[10.5px] tabular-nums transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    isViewportModified
                      ? 'text-[#6EE7B7] hover:bg-white/8'
                      : 'text-emerald-100/65 hover:text-white'
                  }`}
                >
                  {Math.round(viewport.zoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => handleStepZoom(CANVAS_ZOOM_BOUNDS.step)}
                  aria-label="Zoom in canvas"
                  title="Zoom in"
                  className="p-1 rounded text-emerald-100/65 hover:text-white hover:bg-white/8 transition-colors cursor-pointer shrink-0"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}

          {/* Drop Workspace Pin (sm+) */}
          <button
            type="button"
            data-testid="canvas-add-pin-btn"
            onClick={() => setIsPinComposerOpen((prev) => !prev)}
            aria-expanded={isPinComposerOpen}
            className={`hidden sm:inline-flex ui-tactile px-2.5 py-1.5 rounded-lg border text-xs font-medium items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
              isPinComposerOpen
                ? 'border-[#34D399]/55 bg-[#34D399]/16 text-[#6EE7B7]'
                : 'border-white/12 bg-white/[0.04] hover:bg-white/[0.09] text-emerald-50/85 hover:text-white'
            }`}
          >
            <Pin className="w-3 h-3" />
            <span>Pin</span>
          </button>

          <button
            type="button"
            onClick={() => setIsAddOpen(true)}
            data-testid="canvas-add-button"
            className="ui-tactile px-3 py-1.5 rounded-lg border border-[#34D399]/45 bg-[#34D399]/14 hover:bg-[#34D399] hover:text-[#05140E] text-[#6EE7B7] text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>+ Add</span>
          </button>
        </div>
      </div>

      {/* Inline Quick Pin Bar (Block Berd spatial notes / briefs / repo anchors) */}
      {isPinComposerOpen && (
        <form
          onSubmit={handleDropPinSubmit}
          onPointerDown={(e) => e.stopPropagation()}
          data-testid="canvas-pin-composer"
          className="relative z-20 mx-4 sm:mx-6 mb-1 px-3 py-2 rounded-xl border border-[#34D399]/30 bg-[#07130F]/95 flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0"
        >
          <div className="flex items-center gap-1">
            {(['note', 'repo', 'brief'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setPinKind(k)}
                className={`px-2 py-1 rounded text-[11px] font-medium capitalize cursor-pointer whitespace-nowrap shrink-0 ${
                  pinKind === k
                    ? 'bg-[#34D399] text-[#05140E] font-semibold'
                    : 'bg-white/[0.05] text-emerald-100/70 hover:text-white'
                }`}
              >
                {k}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={pinTitle}
            onChange={(e) => setPinTitle(e.target.value)}
            placeholder="Pin title (e.g. Launch Brief)"
            autoFocus
            className="flex-1 min-w-[140px] rounded-lg bg-black/35 border border-white/12 focus:border-[#34D399] px-2.5 py-1 text-xs text-white placeholder:text-emerald-100/40 focus:outline-none"
          />
          <input
            type="text"
            value={pinDetail}
            onChange={(e) => setPinDetail(e.target.value)}
            placeholder="Context or repo path (optional)"
            className="flex-1 min-w-[160px] rounded-lg bg-black/35 border border-white/12 focus:border-[#34D399] px-2.5 py-1 text-xs text-white placeholder:text-emerald-100/40 focus:outline-none"
          />
          <button
            type="submit"
            className="px-3 py-1 rounded-lg bg-[#34D399] hover:bg-[#6EE7B7] text-[#05140E] text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
          >
            Drop Pin
          </button>
          <button
            type="button"
            onClick={() => setIsPinComposerOpen(false)}
            aria-label="Cancel pin"
            className="p-1 rounded text-emerald-100/55 hover:text-white cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </form>
      )}

      {/* Spatial Parallel Dots Stage (2-col mobile grid, Pan/Zoom spatial stage on sm+) */}
      <div
        className={`relative z-10 flex-1 min-h-0 w-full overflow-y-auto ${
          minStagePx ? 'sm:overflow-y-auto' : 'sm:overflow-hidden'
        } cyber-scroll`}
      >
        <div
          style={
            {
              '--canvas-pan-x': `${viewport.panX}px`,
              '--canvas-pan-y': `${viewport.panY}px`,
              '--canvas-zoom': String(viewport.zoom),
              '--stage-min-h': minStagePx ? `${minStagePx}px` : '100%',
            } as React.CSSProperties
          }
          className="relative w-full min-h-full sm:min-h-[var(--stage-min-h)] sm:h-[var(--stage-min-h)] grid grid-cols-2 grid-flow-dense items-start justify-items-center gap-x-2.5 gap-y-5 px-3 pb-24 pt-1 sm:block sm:p-0 sm:origin-center sm:[transform:translate3d(var(--canvas-pan-x),var(--canvas-pan-y),0)_scale(var(--canvas-zoom))]"
        >
          {/* Optical Constellation & Pin Filaments on sm+ */}
          <svg
            aria-hidden="true"
            className="hidden sm:block pointer-events-none absolute inset-0 w-full h-full z-0"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="canvas-link-hot" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(52, 211, 153, 0.55)" />
                <stop offset="50%" stopColor="rgba(167, 243, 208, 0.35)" />
                <stop offset="100%" stopColor="rgba(52, 211, 153, 0.55)" />
              </linearGradient>
            </defs>

            {constellationEdges.map((edge) => {
              const aPos = resolveSessionPos(edge.a);
              const bPos = resolveSessionPos(edge.b);
              const aLive =
                Boolean(thinkingByChannel[edge.a.channelId]) ||
                hermesByChannel.get(edge.a.channelId)?.status === 'thinking' ||
                (voiceState.isSpeaking && (speakingChannel ?? activeChannel) === edge.a.channelId);
              const bLive =
                Boolean(thinkingByChannel[edge.b.channelId]) ||
                hermesByChannel.get(edge.b.channelId)?.status === 'thinking' ||
                (voiceState.isSpeaking && (speakingChannel ?? activeChannel) === edge.b.channelId);
              const isLinkHot = aLive || bLive;
              return (
                <line
                  key={edge.key}
                  x1={`${aPos.xPct}%`}
                  y1={`${aPos.yPct}%`}
                  x2={`${bPos.xPct}%`}
                  y2={`${bPos.yPct}%`}
                  stroke={
                    isLinkHot
                      ? 'url(#canvas-link-hot)'
                      : edge.kind === 'collab'
                      ? 'rgba(110, 231, 183, 0.22)'
                      : 'rgba(110, 231, 183, 0.13)'
                  }
                  strokeWidth={isLinkHot ? '1.5' : '1'}
                  strokeDasharray={isLinkHot ? '5 4' : '4 6'}
                  className="ui-constellation-line"
                />
              );
            })}

            {/* Pin-to-Dot spatial reference lines */}
            {pins.map((pin) => {
              if (!pin.linkedChannelId) return null;
              const owner = visibleSessions.find((s) => s.channelId === pin.linkedChannelId);
              if (!owner) return null;
              const pPos = dragPinPreview && dragPinPreview.id === pin.id ? dragPinPreview : pin;
              const sPos = resolveSessionPos(owner);
              return (
                <line
                  key={`pin-link-${pin.id}`}
                  x1={`${pPos.xPct}%`}
                  y1={`${pPos.yPct}%`}
                  x2={`${sPos.xPct}%`}
                  y2={`${sPos.yPct}%`}
                  stroke="rgba(167, 243, 208, 0.16)"
                  strokeWidth="1"
                  strokeDasharray="2 5"
                />
              );
            })}
          </svg>

          {/* Block Berd-Style Draggable Spatial Workspace Pin Cards (sm+) */}
          {pins.map((pin) => {
            const PinIcon = PIN_ICON[pin.kind];
            const livePinPos =
              dragPinPreview && dragPinPreview.id === pin.id
                ? dragPinPreview
                : { xPct: pin.xPct, yPct: pin.yPct };
            const isPinDragged = draggingId === pin.id;
            const owner = pin.linkedChannelId
              ? sessions.find((s) => s.channelId === pin.linkedChannelId)
              : undefined;
            return (
              <div
                key={pin.id}
                data-testid={`canvas-pin-${pin.id}`}
                onPointerDown={(e) => handlePinPointerDown(e, pin)}
                onPointerUp={(e) => handlePinPointerUp(e, pin)}
                style={
                  {
                    left: `${livePinPos.xPct}%`,
                    top: `${livePinPos.yPct}%`,
                    zIndex: isPinDragged ? 35 : 8,
                  } as React.CSSProperties
                }
                className={`hidden sm:flex flex-col absolute -translate-x-1/2 -translate-y-1/2 w-[196px] rounded-xl border px-3 py-2 bg-[#07130F]/90 shadow-[0_8px_22px_rgba(0,0,0,0.38)] touch-none ${
                  isPinDragged
                    ? 'border-[#34D399]/65 scale-[1.03] cursor-grabbing'
                    : 'border-white/12 hover:border-[#34D399]/40 cursor-grab'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <PinIcon className="w-3.5 h-3.5 text-[#6EE7B7] shrink-0" />
                    <span className="text-[11.5px] font-semibold text-white truncate">
                      {pin.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {owner && (
                      <button
                        type="button"
                        onClick={() => onSelectSession(owner)}
                        aria-label={`Focus Dot #${owner.name}`}
                        title={`Focus #${owner.name}`}
                        className="p-0.5 rounded text-emerald-100/50 hover:text-[#6EE7B7] cursor-pointer"
                      >
                        <Maximize2 className="w-2.5 h-2.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onRemovePin(pin.id)}
                      aria-label={`Remove pin ${pin.title}`}
                      className="p-0.5 rounded text-emerald-100/45 hover:text-rose-300 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-[10.5px] leading-snug text-emerald-100/70 line-clamp-2 select-text">
                  {pin.detail}
                </p>
                <div className="mt-1 font-mono text-[9.5px] text-emerald-100/45 truncate">
                  {pin.meta}
                </div>
              </div>
            );
          })}

          {visibleSessions.length === 0 ? (
            <EmptyState
              className="sm:absolute sm:inset-0 col-span-2"
              icon={<LayoutGrid className="w-4 h-4" />}
              title={
                sessions.length === 0
                  ? 'No isolated hermes-agent Dots on this canvas yet'
                  : 'No Dots match this filter'
              }
              description={
                sessions.length === 0
                  ? 'Spawn an animated Dot character to orchestrate parallel always-on agents.'
                  : 'Switch filter back to All or spawn a new autonomous Dot.'
              }
              action={
                sessions.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => setIsAddOpen(true)}
                    className="ui-tactile px-4 py-2 rounded-lg bg-[#34D399] hover:bg-[#6EE7B7] text-[#05140E] text-xs font-semibold cursor-pointer"
                  >
                    + Add first Dot
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setFilterMode('all')}
                    className="ui-tactile px-4 py-2 rounded-lg border border-white/15 bg-white/[0.05] text-xs font-medium text-white cursor-pointer"
                  >
                    Show all Dots
                  </button>
                )
              }
            />
          ) : (
            visibleSessions.map((session, idx) => {
              const isDragged = draggingId === session.id;
              const livePos = resolveSessionPos(session);

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
                  key={`${session.id}::${session.channelId}`}
                  session={session}
                  hermesSession={serverSession}
                  index={idx}
                  livePos={livePos}
                  isSelected={isSelected}
                  isChatOpen={isChatOpen}
                  isDragged={isDragged}
                  isThinking={isThinkingHere}
                  isSpeaking={isSpeakingHere}
                  isListeningHere={isListeningHere}
                  pendingApprovalCount={pendingApprovalsByChannel.get(session.channelId) ?? 0}
                  viseme={viseme}
                  energy={activeSpeechEnergy}
                  entries={bucket?.entries ?? []}
                  turnCount={turnCount}
                  canRemove={sessions.length > 1}
                  compact={compactNodes}
                  dotProfile={dotProfile}
                  bloom={bloom}
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
                  onUpdateDotConfig={onUpdateDotConfig}
                />
              );
            })
          )}
        </div>
      </div>

      <AddSessionShapeModal
        open={isAddOpen}
        dotProfile={dotProfile}
        bloom={bloom}
        onClose={() => setIsAddOpen(false)}
        onCreate={(payload) => {
          onAddSession(payload);
        }}
      />
    </div>
  );
}
