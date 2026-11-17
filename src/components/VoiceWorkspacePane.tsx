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
  HermesProfileMode,
  HermesProfileSummary,
  HermesSkill,
  HermesToolset,
  HermesTransportMode,
  TerminalEntry,
  VoiceState,
} from '../types/hermes';
import { amplitudeToViseme } from '../utils/asciiCharacter';
import type { LookTarget } from '../utils/asciiPortraitEngine';
import type { PortraitAssetStatus } from '../utils/portraitLoadingEngine';
import {
  type CanvasFormationPreset,
  type CanvasPin,
  type CanvasSession,
} from '../utils/canvasSessions';
import { AVAILABLE_COMMANDS } from '../utils/cliEngine';
import { groupThreadTimeline, isTerminalDiagnosticActivity } from '../utils/threadTrace';
import {
  determineActiveMinimapTurn,
  extractThreadMinimapTurns,
} from '../utils/threadMinimap';
import { computeThreadScrollPin } from '../utils/threadScroll';
import { shouldShowScrollTopFade } from '../utils/motionChoreography';
import { partitionChannelTasks } from '../utils/taskInsights';
import {
  resolveStageHeaderSize,
  resolveThreadTasksLayoutMode,
} from '../utils/responsiveLayout';
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
import { ThreadTurnMinimap } from './ThreadTurnMinimap';
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
  onRefreshGateway?: () => Promise<unknown> | void;
  skills?: HermesSkill[];
  toolsets?: HermesToolset[];
  cronJobs?: HermesCronJob[];
  transportMode?: HermesTransportMode;
  onChangeTransportMode?: (mode: HermesTransportMode) => void;
  onCreateJob?: (payload: { prompt: string; schedule: string; name?: string }) => Promise<unknown>;
  onPauseJob?: (jobId: string) => Promise<void>;
  onResumeJob?: (jobId: string) => Promise<void>;
  onRunJob?: (jobId: string) => Promise<void>;
  onDeleteJob?: (jobId: string) => Promise<void>;
  onApproveCard: (id: string, choice?: 'once' | 'always' | 'deny') => void;
  onRejectCard: (id: string) => void;
  onClarifyCard?: (id: string, answer: string) => void;
  onRunBriefCommand: (command: string, briefId: string) => void;
  onToggleTaskStatus: (id: string) => void;
  onConfirmTask?: (id: string) => void;
  onReopenTask?: (id: string) => void;
  onCancelTask?: (id: string) => void;
  onClearCompletedTasks?: (channelId: ChannelId) => void;
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
    patch: Partial<
      Pick<CanvasSession, 'autonomyMode' | 'scheduleLabel' | 'autonomyPaused' | 'skills' | 'profile'>
    >
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
  profiles?: HermesProfileSummary[];
  draftProfile?: string;
  onChangeDraftProfile?: (profileId: string) => void;
  onSaveProfile?: (payload: {
    id: string;
    label?: string;
    mode: HermesProfileMode;
    baseUrl?: string;
    apiKey?: string;
    description?: string;
  }) => Promise<unknown>;
  onDeleteProfile?: (profileId: string) => Promise<unknown>;
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
  toolsets,
  cronJobs,
  transportMode,
  onChangeTransportMode,
  onCreateJob,
  onPauseJob,
  onResumeJob,
  onRunJob,
  onDeleteJob,
  onApproveCard,
  onRejectCard,
  onClarifyCard,
  onRunBriefCommand,
  onToggleTaskStatus,
  onConfirmTask,
  onReopenTask,
  onCancelTask,
  onClearCompletedTasks,
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
  profiles = [],
  draftProfile = 'default',
  onChangeDraftProfile,
  onSaveProfile,
  onDeleteProfile,
  uiConfig = DEFAULT_UI_CONFIG,
  onOpenStudio,
}: VoiceWorkspacePaneProps) {
  const [tick, setTick] = useState(0);
  const [input, setInput] = useState('');
  const [clarifyDraft, setClarifyDraft] = useState<Record<string, string>>({});
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [workingSeconds, setWorkingSeconds] = useState(0);
  const [portraitStatus, setPortraitStatus] = useState<PortraitAssetStatus>('loading');
  const [isAwayFromBottom, setIsAwayFromBottom] = useState(false);
  const [showTopFade, setShowTopFade] = useState(false);
  const [threadTasksOverrideByChannel, setThreadTasksOverrideByChannel] = useState<
    Record<string, boolean>
  >({});
  const [isDesktopLg, setIsDesktopLg] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true
  );
  const [stageWidth, setStageWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? Math.max(360, window.innerWidth - 340) : 1100
  );
  const [viewportHeight, setViewportHeight] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerHeight : 900
  );
  const stageRef = useRef<HTMLElement | null>(null);
  const [activeMinimapTurnId, setActiveMinimapTurnId] = useState<string | null>(null);
  const [highlightedTurnId, setHighlightedTurnId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const threadListRef = useRef<HTMLDivElement | null>(null);
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);
  const turnAnchorRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const jumpHighlightTimerRef = useRef<number | null>(null);
  const isPinnedToBottomRef = useRef(true);
  const programmaticTargetTopRef = useRef<number | null>(null);
  const lastUserScrollAtRef = useRef(0);
  const lastScrollTopRef = useRef(0);
  const lastScrollVisitRef = useRef('');
  const portraitWrapRef = useRef<HTMLDivElement | null>(null);
  const lookTargetRef = useRef<LookTarget | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => {
      setIsDesktopLg(mq.matches);
      setViewportHeight(window.innerHeight);
    };
    sync();
    mq.addEventListener('change', sync);
    window.addEventListener('resize', sync);
    return () => {
      mq.removeEventListener('change', sync);
      window.removeEventListener('resize', sync);
    };
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const updateWidth = () => {
      const next = Math.round(el.getBoundingClientRect().width);
      if (next > 0) setStageWidth(next);
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isHomeOverview = panelView === 'home';
  const isHomeNewDraft = isHomeOverview && homeSessionDraft;

  const activeCanvasSession = useMemo(
    () => canvasSessions.find((s) => s.channelId === activeChannel) ?? null,
    [canvasSessions, activeChannel]
  );
  const activeChannelObj = useMemo(
    () => channels.find((c) => c.id === activeChannel) ?? null,
    [channels, activeChannel]
  );
  const activeProfile =
    activeCanvasSession?.profile || activeChannelObj?.profile || gatewayStatus?.profile || 'default';
  const sessionCountByProfile = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const ch of channels) {
      const pid = ch.profile || 'default';
      counts[pid] = (counts[pid] ?? 0) + 1;
    }
    return counts;
  }, [channels]);
  const activeHermesSessionId =
    activeCanvasSession?.hermesSessionId ?? (activeChannel ? `hermes-${activeChannel}` : 'new session');
  const rawIsThinking = Boolean(thinkingByChannel[activeChannel]);
  const rawIsSpeaking =
    voiceState.isSpeaking && (speakingChannel ?? activeChannel) === activeChannel;
  const activeIsThinking = isHomeNewDraft ? false : rawIsThinking;
  const activeIsSpeaking = isHomeNewDraft ? false : rawIsSpeaking;

  const threadTasksDockMode = resolveThreadTasksLayoutMode(stageWidth, isDesktopLg);
  const stageHeaderSize = resolveStageHeaderSize({
    panelView,
    viewportHeightPx: viewportHeight,
  });

  const activeChannelTasksPartition = useMemo(
    () => partitionChannelTasks(tasks, activeChannel),
    [tasks, activeChannel]
  );
  const threadTasksOpen =
    threadTasksOverrideByChannel[activeChannel] ??
    (threadTasksDockMode === 'split'
      ? activeChannelTasksPartition.all.length > 0 || activeIsThinking
      : false);

  const toggleThreadTasksOpen = () => {
    const current = threadTasksOpen;
    const nextOpen = !current;
    setThreadTasksOverrideByChannel((prev) => ({
      ...prev,
      [activeChannel]: nextOpen,
    }));
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
          isTerminalDiagnosticActivity(e) ||
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
    () => groupThreadTimeline(visibleMessages, activeIsThinking, showThinking),
    [visibleMessages, activeIsThinking, showThinking]
  );

  const minimapTurns = useMemo(
    () => extractThreadMinimapTurns(timelineBlocks),
    [timelineBlocks]
  );

  const minimapAnchorSet = useMemo(
    () => new Set(minimapTurns.map((t) => t.anchorId)),
    [minimapTurns]
  );

  const syncActiveMinimapTurn = () => {
    const scrollEl = scrollRef.current;
    if (!scrollEl || minimapTurns.length === 0) {
      setActiveMinimapTurnId(null);
      return;
    }
    const containerRect = scrollEl.getBoundingClientRect();
    const scrollTop = scrollEl.scrollTop;
    const anchors = minimapTurns
      .map((turn) => {
        const el = turnAnchorRefs.current.get(turn.anchorId);
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return {
          id: turn.anchorId,
          top: rect.top - containerRect.top + scrollTop,
          height: rect.height,
        };
      })
      .filter((a): a is { id: string; top: number; height: number } => a !== null);

    const maxScrollTop = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
    const nextId = determineActiveMinimapTurn(
      anchors,
      scrollTop,
      scrollEl.clientHeight,
      maxScrollTop
    );
    setActiveMinimapTurnId((prev) => (prev === nextId ? prev : nextId));
  };

  useEffect(() => {
    if (panelView !== 'voice' || minimapTurns.length === 0) {
      setActiveMinimapTurnId(null);
      return;
    }
    const rafId = requestAnimationFrame(() => syncActiveMinimapTurn());
    return () => cancelAnimationFrame(rafId);
  }, [panelView, activeChannel, minimapTurns]);

  useEffect(() => {
    return () => {
      if (jumpHighlightTimerRef.current !== null) {
        window.clearTimeout(jumpHighlightTimerRef.current);
      }
    };
  }, []);

  const handleJumpToMinimapTurn = (anchorId: string) => {
    const scrollEl = scrollRef.current;
    const targetEl = turnAnchorRefs.current.get(anchorId);
    if (!scrollEl || !targetEl) return;

    const containerRect = scrollEl.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();
    const rawTarget = targetRect.top - containerRect.top + scrollEl.scrollTop - 16;
    const maxTop = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
    const targetTop = Math.max(0, Math.min(maxTop, rawTarget));

    isPinnedToBottomRef.current = maxTop - targetTop <= 28;
    lastUserScrollAtRef.current = performance.now();
    programmaticTargetTopRef.current = targetTop;
    setIsAwayFromBottom(maxTop - targetTop > 96);
    setActiveMinimapTurnId(anchorId);
    setShowTopFade(shouldShowScrollTopFade(targetTop));

    scrollEl.scrollTo({
      top: targetTop,
      behavior: uiConfig.reducedMotion ? 'auto' : 'smooth',
    });

    if (jumpHighlightTimerRef.current !== null) {
      window.clearTimeout(jumpHighlightTimerRef.current);
    }
    setHighlightedTurnId(anchorId);
    jumpHighlightTimerRef.current = window.setTimeout(() => {
      setHighlightedTurnId(null);
      jumpHighlightTimerRef.current = null;
    }, 950);
  };

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

  const isThreadSplitLayout = panelView === 'voice' && threadTasksDockMode === 'split';
  const showDesktopThreadSidebar = panelView === 'voice' && isDesktopLg;

  const composerDock =
    panelView !== 'canvas' ? (
      <div
        className={`relative z-20 shrink-0 ${
          uiConfig.composerStyle === 'floating'
            ? 'px-4 sm:px-8 lg:px-10 pb-3.5 lg:pb-5 pt-1.5'
            : uiConfig.composerStyle === 'minimal'
            ? 'px-3 sm:px-6 lg:px-8 pb-2 lg:pb-3 pt-1'
            : 'px-2.5 sm:px-6 lg:px-8 pb-2.5 lg:pb-3.5 pt-1.5 lg:pt-2'
        } ${
          isHomeOverview && uiConfig.composerStyle === 'docked'
            ? 'bg-gradient-to-t from-black/45 via-black/25 to-transparent'
            : ''
        }`}
      >
        <form
          onSubmit={handleSubmit}
          className={`lg:max-w-[740px] lg:mx-auto w-full flex flex-col lg:flex-row lg:items-center gap-1.5 lg:gap-2.5 rounded-[22px] lg:rounded-xl border px-3 py-2.5 lg:px-3.5 lg:py-1.5 transition-colors duration-150 ${
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
                isHomeNewDraft || !activeChannel
                  ? voiceState.isListening
                    ? 'Listening for new session prompt...'
                    : 'Start a new Hermes session or type /help'
                  : activeIsThinking || activeIsSpeaking
                  ? `Steer #${activeChannel} or send next prompt…`
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
                  className="ui-tactile w-10 h-10 lg:w-auto lg:h-7 lg:px-2.5 rounded-full lg:rounded-lg border border-rose-400/40 bg-rose-500/14 text-rose-200 hover:bg-rose-500/24 flex items-center justify-center gap-1.5 text-xs font-medium transition-colors cursor-pointer shrink-0"
                >
                  <Square className="w-3.5 h-3.5 lg:w-2.5 lg:h-2.5 fill-current" />
                  <span className="hidden lg:inline">Stop</span>
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
    ) : null;

  return (
    <section
      ref={stageRef}
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
      className="@container ui-stage-shell relative flex flex-col h-full min-w-0 rounded-2xl border overflow-hidden"
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
        <div className="hidden lg:flex items-center justify-between gap-3 xl:gap-6 px-4 xl:px-6 pt-3 pb-2 border-b border-white/6 z-30 shrink-0">
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
                aria-label={
                  showThinking
                    ? 'Hide inline activity trace in chat'
                    : 'Show inline activity trace in chat'
                }
                title={
                  showThinking
                    ? 'Hide inline activity trace in chat'
                    : 'Show inline activity trace in chat (Tasks sidebar tracks runs)'
                }
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
          className="ui-view-enter relative z-10 flex-1 min-h-0 overflow-y-auto cyber-scroll flex flex-col items-center px-5 sm:px-10 pt-2 pb-28 sm:pb-32 lg:pb-24"
        >
          <div className="my-auto w-full flex flex-col items-center">
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
                    effectiveMood === 'thinking'
                      ? 'radial-gradient(circle at 50% 48%, rgba(245, 158, 11, 0.17) 0%, rgba(245, 158, 11, 0.05) 44%, transparent 72%)'
                      : effectiveMood === 'alert'
                      ? 'radial-gradient(circle at 50% 48%, rgba(244, 63, 94, 0.16) 0%, rgba(244, 63, 94, 0.05) 44%, transparent 72%)'
                      : 'radial-gradient(circle at 50% 48%, rgba(var(--ui-accent-rgb), 0.16) 0%, rgba(var(--ui-accent-rgb), 0.05) 44%, transparent 72%)',
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
              {gatewayStatus && !gatewayStatus.connected ? (
                <div
                  data-testid="gateway-offline-banner"
                  className="relative z-10 flex flex-wrap items-center justify-center gap-2 mt-2.5 text-xs"
                >
                  <StatusPulse state="error" size="sm" />
                  <span className="font-mono text-rose-200/90">
                    Gateway offline · {gatewayStatus.gatewayUrl.replace(/^https?:\/\//, '')}
                  </span>
                  <span aria-hidden="true" className="text-emerald-100/25">·</span>
                  <span
                    data-testid="home-session-badge"
                    className="font-mono text-[11px] text-[#6EE7B7]/85"
                  >
                    {isHomeNewDraft || !activeChannel
                      ? 'new session'
                      : `#${activeChannel}${activeProfile !== 'default' ? ` · @${activeProfile}` : ''}`}
                  </span>
                  {isHomeNewDraft && profiles.length > 1 && onChangeDraftProfile ? (
                    <select
                      data-testid="home-profile-select"
                      aria-label="Hermes profile for new session"
                      value={draftProfile}
                      onChange={(e) => onChangeDraftProfile(e.target.value)}
                      className="rounded-md bg-black/40 border border-white/15 px-1.5 py-0.5 font-mono text-[10.5px] text-[#6EE7B7] focus:outline-none focus:border-[#34D399]"
                    >
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          @{p.id}
                        </option>
                      ))}
                    </select>
                  ) : (
                    isHomeNewDraft && (
                      <button
                        type="button"
                        data-testid="home-add-profile-btn"
                        onClick={() => onChangePanelView('queue')}
                        className="font-mono text-[10.5px] text-emerald-100/50 hover:text-[#6EE7B7] transition-colors cursor-pointer"
                      >
                        @{draftProfile} · + profile
                      </button>
                    )
                  )}
                  {onRefreshGateway && (
                    <>
                      <span aria-hidden="true" className="text-emerald-100/25">·</span>
                      <button
                        type="button"
                        onClick={() => void onRefreshGateway()}
                        className="ui-tactile font-mono text-[11px] text-rose-100/90 hover:text-white underline underline-offset-4 decoration-rose-400/45 transition-colors cursor-pointer"
                      >
                        Retry
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="relative z-10 flex flex-wrap items-center justify-center gap-2 mt-2.5 text-xs text-emerald-100/70">
                  <StatusPulse state={statusPulseState} />
                  <span>{statusText}</span>
                  <span aria-hidden="true" className="text-emerald-100/30">·</span>
                  <span
                    data-testid="home-session-badge"
                    className="font-mono text-[11px] text-[#6EE7B7]/85"
                  >
                    {isHomeNewDraft || !activeChannel
                      ? 'new session'
                      : `#${activeChannel}${activeProfile !== 'default' ? ` · @${activeProfile}` : ''}`}
                  </span>
                  {isHomeNewDraft && profiles.length > 1 && onChangeDraftProfile ? (
                    <select
                      data-testid="home-profile-select"
                      aria-label="Hermes profile for new session"
                      value={draftProfile}
                      onChange={(e) => onChangeDraftProfile(e.target.value)}
                      className="rounded-md bg-black/40 border border-white/15 px-1.5 py-0.5 font-mono text-[10.5px] text-[#6EE7B7] focus:outline-none focus:border-[#34D399]"
                    >
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          @{p.id}
                        </option>
                      ))}
                    </select>
                  ) : (
                    isHomeNewDraft && (
                      <button
                        type="button"
                        data-testid="home-add-profile-btn"
                        onClick={() => onChangePanelView('queue')}
                        className="font-mono text-[10.5px] text-emerald-100/50 hover:text-[#6EE7B7] transition-colors cursor-pointer"
                      >
                        @{draftProfile} · + profile
                      </button>
                    )
                  )}
                </div>
              )}

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
          profiles={profiles}
          defaultProfile={draftProfile}
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
        <div className="relative flex-1 min-h-0 min-w-0 flex flex-row overflow-hidden">
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            {/* Desktop Compact Top-Center Character Stage — integrated seamlessly with Thread/Queue/CLI */}
            {uiConfig.portraitVisible && stageHeaderSize !== 'strip' ? (
              <div
                ref={portraitWrapRef}
                className="relative hidden lg:flex flex-col items-center justify-center pt-1.5 pb-1.5 shrink-0"
              >
                <div className="relative flex items-center justify-center">
                  <div
                    aria-hidden="true"
                    className={`absolute inset-0 -m-8 rounded-full pointer-events-none transition-opacity duration-300 ${
                      activeIsSpeaking || voiceState.isListening
                        ? 'opacity-100'
                        : 'opacity-75'
                    }`}
                    style={{
                      background:
                        effectiveMood === 'thinking'
                          ? 'radial-gradient(ellipse 65% 58% at 50% 48%, rgba(245, 158, 11, 0.16) 0%, rgba(245, 158, 11, 0.04) 48%, transparent 74%)'
                          : effectiveMood === 'alert'
                          ? 'radial-gradient(ellipse 65% 58% at 50% 48%, rgba(244, 63, 94, 0.16) 0%, rgba(244, 63, 94, 0.04) 48%, transparent 74%)'
                          : 'radial-gradient(ellipse 65% 58% at 50% 48%, rgba(var(--ui-accent-rgb), 0.14) 0%, rgba(var(--ui-accent-rgb), 0.04) 48%, transparent 74%)',
                    }}
                  />
                  <div className="relative z-10">
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

                <div className="relative z-10 flex flex-wrap items-center justify-center gap-2 mt-0.5 px-4 text-[11.5px] font-medium text-emerald-50/75">
                  <StatusPulse size="sm" state={statusPulseState} />
                  <span className="text-white/90">{statusText}</span>
                  <span aria-hidden="true" className="text-emerald-100/30">·</span>
                  <span
                    className="font-mono text-[11px] text-[#6EE7B7]/90 max-w-[230px] truncate"
                    title={activeHermesSessionId}
                    data-testid="active-hermes-session-id"
                  >
                    {activeHermesSessionId}
                  </span>
                  {activeProfile && activeProfile !== 'default' && (
                    <>
                      <span aria-hidden="true" className="text-emerald-100/25">·</span>
                      <span
                        data-testid="active-thread-profile"
                        className="font-mono text-[11px] text-emerald-200/75"
                      >
                        @{activeProfile}
                      </span>
                    </>
                  )}
                  {panelView === 'voice' && (
                    <>
                      <span aria-hidden="true" className="text-emerald-100/25">·</span>
                      <ThreadTaskBanner
                        variant="thread-trigger"
                        sidebarMode={isDesktopLg}
                        activeChannel={activeChannel}
                        activeSessionId={activeHermesSessionId}
                        tasks={tasks}
                        activeIsThinking={activeIsThinking}
                        workingSeconds={workingSeconds}
                        isOpen={threadTasksOpen}
                        onToggleOpen={toggleThreadTasksOpen}
                        onHide={hideThreadTasks}
                      />
                      <span aria-hidden="true" className="text-emerald-100/25">·</span>
                      <button
                        type="button"
                        onClick={() => onResetSession(activeChannel)}
                        title="Reset isolated hermes-agent session context"
                        className="inline-flex items-center gap-1 text-[11px] text-emerald-100/45 hover:text-white transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset</span>
                      </button>
                    </>
                  )}
                </div>

                {panelView === 'voice' && uiConfig.horizonVisible ? (
                  <div
                    aria-hidden="true"
                    className="w-full max-w-[740px] px-8 mt-1.5 h-[22px] overflow-hidden"
                    style={{
                      opacity:
                        activeIsSpeaking || voiceState.isListening || activeIsThinking
                          ? Math.max(0.55, uiConfig.horizonOpacity)
                          : Math.min(0.42, uiConfig.horizonOpacity * 0.65),
                    }}
                  >
                    <BrailleHorizonCanvas
                      energy={activeIsThinking && !activeIsSpeaking ? 0.24 : energy}
                      isActive={activeIsSpeaking || voiceState.isListening || activeIsThinking}
                      frequencyBands={voiceState.frequencyBands}
                      lookTargetRef={lookTargetRef}
                      dotProfile={uiConfig.brailleDotProfile}
                      bloom={uiConfig.brailleBloom}
                      horizonStyle="ribbon"
                      speedScale={uiConfig.animationSpeed}
                      reducedMotionOverride={uiConfig.reducedMotion}
                    />
                  </div>
                ) : (
                  <div
                    aria-hidden="true"
                    className="w-full max-w-[740px] px-8 mt-2.5"
                  >
                    <div className="h-px w-full bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
                  </div>
                )}
              </div>
            ) : (
              panelView === 'voice' && (
                <div className="hidden lg:block shrink-0">
                  <div className="max-w-[740px] mx-auto w-full px-8 py-2 flex items-center justify-between gap-3 text-xs text-emerald-100/75 border-b border-white/[0.06]">
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusPulse size="sm" state={statusPulseState} />
                      <span
                        data-testid="active-hermes-session-id"
                        title={activeHermesSessionId}
                        className="font-mono text-[11px] text-[#6EE7B7] max-w-[260px] truncate"
                      >
                        {activeHermesSessionId}
                      </span>
                      {activeProfile && activeProfile !== 'default' && (
                        <span
                          data-testid="active-thread-profile"
                          className="font-mono text-[11px] text-emerald-200/75 shrink-0"
                        >
                          @{activeProfile}
                        </span>
                      )}
                    </div>
                    <ThreadTaskBanner
                      variant="thread-trigger"
                      sidebarMode={isDesktopLg}
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

            {/* Mobile Slim Thread Control Bar + Docked Tasks Drawer (never clogs chat stream) */}
            {panelView === 'voice' && (
              <>
                <div className="flex lg:hidden items-center justify-between gap-2 mx-3 px-1 py-1.5 border-b border-white/[0.07] shrink-0">
                  <div className="flex items-center gap-1.5 min-w-0 text-[11.5px]">
                    <StatusPulse state={statusPulseState} size="sm" />
                    <span className="font-medium text-white shrink-0">{statusText}</span>
                    <span aria-hidden="true" className="text-emerald-100/25">·</span>
                    <span className="font-mono text-[11px] text-[#6EE7B7]/85 truncate">
                      {activeChannel ? `#${activeChannel}` : 'new-session'}
                      {activeProfile && activeProfile !== 'default' ? ` · @${activeProfile}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
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
                      aria-label={
                        showThinking
                          ? 'Hide inline activity trace in chat'
                          : 'Show inline activity trace in chat'
                      }
                      className={`shrink-0 px-2 py-1 rounded-lg text-[10.5px] font-mono transition-colors cursor-pointer ${
                        showThinking
                          ? 'bg-[#34D399]/14 text-[#6EE7B7]'
                          : 'text-emerald-100/55 hover:text-white'
                      }`}
                    >
                      {showThinking ? 'Trace' : 'Clean'}
                    </button>
                  </div>
                </div>

                {!isDesktopLg && threadTasksOpen && (
                  <div className="lg:hidden max-h-[46dvh] overflow-y-auto cyber-scroll px-3.5 py-2.5 pb-3 border-b border-white/[0.07] bg-white/[0.015] shrink-0">
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
                      onClearCompleted={onClearCompletedTasks}
                      onSteerTask={onSteerTask}
                      onStopSpeaking={onStopSpeaking}
                    />
                  </div>
                )}
              </>
            )}

            {panelView === 'queue' ? (
              <div key="view-queue" className="ui-view-enter flex-1 min-h-0 px-3 sm:px-8 py-2 sm:py-3 overflow-y-auto cyber-scroll">
                <div className="max-w-[780px] mx-auto w-full pb-2">
                  <HermesOperationsPanel
                    channels={channels}
                    activeChannel={activeChannel}
                    onSelectChannel={onSelectChannel}
                    approvals={approvals}
                    onApproveCard={onApproveCard}
                    onRejectCard={onRejectCard}
                    onClarifyCard={onClarifyCard}
                    brief={brief}
                    onRunBriefCommand={(cmd, id) => {
                      onRunBriefCommand(cmd, id);
                      onChangePanelView('voice');
                    }}
                    gatewayStatus={gatewayStatus}
                    onRefreshGateway={onRefreshGateway}
                    skills={skills}
                    toolsets={toolsets}
                    cronJobs={cronJobs}
                    transportMode={transportMode}
                    onChangeTransportMode={onChangeTransportMode}
                    onCreateJob={onCreateJob}
                    onPauseJob={onPauseJob}
                    onResumeJob={onResumeJob}
                    onRunJob={onRunJob}
                    onDeleteJob={onDeleteJob}
                    profiles={profiles}
                    selectedProfileId={draftProfile}
                    onSelectDefaultProfile={onChangeDraftProfile}
                    onSaveProfile={onSaveProfile}
                    onDeleteProfile={onDeleteProfile}
                    sessionCountByProfile={sessionCountByProfile}
                  />
                </div>
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

                <ThreadTurnMinimap
                  turns={minimapTurns}
                  activeTurnId={activeMinimapTurnId}
                  onJumpToTurn={handleJumpToMinimapTurn}
                />

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
                    syncActiveMinimapTurn();
                  }}
                  data-testid="voice-transcript-stream"
                  data-pinned={String(!isAwayFromBottom)}
                  style={{ overflowAnchor: 'none' }}
                  className={`ui-view-enter transcript-fade-mask ${
                    showTopFade ? 'ui-transcript-fade-active' : ''
                  } flex-1 min-h-0 overflow-y-auto cyber-scroll pt-2.5 pb-6 ${
                    minimapTurns.length > 0
                      ? 'pl-3.5 sm:pl-12 lg:pl-14 pr-3.5 sm:pr-8'
                      : 'px-3.5 sm:px-8'
                  }`}
                >
                  <div
                    ref={threadListRef}
                    className="max-w-[740px] mx-auto w-full flex flex-col justify-start space-y-4 sm:space-y-5"
                  >
                    {timelineBlocks.map((block, idx) => {
                      if (block.kind === 'trace') {
                        const hasVisibleTaskBlock =
                          threadTasksOpen &&
                          (activeChannelTasksPartition.running.length > 0 || activeIsThinking);
                        if (block.isLive && block.items.length === 0 && hasVisibleTaskBlock) {
                          return null;
                        }
                        const isMinimapAnchor = minimapAnchorSet.has(block.id);
                        return (
                          <div
                            key={block.id}
                            ref={
                              isMinimapAnchor
                                ? (el) => {
                                    if (el) turnAnchorRefs.current.set(block.id, el);
                                    else turnAnchorRefs.current.delete(block.id);
                                  }
                                : undefined
                            }
                            data-turn-anchor={isMinimapAnchor ? block.id : undefined}
                            className={highlightedTurnId === block.id ? 'ui-turn-jump rounded-xl' : undefined}
                          >
                            <ThreadTraceTree
                              sessionId={activeHermesSessionId}
                              items={block.items}
                              isLive={block.isLive}
                              hideLiveFooter={hasVisibleTaskBlock}
                            />
                          </div>
                        );
                      }

                      const entry = block.entry;
                      const isUser = entry.role === 'user' || entry.role === 'command';
                      const isMinimapAnchor = minimapAnchorSet.has(entry.id);
                      const isJumpHighlighted = highlightedTurnId === entry.id;
                      const setAnchorRef = isMinimapAnchor
                        ? (el: HTMLDivElement | null) => {
                            if (el) turnAnchorRefs.current.set(entry.id, el);
                            else turnAnchorRefs.current.delete(entry.id);
                          }
                        : undefined;

                      if (isUser) {
                        return (
                          <div
                            key={entry.id}
                            ref={setAnchorRef}
                            data-turn-anchor={isMinimapAnchor ? entry.id : undefined}
                            className={`ui-msg-enter ml-auto max-w-[85%] sm:max-w-[72%] rounded-2xl bg-[#34D399]/[0.085] border border-[#34D399]/20 px-3.5 sm:px-4 py-2 sm:py-2.5 text-[13.5px] leading-relaxed text-white ${
                              isJumpHighlighted ? 'ui-turn-jump' : ''
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">{entry.text}</p>
                          </div>
                        );
                      }
                      const outcomeLabel =
                        entry.terminalOutcome === 'iteration_budget_exhausted'
                          ? 'Budget limit'
                          : entry.terminalOutcome === 'cancelled'
                          ? 'Cancelled'
                          : entry.terminalOutcome === 'interrupted'
                          ? 'Interrupted'
                          : entry.terminalOutcome === 'admission_conflict'
                          ? 'Conflict'
                          : entry.errorCode === 'gateway_offline'
                          ? 'Gateway offline'
                          : entry.terminalOutcome === 'failed'
                          ? 'Failed'
                          : null;
                      const isErrorDiagnostic =
                        entry.errorCode === 'gateway_offline' ||
                        entry.terminalOutcome === 'failed' ||
                        entry.terminalOutcome === 'admission_conflict';
                      return (
                        <div
                          key={entry.id}
                          ref={setAnchorRef}
                          data-turn-anchor={isMinimapAnchor ? entry.id : undefined}
                          className={`ui-msg-enter max-w-[66ch] ${
                            isErrorDiagnostic
                              ? 'rounded-xl bg-rose-500/[0.05] border border-rose-400/20 px-3.5 py-2.5 space-y-1.5'
                              : 'space-y-1'
                          } ${isJumpHighlighted ? 'ui-turn-jump rounded-xl' : ''}`}
                        >
                          <p
                            className={`text-[14.5px] sm:text-[15px] leading-[1.68] font-normal whitespace-pre-wrap break-words ${
                              isErrorDiagnostic ? 'text-rose-100/95' : 'text-[#ECF3F0]'
                            }`}
                          >
                            <DecodedText
                              text={entry.text}
                              animate={!entry.id.startsWith('init-') && !entry.streaming}
                            />
                          </p>
                          {(idx > 0 || outcomeLabel) && (
                            <div className="flex items-center gap-2 font-mono text-[10.5px] text-emerald-100/45 tabular-nums">
                              {idx > 0 && <span>{entry.timestamp}</span>}
                              {outcomeLabel && (
                                <span
                                  data-testid="entry-outcome-badge"
                                  className={`px-1.5 py-0.5 rounded border text-[10px] ${
                                    entry.terminalOutcome === 'iteration_budget_exhausted'
                                      ? 'border-amber-400/35 bg-amber-500/12 text-amber-200'
                                      : entry.terminalOutcome === 'cancelled' || entry.terminalOutcome === 'interrupted'
                                      ? 'border-white/20 bg-white/[0.06] text-emerald-100/75'
                                      : 'border-rose-400/35 bg-rose-500/12 text-rose-200'
                                  }`}
                                >
                                  {outcomeLabel}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {voiceState.interimTranscript && (
                      <div className="ml-auto max-w-[85%] sm:max-w-[72%] rounded-2xl bg-[#34D399]/14 border border-[#34D399]/40 px-3.5 sm:px-4 py-2 sm:py-2.5 text-[13.5px] leading-relaxed text-emerald-50">
                        <p className="whitespace-pre-wrap break-words">{voiceState.interimTranscript}</p>
                      </div>
                    )}

                    {/* Inline Pending Run Approval / Clarification Card */}
                    {channelPendingApprovals.length > 0 && (() => {
                      const card = channelPendingApprovals[0];
                      const isClarify = card.kind === 'clarify';
                      const draftVal = clarifyDraft[card.id] ?? '';
                      return (
                        <div
                          data-testid={`approval-card-${card.id}`}
                          className="max-w-[66ch] rounded-xl bg-amber-500/[0.06] border border-amber-400/30 p-3 space-y-2.5"
                        >
                          <div className="flex items-start justify-between gap-2.5">
                            <button
                              type="button"
                              onClick={() => onChangePanelView('queue')}
                              className="flex items-center gap-2 min-w-0 text-left hover:text-[#6EE7B7] transition-colors cursor-pointer"
                            >
                              <RefreshCw className="w-3.5 h-3.5 text-amber-300 shrink-0" aria-hidden="true" />
                              <span className="text-xs sm:text-[13px] font-medium text-white truncate">
                                {card.title}
                              </span>
                            </button>
                            <span className="font-mono text-[10px] text-amber-200/80 shrink-0">
                              {card.mcpTool || 'approval'}
                            </span>
                          </div>

                          {(card.command || card.summary) && (
                            <pre className="rounded-lg bg-black/40 border border-white/10 px-2.5 py-1.5 font-mono text-[11px] text-[#6EE7B7] whitespace-pre-wrap break-all">
                              {card.command || card.summary}
                            </pre>
                          )}

                          {isClarify && onClarifyCard ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={draftVal}
                                onChange={(e) =>
                                  setClarifyDraft((prev) => ({ ...prev, [card.id]: e.target.value }))
                                }
                                placeholder="Provide answer to continue run..."
                                className="flex-1 min-w-0 rounded-lg bg-black/40 border border-white/15 px-2.5 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-[#34D399]"
                              />
                              <button
                                type="button"
                                disabled={!draftVal.trim()}
                                onClick={() => onClarifyCard(card.id, draftVal)}
                                className="h-8 px-3 rounded-lg bg-[#34D399] text-[#05140E] font-semibold text-xs hover:bg-[#6EE7B7] disabled:opacity-45 cursor-pointer"
                              >
                                Send
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                data-testid={`thread-approve-once-${card.id}`}
                                onClick={() => onApproveCard(card.id, 'once')}
                                className="h-8 px-3 rounded-lg bg-[#34D399] text-[#05140E] font-semibold text-xs inline-flex items-center gap-1 hover:bg-[#6EE7B7] transition-colors cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Once</span>
                              </button>
                              <button
                                type="button"
                                data-testid={`thread-approve-always-${card.id}`}
                                onClick={() => onApproveCard(card.id, 'always')}
                                className="h-8 px-3 rounded-lg bg-[#34D399]/18 border border-[#34D399]/40 text-[#6EE7B7] font-semibold text-xs inline-flex items-center gap-1 hover:bg-[#34D399]/28 transition-colors cursor-pointer"
                              >
                                <span>Always</span>
                              </button>
                              <button
                                type="button"
                                data-testid={`thread-approve-deny-${card.id}`}
                                onClick={() => onRejectCard(card.id)}
                                className="h-8 px-3 rounded-lg bg-rose-500/12 border border-rose-400/30 text-rose-200 hover:bg-rose-500/22 text-xs inline-flex items-center gap-1 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>Deny</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })()}

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

            {isThreadSplitLayout && composerDock}
          </div>

          {/* Dedicated Right Tasks Sidebar (Split on >=900px stage, Overlay drawer on narrower desktop stages) */}
          {showDesktopThreadSidebar && (
            <ThreadTaskBanner
              variant="thread-sidebar"
              overlayMode={threadTasksDockMode === 'overlay'}
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
              onClearCompleted={onClearCompletedTasks}
              onSteerTask={onSteerTask}
              onStopSpeaking={onStopSpeaking}
            />
          )}
        </div>
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

      {/* Floating Glass Composer Dock for Home, Queue, CLI, and non-split Mobile Thread */}
      {!isThreadSplitLayout && composerDock}
    </section>
  );
}
