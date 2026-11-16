import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import {
  ArrowUp,
  AudioLines,
  Clock,
  Cpu,
  FolderGit2,
  Maximize2,
  MessageSquare,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type {
  ExpressionMood,
  MouthViseme,
  TerminalEntry,
} from '../types/hermes';
import type { BrailleDotProfile } from '../utils/brailleCanvasRaster';
import { BRAILLE_TINT_PALETTE } from '../utils/brailleShapesEngine';
import {
  AVAILABLE_DOT_SKILLS,
  formatAutonomyLabel,
  formatSandboxLabel,
  getShapeMeta,
  type CanvasSession,
  type DotAutonomyMode,
} from '../utils/canvasSessions';
import { BrailleShapeCanvas } from './BrailleShapeCanvas';
import { DecodedText } from './DecodedText';
import { ScrollToBottomButton, StatusPulse } from './ui';

interface CanvasSessionNodeProps {
  session: CanvasSession;
  index: number;
  livePos: { xPct: number; yPct: number };
  isSelected: boolean;
  isChatOpen: boolean;
  isDragged: boolean;
  isThinking: boolean;
  isSpeaking: boolean;
  isListeningHere: boolean;
  pendingApprovalCount?: number;
  viseme: MouthViseme;
  energy: number;
  entries: TerminalEntry[];
  turnCount: number;
  canRemove: boolean;
  dotProfile?: BrailleDotProfile;
  bloom?: number;
  speedScale?: number;
  reducedMotionOverride?: boolean;
  gazeRef: RefObject<{ clientX: number; clientY: number } | null>;
  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  onSelect: () => void;
  onToggleChat: () => void;
  onSendMessage: (text: string) => void;
  onToggleVoice: () => void;
  onCycleMood: () => void;
  onResetSession: () => void;
  onOpenThread: () => void;
  onRemoveSession: () => void;
  onUpdateDotConfig?: (
    id: string,
    patch: Partial<Pick<CanvasSession, 'autonomyMode' | 'scheduleLabel' | 'autonomyPaused' | 'skills'>>
  ) => void;
}

export function CanvasSessionNode({
  session,
  index,
  livePos,
  isSelected,
  isChatOpen,
  isDragged,
  isThinking,
  isSpeaking,
  isListeningHere,
  pendingApprovalCount = 0,
  viseme,
  energy,
  entries,
  turnCount,
  canRemove,
  dotProfile = 'balanced',
  bloom = 0.75,
  speedScale = 1,
  reducedMotionOverride = false,
  gazeRef,
  onPointerDown,
  onPointerUp,
  onKeyDown,
  onSelect,
  onToggleChat,
  onSendMessage,
  onToggleVoice,
  onCycleMood,
  onResetSession,
  onOpenThread,
  onRemoveSession,
  onUpdateDotConfig,
}: CanvasSessionNodeProps) {
  const [draft, setDraft] = useState('');
  const [isHovered, setIsHovered] = useState(false);
  const [isAwayFromBottom, setIsAwayFromBottom] = useState(false);
  const [popoverTab, setPopoverTab] = useState<'chat' | 'config'>('chat');
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const palette = BRAILLE_TINT_PALETTE[session.tint];
  const meta = getShapeMeta(session.shape);

  const effectiveMood: ExpressionMood = isThinking
    ? 'thinking'
    : isSpeaking
    ? 'speaking'
    : session.mood;

  const isAutonomousActive = session.autonomyMode !== 'manual' && !session.autonomyPaused;

  const visibleMessages = entries.filter(
    (e) =>
      e.role === 'user' ||
      e.role === 'hermes' ||
      e.role === 'command' ||
      e.role === 'activity'
  );

  const lastMsgLen = visibleMessages[visibleMessages.length - 1]?.text.length ?? 0;

  useLayoutEffect(() => {
    if (!isChatOpen || popoverTab !== 'chat' || !chatScrollRef.current) {
      setIsAwayFromBottom(false);
      return;
    }
    const snap = () => {
      if (chatScrollRef.current) {
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
        setIsAwayFromBottom(false);
      }
    };
    snap();
    const rafId = requestAnimationFrame(snap);
    const timerId = window.setTimeout(snap, 60);
    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(timerId);
    };
  }, [isChatOpen, popoverTab, visibleMessages.length, lastMsgLen, isThinking]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    setDraft('');
    setPopoverTab('chat');
    onSelect();
    onSendMessage(trimmed);
  };

  const handleSetAutonomyMode = (mode: DotAutonomyMode) => {
    if (!onUpdateDotConfig) return;
    const scheduleLabel =
      mode === 'manual'
        ? 'On-demand'
        : mode === 'watch'
        ? 'Continuous watch'
        : session.autonomyMode === 'scheduled' && session.scheduleLabel !== 'On-demand'
        ? session.scheduleLabel
        : 'Every 15m';
    onUpdateDotConfig(session.id, {
      autonomyMode: mode,
      scheduleLabel,
      autonomyPaused: false,
    });
  };

  const handleToggleSkill = (skillId: string) => {
    if (!onUpdateDotConfig) return;
    const has = session.skills.includes(skillId);
    const nextSkills = has
      ? session.skills.filter((s) => s !== skillId)
      : [...session.skills, skillId];
    onUpdateDotConfig(session.id, { skills: nextSkills });
  };

  const statusTag = isSpeaking
    ? 'speaking'
    : isThinking
    ? 'thinking'
    : isAutonomousActive
    ? session.autonomyMode === 'watch'
      ? 'watching'
      : 'scheduled'
    : null;

  return (
    <div
      data-testid={`canvas-session-${session.channelId}`}
      data-shape={session.shape}
      data-hermes-session={session.hermesSessionId}
      data-chat-open={String(isChatOpen)}
      data-autonomy={session.autonomyMode}
      data-x={livePos.xPct}
      data-y={livePos.yPct}
      style={
        {
          '--dot-x': `${livePos.xPct}%`,
          '--dot-y': `${livePos.yPct}%`,
          zIndex: isDragged ? 50 : isChatOpen ? 45 : isSelected ? 22 : 12,
        } as React.CSSProperties
      }
      className={`ui-node-enter ${
        !isDragged ? 'ui-canvas-node-glide' : ''
      } relative sm:absolute sm:left-[var(--dot-x)] sm:top-[var(--dot-y)] sm:-translate-x-1/2 sm:-translate-y-1/2 flex flex-col items-center sm:touch-none py-1 sm:py-0 w-full sm:w-auto ${
        isChatOpen ? 'col-span-2 sm:col-span-1' : ''
      }`}
    >
      {/* Draggable / Clickable Anime Braille Character Sprite */}
      <button
        type="button"
        data-testid={`canvas-session-trigger-${session.channelId}`}
        onPointerEnter={() => setIsHovered(true)}
        onPointerLeave={() => setIsHovered(false)}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onClick={(e) => {
          if (e.detail === 0) {
            onToggleChat();
          }
        }}
        onKeyDown={onKeyDown}
        aria-label={`Dot #${session.name} (${session.hermesSessionId}), ${meta.label} anime character, ${formatAutonomyLabel(session.autonomyMode, session.scheduleLabel, session.autonomyPaused)}, ${turnCount} turns. Click to open workspace or drag to move.`}
        aria-expanded={isChatOpen}
        className={`group relative flex flex-col items-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#34D399] rounded-2xl transition-transform duration-200 ease-out ${
          isDragged
            ? 'scale-110 -translate-y-1.5 cursor-grabbing'
            : isSelected || isChatOpen
            ? 'scale-[1.04] cursor-grab hover:scale-108'
            : 'cursor-grab hover:scale-105'
        }`}
      >
        {/* Optical Ambient Corona + Floor Selection Reticle */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute -inset-3 rounded-full transition-opacity duration-200 ${
            isSelected || isDragged || isThinking || isChatOpen
              ? 'opacity-100'
              : isAutonomousActive
              ? 'opacity-45 group-hover:opacity-85'
              : 'opacity-0 group-hover:opacity-70'
          }`}
          style={{
            background: `radial-gradient(circle, ${palette.glow} 0%, transparent 72%)`,
          }}
        />

        {(isSelected || isThinking || isSpeaking) && (
          <svg
            aria-hidden="true"
            viewBox="0 0 120 36"
            className="pointer-events-none absolute bottom-[38px] w-28 h-8 opacity-85"
          >
            <ellipse
              cx="60"
              cy="18"
              rx="52"
              ry="12"
              fill="none"
              stroke={palette.mid}
              strokeOpacity={isThinking || isSpeaking ? '0.68' : '0.38'}
              strokeWidth="1.25"
              strokeDasharray="6 5"
              className="ui-constellation-line"
            />
            <ellipse
              cx="60"
              cy="18"
              rx="38"
              ry="8"
              fill="none"
              stroke={palette.high}
              strokeOpacity="0.24"
              strokeWidth="1"
            />
          </svg>
        )}

        <div className="relative z-10 scale-[0.76] sm:scale-[0.86] origin-bottom">
          <BrailleShapeCanvas
            shape={session.shape}
            tint={session.tint}
            mood={effectiveMood}
            eyeStyle={session.eyeStyle}
            viseme={isSpeaking ? viseme : 'closed'}
            energy={isSpeaking ? energy : isThinking ? 0.28 : 0.08}
            isSpeaking={isSpeaking}
            isThinking={isThinking}
            isDragging={isDragged}
            isHovered={isHovered}
            dotProfile={dotProfile}
            bloom={bloom}
            speedScale={speedScale}
            reducedMotionOverride={reducedMotionOverride}
            blinkPhaseOffset={index * 4.35}
            gazeRef={gazeRef}
          />
        </div>

        {/* Ground Contact Shadow */}
        <div
          aria-hidden="true"
          className={`pointer-events-none w-18 h-2.5 rounded-full transition-[transform,opacity] duration-150 ease-out -mt-1.5 ${
            isDragged ? 'scale-x-[0.68] scale-y-[0.82] opacity-35' : 'scale-100 opacity-60'
          }`}
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(0, 0, 0, 0.72) 0%, transparent 75%)',
          }}
        />

        {/* Crisp Unboxed Dot Identity & Always-On Autonomy Line */}
        <div className="relative z-10 mt-0.5 flex flex-col items-center leading-tight whitespace-nowrap">
          <div className="flex items-center gap-1.5 text-xs">
            <span
              className={`font-mono font-semibold ${
                isSelected || isChatOpen
                  ? 'text-white'
                  : 'text-emerald-50/85 group-hover:text-white'
              }`}
            >
              #{session.name}
            </span>
            {statusTag && (
              <span className="font-mono text-[10px]" style={{ color: palette.mid }}>
                · {statusTag}
              </span>
            )}
          </div>
          <span className="font-mono text-[10px] text-emerald-100/50 tabular-nums">
            {session.hermesSessionId} · {turnCount}t
            {pendingApprovalCount > 0 ? ` · ${pendingApprovalCount} gate` : ''}
          </span>
        </div>
      </button>

      {/* Modular Per-Dot Perspective Workspace Window (Chat | Sandbox & Triggers) */}
      {isChatOpen && (
        <div
          data-testid={`session-chat-${session.channelId}`}
          onPointerDown={(e) => e.stopPropagation()}
          onWheelCapture={(e) => e.stopPropagation()}
          className={`ui-chat-pop relative mt-2 w-[min(308px,calc(100vw-2rem))] sm:mt-0 sm:w-[308px] sm:absolute sm:left-1/2 sm:-translate-x-1/2 ${
            livePos.yPct > 56 ? 'sm:bottom-[calc(100%+8px)]' : 'sm:top-[calc(100%+8px)]'
          } rounded-xl bg-[#07120F]/96 border border-[#34D399]/35 shadow-[0_14px_34px_rgba(0,0,0,0.62)] overflow-hidden flex flex-col z-40`}
        >
          {/* Dot Window Header */}
          <div className="flex items-center justify-between gap-1.5 px-2.5 py-1.5 border-b border-white/8 bg-white/[0.02]">
            <div className="flex items-center gap-1.5 min-w-0">
              <StatusPulse
                state={isThinking ? 'thinking' : isSpeaking ? 'speaking' : 'idle'}
              />
              <span className="font-mono text-[10.5px] font-medium text-emerald-50/90 truncate">
                {session.hermesSessionId}
              </span>
              <span className="text-[10px] text-emerald-100/45 truncate hidden sm:inline">
                · {meta.label}
              </span>
            </div>

            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={onCycleMood}
                aria-label={`Cycle mood for #${session.name}`}
                title="Cycle expression"
                className="p-1 rounded text-emerald-100/55 hover:text-white hover:bg-white/8 transition-colors cursor-pointer"
              >
                <Sparkles className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={onResetSession}
                aria-label={`Reset session #${session.name}`}
                title="Reset session context"
                className="p-1 rounded text-emerald-100/55 hover:text-white hover:bg-white/8 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={onOpenThread}
                aria-label={`Expand #${session.name} to full thread`}
                title="Expand full thread"
                className="p-1 rounded text-emerald-100/55 hover:text-[#6EE7B7] hover:bg-white/8 transition-colors cursor-pointer"
              >
                <Maximize2 className="w-3 h-3" />
              </button>
              {canRemove && !session.isCore && (
                <button
                  type="button"
                  onClick={onRemoveSession}
                  aria-label={`Remove session #${session.name}`}
                  title="Remove session"
                  className="p-1 rounded text-emerald-100/45 hover:text-rose-300 hover:bg-rose-500/12 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
              <button
                type="button"
                onClick={onToggleChat}
                aria-label={`Minimize chat for #${session.name}`}
                title="Minimize workspace"
                className="p-1 rounded text-emerald-100/55 hover:text-white hover:bg-white/8 transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Sub-View Switcher: Thread Stream vs OpenAI Dots Sandbox & Autonomy Config */}
          <div className="flex items-center justify-between gap-2 px-2.5 py-1 border-b border-white/[0.06] bg-black/25">
            <div className="flex items-center gap-1" role="tablist" aria-label={`#${session.name} workspace sections`}>
              <button
                type="button"
                role="tab"
                aria-selected={popoverTab === 'chat'}
                onClick={() => setPopoverTab('chat')}
                className={`px-2 py-0.5 rounded text-[10.5px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  popoverTab === 'chat'
                    ? 'bg-[#34D399]/18 text-[#6EE7B7]'
                    : 'text-emerald-100/55 hover:text-white'
                }`}
              >
                Thread
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={popoverTab === 'config'}
                data-testid={`dot-config-tab-${session.channelId}`}
                onClick={() => setPopoverTab('config')}
                className={`px-2 py-0.5 rounded text-[10.5px] font-medium flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                  popoverTab === 'config'
                    ? 'bg-[#34D399]/18 text-[#6EE7B7]'
                    : 'text-emerald-100/55 hover:text-white'
                }`}
              >
                <SlidersHorizontal className="w-2.5 h-2.5" />
                <span>Sandbox &amp; Trigger</span>
              </button>
            </div>
            <span className="font-mono text-[9.5px] text-emerald-100/45 truncate tabular-nums">
              {session.skills.length} skills
            </span>
          </div>

          {popoverTab === 'chat' ? (
            <div className="relative">
              <div
                ref={chatScrollRef}
                onScroll={() => {
                  const el = chatScrollRef.current;
                  if (!el) return;
                  setIsAwayFromBottom(el.scrollHeight - el.scrollTop - el.clientHeight > 22);
                }}
                data-testid={`session-chat-scroll-${session.channelId}`}
                className="max-h-[168px] min-h-[78px] overflow-y-auto cyber-scroll px-2.5 py-2 space-y-2 text-[11.5px] leading-relaxed select-text"
              >
                {visibleMessages.length === 0 ? (
                  <p className="text-emerald-100/55 text-[11px] leading-snug">
                    {session.topic}
                  </p>
                ) : (
                  visibleMessages.map((entry) => {
                    const isUser = entry.role === 'user' || entry.role === 'command';
                    if (entry.role === 'activity') {
                      return (
                        <div
                          key={entry.id}
                          className="font-mono text-[10px] text-emerald-100/45 truncate"
                        >
                          ▸ {entry.text}
                        </div>
                      );
                    }
                    if (isUser) {
                      return (
                        <div
                          key={entry.id}
                          className="ui-msg-enter ml-auto max-w-[88%] rounded-lg bg-white/[0.08] border border-white/10 px-2.5 py-1.5 text-white/95 whitespace-pre-wrap break-words"
                        >
                          {entry.text}
                        </div>
                      );
                    }
                    return (
                      <div
                        key={entry.id}
                        className="ui-msg-enter max-w-[94%] text-emerald-50/90 whitespace-pre-wrap break-words"
                      >
                        <DecodedText
                          text={entry.text}
                          animate={!entry.id.startsWith('init-')}
                          speedMultiplier={1.3}
                        />
                      </div>
                    );
                  })
                )}

                {isThinking && (
                  <div className="flex items-center gap-1.5 font-mono text-[10.5px] text-amber-300/90">
                    <span aria-hidden="true">❖</span>
                    <span>Thinking in {session.hermesSessionId}…</span>
                  </div>
                )}
              </div>

              <ScrollToBottomButton
                compact
                label="Latest"
                visible={isAwayFromBottom}
                testId={`session-jump-${session.channelId}`}
                className="absolute bottom-1.5 right-2 z-10"
                onClick={() => {
                  const el = chatScrollRef.current;
                  if (el) {
                    el.scrollTop = el.scrollHeight;
                    setIsAwayFromBottom(false);
                  }
                }}
              />
            </div>
          ) : (
            <div
              data-testid={`dot-config-panel-${session.channelId}`}
              className="px-3 py-2.5 space-y-2.5 text-[11px] max-h-[210px] overflow-y-auto cyber-scroll select-text"
            >
              {/* Isolated Environment / Workspace Directory */}
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/8">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-white font-medium">
                    <Cpu className="w-3 h-3 text-[#6EE7B7] shrink-0" />
                    <span className="truncate">{formatSandboxLabel(session.sandboxEnv)}</span>
                  </div>
                  <div className="flex items-center gap-1 font-mono text-[10px] text-emerald-100/50 truncate mt-0.5">
                    <FolderGit2 className="w-2.5 h-2.5 shrink-0" />
                    <span className="truncate">{session.workspaceDir}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onSelect();
                    onSendMessage(`/status`);
                    setPopoverTab('chat');
                  }}
                  className="px-2 py-1 rounded-md border border-[#34D399]/35 bg-[#34D399]/12 hover:bg-[#34D399]/22 text-[10px] font-semibold text-[#6EE7B7] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Run check
                </button>
              </div>

              {/* Always-On Autonomy & Cadence Controls */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 text-[10.5px] font-medium text-emerald-100/75">
                    <Clock className="w-3 h-3 text-emerald-100/55" />
                    <span>Trigger Mode</span>
                  </span>
                  {session.autonomyMode !== 'manual' && onUpdateDotConfig && (
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateDotConfig(session.id, {
                          autonomyPaused: !session.autonomyPaused,
                        })
                      }
                      className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-100/75 hover:text-white cursor-pointer whitespace-nowrap"
                    >
                      {session.autonomyPaused ? (
                        <>
                          <Play className="w-2.5 h-2.5 text-[#34D399]" />
                          <span>Resume</span>
                        </>
                      ) : (
                        <>
                          <Pause className="w-2.5 h-2.5 text-amber-300" />
                          <span>Pause</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-white/[0.04] border border-white/10">
                  {(
                    [
                      { id: 'manual', label: 'On-demand' },
                      { id: 'scheduled', label: 'Scheduled' },
                      { id: 'watch', label: 'Watch' },
                    ] as const
                  ).map((opt) => {
                    const active = session.autonomyMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleSetAutonomyMode(opt.id)}
                        className={`py-1 px-1.5 rounded-md text-[10px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          active
                            ? 'bg-[#34D399] text-[#05140E] font-semibold'
                            : 'text-emerald-100/65 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Portable Berd-Style Skills */}
              <div className="space-y-1.5 pt-1 border-t border-white/8">
                <div className="text-[10.5px] font-medium text-emerald-100/75">
                  Attached Skills
                </div>
                <div className="flex flex-wrap gap-1">
                  {AVAILABLE_DOT_SKILLS.map((skill) => {
                    const active = session.skills.includes(skill.id);
                    return (
                      <button
                        key={skill.id}
                        type="button"
                        onClick={() => handleToggleSkill(skill.id)}
                        aria-pressed={active}
                        title={skill.summary}
                        className={`px-2 py-0.5 rounded-md border text-[10px] transition-colors cursor-pointer whitespace-nowrap ${
                          active
                            ? 'border-[#34D399]/50 bg-[#34D399]/14 text-[#6EE7B7]'
                            : 'border-white/10 bg-white/[0.03] text-emerald-100/50 hover:text-white hover:border-white/20'
                        }`}
                      >
                        {skill.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* OpenAI Dots-Inspired Per-Character Input Box inside its Perspective Div */}
      <form
        onSubmit={handleSubmit}
        onPointerDown={(e) => e.stopPropagation()}
        data-testid={`session-input-form-${session.channelId}`}
        className={`mt-1.5 ${
          isChatOpen ? 'w-[min(308px,calc(100vw-2rem))] sm:w-[308px]' : 'w-full max-w-[196px] sm:w-[260px] sm:max-w-none'
        } flex items-center gap-1 rounded-xl border px-1.5 py-1 bg-[#07120F]/95 shadow-[0_6px_20px_rgba(0,0,0,0.42)] transition-[border-color,box-shadow,width] duration-150 ${
          isChatOpen || isSelected
            ? 'border-[#34D399]/65 shadow-[0_0_20px_rgba(52,211,153,0.16)]'
            : 'border-white/18 hover:border-[#34D399]/45 focus-within:border-[#4ADE80]'
        }`}
      >
        <button
          type="button"
          onClick={() => {
            onToggleChat();
            if (!isChatOpen) {
              window.setTimeout(() => inputRef.current?.focus(), 0);
            }
          }}
          aria-label={
            isChatOpen
              ? `Hide #${session.name} chat window`
              : `Open #${session.name} chat window`
          }
          title={isChatOpen ? 'Hide workspace window' : 'Open workspace window'}
          className={`ui-tactile w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
            isChatOpen
              ? 'bg-white/10 text-[#6EE7B7]'
              : 'bg-white/[0.05] text-emerald-100/75 hover:text-white hover:bg-white/10'
          }`}
        >
          {isChatOpen ? (
            <MessageSquare className="w-3.5 h-3.5" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
        </button>

        <input
          ref={inputRef}
          type="text"
          value={draft}
          onFocus={onSelect}
          onChange={(e) => setDraft(e.target.value)}
          data-testid={`session-input-${session.channelId}`}
          aria-label={`Prompt for #${session.name} (${session.hermesSessionId})`}
          placeholder={
            isThinking
              ? 'Thinking…'
              : `Ask #${session.name}…`
          }
          className="flex-1 min-w-0 bg-transparent text-xs text-white placeholder:text-emerald-100/45 text-ellipsis focus:outline-none px-1.5 py-1"
        />

        {draft.trim() ? (
          <button
            type="submit"
            data-testid={`session-send-${session.channelId}`}
            aria-label={`Send message to #${session.name}`}
            className="ui-pop-in ui-tactile w-7 h-7 rounded-lg bg-[#34D399] hover:bg-[#6EE7B7] text-[#05140E] flex items-center justify-center transition-colors shrink-0 cursor-pointer"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onToggleVoice}
            aria-pressed={isListeningHere}
            aria-label={
              isListeningHere
                ? `Stop voice input for #${session.name}`
                : `Voice input for #${session.name}`
            }
            className={`ui-tactile w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
              isListeningHere || isSpeaking
                ? 'bg-[#4ADE80] text-[#05140E] shadow-[0_0_12px_rgba(74,222,128,0.45)]'
                : 'bg-[#227D5A]/80 hover:bg-[#34D399] text-emerald-50 hover:text-[#05140E]'
            }`}
          >
            <AudioLines className="w-3.5 h-3.5" />
          </button>
        )}
      </form>
    </div>
  );
}
