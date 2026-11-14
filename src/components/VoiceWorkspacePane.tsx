import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  MessageSquareText,
  Globe,
  Terminal as TerminalIcon,
  Mic,
  MicOff,
  Square,
  Volume2,
  VolumeX,
  ArrowUp,
  Brain,
  Check,
  X,
  Shapes,
  RotateCcw,
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
import type { BrailleShapeKind, BrailleShapeTint } from '../utils/brailleShapesEngine';
import { getShapeMeta, type CanvasSession } from '../utils/canvasSessions';
import { AVAILABLE_COMMANDS } from '../utils/cliEngine';
import { AsciiPortraitCanvas } from './AsciiPortraitCanvas';
import { BrailleHorizonCanvas } from './BrailleHorizonCanvas';
import { BrailleSessionsCanvas } from './BrailleSessionsCanvas';
import { DecodedText } from './DecodedText';
import { DuetOperationsPanel } from './DuetOperationsPanel';
import { CommandTerminal } from './CommandTerminal';

export type WorkspacePanelView = 'home' | 'canvas' | 'voice' | 'queue' | 'cli';

interface VoiceWorkspacePaneProps {
  channels: Channel[];
  activeChannel: ChannelId;
  onSelectChannel: (id: ChannelId) => void;
  mood: ExpressionMood;
  onCycleMood: () => void;
  panelView: WorkspacePanelView;
  onChangePanelView: (view: WorkspacePanelView) => void;
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
}

export function VoiceWorkspacePane({
  channels,
  activeChannel,
  onSelectChannel,
  mood,
  onCycleMood,
  panelView,
  onChangePanelView,
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
}: VoiceWorkspacePaneProps) {
  const [tick, setTick] = useState(0);
  const [input, setInput] = useState('');
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [workingSeconds, setWorkingSeconds] = useState(0);
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

  const runningTask = useMemo(
    () => tasks.find((t) => t.status === 'running') ?? tasks[0],
    [tasks]
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
      className="relative flex flex-col h-full rounded-2xl bg-[#0A1613]/92 border border-[#34D399]/60 shadow-[0_0_32px_rgba(52,211,153,0.09)] overflow-hidden"
    >
      {/* Top Bar matching reference: left breadcrumbs + right utility controls */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-3 pb-1 z-30 shrink-0">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 overflow-hidden text-xs text-emerald-100/60">
          <button
            type="button"
            onClick={() => onChangePanelView('home')}
            className={`underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              isHomeOverview
                ? 'text-[#6EE7B7] font-medium decoration-[#34D399]/60'
                : 'text-emerald-50/80 hover:text-white decoration-white/20'
            }`}
          >
            Home
          </button>
          <span aria-hidden="true" className="text-emerald-100/30 shrink-0">·</span>
          <button
            type="button"
            onClick={() => onChangePanelView('canvas')}
            className={`underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              panelView === 'canvas'
                ? 'text-[#6EE7B7] font-medium decoration-[#34D399]/60'
                : 'text-emerald-50/80 hover:text-white decoration-white/20'
            }`}
          >
            Canvas
          </button>
          <span aria-hidden="true" className="hidden sm:inline text-emerald-100/30 shrink-0">·</span>
          <button
            type="button"
            onClick={() => onChangePanelView(panelView === 'queue' ? 'home' : 'queue')}
            className="hidden sm:inline hover:text-white underline underline-offset-4 decoration-white/20 truncate cursor-pointer"
          >
            ← {runningTask ? runningTask.title : `#${activeChannel}`}
          </button>
          <span aria-hidden="true" className="hidden md:inline text-emerald-100/30 shrink-0">·</span>
          <button
            type="button"
            onClick={() => onSubmitInput('/brief', 'cli')}
            className="hidden md:inline hover:text-white underline underline-offset-4 decoration-white/20 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Morning brief
          </button>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onToggleThinking}
            aria-pressed={showThinking}
            aria-label={showThinking ? 'Hide agent thinking trace' : 'Show agent thinking trace'}
            title={showThinking ? 'Hide thinking trace' : 'Show thinking trace'}
            className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
              showThinking
                ? 'border-[#34D399]/50 bg-[#34D399]/12 text-[#6EE7B7]'
                : 'border-white/12 bg-white/[0.05] text-emerald-50/50 hover:text-white hover:border-white/25'
            }`}
          >
            <Brain className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={voiceState.isMuted ? 'Unmute Hermes audio' : 'Mute Hermes audio'}
            title={voiceState.isMuted ? 'Unmute audio' : 'Mute audio'}
            className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
              voiceState.isMuted
                ? 'border-rose-400/45 bg-rose-500/15 text-rose-200'
                : 'border-white/12 bg-white/[0.05] text-emerald-50/75 hover:text-white hover:border-white/25'
            }`}
          >
            {voiceState.isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => onChangePanelView('home')}
            aria-pressed={panelView === 'home'}
            aria-label="Character overview home view"
            title="Character Overview (Home)"
            className={`hidden sm:flex w-8 h-8 rounded-lg border items-center justify-center transition-colors cursor-pointer ${
              panelView === 'home'
                ? 'border-[#34D399] bg-[#34D399]/18 text-[#6EE7B7]'
                : 'border-white/12 bg-white/[0.05] text-emerald-50/75 hover:text-white hover:border-white/25'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onChangePanelView(panelView === 'canvas' ? 'home' : 'canvas')}
            aria-pressed={panelView === 'canvas'}
            aria-label="Open Braille sessions canvas"
            title="Braille Sessions Canvas"
            className={`hidden sm:flex w-8 h-8 rounded-lg border items-center justify-center transition-colors cursor-pointer ${
              panelView === 'canvas'
                ? 'border-[#34D399] bg-[#34D399]/18 text-[#6EE7B7]'
                : 'border-white/12 bg-white/[0.05] text-emerald-50/75 hover:text-white hover:border-white/25'
            }`}
          >
            <Shapes className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onChangePanelView(panelView === 'voice' ? 'home' : 'voice')}
            aria-pressed={panelView === 'voice'}
            aria-label="Switch to voice conversation thread view"
            title="Voice Conversation Thread"
            className={`hidden sm:flex w-8 h-8 rounded-lg border items-center justify-center transition-colors cursor-pointer ${
              panelView === 'voice'
                ? 'border-[#34D399] bg-[#34D399]/18 text-[#6EE7B7]'
                : 'border-white/12 bg-white/[0.05] text-emerald-50/75 hover:text-white hover:border-white/25'
            }`}
          >
            <MessageSquareText className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onChangePanelView(panelView === 'queue' ? 'home' : 'queue')}
            aria-pressed={panelView === 'queue'}
            aria-label="Toggle approvals and Hermes runtime queue"
            title="Duet Gates, Brief & Hermes Agent Runtime"
            className={`hidden sm:flex w-8 h-8 rounded-lg border items-center justify-center transition-colors cursor-pointer ${
              panelView === 'queue'
                ? 'border-[#34D399] bg-[#34D399]/18 text-[#6EE7B7]'
                : 'border-white/12 bg-white/[0.05] text-emerald-50/75 hover:text-white hover:border-white/25'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onChangePanelView(panelView === 'cli' ? 'home' : 'cli')}
            aria-pressed={panelView === 'cli'}
            aria-label="Toggle interactive CLI console"
            title="Interactive Command Line (hermes-duet)"
            className={`hidden sm:flex w-8 h-8 rounded-lg border items-center justify-center transition-colors cursor-pointer ${
              panelView === 'cli'
                ? 'border-[#34D399] bg-[#34D399]/18 text-[#6EE7B7]'
                : 'border-white/12 bg-white/[0.05] text-emerald-50/75 hover:text-white hover:border-white/25'
            }`}
          >
            <TerminalIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Center Stage: Overall Character Home View OR Compact Header + Thread/Queue/CLI */}
      {isHomeOverview ? (
        <div
          ref={portraitWrapRef}
          data-testid="home-character-overview"
          className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center px-6 sm:px-10 pb-6"
        >
          <div className="relative flex flex-col items-center justify-center">
            <div
              aria-hidden="true"
              className="absolute inset-0 -m-10 rounded-full pointer-events-none"
              style={{
                background:
                  'radial-gradient(circle at 50% 48%, rgba(52, 211, 153, 0.14) 0%, rgba(16, 86, 66, 0.06) 44%, transparent 72%)',
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
                onClick={onCycleMood}
              />
            </div>
          </div>

          <div className="relative z-10 flex items-center gap-2 mt-2 text-xs font-medium text-emerald-50/80">
            <span
              aria-hidden="true"
              className={`inline-block w-2 h-2 rounded-full ${
                activeIsSpeaking || voiceState.isListening
                  ? 'bg-[#4ADE80]'
                  : activeIsThinking
                  ? 'bg-amber-400'
                  : 'bg-emerald-200/45'
              }`}
            />
            <span>{statusText}</span>
            <span aria-hidden="true" className="text-emerald-100/35">·</span>
            <span className="font-mono text-[11px] text-emerald-100/60">{effectiveMood}</span>
            <span aria-hidden="true" className="text-emerald-100/35">·</span>
            <span className="font-mono text-[11px] text-[#6EE7B7]/80">
              {gatewayStatus?.connected ? 'gateway :8642' : activeHermesSessionId}
            </span>
          </div>

          {/* Live Decoded Speech / Response Readout beneath the Character */}
          <div className="relative z-10 mt-4 max-w-[56ch] text-center space-y-2">
            <p
              data-testid="home-decoded-line"
              className="text-sm sm:text-[15.5px] leading-relaxed text-white/95"
            >
              {activeIsThinking ? (
                <DecodedText text={`Routing turn inside ${activeHermesSessionId}...`} animate />
              ) : (
                <DecodedText text={lastSpokenLine} animate={animateSpeechLine} />
              )}
            </p>

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
              <button
                type="button"
                onClick={() => onChangePanelView('voice')}
                className="text-[#6EE7B7]/90 hover:text-white underline underline-offset-4 decoration-[#34D399]/35 transition-colors cursor-pointer"
              >
                Open thread ({visibleMessages.length})
              </button>
              <button
                type="button"
                onClick={() => onChangePanelView('queue')}
                className="hover:text-white underline underline-offset-4 decoration-white/20 transition-colors cursor-pointer"
              >
                {pendingApprovals.length} mcp__duet gates
              </button>
            </div>
          </div>
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
          lastSpokenLine={lastSpokenLine}
          onSelectSession={onSelectCanvasSession}
          onMoveSession={onMoveCanvasSession}
          onAddSession={onAddCanvasSession}
          onAutoArrange={onAutoArrangeCanvas}
          onCycleSessionMood={onCycleSessionMood}
          onResetSession={onResetSession}
          onRemoveSession={onRemoveCanvasSession}
          onOpenSessionThread={onOpenSessionThread}
        />
      ) : (
        <>
          {/* Compact Top-Center Portrait for Thread / Queue / CLI Views */}
          <div
            ref={portraitWrapRef}
            className="flex flex-col items-center justify-center pt-1 pb-1 shrink-0"
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

          {panelView === 'queue' ? (
            <div className="flex-1 min-h-0 px-5 sm:px-8 py-3 overflow-y-auto cyber-scroll">
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
            <div className="flex-1 min-h-0 px-5 sm:px-8 py-3 overflow-hidden">
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
              ref={scrollRef}
              data-testid="voice-transcript-stream"
              className="transcript-fade-mask flex-1 min-h-0 overflow-y-auto cyber-scroll px-6 sm:px-14 lg:px-20 py-4 space-y-5"
            >
              {visibleMessages.map((entry, idx) => {
                const isUser = entry.role === 'user' || entry.role === 'command';
                if (entry.role === 'activity') {
                  return (
                    <div
                      key={entry.id}
                      className="flex items-baseline gap-2 font-mono text-[11.5px] text-emerald-100/45"
                    >
                      <span aria-hidden="true" className="text-[#6EE7B7]/70 shrink-0">▸</span>
                      <span className="truncate">{entry.text}</span>
                      <span className="tabular-nums shrink-0 text-emerald-100/25">
                        {entry.timestamp}
                      </span>
                    </div>
                  );
                }
                if (isUser) {
                  return (
                    <div
                      key={entry.id}
                      className="ml-auto max-w-[82%] sm:max-w-[66%] rounded-xl bg-white/[0.07] border border-white/10 px-4 py-3 text-[13.5px] leading-relaxed text-emerald-50/90"
                    >
                      <p className="whitespace-pre-wrap break-words">{entry.text}</p>
                    </div>
                  );
                }
                return (
                  <div key={entry.id} className="max-w-[68ch] space-y-2.5">
                    {idx > 0 && (
                      <div className="flex items-center gap-2 text-xs text-emerald-100/50">
                        <span className="underline underline-offset-4 decoration-white/20">
                          Hermes · #{entry.channelId}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums font-mono text-[11px]">{entry.timestamp}</span>
                      </div>
                    )}
                    <p className="text-[15.5px] sm:text-[16px] leading-[1.6] font-normal text-white/95 whitespace-pre-wrap break-words">
                      <DecodedText
                        text={entry.text}
                        animate={!entry.id.startsWith('init-')}
                      />
                    </p>
                  </div>
                );
              })}

              {voiceState.interimTranscript && (
                <div className="ml-auto max-w-[82%] sm:max-w-[66%] rounded-xl bg-[#34D399]/12 border border-[#34D399]/40 px-4 py-3 text-[13.5px] leading-relaxed text-emerald-50">
                  <p className="whitespace-pre-wrap break-words">{voiceState.interimTranscript}</p>
                </div>
              )}

              {channelPendingApprovals.length > 0 && !activeIsThinking && (
                <div
                  data-testid={`approval-card-${channelPendingApprovals[0].id}`}
                  className="rounded-xl bg-white/[0.05] border border-white/12 px-4 py-3 max-w-[68ch] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-mono text-[11px] text-emerald-100/55">
                      <span className="text-[#6EE7B7]">{channelPendingApprovals[0].id}</span>
                      <span aria-hidden="true">·</span>
                      <span>#{channelPendingApprovals[0].channelId}</span>
                    </div>
                    <p className="text-sm font-medium text-white truncate mt-0.5">
                      {channelPendingApprovals[0].title}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onApproveCard(channelPendingApprovals[0].id)}
                      className="min-h-[36px] px-3.5 rounded-lg bg-[#34D399] text-[#05140E] font-semibold text-xs flex items-center gap-1.5 hover:bg-[#6EE7B7] transition-colors cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Approve</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRejectCard(channelPendingApprovals[0].id)}
                      className="min-h-[36px] px-3 rounded-lg bg-white/[0.06] border border-white/12 text-emerald-50/80 hover:text-white text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Not now</span>
                    </button>
                  </div>
                </div>
              )}

              {(activeIsThinking || activeIsSpeaking) && (
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center gap-2.5 text-sm font-medium text-emerald-50/90">
                    <span aria-hidden="true" className="text-[#6EE7B7]">
                      ❖
                    </span>
                    <span>{activeIsThinking ? `Thinking (${activeHermesSessionId})` : 'Speaking'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={onStopSpeaking}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/15 text-xs font-medium text-emerald-50 hover:bg-white/12 transition-colors cursor-pointer"
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
      {isHomeOverview && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[74px] sm:bottom-[80px] h-[132px] sm:h-[150px] z-0 overflow-hidden opacity-85">
          <BrailleHorizonCanvas
            energy={energy}
            isActive={activeIsSpeaking || voiceState.isListening}
            frequencyBands={voiceState.frequencyBands}
            lookTargetRef={lookTargetRef}
          />
        </div>
      )}

      {/* Bottom Emerald-Framed Voice & Command Dock matching reference */}
      <div
        className={`relative z-20 px-5 sm:px-10 lg:px-16 pb-4 pt-3 shrink-0 space-y-2 ${
          isHomeOverview
            ? 'bg-gradient-to-t from-[#091512] via-[#091512]/94 to-transparent'
            : ''
        }`}
      >
        <div className="flex items-center justify-between gap-2 text-[11.5px] text-emerald-100/65">
          <div className="flex items-center gap-2 min-w-0">
            <span className="shrink-0 sm:hidden">
              {activeIsThinking || activeIsSpeaking
                ? `Working · ${workingSeconds}s`
                : `#${activeChannel}`}
            </span>
            <span className="hidden sm:inline shrink-0 font-mono text-[11px]">
              {activeIsThinking || activeIsSpeaking
                ? `Working · ${workingSeconds}s`
                : `${activeHermesSessionId} · #${activeChannel}`}
            </span>
            <span aria-hidden="true" className="hidden sm:inline">·</span>
            <span className="hidden sm:inline truncate">
              {voiceState.isListening ? 'Voice active' : 'Tap mic or type /help'}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0 font-mono text-[11px]">
            <button
              type="button"
              onClick={() => onSubmitInput('/brief', 'cli')}
              className="text-emerald-100/65 hover:text-[#6EE7B7] transition-colors cursor-pointer whitespace-nowrap"
            >
              “/brief”
            </button>
            <button
              type="button"
              onClick={() => onSubmitInput('/skills', 'cli')}
              className="text-emerald-100/65 hover:text-[#6EE7B7] transition-colors cursor-pointer whitespace-nowrap"
            >
              “/skills”
            </button>
            <button
              type="button"
              onClick={() => onSubmitInput('/gateway', 'cli')}
              className="text-emerald-100/65 hover:text-[#6EE7B7] transition-colors cursor-pointer whitespace-nowrap"
            >
              “/gateway”
            </button>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2 transition-colors ${
            voiceState.isListening
              ? 'border-[#4ADE80] bg-[#071410]/90'
              : 'border-[#34D399]/60 focus-within:border-[#4ADE80] bg-[#07120F]/88'
          }`}
        >
          <span
            aria-hidden="true"
            className={`font-mono text-sm select-none ${
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
              voiceState.isListening
                ? 'Listening...'
                : 'Listening... or type /help'
            }
            className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder:text-emerald-100/45 focus:outline-none py-1.5"
          />

          {input.trim() && (
            <button
              type="submit"
              aria-label="Send message or command"
              className="w-8 h-8 rounded-lg bg-[#34D399] text-[#05140E] flex items-center justify-center hover:bg-[#6EE7B7] transition-colors cursor-pointer shrink-0"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={onToggleListening}
            aria-pressed={voiceState.isListening}
            aria-label={voiceState.isListening ? 'Stop voice input' : 'Start voice input'}
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
              voiceState.isListening
                ? 'bg-[#34D399]/20 text-[#4ADE80] border border-[#4ADE80]/60'
                : 'text-[#34D399]/80 hover:text-[#6EE7B7] hover:bg-white/5'
            }`}
          >
            {voiceState.isListening ? (
              <Mic className="w-4 h-4" />
            ) : (
              <MicOff className="w-4 h-4" />
            )}
          </button>
        </form>
      </div>
    </section>
  );
}
