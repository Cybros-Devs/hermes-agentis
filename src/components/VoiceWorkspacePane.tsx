import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PanelLeft,
  Mic,
  MicOff,
  Square,
  Volume2,
  VolumeX,
  ArrowUp,
  Brain,
  Check,
  X,
  RotateCcw,
  Terminal,
  ListChecks,
  LayoutGrid,
  ChevronRight,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  ApprovalCard,
  BackgroundTask,
  BriefDecision,
  Channel,
  ChannelId,
  ExpressionMood,
  HermesAgentSession,
  HermesGatewayStatus,
  TerminalEntry,
  VoiceState,
} from '../types/hermes';
import { amplitudeToViseme, resolveEyeState } from '../utils/asciiCharacter';
import type { LookTarget } from '../utils/asciiPortraitEngine';
import type { PortraitAssetStatus } from '../utils/portraitLoadingEngine';
import type { BrailleShapeKind, BrailleShapeTint } from '../utils/brailleShapesEngine';
import { getShapeMeta, type CanvasSession } from '../utils/canvasSessions';
import { AVAILABLE_COMMANDS } from '../utils/cliEngine';
import { groupThreadTimeline } from '../utils/threadTrace';
import { DEFAULT_UI_CONFIG, type UiCustomizationConfig } from '../utils/uiCustomization';
import { AsciiPortraitCanvas } from './AsciiPortraitCanvas';
import { BrailleHorizonCanvas } from './BrailleHorizonCanvas';
import { BrailleSessionsCanvas } from './BrailleSessionsCanvas';
import { DecodedText } from './DecodedText';
import { DuetOperationsPanel } from './DuetOperationsPanel';
import { CommandTerminal } from './CommandTerminal';
import { MobileWorkspaceBar } from './MobileWorkspaceBar';
import { ThreadTraceTree } from './ThreadTraceTree';

export type WorkspacePanelView = 'home' | 'canvas' | 'voice' | 'queue' | 'cli';

interface VoiceWorkspacePaneProps {
  channels: Channel[];
  activeChannel: ChannelId;
  onSelectChannel: (id: ChannelId) => void;
  mood: ExpressionMood;
  onCycleMood: () => void;
  panelView: WorkspacePanelView;
  onChangePanelView: (view: WorkspacePanelView) => void;
  onOpenMobileSidebar?: () => void;
  voiceState: VoiceState;
  lastSpokenLine: string;
  animateSpeechLine: boolean;
  entries: TerminalEntry[];
  approvals: ApprovalCard[];
  brief: BriefDecision[];
  tasks: BackgroundTask[];
  gatewayStatus?: HermesGatewayStatus | null;
  onApproveCard: (id: string, editedDraft?: string) => void;
  onRejectCard: (id: string) => void;
  onRunBriefCommand: (command: string, briefId: string) => void;
  onToggleTaskStatus: (id: string) => void;
  onToggleListening: () => void;
  onToggleMute: () => void;
  onStopSpeaking: () => void;
  onSubmitInput: (value: string, source: 'voice' | 'cli') => void;
  onSubmitSessionInput: (channelId: ChannelId, value: string, source: 'voice' | 'cli') => void;
  /** Whether the agent's live activity trace is shown in the transcript. */
  showThinking: boolean;
  onToggleThinking: () => void;
  canvasSessions: CanvasSession[];
  hermesSessions: HermesAgentSession[];
  thinkingByChannel: Record<string, boolean>;
  speakingChannel: ChannelId | null;
  onSelectCanvasSession: (session: CanvasSession) => void;
  onMoveCanvasSession: (id: string, xPct: number, yPct: number) => void;
  onAddCanvasSession: (payload: {
    name: string;
    topic: string;
    persona: string;
    shape: BrailleShapeKind;
    tint: BrailleShapeTint;
    eyeStyle: 'open' | 'sleepy';
  }) => void;
  onAutoArrangeCanvas: () => void;
  onCycleSessionMood: (id: string) => void;
  onResetSession: (channelId: string) => void;
  onRemoveCanvasSession: (id: string) => void;
  onOpenSessionThread: (session: CanvasSession) => void;
  uiConfig?: UiCustomizationConfig;
  onOpenStudio?: () => void;
}

export function VoiceWorkspacePane({
  channels,
  activeChannel,
  onSelectChannel,
  mood,
  onCycleMood,
  panelView,
  onChangePanelView,
  onOpenMobileSidebar,
  voiceState,
  lastSpokenLine,
  animateSpeechLine,
  entries,
  approvals,
  brief,
  tasks,
  gatewayStatus,
  onApproveCard,
  onRejectCard,
  onRunBriefCommand,
  onToggleTaskStatus,
  onToggleListening,
  onToggleMute,
  onStopSpeaking,
  onSubmitInput,
  onSubmitSessionInput,
  showThinking,
  onToggleThinking,
  canvasSessions,
  hermesSessions,
  thinkingByChannel,
  speakingChannel,
  onSelectCanvasSession,
  onMoveCanvasSession,
  onAddCanvasSession,
  onAutoArrangeCanvas,
  onCycleSessionMood,
  onResetSession,
  onRemoveCanvasSession,
  onOpenSessionThread,
  uiConfig = DEFAULT_UI_CONFIG,
  onOpenStudio,
}: VoiceWorkspacePaneProps) {
  const [tick, setTick] = useState(0);
  const [input, setInput] = useState('');
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [workingSeconds, setWorkingSeconds] = useState(0);
  const [portraitStatus, setPortraitStatus] = useState<PortraitAssetStatus>('loading');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const portraitWrapRef = useRef<HTMLDivElement | null>(null);
  const lookTargetRef = useRef<LookTarget | null>(null);

  const activeCanvasSession = useMemo(
    () => canvasSessions.find((s) => s.channelId === activeChannel) ?? null,
    [canvasSessions, activeChannel]
  );
  const activeShapeMeta = activeCanvasSession ? getShapeMeta(activeCanvasSession.shape) : null;
  const activeHermesSessionId =
    activeCanvasSession?.hermesSessionId ?? `hermes-${activeChannel}`;
  const activeIsThinking = Boolean(thinkingByChannel[activeChannel]);
  const activeIsSpeaking =
    voiceState.isSpeaking && (speakingChannel ?? activeChannel) === activeChannel;

  useEffect(() => {
    const intervalMs = activeIsSpeaking ? 42 : 120;
    const id = window.setInterval(() => {
      setTick((t) => (t + 1) % 10000);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [activeIsSpeaking]);

  useEffect(() => {
    if (!activeIsThinking && !activeIsSpeaking) {
      setWorkingSeconds(0);
      return;
    }
    const id = window.setInterval(() => {
      setWorkingSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [activeIsThinking, activeIsSpeaking]);

  const scopedEntries = useMemo(
    () => entries.filter((e) => e.channelId === activeChannel),
    [entries, activeChannel]
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [scopedEntries.length, voiceState.interimTranscript, activeIsThinking, activeChannel]);

  const effectiveMood: ExpressionMood = activeIsThinking
    ? 'thinking'
    : voiceState.isListening && !activeIsSpeaking
    ? 'listening'
    : mood;

  const viseme = useMemo(
    () =>
      amplitudeToViseme(
        voiceState.outputLevel,
        effectiveMood,
        tick,
        activeIsSpeaking,
        voiceState.frequencyBands,
        lastSpokenLine
      ),
    [voiceState.outputLevel, effectiveMood, tick, activeIsSpeaking, voiceState.frequencyBands, lastSpokenLine]
  );

  const eyeState = useMemo(
    () => resolveEyeState(effectiveMood, tick, activeIsSpeaking),
    [effectiveMood, tick, activeIsSpeaking]
  );

  const energy = activeIsSpeaking
    ? voiceState.outputLevel
    : voiceState.isListening
    ? Math.max(0.18, voiceState.inputLevel)
    : 0.08;

  const commandHistory = useMemo(
    () => scopedEntries.filter((e) => e.role === 'user' || e.role === 'command').map((e) => e.text),
    [scopedEntries]
  );

  const visibleMessages = useMemo(
    () =>
      scopedEntries.filter(
        (e) =>
          e.role === 'user' ||
          e.role === 'hermes' ||
          e.role === 'command' ||
          (showThinking && e.role === 'activity')
      ),
    [scopedEntries, showThinking]
  );

  const pendingApprovals = useMemo(
    () => approvals.filter((a) => a.status === 'pending'),
    [approvals]
  );

  const channelPendingApprovals = useMemo(
    () => pendingApprovals.filter((a) => a.channelId === activeChannel),
    [pendingApprovals, activeChannel]
  );

  const activeTurnCount = useMemo(
    () =>
      scopedEntries.filter((e) => e.role === 'user' || e.role === 'command').length,
    [scopedEntries]
  );

  const timelineBlocks = useMemo(
    () => groupThreadTimeline(visibleMessages, activeIsThinking),
    [visibleMessages, activeIsThinking]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput('');
    setHistoryIdx(-1);
    onSubmitInput(trimmed, trimmed.startsWith('/') ? 'cli' : 'voice');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length === 0) return;
      const nextIdx =
        historyIdx === -1 ? commandHistory.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(nextIdx);
      setInput(commandHistory[nextIdx]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx === -1) return;
      if (historyIdx >= commandHistory.length - 1) {
        setHistoryIdx(-1);
        setInput('');
      } else {
        const nextIdx = historyIdx + 1;
        setHistoryIdx(nextIdx);
        setInput(commandHistory[nextIdx]);
      }
    } else if (e.key === 'Tab' && input.startsWith('/')) {
      e.preventDefault();
      const match = AVAILABLE_COMMANDS.find((c) => c.startsWith(input.toLowerCase()));
      if (match) setInput(match + ' ');
    }
  };

  const statusText = voiceState.isMuted
    ? 'Mute'
    : portraitStatus === 'loading'
    ? 'Calibrating'
    : portraitStatus === 'error'
    ? 'Signal offline'
    : activeIsThinking
    ? 'Thinking'
    : activeIsSpeaking
    ? 'Speaking'
    : voiceState.isListening
    ? 'Listening'
    : 'Standby';

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const anchor = portraitWrapRef.current ?? e.currentTarget;
    const rect = anchor.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.48;
    const normW = Math.max(160, rect.width * 1.4);
    const normH = Math.max(160, rect.height * 1.4);
    const nx = Math.max(-1, Math.min(1, (e.clientX - cx) / normW));
    const ny = Math.max(-1, Math.min(1, (e.clientY - cy) / normH));
    lookTargetRef.current = { x: nx, y: ny };
  };

  const handlePointerLeave = () => {
    lookTargetRef.current = null;
  };

  const isHomeOverview = panelView === 'home';
  const effectivePortraitTint =
    uiConfig.portraitTintHex ??
    (uiConfig.accentPreset === 'emerald' ? null : uiConfig.accentSoftHex);

  return (
    <section
      aria-label="Hermes Voice Conversation Workspace"
      data-testid="ascii-stage"
      data-engine="halftone-portrait-ascii"
      data-dither="braille"
      data-view={panelView}
      data-viseme={viseme}
      data-mood={effectiveMood}
      data-speaking={String(voiceState.isSpeaking)}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="ui-stage-shell relative flex flex-col h-full rounded-2xl border overflow-hidden"
    >
      {/* Mobile Reference-Inspired Dual-Pill Header & Parallel Session Avatar Strip */}
      <MobileWorkspaceBar
        activeChannel={activeChannel}
        activeSessionId={activeHermesSessionId}
        turnCount={activeTurnCount}
        mood={effectiveMood}
        viseme={viseme}
        isSpeaking={activeIsSpeaking}
        isListening={voiceState.isListening}
        isMuted={voiceState.isMuted}
        panelView={panelView}
        pendingCount={pendingApprovals.length}
        showThinking={showThinking}
        canvasSessions={canvasSessions}
        thinkingByChannel={thinkingByChannel}
        onChangePanelView={onChangePanelView}
        onSelectChannel={onSelectChannel}
        onOpenMobileSidebar={onOpenMobileSidebar}
        onResetSession={onResetSession}
        onCycleMood={onCycleMood}
        onToggleMute={onToggleMute}
        onToggleThinking={onToggleThinking}
        onOpenStudio={onOpenStudio}
      />

      {/* Unified Clean Top Bar (Desktop lg+) */}
      {uiConfig.showTopNav ? (
        <div className="hidden lg:flex items-center justify-between gap-3 px-6 pt-3 pb-2 border-b border-white/6 z-30 shrink-0">
          <div className="flex items-center gap-4 min-w-0 overflow-x-auto cyber-scroll">
            {onOpenMobileSidebar && (
              <button
                type="button"
                onClick={onOpenMobileSidebar}
                aria-label="Open tasks and lanes"
                className="lg:hidden inline-flex items-center gap-1.5 text-xs text-emerald-100/75 hover:text-white transition-colors shrink-0 cursor-pointer"
              >
                <PanelLeft className="w-3.5 h-3.5" />
                <span>Tasks</span>
              </button>
            )}

            {(
              [
                { id: 'home', label: 'Home' },
                { id: 'canvas', label: 'Canvas' },
                { id: 'voice', label: 'Thread' },
                {
                  id: 'queue',
                  label: pendingApprovals.length > 0 ? `Queue (${pendingApprovals.length})` : 'Queue',
                },
                { id: 'cli', label: 'CLI' },
              ] as { id: WorkspacePanelView; label: string }[]
            ).map((tab) => {
              const active = panelView === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onChangePanelView(tab.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-0.5 ${
                    active
                      ? 'text-[#6EE7B7] font-medium border-b border-[#34D399]'
                      : 'text-emerald-100/60 hover:text-white border-b border-transparent'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {panelView === 'voice' && (
              <button
                type="button"
                onClick={onToggleThinking}
                aria-pressed={showThinking}
                aria-label={showThinking ? 'Hide agent thinking trace' : 'Show agent thinking trace'}
                title={showThinking ? 'Hide thinking trace' : 'Show thinking trace'}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                  showThinking
                    ? 'bg-[#34D399]/14 text-[#6EE7B7]'
                    : 'text-emerald-100/45 hover:text-white hover:bg-white/6'
                }`}
              >
                <Brain className="w-3.5 h-3.5" />
              </button>
            )}

            {onOpenStudio && (
              <button
                type="button"
                onClick={onOpenStudio}
                data-testid="ui-studio-trigger"
                aria-label="Open UI Studio"
                title="Customize UI Studio"
                className="h-7 px-2 rounded-lg border border-white/10 bg-white/[0.03] text-[11px] font-medium text-emerald-100/75 hover:text-white hover:border-[#34D399]/50 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-3 h-3 text-[#6EE7B7]" />
                <span>Studio</span>
              </button>
            )}

            <button
              type="button"
              onClick={onToggleMute}
              aria-label={voiceState.isMuted ? 'Unmute Hermes audio' : 'Mute Hermes audio'}
              title={voiceState.isMuted ? 'Unmute audio' : 'Mute audio'}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                voiceState.isMuted
                  ? 'bg-rose-500/15 text-rose-200'
                  : 'text-emerald-100/60 hover:text-white hover:bg-white/6'
              }`}
            >
              {voiceState.isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      ) : (
        onOpenStudio && (
          <div className="hidden lg:flex items-center gap-1.5 absolute top-3 right-4 z-30">
            <button
              type="button"
              onClick={onOpenStudio}
              data-testid="ui-studio-trigger"
              aria-label="Open UI Studio"
              className="h-7 px-2.5 rounded-lg border border-white/12 bg-black/45 backdrop-blur-md text-[11px] font-medium text-emerald-100/80 hover:text-white flex items-center gap-1.5 cursor-pointer"
            >
              <SlidersHorizontal className="w-3 h-3 text-[#6EE7B7]" />
              <span>Studio</span>
            </button>
          </div>
        )
      )}

      {/* Center Stage: Overall Character Home View OR Compact Header + Thread/Queue/CLI */}
      {isHomeOverview ? (
        <div
          key="view-home"
          ref={portraitWrapRef}
          data-testid="home-character-overview"
          className="ui-view-enter relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center px-4 sm:px-10 pb-4 sm:pb-6"
        >
          {uiConfig.portraitVisible && (
            <div
              className="relative flex flex-col items-center justify-center transition-transform duration-200"
              style={{ transform: 'scale(var(--ui-portrait-scale, 1))' }}
            >
              <div
                aria-hidden="true"
                className="ui-halo-pulse absolute inset-0 -m-10 rounded-full pointer-events-none"
                style={{
                  background:
                    'radial-gradient(circle at 50% 48%, rgba(var(--ui-accent-rgb), 0.16) 0%, rgba(var(--ui-accent-rgb), 0.05) 44%, transparent 72%)',
                }}
              />
              <div className="relative z-10">
                <AsciiPortraitCanvas
                  variant="stage"
                  mood={effectiveMood}
                  viseme={viseme}
                  eyeState={eyeState}
                  energy={energy}
                  isSpeaking={voiceState.isSpeaking}
                  isListening={voiceState.isListening}
                  lookTargetRef={lookTargetRef}
                  tintHex={effectivePortraitTint}
                  speedScale={uiConfig.animationSpeed}
                  reducedMotionOverride={uiConfig.reducedMotion}
                  onStatusChange={setPortraitStatus}
                  onClick={onCycleMood}
                />
              </div>
            </div>
          )}

          {uiConfig.statusReadoutVisible && (
            <>
              <div className="relative z-10 flex items-center gap-2 mt-2 text-xs text-emerald-100/70">
                <span
                  aria-hidden="true"
                  className={`inline-block w-1.5 h-1.5 rounded-full ${
                    activeIsSpeaking || voiceState.isListening
                      ? 'bg-[#4ADE80]'
                      : activeIsThinking
                      ? 'bg-amber-400'
                      : 'bg-emerald-200/45'
                  }`}
                />
                <span>{statusText}</span>
                <span aria-hidden="true" className="text-emerald-100/30">·</span>
                <span className="font-mono text-[11px] text-[#6EE7B7]/85">#{activeChannel}</span>
              </div>

              {/* Live Decoded Speech / Response Readout */}
              <div className="relative z-10 mt-3.5 max-w-[52ch] text-center space-y-2.5">
                <p
                  data-testid="home-decoded-line"
                  className="text-sm sm:text-[15px] leading-relaxed text-white/95"
                >
                  {activeIsThinking ? (
                    <DecodedText text={`Routing turn inside ${activeHermesSessionId}...`} animate />
                  ) : (
                    <DecodedText text={lastSpokenLine} animate={animateSpeechLine} />
                  )}
                </p>

                {(activeIsThinking || activeIsSpeaking || visibleMessages.length > 0 || pendingApprovals.length > 0) && (
                  <div className="flex items-center justify-center gap-4 text-xs text-emerald-100/55">
                    {(activeIsThinking || activeIsSpeaking) && (
                      <button
                        type="button"
                        onClick={onStopSpeaking}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.06] border border-white/15 text-emerald-50 hover:bg-white/12 transition-colors cursor-pointer"
                      >
                        <Square className="w-2.5 h-2.5 fill-current" />
                        <span>Stop</span>
                      </button>
                    )}
                    {visibleMessages.length > 0 && (
                      <button
                        type="button"
                        onClick={() => onChangePanelView('voice')}
                        className="text-[#6EE7B7]/90 hover:text-white underline underline-offset-4 decoration-[#34D399]/35 transition-colors cursor-pointer"
                      >
                        Open thread ({visibleMessages.length})
                      </button>
                    )}
                    {pendingApprovals.length > 0 && (
                      <button
                        type="button"
                        onClick={() => onChangePanelView('queue')}
                        className="hover:text-white underline underline-offset-4 decoration-white/20 transition-colors cursor-pointer"
                      >
                        {pendingApprovals.length} pending
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ) : panelView === 'canvas' ? (
        <BrailleSessionsCanvas
          sessions={canvasSessions}
          hermesSessions={hermesSessions}
          thinkingByChannel={thinkingByChannel}
          speakingChannel={speakingChannel}
          activeChannel={activeChannel}
          entries={entries}
          voiceState={voiceState}
          viseme={viseme}
          speedScale={uiConfig.animationSpeed}
          reducedMotionOverride={uiConfig.reducedMotion}
          onSelectSession={onSelectCanvasSession}
          onMoveSession={onMoveCanvasSession}
          onAddSession={onAddCanvasSession}
          onSubmitSessionMessage={onSubmitSessionInput}
          onToggleListening={onToggleListening}
          onAutoArrange={onAutoArrangeCanvas}
          onCycleSessionMood={onCycleSessionMood}
          onResetSession={onResetSession}
          onRemoveSession={onRemoveCanvasSession}
          onOpenSessionThread={onOpenSessionThread}
        />
      ) : (
        <>
          {/* Desktop Compact Top-Center Portrait for Thread / Queue / CLI Views */}
          {uiConfig.portraitVisible && (
            <div
              ref={portraitWrapRef}
              className="hidden lg:flex flex-col items-center justify-center pt-1 pb-1 shrink-0"
            >
              <AsciiPortraitCanvas
                variant="hero"
                mood={effectiveMood}
                viseme={viseme}
                eyeState={eyeState}
                energy={energy}
                isSpeaking={activeIsSpeaking}
                isListening={voiceState.isListening}
                lookTargetRef={lookTargetRef}
                tintHex={effectivePortraitTint}
                speedScale={uiConfig.animationSpeed}
                reducedMotionOverride={uiConfig.reducedMotion}
                onClick={onCycleMood}
              />

              <div className="flex flex-wrap items-center justify-center gap-2 mt-1 px-4 text-xs font-medium text-emerald-50/80">
                <span
                  aria-hidden="true"
                  className={`inline-block w-2 h-2 rounded-full ${
                    activeIsSpeaking || voiceState.isListening
                      ? 'bg-[#4ADE80]'
                      : activeIsThinking
                      ? 'bg-amber-400'
                      : 'bg-emerald-200/40'
                  }`}
                />
                <span>{statusText}</span>
                <span aria-hidden="true" className="text-emerald-100/35">·</span>
                <span className="font-mono text-[11px] text-[#6EE7B7]" data-testid="active-hermes-session-id">
                  {activeHermesSessionId}
                </span>
                {activeShapeMeta && (
                  <>
                    <span aria-hidden="true" className="text-emerald-100/35">·</span>
                    <span className="text-[11px] text-emerald-100/65">{activeShapeMeta.label}</span>
                  </>
                )}
                {panelView === 'voice' && (
                  <button
                    type="button"
                    onClick={() => onResetSession(activeChannel)}
                    title="Reset isolated hermes-agent session context"
                    className="ml-1 inline-flex items-center gap-1 text-[11px] text-emerald-100/55 hover:text-white underline underline-offset-4 decoration-white/20 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Mobile Compact Character Presence Strip in Thread View (includes animated character without crowding) */}
          {panelView === 'voice' && uiConfig.portraitVisible && (
            <div className="flex lg:hidden items-center gap-2.5 mx-2.5 my-1 rounded-2xl bg-white/[0.035] border border-white/10 px-2.5 py-1.5 shrink-0">
              <div className="relative w-[68px] h-[60px] rounded-xl bg-black/35 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                <div className="scale-[0.31] origin-center">
                  <AsciiPortraitCanvas
                    variant="hero"
                    mood={effectiveMood}
                    viseme={viseme}
                    eyeState={eyeState}
                    energy={energy}
                    isSpeaking={activeIsSpeaking}
                    isListening={voiceState.isListening}
                    lookTargetRef={lookTargetRef}
                    tintHex={effectivePortraitTint}
                    speedScale={uiConfig.animationSpeed}
                    reducedMotionOverride={uiConfig.reducedMotion}
                    onClick={onCycleMood}
                  />
                </div>
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-100/75">
                  <span
                    aria-hidden="true"
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      activeIsSpeaking || voiceState.isListening
                        ? 'bg-[#4ADE80]'
                        : activeIsThinking
                        ? 'bg-amber-400'
                        : 'bg-emerald-200/45'
                    }`}
                  />
                  <span className="font-medium text-white">{statusText}</span>
                  <span aria-hidden="true" className="text-emerald-100/30">·</span>
                  <span className="font-mono text-[#6EE7B7] truncate">{activeHermesSessionId}</span>
                </div>
                <div className="text-[11px] text-emerald-100/55 truncate">
                  {activeIsThinking
                    ? `Routing turn inside ${activeHermesSessionId}…`
                    : `${activeShapeMeta?.label ?? 'Hermes'} · Tap portrait to cycle mood`}
                </div>
              </div>
              <button
                type="button"
                onClick={onToggleThinking}
                aria-pressed={showThinking}
                className={`shrink-0 px-2.5 py-1.5 rounded-xl border text-[10.5px] font-mono transition-colors cursor-pointer ${
                  showThinking
                    ? 'bg-[#34D399]/14 border-[#34D399]/35 text-[#6EE7B7]'
                    : 'bg-white/[0.04] border-white/10 text-emerald-100/60'
                }`}
              >
                {showThinking ? 'Trace on' : 'Trace off'}
              </button>
            </div>
          )}

          {panelView === 'queue' ? (
            <div key="view-queue" className="ui-view-enter flex-1 min-h-0 px-3 sm:px-8 py-2 sm:py-3 overflow-y-auto cyber-scroll">
              <DuetOperationsPanel
                channels={channels}
                activeChannel={activeChannel}
                onSelectChannel={onSelectChannel}
                approvals={approvals}
                onApproveCard={onApproveCard}
                onRejectCard={onRejectCard}
                brief={brief}
                onRunBriefCommand={(cmd, id) => {
                  onRunBriefCommand(cmd, id);
                  onChangePanelView('voice');
                }}
                tasks={tasks}
                onToggleTaskStatus={onToggleTaskStatus}
                gatewayStatus={gatewayStatus}
              />
            </div>
          ) : panelView === 'cli' ? (
            <div key="view-cli" className="ui-view-enter flex-1 min-h-0 px-3 sm:px-8 py-2 sm:py-3 overflow-hidden">
              <CommandTerminal
                activeChannel={activeChannel}
                activeSessionId={activeHermesSessionId}
                entries={entries}
                isThinking={activeIsThinking}
                onSubmitInput={(val) => onSubmitInput(val, 'cli')}
              />
            </div>
          ) : (
            <div
              key="view-voice"
              ref={scrollRef}
              data-testid="voice-transcript-stream"
              className="ui-view-enter transcript-fade-mask flex-1 min-h-0 overflow-y-auto cyber-scroll px-3.5 sm:px-14 lg:px-20 py-3 sm:py-4 space-y-4 sm:space-y-5"
            >
              {timelineBlocks.map((block, idx) => {
                if (block.kind === 'trace') {
                  return (
                    <ThreadTraceTree
                      key={block.id}
                      sessionId={activeHermesSessionId}
                      items={block.items}
                      isLive={block.isLive}
                    />
                  );
                }

                const entry = block.entry;
                const isUser = entry.role === 'user' || entry.role === 'command';
                if (isUser) {
                  return (
                    <div
                      key={entry.id}
                      className="ui-msg-enter ml-auto max-w-[85%] sm:max-w-[66%] rounded-2xl bg-white/[0.07] border border-white/10 px-3.5 sm:px-4 py-2.5 sm:py-3 text-[13.5px] leading-relaxed text-emerald-50/90"
                    >
                      <p className="whitespace-pre-wrap break-words">{entry.text}</p>
                    </div>
                  );
                }
                return (
                  <div key={entry.id} className="ui-msg-enter max-w-[68ch] space-y-2">
                    <p className="text-[14.5px] sm:text-[16px] leading-[1.6] font-normal text-white/95 whitespace-pre-wrap break-words">
                      <DecodedText
                        text={entry.text}
                        animate={!entry.id.startsWith('init-')}
                      />
                    </p>
                    {idx > 0 && (
                      <div className="flex items-center gap-2 font-mono text-[11px] text-emerald-100/45 tabular-nums">
                        <span>{entry.timestamp}</span>
                        <span aria-hidden="true">·</span>
                        <span>#{entry.channelId}</span>
                        <span aria-hidden="true">·</span>
                        <span>{activeHermesSessionId}</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {voiceState.interimTranscript && (
                <div className="ml-auto max-w-[85%] sm:max-w-[66%] rounded-2xl bg-[#34D399]/12 border border-[#34D399]/40 px-3.5 sm:px-4 py-2.5 sm:py-3 text-[13.5px] leading-relaxed text-emerald-50">
                  <p className="whitespace-pre-wrap break-words">{voiceState.interimTranscript}</p>
                </div>
              )}

              {/* Reference-style inline pending status pill + approval action */}
              {channelPendingApprovals.length > 0 && !activeIsThinking && (
                <div
                  data-testid={`approval-card-${channelPendingApprovals[0].id}`}
                  className="max-w-[68ch] space-y-2.5"
                >
                  <button
                    type="button"
                    onClick={() => onChangePanelView('queue')}
                    className="w-full rounded-2xl bg-white/[0.05] border border-white/12 px-3.5 py-2.5 flex items-center justify-between gap-2.5 text-left hover:border-[#34D399]/40 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <RefreshCw className="w-4 h-4 text-[#6EE7B7] shrink-0" aria-hidden="true" />
                      <span className="text-xs sm:text-[13px] font-medium text-white truncate">
                        Approval waiting: {channelPendingApprovals[0].title}
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-emerald-100/50 shrink-0" aria-hidden="true" />
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onApproveCard(channelPendingApprovals[0].id)}
                      className="min-h-[42px] px-4 rounded-xl bg-[#34D399] text-[#05140E] font-semibold text-xs flex items-center gap-1.5 hover:bg-[#6EE7B7] transition-colors cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Approve</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRejectCard(channelPendingApprovals[0].id)}
                      className="min-h-[42px] px-3.5 rounded-xl bg-white/[0.06] border border-white/12 text-emerald-50/85 hover:text-white text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Not now</span>
                    </button>
                  </div>
                </div>
              )}

              {(activeIsThinking || activeIsSpeaking) && (
                <div className="flex items-center justify-between gap-3 pt-1 max-w-[68ch]">
                  <span className="font-mono text-[11px] text-emerald-100/55 tabular-nums">
                    {workingSeconds > 0 ? `${workingSeconds}s elapsed` : 'Live turn'} · #{activeChannel}
                  </span>
                  <button
                    type="button"
                    onClick={onStopSpeaking}
                    className="inline-flex items-center gap-2 min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white/[0.07] border border-white/15 text-xs font-medium text-emerald-50 hover:bg-white/12 transition-colors cursor-pointer"
                  >
                    <Square className="w-3 h-3 fill-current" />
                    <span>Stop</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Fluid Bottom Braille Wave Horizon inside the Main Window (Home Overview) */}
      {isHomeOverview && uiConfig.horizonVisible && (
        <div
          data-testid="horizon-wave-container"
          className="pointer-events-none absolute inset-x-0 bottom-[106px] lg:bottom-[68px] h-[112px] sm:h-[144px] z-0 overflow-hidden"
          style={{ opacity: uiConfig.horizonOpacity }}
        >
          <BrailleHorizonCanvas
            energy={energy}
            isActive={activeIsSpeaking || voiceState.isListening}
            frequencyBands={voiceState.frequencyBands}
            lookTargetRef={lookTargetRef}
            speedScale={uiConfig.animationSpeed}
            reducedMotionOverride={uiConfig.reducedMotion}
          />
        </div>
      )}

      {/* Floating Glass Composer Dock (2-row thumb dock on mobile, sleek single-row bar on lg+) */}
      {panelView !== 'canvas' && (
        <div
          className={`relative z-20 shrink-0 ${
            uiConfig.composerStyle === 'floating'
              ? 'px-4 sm:px-10 lg:px-20 pb-3.5 lg:pb-5 pt-1.5'
              : uiConfig.composerStyle === 'minimal'
              ? 'px-3 sm:px-8 lg:px-16 pb-2 lg:pb-3 pt-1'
              : 'px-2.5 sm:px-6 lg:px-14 pb-2.5 lg:pb-3.5 pt-1.5 lg:pt-2'
          } ${
            isHomeOverview && uiConfig.composerStyle === 'docked'
              ? 'bg-gradient-to-t from-black/45 via-black/25 to-transparent'
              : ''
          }`}
        >
          <form
            onSubmit={handleSubmit}
            className={`flex flex-col lg:flex-row lg:items-center gap-1.5 lg:gap-2.5 rounded-[22px] lg:rounded-xl border px-3 py-2.5 lg:px-3.5 lg:py-1.5 backdrop-blur-xl transition-colors ${
              uiConfig.composerStyle === 'minimal'
                ? 'border-white/10 bg-black/30 shadow-none'
                : uiConfig.composerStyle === 'floating'
                ? 'border-white/18 bg-black/55 shadow-[0_14px_38px_rgba(0,0,0,0.52)]'
                : 'shadow-[0_-6px_28px_rgba(0,0,0,0.42)] lg:shadow-none'
            } ${
              voiceState.isListening
                ? 'border-[#4ADE80] bg-[#071410]/94'
                : uiConfig.composerStyle === 'docked'
                ? 'ui-composer-docked'
                : 'focus-within:border-[#4ADE80]'
            }`}
          >
            {/* Row 1 (Mobile) / Flex Input (Desktop) */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span
                aria-hidden="true"
                className={`hidden lg:inline font-mono text-sm select-none ${
                  voiceState.isListening ? 'text-[#4ADE80]' : 'text-emerald-100/50'
                }`}
              >
                &gt;
              </span>

              <label htmlFor="hermes-voice-input" className="sr-only">
                Voice transcript or command input
              </label>
              <input
                id="hermes-voice-input"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  activeIsThinking || activeIsSpeaking
                    ? `Working · ${workingSeconds}s`
                    : voiceState.isListening
                    ? 'Listening...'
                    : `Steer #${activeChannel} or type /help`
                }
                className="flex-1 min-w-0 bg-transparent text-[14px] lg:text-sm text-white placeholder:text-emerald-100/45 focus:outline-none py-1.5 px-1 lg:px-0"
              />
            </div>

            {/* Mobile 2nd Row Toolbar: Thumb-Zone Utility Pills + Voice/Send */}
            <div className="flex items-center justify-between gap-2 lg:justify-end shrink-0">
              {/* Left Tool Cluster (Mobile only; desktop uses top tabs & sidebar) */}
              <div className="flex lg:hidden items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onChangePanelView(panelView === 'cli' ? 'voice' : 'cli')}
                  aria-label="Toggle CLI view"
                  title="CLI"
                  className={`w-10 h-10 rounded-full border flex items-center justify-center transition-colors cursor-pointer ${
                    panelView === 'cli'
                      ? 'bg-[#34D399]/18 border-[#34D399]/55 text-[#6EE7B7]'
                      : 'bg-white/[0.06] border-white/10 text-emerald-100/75 hover:text-white'
                  }`}
                >
                  <Terminal className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => onChangePanelView(panelView === 'queue' ? 'voice' : 'queue')}
                  aria-label="Toggle Queue and Approvals"
                  title="Queue"
                  className={`relative w-10 h-10 rounded-full border flex items-center justify-center transition-colors cursor-pointer ${
                    panelView === 'queue'
                      ? 'bg-[#34D399]/18 border-[#34D399]/55 text-[#6EE7B7]'
                      : 'bg-white/[0.06] border-white/10 text-emerald-100/75 hover:text-white'
                  }`}
                >
                  <ListChecks className="w-4 h-4" />
                  {pendingApprovals.length > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#34D399] text-[#05140E] font-mono text-[9.5px] font-bold flex items-center justify-center tabular-nums">
                      {pendingApprovals.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onChangePanelView('canvas')}
                  aria-label="Switch to Canvas"
                  title="Canvas"
                  className="w-10 h-10 rounded-full bg-white/[0.06] border border-white/10 text-emerald-100/75 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </div>

              {/* Right Action Cluster: Reset / Working Ring / Mic / Send or Stop */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onResetSession(activeChannel)}
                  aria-label="Clear or reset active session"
                  title="Reset session"
                  className="lg:hidden w-10 h-10 rounded-full bg-white/[0.06] border border-white/10 text-emerald-100/75 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>

                {(activeIsThinking || activeIsSpeaking) && (
                  <button
                    type="button"
                    onClick={onStopSpeaking}
                    aria-label="Stop active run"
                    title="Stop"
                    className="lg:hidden w-10 h-10 rounded-full border border-rose-400/50 bg-rose-500/15 text-rose-200 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={onToggleListening}
                  aria-pressed={voiceState.isListening}
                  aria-label={voiceState.isListening ? 'Stop voice input' : 'Start voice input'}
                  className={`w-10 h-10 lg:w-8 lg:h-8 rounded-full lg:rounded-lg flex items-center justify-center transition-colors cursor-pointer shrink-0 border lg:border-0 ${
                    voiceState.isListening
                      ? 'bg-[#34D399]/22 text-[#4ADE80] border-[#4ADE80]/60'
                      : 'bg-white/[0.06] lg:bg-transparent border-white/10 text-[#34D399] hover:text-[#6EE7B7] hover:bg-white/10'
                  }`}
                >
                  {voiceState.isListening ? (
                    <Mic className="w-4 h-4" />
                  ) : (
                    <MicOff className="w-4 h-4" />
                  )}
                </button>

                {input.trim() ? (
                  <button
                    type="submit"
                    aria-label="Send message or command"
                    className="w-10 h-10 lg:w-8 lg:h-8 rounded-full lg:rounded-lg bg-[#34D399] text-[#05140E] flex items-center justify-center hover:bg-[#6EE7B7] transition-colors cursor-pointer shrink-0"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      onChangePanelView(panelView === 'home' ? 'voice' : 'home')
                    }
                    aria-label={panelView === 'home' ? 'Open Thread' : 'Focus Character Home'}
                    title={panelView === 'home' ? 'Open Thread' : 'Character Home'}
                    className="lg:hidden w-10 h-10 rounded-full bg-white/[0.08] border border-white/14 text-white flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
