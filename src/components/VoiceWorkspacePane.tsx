import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  Settings,
  Plus,
} from 'lucide-react';
import type {
  ApprovalCard,
  BackgroundTask,
  BriefDecision,
  Channel,
  ChannelId,
  ExpressionMood,
  EyeState,
  HermesAgentSession,
  HermesCronJob,
  HermesGatewayStatus,
  HermesMemoryItem,
  HermesSkill,
  TerminalEntry,
  VoiceState,
} from '../types/hermes';
import { amplitudeToViseme } from '../utils/asciiCharacter';
import type { LookTarget } from '../utils/asciiPortraitEngine';
import type { PortraitAssetStatus } from '../utils/portraitLoadingEngine';
import {
  getShapeMeta,
  type CanvasFormationPreset,
  type CanvasPin,
  type CanvasSession,
} from '../utils/canvasSessions';
import { AVAILABLE_COMMANDS } from '../utils/cliEngine';
import { groupThreadTimeline } from '../utils/threadTrace';
import { computeThreadScrollPin } from '../utils/threadScroll';
import { shouldShowScrollTopFade } from '../utils/motionChoreography';
import { partitionChannelTasks } from '../utils/taskInsights';
import { DEFAULT_UI_CONFIG, type UiCustomizationConfig } from '../utils/uiCustomization';
import type { CreateDotSessionPayload } from './AddSessionShapeModal';
import { AsciiPortraitCanvas } from './AsciiPortraitCanvas';
import { BrailleHorizonCanvas } from './BrailleHorizonCanvas';
import { BrailleSessionsCanvas } from './BrailleSessionsCanvas';
import { DecodedText } from './DecodedText';
import { HermesOperationsPanel } from './HermesOperationsPanel';
import { CommandTerminal } from './CommandTerminal';
import { MobileWorkspaceBar } from './MobileWorkspaceBar';
import { ThreadTaskBanner } from './ThreadTaskBanner';
import { ThreadTraceTree } from './ThreadTraceTree';
import {
  MorphTabs,
  ScrollToBottomButton,
  StatusPulse,
  type MorphTabItem,
  type StatusPulseState,
} from './ui';

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
  onRefreshGateway?: () => void;
  skills?: HermesSkill[];
  memory?: HermesMemoryItem[];
  cronJobs?: HermesCronJob[];
  onApproveCard: (id: string, editedDraft?: string) => void;
  onRejectCard: (id: string) => void;
  onRunBriefCommand: (command: string, briefId: string) => void;
  onToggleTaskStatus: (id: string) => void;
  onConfirmTask?: (id: string) => void;
  onReopenTask?: (id: string) => void;
  onCancelTask?: (id: string) => void;
  onSteerTask?: (id: string, text: string) => Promise<void> | void;
  onToggleListening: () => void;
  onToggleMute: () => void;
  onStopSpeaking: () => void;
  onSubmitInput: (value: string, source: 'voice' | 'cli') => void;
  onSubmitSessionInput: (channelId: ChannelId, value: string, source: 'voice' | 'cli') => void;
  /** Whether the agent's live activity trace is shown in the transcript. */
  showThinking: boolean;
  onToggleThinking: () => void;
  canvasSessions: CanvasSession[];
  canvasPins: CanvasPin[];
  hermesSessions: HermesAgentSession[];
  thinkingByChannel: Record<string, boolean>;
  speakingChannel: ChannelId | null;
  onSelectCanvasSession: (session: CanvasSession) => void;
  onMoveCanvasSession: (id: string, xPct: number, yPct: number) => void;
  onAddCanvasSession: (payload: CreateDotSessionPayload) => void;
  onUpdateDotConfig?: (
    id: string,
    patch: Partial<Pick<CanvasSession, 'autonomyMode' | 'scheduleLabel' | 'autonomyPaused' | 'skills'>>
  ) => void;
  onAddCanvasPin: (pin: Omit<CanvasPin, 'id'>) => void;
  onMoveCanvasPin: (id: string, xPct: number, yPct: number) => void;
  onRemoveCanvasPin: (id: string) => void;
  onAutoArrangeCanvas: (formation?: CanvasFormationPreset) => void;
  onCycleSessionMood: (id: string) => void;
  onResetSession: (channelId: string) => void;
  onRemoveCanvasSession: (id: string) => void;
  onOpenSessionThread: (session: CanvasSession) => void;
  threadVisitNonce?: number;
  homeSessionDraft?: boolean;
  onStartNewSession?: () => void;
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
  onRefreshGateway,
  skills,
  memory,
  cronJobs,
  onApproveCard,
  onRejectCard,
  onRunBriefCommand,
  onToggleTaskStatus,
  onConfirmTask,
  onReopenTask,
  onCancelTask,
  onSteerTask,
  onToggleListening,
  onToggleMute,
  onStopSpeaking,
  onSubmitInput,
  onSubmitSessionInput,
  showThinking,
  onToggleThinking,
  canvasSessions,
  canvasPins,
  hermesSessions,
  thinkingByChannel,
  speakingChannel,
  onSelectCanvasSession,
  onMoveCanvasSession,
  onAddCanvasSession,
  onUpdateDotConfig,
  onAddCanvasPin,
  onMoveCanvasPin,
  onRemoveCanvasPin,
  onAutoArrangeCanvas,
  onCycleSessionMood,
  onResetSession,
  onRemoveCanvasSession,
  onOpenSessionThread,
  threadVisitNonce = 0,
  homeSessionDraft = false,
  onStartNewSession,
  uiConfig = DEFAULT_UI_CONFIG,
  onOpenStudio,
}: VoiceWorkspacePaneProps) {
  const [tick, setTick] = useState(0);
  const [input, setInput] = useState('');
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [workingSeconds, setWorkingSeconds] = useState(0);
  const [portraitStatus, setPortraitStatus] = useState<PortraitAssetStatus>('loading');
  const [isAwayFromBottom, setIsAwayFromBottom] = useState(false);
  const [showTopFade, setShowTopFade] = useState(false);
  const [threadTasksOverrideByChannel, setThreadTasksOverrideByChannel] = useState<
    Record<string, boolean>
  >({});
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const threadListRef = useRef<HTMLDivElement | null>(null);
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);
  const isPinnedToBottomRef = useRef(true);
  const programmaticTargetTopRef = useRef<number | null>(null);
  const lastUserScrollAtRef = useRef(0);
  const lastScrollTopRef = useRef(0);
  const lastScrollVisitRef = useRef('');
  const portraitWrapRef = useRef<HTMLDivElement | null>(null);
  const lookTargetRef = useRef<LookTarget | null>(null);

  const isHomeOverview = panelView === 'home';
  const isHomeNewDraft = isHomeOverview && homeSessionDraft;

  const activeCanvasSession = useMemo(
    () => canvasSessions.find((s) => s.channelId === activeChannel) ?? null,
    [canvasSessions, activeChannel]
  );
  const activeShapeMeta = activeCanvasSession ? getShapeMeta(activeCanvasSession.shape) : null;
  const activeHermesSessionId =
    activeCanvasSession?.hermesSessionId ?? `hermes-${activeChannel}`;
  const rawIsThinking = Boolean(thinkingByChannel[activeChannel]);
  const rawIsSpeaking =
    voiceState.isSpeaking && (speakingChannel ?? activeChannel) === activeChannel;
  const activeIsThinking = isHomeNewDraft ? false : rawIsThinking;
  const activeIsSpeaking = isHomeNewDraft ? false : rawIsSpeaking;

  const activeChannelTasksPartition = useMemo(
    () => partitionChannelTasks(tasks, activeChannel),
    [tasks, activeChannel]
  );
  const threadTasksOpen =
    threadTasksOverrideByChannel[activeChannel] ??
    (activeChannelTasksPartition.all.length > 0 || activeIsThinking);

  const toggleThreadTasksOpen = () => {
    const current =
      threadTasksOverrideByChannel[activeChannel] ??
      (activeChannelTasksPartition.all.length > 0 || activeIsThinking);
    const nextOpen = !current;
    setThreadTasksOverrideByChannel((prev) => ({
      ...prev,
      [activeChannel]: nextOpen,
    }));
    if (nextOpen) {
      isPinnedToBottomRef.current = true;
      setIsAwayFromBottom(false);
      requestAnimationFrame(() => snapThreadToBottom('smooth'));
    }
  };

  const hideThreadTasks = () => {
    setThreadTasksOverrideByChannel((prev) => ({
      ...prev,
      [activeChannel]: false,
    }));
  };

  useEffect(() => {
    if (!activeIsSpeaking) return;
    const id = window.setInterval(() => {
      setTick((t) => (t + 1) % 10000);
    }, 42);
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
  const lastScopedTextLen = scopedEntries[scopedEntries.length - 1]?.text.length ?? 0;

  const snapThreadToBottom = (behavior: ScrollBehavior = 'auto') => {
    const el = scrollRef.current;
    if (!el) return;
    const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
    if (behavior === 'smooth') {
      programmaticTargetTopRef.current = maxTop;
      el.scrollTo({ top: maxTop, behavior: 'smooth' });
      setShowTopFade(shouldShowScrollTopFade(maxTop));
    } else {
      el.scrollTop = el.scrollHeight;
      programmaticTargetTopRef.current = el.scrollTop;
      lastScrollTopRef.current = el.scrollTop;
      setShowTopFade(shouldShowScrollTopFade(el.scrollTop));
    }
  };

  useLayoutEffect(() => {
    const visitKey = `${panelView}:${activeChannel}:${threadVisitNonce}`;
    const isNewVisit = lastScrollVisitRef.current !== visitKey;
    lastScrollVisitRef.current = visitKey;

    if (panelView !== 'voice') {
      isPinnedToBottomRef.current = true;
      setIsAwayFromBottom(false);
      setShowTopFade(false);
      return;
    }

    const el = scrollRef.current;
    if (!el) return;

    if (isNewVisit) {
      isPinnedToBottomRef.current = true;
      setIsAwayFromBottom(false);
      lastScrollTopRef.current = el.scrollHeight;
    }
    if (!isPinnedToBottomRef.current) return;

    snapThreadToBottom('auto');
    const rafId = requestAnimationFrame(() => {
      if (isPinnedToBottomRef.current) snapThreadToBottom('auto');
    });
    const timerId = window.setTimeout(() => {
      if (isPinnedToBottomRef.current) snapThreadToBottom('auto');
    }, 60);
    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(timerId);
    };
  }, [
    panelView,
    activeChannel,
    threadVisitNonce,
    scopedEntries.length,
    lastScopedTextLen,
    voiceState.interimTranscript,
    activeIsThinking,
  ]);

  useEffect(() => {
    if (panelView !== 'voice') return;
    const container = scrollRef.current;
    const list = threadListRef.current;
    const anchor = bottomAnchorRef.current;
    if (!container) return;

    let rafId = 0;
    const snapIfPinned = () => {
      if (!isPinnedToBottomRef.current) return;
      if (performance.now() - lastUserScrollAtRef.current < 200) return;
      snapThreadToBottom('auto');
    };

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        snapIfPinned();
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          snapIfPinned();
        });
      });
      if (list) resizeObserver.observe(list);
      if (anchor) resizeObserver.observe(anchor);
      resizeObserver.observe(container);
    }

    let mutationObserver: MutationObserver | null = null;
    if (list && typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver(() => {
        snapIfPinned();
      });
      mutationObserver.observe(list, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [panelView, activeChannel, threadVisitNonce]);

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

  const portraitEyeState: EyeState =
    effectiveMood === 'alert'
      ? 'wide'
      : effectiveMood === 'thinking'
      ? 'side'
      : effectiveMood === 'focused'
      ? 'half'
      : effectiveMood === 'happy'
      ? 'happy'
      : 'open';

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

  const statusPulseState: StatusPulseState = voiceState.isMuted
    ? 'muted'
    : portraitStatus === 'error'
    ? 'error'
    : activeIsThinking
    ? 'thinking'
    : activeIsSpeaking
    ? 'speaking'
    : voiceState.isListening
    ? 'listening'
    : 'idle';

  const activeChannelRunningTaskCount =
    activeChannelTasksPartition.running.length > 0
      ? activeChannelTasksPartition.running.length
      : activeIsThinking
      ? 1
      : 0;

  const navTabItems: MorphTabItem<WorkspacePanelView>[] = useMemo(
    () => [
      { id: 'home', label: 'Home' },
      { id: 'canvas', label: 'Canvas' },
      {
        id: 'voice',
        label:
          activeChannelRunningTaskCount > 0
            ? `Thread (${activeChannelRunningTaskCount})`
            : 'Thread',
      },
      {
        id: 'queue',
        label: pendingApprovals.length > 0 ? `Queue (${pendingApprovals.length})` : 'Queue',
      },
      { id: 'cli', label: 'CLI' },
    ],
    [activeChannelRunningTaskCount, pendingApprovals.length]
  );

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
        tasks={tasks}
        homeSessionDraft={homeSessionDraft}
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
        <div className="hidden lg:flex items-center justify-between gap-6 px-6 pt-3 pb-2 border-b border-white/6 z-30 shrink-0">
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

            <MorphTabs
              items={navTabItems}
              value={panelView}
              onChange={onChangePanelView}
              ariaLabel="Workspace views"
              variant="underline"
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {panelView === 'voice' && (
              <button
                type="button"
                onClick={onToggleThinking}
                aria-pressed={showThinking}
                aria-label={showThinking ? 'Hide agent thinking trace' : 'Show agent thinking trace'}
                title={showThinking ? 'Hide thinking trace' : 'Show thinking trace'}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                  showThinking
                    ? 'bg-[#34D399]/14 text-[#6EE7B7]'
                    : 'text-emerald-100/50 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                <Brain className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={onToggleMute}
              aria-label={voiceState.isMuted ? 'Unmute Hermes audio' : 'Mute Hermes audio'}
              title={voiceState.isMuted ? 'Unmute audio' : 'Mute audio'}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                voiceState.isMuted
                  ? 'bg-rose-500/15 text-rose-200'
                  : 'text-emerald-100/60 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              {voiceState.isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>

            {onOpenStudio && (
              <button
                type="button"
                onClick={onOpenStudio}
                data-testid="ui-studio-trigger"
                aria-label="Open Settings"
                title="Settings"
                className="ui-tactile h-8 px-2.5 rounded-lg border border-white/10 bg-white/[0.03] text-xs font-medium text-emerald-100/75 hover:text-white hover:border-white/25 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 text-[#6EE7B7]" />
                <span>Settings</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        onOpenStudio && (
          <div className="hidden lg:flex items-center gap-1.5 absolute top-3.5 right-4 z-30">
            <button
              type="button"
              onClick={onOpenStudio}
              data-testid="ui-studio-trigger"
              aria-label="Open Settings"
              className="h-8 px-2.5 rounded-lg border border-white/12 bg-[#07130F]/92 text-xs font-medium text-emerald-100/80 hover:text-white flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-[#6EE7B7]" />
              <span>Settings</span>
            </button>
          </div>
        )
      )}

      {/* Center Stage: Simplified Character Home View OR Compact Header + Thread/Queue/CLI */}
      {isHomeOverview ? (
        <div
          key="view-home"
          ref={portraitWrapRef}
          data-testid="home-character-overview"
          className="ui-view-enter relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center px-5 sm:px-10 pb-10 lg:pb-14"
        >
          {uiConfig.portraitVisible && (
            <div
              className="relative flex flex-col items-center justify-center transition-transform duration-200"
              style={{ transform: 'scale(var(--ui-portrait-scale, 1))' }}
            >
              <div
                aria-hidden="true"
                className={`absolute inset-0 -m-12 rounded-full pointer-events-none transition-opacity duration-300 ${
                  activeIsSpeaking || voiceState.isListening
                    ? 'ui-halo-pulse opacity-100'
                    : 'ui-halo-idle opacity-75'
                }`}
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
                  eyeState={portraitEyeState}
                  energy={energy}
                  isSpeaking={activeIsSpeaking}
                  isListening={voiceState.isListening}
                  lookTargetRef={lookTargetRef}
                  tintHex={effectivePortraitTint}
                  dotProfile={uiConfig.brailleDotProfile}
                  bloom={uiConfig.brailleBloom}
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
              <div className="relative z-10 flex items-center gap-2 mt-2.5 text-xs text-emerald-100/70">
                <StatusPulse state={statusPulseState} />
                <span>{statusText}</span>
                <span aria-hidden="true" className="text-emerald-100/30">·</span>
                <span
                  data-testid="home-session-badge"
                  className="font-mono text-[11px] text-[#6EE7B7]/85"
                >
                  {isHomeNewDraft ? 'new session' : `#${activeChannel}`}
                </span>
              </div>

              {/* Live Decoded Speech / Response Readout */}
              <div className="relative z-10 mt-3 max-w-[50ch] text-center space-y-3">
                <p
                  data-testid="home-decoded-line"
                  className="text-sm sm:text-[15px] leading-relaxed text-white/92"
                >
                  {activeIsThinking ? (
                    <DecodedText
                      text={`Routing turn inside ${activeHermesSessionId}...`}
                      animate={!uiConfig.reducedMotion}
                      speedMultiplier={uiConfig.animationSpeed}
                    />
                  ) : (
                    <DecodedText
                      text={lastSpokenLine}
                      animate={animateSpeechLine && !uiConfig.reducedMotion}
                      speedMultiplier={uiConfig.animationSpeed}
                    />
                  )}
                </p>

                {(activeIsThinking ||
                  activeIsSpeaking ||
                  (!isHomeNewDraft && visibleMessages.length > 0) ||
                  (!isHomeNewDraft && onStartNewSession) ||
                  pendingApprovals.length > 0) && (
                  <div className="flex flex-wrap items-center justify-center gap-5 text-xs text-emerald-100/55">
                    {(activeIsThinking || activeIsSpeaking) && (
                      <button
                        type="button"
                        onClick={onStopSpeaking}
                        className="ui-tactile inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.06] border border-white/15 text-emerald-50 hover:bg-white/12 transition-colors cursor-pointer"
                      >
                        <Square className="w-2.5 h-2.5 fill-current" />
                        <span>Stop</span>
                      </button>
                    )}
                    {!isHomeNewDraft && visibleMessages.length > 0 && (
                      <button
                        type="button"
                        onClick={() => onChangePanelView('voice')}
                        className="ui-tactile text-[#6EE7B7]/90 hover:text-white underline underline-offset-4 decoration-[#34D399]/35 transition-colors cursor-pointer"
                      >
                        Open thread ({visibleMessages.length})
                      </button>
                    )}
                    {!isHomeNewDraft && onStartNewSession && (
                      <button
                        type="button"
                        data-testid="home-new-session-btn"
                        onClick={onStartNewSession}
                        className="ui-tactile inline-flex items-center gap-1 hover:text-white underline underline-offset-4 decoration-white/20 transition-colors cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>New session</span>
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
          pins={canvasPins}
          hermesSessions={hermesSessions}
          approvals={approvals}
          thinkingByChannel={thinkingByChannel}
          speakingChannel={speakingChannel}
          activeChannel={activeChannel}
          entries={entries}
          voiceState={voiceState}
          viseme={viseme}
          dotProfile={uiConfig.brailleDotProfile}
          bloom={uiConfig.brailleBloom}
          horizonStyle={uiConfig.horizonStyle}
          speedScale={uiConfig.animationSpeed}
          reducedMotionOverride={uiConfig.reducedMotion}
          onSelectSession={onSelectCanvasSession}
          onMoveSession={onMoveCanvasSession}
          onAddSession={onAddCanvasSession}
          onUpdateDotConfig={onUpdateDotConfig}
          onAddPin={onAddCanvasPin}
          onMovePin={onMoveCanvasPin}
          onRemovePin={onRemoveCanvasPin}
          onSubmitSessionMessage={onSubmitSessionInput}
          onToggleListening={onToggleListening}
          onArrangeFormation={(formation) => onAutoArrangeCanvas(formation)}
          onCycleSessionMood={onCycleSessionMood}
          onResetSession={onResetSession}
          onRemoveSession={onRemoveCanvasSession}
          onOpenSessionThread={onOpenSessionThread}
        />
      ) : (
        <>
          {/* Desktop Compact Top-Center Portrait for Thread / Queue / CLI Views + Top-Right Thread Tasks Corner */}
          {uiConfig.portraitVisible ? (
            <div
              ref={portraitWrapRef}
              className="relative hidden lg:flex flex-col items-center justify-center pt-1 pb-2.5 border-b border-white/[0.06] shrink-0"
            >
              <AsciiPortraitCanvas
                variant="hero"
                mood={effectiveMood}
                viseme={viseme}
                eyeState={portraitEyeState}
                energy={energy}
                isSpeaking={activeIsSpeaking}
                isListening={voiceState.isListening}
                lookTargetRef={lookTargetRef}
                tintHex={effectivePortraitTint}
                dotProfile={uiConfig.brailleDotProfile}
                bloom={uiConfig.brailleBloom}
                speedScale={uiConfig.animationSpeed}
                reducedMotionOverride={uiConfig.reducedMotion}
                onStatusChange={setPortraitStatus}
                onClick={onCycleMood}
              />

              <div className="flex flex-wrap items-center justify-center gap-2 mt-1 px-4 text-xs font-medium text-emerald-50/80">
                <StatusPulse size="md" state={statusPulseState} />
                <span>{statusText}</span>
                <span aria-hidden="true" className="text-emerald-100/35">·</span>
                <span
                  className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/10 font-mono text-[11px] text-[#6EE7B7]"
                  data-testid="active-hermes-session-id"
                >
                  {activeHermesSessionId}
                </span>
                {activeShapeMeta && (
                  <>
                    <span aria-hidden="true" className="text-emerald-100/35">·</span>
                    <span className="text-[11px] text-emerald-100/65">{activeShapeMeta.label}</span>
                  </>
                )}
                {panelView === 'voice' && (
                  <>
                    <button
                      type="button"
                      onClick={() => onResetSession(activeChannel)}
                      title="Reset isolated hermes-agent session context"
                      className="ml-1 inline-flex items-center gap-1 text-[11px] text-emerald-100/55 hover:text-white underline underline-offset-4 decoration-white/20 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset</span>
                    </button>
                    <span aria-hidden="true" className="text-emerald-100/25">·</span>
                    <ThreadTaskBanner
                      variant="thread-trigger"
                      activeChannel={activeChannel}
                      activeSessionId={activeHermesSessionId}
                      tasks={tasks}
                      activeIsThinking={activeIsThinking}
                      workingSeconds={workingSeconds}
                      isOpen={threadTasksOpen}
                      onToggleOpen={toggleThreadTasksOpen}
                      onHide={hideThreadTasks}
                    />
                  </>
                )}
              </div>
            </div>
          ) : (
            panelView === 'voice' && (
              <div className="hidden lg:block border-b border-white/[0.06] shrink-0">
                <div className="max-w-[780px] mx-auto w-full px-3.5 sm:px-8 lg:px-12 py-2 flex items-center justify-between gap-3 text-xs text-emerald-100/75">
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusPulse size="sm" state={statusPulseState} />
                    <span className="font-mono text-[11px] text-[#6EE7B7]">{activeHermesSessionId}</span>
                  </div>
                  <ThreadTaskBanner
                    variant="thread-trigger"
                    activeChannel={activeChannel}
                    activeSessionId={activeHermesSessionId}
                    tasks={tasks}
                    activeIsThinking={activeIsThinking}
                    workingSeconds={workingSeconds}
                    isOpen={threadTasksOpen}
                    onToggleOpen={toggleThreadTasksOpen}
                    onHide={hideThreadTasks}
                  />
                </div>
              </div>
            )
          )}

          {/* Mobile Compact Character Presence Strip in Thread View */}
          {panelView === 'voice' && (
            <div className="flex lg:hidden items-center gap-2 mx-2.5 my-0.5 rounded-xl bg-white/[0.035] border border-white/10 px-2.5 py-1 shrink-0">
              {uiConfig.portraitVisible && (
                <div className="relative w-[64px] h-[54px] rounded-lg bg-black/35 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                  <div className="scale-[0.29] origin-center">
                    <AsciiPortraitCanvas
                      variant="hero"
                      mood={effectiveMood}
                      viseme={viseme}
                      eyeState={portraitEyeState}
                      energy={energy}
                      isSpeaking={activeIsSpeaking}
                      isListening={voiceState.isListening}
                      lookTargetRef={lookTargetRef}
                      tintHex={effectivePortraitTint}
                      dotProfile={uiConfig.brailleDotProfile}
                      bloom={uiConfig.brailleBloom}
                      speedScale={uiConfig.animationSpeed}
                      reducedMotionOverride={uiConfig.reducedMotion}
                      onStatusChange={setPortraitStatus}
                      onClick={onCycleMood}
                    />
                  </div>
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-100/75">
                  <StatusPulse state={statusPulseState} />
                  <span className="font-medium text-white">{statusText}</span>
                  <span aria-hidden="true" className="text-emerald-100/30">·</span>
                  <span className="font-mono text-[#6EE7B7] truncate">{activeHermesSessionId}</span>
                </div>
                <div className="text-[11px] text-emerald-100/55 truncate">
                  {activeIsThinking
                    ? `Routing in ${activeHermesSessionId}…`
                    : activeShapeMeta?.label ?? 'Hermes'}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <ThreadTaskBanner
                  variant="mobile-trigger"
                  activeChannel={activeChannel}
                  activeSessionId={activeHermesSessionId}
                  tasks={tasks}
                  activeIsThinking={activeIsThinking}
                  workingSeconds={workingSeconds}
                  isOpen={threadTasksOpen}
                  onToggleOpen={toggleThreadTasksOpen}
                  onHide={hideThreadTasks}
                />
                <button
                  type="button"
                  onClick={onToggleThinking}
                  aria-pressed={showThinking}
                  className={`shrink-0 px-2 py-1.5 rounded-xl border text-[10.5px] font-mono transition-colors cursor-pointer ${
                    showThinking
                      ? 'bg-[#34D399]/14 border-[#34D399]/35 text-[#6EE7B7]'
                      : 'bg-white/[0.04] border-white/10 text-emerald-100/60'
                  }`}
                >
                  {showThinking ? 'Trace' : 'Muted'}
                </button>
              </div>
            </div>
          )}

          {panelView === 'queue' ? (
            <div key="view-queue" className="ui-view-enter flex-1 min-h-0 px-3 sm:px-8 py-2 sm:py-3 overflow-y-auto cyber-scroll">
              <HermesOperationsPanel
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
                gatewayStatus={gatewayStatus}
                onRefreshGateway={onRefreshGateway}
                skills={skills}
                memory={memory}
                cronJobs={cronJobs}
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
            <div className="relative flex-1 min-h-0 flex flex-col">

              <div
                key={`view-voice-${activeChannel}`}
                ref={scrollRef}
                onWheel={() => {
                  lastUserScrollAtRef.current = performance.now();
                }}
                onTouchMove={() => {
                  lastUserScrollAtRef.current = performance.now();
                }}
                onPointerDown={() => {
                  lastUserScrollAtRef.current = performance.now();
                }}
                onScroll={() => {
                  const el = scrollRef.current;
                  if (!el) return;
                  const nextTop = el.scrollTop;
                  const target = programmaticTargetTopRef.current;
                  const isNearTarget =
                    target !== null && Math.abs(nextTop - target) <= 8;
                  const isNearEnd =
                    el.scrollHeight - nextTop - el.clientHeight <= 24;
                  const isProgrammatic =
                    target !== null && (isNearTarget || isNearEnd);
                  if (!isProgrammatic || isNearTarget) {
                    programmaticTargetTopRef.current = null;
                  }
                  const hasUserScrollIntent =
                    performance.now() - lastUserScrollAtRef.current < 450;
                  const result = computeThreadScrollPin({
                    prevScrollTop: lastScrollTopRef.current,
                    nextScrollTop: nextTop,
                    scrollHeight: el.scrollHeight,
                    clientHeight: el.clientHeight,
                    isNewVisit: false,
                    isProgrammatic,
                    prevPinned: isPinnedToBottomRef.current,
                    hasUserScrollIntent,
                  });
                  lastScrollTopRef.current = nextTop;
                  isPinnedToBottomRef.current = result.pinned;
                  setIsAwayFromBottom(result.away);
                  setShowTopFade(shouldShowScrollTopFade(nextTop));
                }}
                data-testid="voice-transcript-stream"
                data-pinned={String(!isAwayFromBottom)}
                style={{ overflowAnchor: 'none' }}
                className={`ui-view-enter transcript-fade-mask ${
                  showTopFade ? 'ui-transcript-fade-active' : ''
                } flex-1 min-h-0 overflow-y-auto cyber-scroll px-3 sm:px-8 lg:px-12 py-2.5 sm:py-5`}
              >
                <div
                  ref={threadListRef}
                  className="max-w-[780px] mx-auto w-full min-h-full flex flex-col justify-end space-y-4 sm:space-y-5"
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
                          className="ui-msg-enter ml-auto max-w-[85%] sm:max-w-[70%] rounded-2xl bg-[#34D399]/[0.09] border border-[#34D399]/22 px-3.5 sm:px-4 py-2.5 sm:py-3 text-[13.5px] leading-relaxed text-white"
                        >
                          <p className="whitespace-pre-wrap break-words">{entry.text}</p>
                        </div>
                      );
                    }
                    return (
                      <div key={entry.id} className="ui-msg-enter max-w-[66ch] space-y-1.5">
                        <p className="text-[14.5px] sm:text-[15.5px] leading-[1.65] font-normal text-white/95 whitespace-pre-wrap break-words">
                          <DecodedText
                            text={entry.text}
                            animate={!entry.id.startsWith('init-') && !entry.streaming}
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
                    <div className="ml-auto max-w-[85%] sm:max-w-[70%] rounded-2xl bg-[#34D399]/14 border border-[#34D399]/40 px-3.5 sm:px-4 py-2.5 sm:py-3 text-[13.5px] leading-relaxed text-emerald-50">
                      <p className="whitespace-pre-wrap break-words">{voiceState.interimTranscript}</p>
                    </div>
                  )}

                  {/* Thread-integrated Task Timeline Block inside the conversation stream */}
                  <ThreadTaskBanner
                    variant="thread-inline"
                    activeChannel={activeChannel}
                    activeSessionId={activeHermesSessionId}
                    tasks={tasks}
                    activeIsThinking={activeIsThinking}
                    workingSeconds={workingSeconds}
                    isOpen={threadTasksOpen}
                    onToggleOpen={toggleThreadTasksOpen}
                    onHide={hideThreadTasks}
                    onToggleTaskStatus={onToggleTaskStatus}
                    onConfirmTask={onConfirmTask}
                    onReopenTask={onReopenTask}
                    onCancelTask={onCancelTask}
                    onSteerTask={onSteerTask}
                    onStopSpeaking={onStopSpeaking}
                  />

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

                  <div ref={bottomAnchorRef} aria-hidden="true" className="h-px shrink-0" />
                </div>
              </div>

              <ScrollToBottomButton
                visible={isAwayFromBottom}
                onClick={() => {
                  isPinnedToBottomRef.current = true;
                  setIsAwayFromBottom(false);
                  snapThreadToBottom('auto');
                }}
                className="absolute bottom-3 right-4 sm:right-10 z-20"
              />
            </div>
          )}
        </>
      )}

      {/* Fluid Bottom Braille Wave Horizon inside the Main Window (Home Overview) */}
      {isHomeOverview && uiConfig.horizonVisible && (
        <div
          data-testid="horizon-wave-container"
          className="pointer-events-none absolute inset-x-0 bottom-[106px] lg:bottom-[68px] h-[124px] sm:h-[164px] z-0 overflow-hidden"
          style={{ opacity: uiConfig.horizonOpacity }}
        >
          <BrailleHorizonCanvas
            energy={energy}
            isActive={activeIsSpeaking || voiceState.isListening}
            frequencyBands={voiceState.frequencyBands}
            lookTargetRef={lookTargetRef}
            horizonStyle={uiConfig.horizonStyle}
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
            className={`${isHomeOverview ? 'lg:max-w-[740px] lg:mx-auto w-full ' : ''}flex flex-col lg:flex-row lg:items-center gap-1.5 lg:gap-2.5 rounded-[22px] lg:rounded-xl border px-3 py-2.5 lg:px-3.5 lg:py-1.5 transition-colors duration-150 ${
              uiConfig.composerStyle === 'minimal'
                ? 'border-white/10 bg-[#081310]/82 shadow-none'
                : uiConfig.composerStyle === 'floating'
                ? 'border-white/18 bg-[#081310]/92 shadow-[0_14px_38px_rgba(0,0,0,0.52)]'
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
                  isHomeNewDraft
                    ? voiceState.isListening
                      ? 'Listening for new session prompt...'
                      : 'Start a new Hermes session or type /help'
                    : activeIsThinking
                    ? `Working · ${workingSeconds}s`
                    : activeIsSpeaking
                    ? 'Speaking · type next prompt or tap Stop'
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
                    className="ui-pop-in w-10 h-10 lg:w-8 lg:h-8 rounded-full lg:rounded-lg bg-[#34D399] text-[#05140E] flex items-center justify-center hover:bg-[#6EE7B7] active:scale-95 transition-all duration-150 cursor-pointer shrink-0"
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
