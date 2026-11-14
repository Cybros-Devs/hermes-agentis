import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  ArrowUp,
  AudioLines,
  Maximize2,
  MessageSquare,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type {
  ExpressionMood,
  MouthViseme,
  TerminalEntry,
} from '../types/hermes';
import { BRAILLE_TINT_PALETTE } from '../utils/brailleShapesEngine';
import { getShapeMeta, type CanvasSession } from '../utils/canvasSessions';
import { BrailleShapeCanvas } from './BrailleShapeCanvas';
import { DecodedText } from './DecodedText';

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
  viseme: MouthViseme;
  energy: number;
  entries: TerminalEntry[];
  turnCount: number;
  canRemove: boolean;
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
  viseme,
  energy,
  entries,
  turnCount,
  canRemove,
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
}: CanvasSessionNodeProps) {
  const [draft, setDraft] = useState('');
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const palette = BRAILLE_TINT_PALETTE[session.tint];
  const meta = getShapeMeta(session.shape);

  const effectiveMood: ExpressionMood = isThinking
    ? 'thinking'
    : isSpeaking
    ? 'speaking'
    : session.mood;

  const visibleMessages = entries.filter(
    (e) =>
      e.role === 'user' ||
      e.role === 'hermes' ||
      e.role === 'command' ||
      e.role === 'activity'
  );

  // Auto-scroll this character's individual chat window when new messages arrive
  useEffect(() => {
    if (isChatOpen && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [isChatOpen, visibleMessages.length, isThinking]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    setDraft('');
    onSelect();
    onSendMessage(trimmed);
  };

  return (
    <div
      data-testid={`canvas-session-${session.channelId}`}
      data-shape={session.shape}
      data-hermes-session={session.hermesSessionId}
      data-chat-open={String(isChatOpen)}
      data-x={livePos.xPct}
      data-y={livePos.yPct}
      style={
        {
          '--dot-x': `${livePos.xPct}%`,
          '--dot-y': `${livePos.yPct}%`,
          zIndex: isDragged ? 40 : isChatOpen ? 30 : isSelected ? 20 : 10,
        } as React.CSSProperties
      }
      className="relative sm:absolute sm:left-[var(--dot-x)] sm:top-[var(--dot-y)] sm:-translate-x-1/2 sm:-translate-y-1/2 flex flex-col items-center touch-none py-2 sm:py-0"
    >
      {/* Draggable / Clickable Anime Braille Character Sprite */}
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
        aria-label={`Session #${session.name} (${session.hermesSessionId}), ${meta.label} anime character, ${turnCount} turns. Click to toggle chat or drag to move.`}
        aria-expanded={isChatOpen}
        className={`group relative flex flex-col items-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#34D399] rounded-2xl transition-transform duration-150 ${
          isDragged
            ? 'scale-110 -translate-y-1.5 cursor-grabbing'
            : isSelected || isChatOpen
            ? 'scale-[1.04] cursor-grab hover:scale-108'
            : 'cursor-grab hover:scale-105'
        }`}
      >
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute -inset-3 rounded-full transition-opacity duration-200 ${
            isSelected || isDragged || isThinking || isChatOpen
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-70'
          }`}
          style={{
            background: `radial-gradient(circle, ${palette.glow} 0%, transparent 72%)`,
          }}
        />

        <div className="relative z-10 scale-[0.78] sm:scale-[0.88] origin-bottom">
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
            blinkPhaseOffset={index * 1.15}
            gazeRef={gazeRef}
          />
        </div>

        {/* Ground Contact Shadow */}
        <div
          aria-hidden="true"
          className={`pointer-events-none rounded-full transition-all duration-150 -mt-1.5 ${
            isDragged ? 'w-12 h-2 opacity-35 blur-[3px]' : 'w-18 h-2.5 opacity-60 blur-[2px]'
          }`}
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(0, 0, 0, 0.72) 0%, transparent 75%)',
          }}
        />

        {/* Crisp Unboxed Session Name & Status */}
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
            {(isSpeaking || isThinking) && (
              <span className="font-mono text-[10px]" style={{ color: palette.mid }}>
                · {isSpeaking ? 'speaking' : 'thinking'}
              </span>
            )}
          </div>
          <span className="font-mono text-[10px] text-emerald-100/50 tabular-nums">
            {session.hermesSessionId} · {turnCount}t
          </span>
        </div>
      </button>

      {/* Modular Individual Scrollable Chat Window inside this Character's Perspective Div */}
      {isChatOpen && (
        <div
          data-testid={`session-chat-${session.channelId}`}
          onPointerDown={(e) => e.stopPropagation()}
          onWheelCapture={(e) => e.stopPropagation()}
          className="mt-2 w-[264px] sm:w-[280px] rounded-xl bg-[#07120F]/94 border border-[#34D399]/35 backdrop-blur-md shadow-[0_14px_34px_rgba(0,0,0,0.58)] overflow-hidden flex flex-col"
        >
          {/* Individual Window Header */}
          <div className="flex items-center justify-between gap-1.5 px-2.5 py-1.5 border-b border-white/8 bg-white/[0.02]">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                aria-hidden="true"
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{
                  backgroundColor: isThinking
                    ? '#FBBF24'
                    : isSpeaking
                    ? '#4ADE80'
                    : palette.mid,
                }}
              />
              <span className="font-mono text-[10.5px] font-medium text-emerald-50/90 truncate">
                {session.hermesSessionId}
              </span>
              <span className="text-[10px] text-emerald-100/40 truncate hidden sm:inline">
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
                title="Minimize chat"
                className="p-1 rounded text-emerald-100/55 hover:text-white hover:bg-white/8 transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Independently Scrollable Message Stream */}
          <div
            ref={chatScrollRef}
            data-testid={`session-chat-scroll-${session.channelId}`}
            className="max-h-[168px] min-h-[76px] overflow-y-auto cyber-scroll px-2.5 py-2 space-y-2 text-[11.5px] leading-relaxed select-text"
          >
            {visibleMessages.length === 0 ? (
              <p className="text-emerald-100/50 text-[11px] leading-snug">
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
                      className="ml-auto max-w-[88%] rounded-lg bg-white/[0.08] border border-white/10 px-2.5 py-1.5 text-white/95 whitespace-pre-wrap break-words"
                    >
                      {entry.text}
                    </div>
                  );
                }
                return (
                  <div
                    key={entry.id}
                    className="max-w-[94%] text-emerald-50/90 whitespace-pre-wrap break-words"
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
        </div>
      )}

      {/* OpenDots-Inspired Per-Character Input Box inside its Perspective Div */}
      <form
        onSubmit={handleSubmit}
        onPointerDown={(e) => e.stopPropagation()}
        data-testid={`session-input-form-${session.channelId}`}
        className={`mt-1.5 w-[224px] sm:w-[244px] flex items-center gap-1.5 rounded-full border px-1.5 py-1 bg-[#07120F]/92 backdrop-blur-md shadow-[0_6px_20px_rgba(0,0,0,0.42)] transition-all ${
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
          title={isChatOpen ? 'Hide chat window' : 'Open chat window'}
          className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
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
              : `Message #${session.name}…`
          }
          className="flex-1 min-w-0 bg-transparent text-xs text-white placeholder:text-emerald-100/45 focus:outline-none px-1 py-1"
        />

        {draft.trim() ? (
          <button
            type="submit"
            data-testid={`session-send-${session.channelId}`}
            aria-label={`Send message to #${session.name}`}
            className="w-7 h-7 rounded-full bg-[#34D399] hover:bg-[#6EE7B7] text-[#05140E] flex items-center justify-center transition-colors shrink-0 cursor-pointer"
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
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
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
