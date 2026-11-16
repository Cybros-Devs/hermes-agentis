import type {
  ApprovalCard,
  BackgroundTask,
  ChannelId,
  ExpressionMood,
  EyeState,
  HermesAgentSession,
  HermesGatewayStatus,
  MouthViseme,
} from '../types/hermes';
import type { StatusPulseState } from '../components/ui/StatusPulse';
import { amplitudeToViseme } from './asciiCharacter';
import type { LookTarget } from './asciiPortraitEngine';
import {
  resolveTaskDisplayTitle,
  resolveTaskProgress,
  resolveTaskStepBreakdown,
} from './taskInsights';

export type SidebarCharacterMode =
  | 'speaking'
  | 'listening'
  | 'working'
  | 'attention'
  | 'offline'
  | 'idle';

export type SidebarCharacterTone = 'emerald' | 'amber' | 'rose';

export interface SidebarActiveTaskSummary {
  id: string;
  channelId: ChannelId;
  title: string;
  stepText: string;
  progressPct: number;
  ratioLabel: string;
  isIndeterminate: boolean;
  createdAtMs?: number;
}

export interface SidebarPendingApprovalSummary {
  id: string;
  channelId: ChannelId;
  title: string;
}

export interface SidebarCharacterInput {
  tasks: BackgroundTask[];
  approvals: ApprovalCard[];
  thinkingByChannel?: Record<string, boolean>;
  hermesSessions?: HermesAgentSession[];
  activeChannel: ChannelId;
  homeSessionDraft?: boolean;
  baseMood: ExpressionMood;
  isSpeaking: boolean;
  isListening: boolean;
  inputLevel?: number;
  outputLevel?: number;
  frequencyBands?: number[];
  tick?: number;
  gatewayStatus?: HermesGatewayStatus | null;
  lastSpokenLine: string;
}

export interface SidebarCharacterSnapshot {
  mode: SidebarCharacterMode;
  mood: ExpressionMood;
  eyeState: EyeState;
  viseme: MouthViseme;
  energy: number;
  tone: SidebarCharacterTone;
  pulseState: StatusPulseState;
  statusLabel: string;
  gatewayLine: string;
  runningTaskCount: number;
  pendingApprovalCount: number;
  activeTask: SidebarActiveTaskSummary | null;
  topApproval: SidebarPendingApprovalSummary | null;
}

const ACTIVE_SESSION_STATUSES = new Set(['thinking', 'speaking', 'running']);

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function resolveMoodEyeState(mood: ExpressionMood): EyeState {
  if (mood === 'alert') return 'wide';
  if (mood === 'thinking') return 'side';
  if (mood === 'focused') return 'half';
  if (mood === 'happy') return 'happy';
  return 'open';
}

function peakBandEnergy(bands?: number[]): number {
  if (!bands || bands.length === 0) return 0;
  let sum = 0;
  let max = 0;
  const count = Math.min(8, bands.length);
  for (let i = 0; i < count; i++) {
    const val = Number.isFinite(bands[i]) ? Math.max(0, bands[i]) : 0;
    sum += val;
    if (val > max) max = val;
  }
  return clamp(max * 0.6 + (sum / Math.max(1, count)) * 0.4, 0, 1);
}

/**
 * Derives the sidebar character's synchronized expression, halftone palette tone,
 * vocal viseme, energy level, and compact running-task telemetry from live app state.
 */
export function deriveSidebarCharacterState(
  input: SidebarCharacterInput
): SidebarCharacterSnapshot {
  const {
    tasks,
    approvals,
    thinkingByChannel = {},
    hermesSessions = [],
    activeChannel,
    homeSessionDraft = false,
    baseMood,
    isSpeaking,
    isListening,
    inputLevel = 0,
    outputLevel = 0,
    frequencyBands,
    tick = 0,
    gatewayStatus,
    lastSpokenLine,
  } = input;

  const runningTasks = tasks
    .filter((t) => t.status === 'running')
    .sort((a, b) => {
      if (!homeSessionDraft && activeChannel) {
        const aActive = a.channelId === activeChannel ? 0 : 1;
        const bActive = b.channelId === activeChannel ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
      }
      return (b.updatedAtMs ?? b.createdAtMs ?? 0) - (a.updatedAtMs ?? a.createdAtMs ?? 0);
    });

  const runningChannelSet = new Set<string>(runningTasks.map((t) => t.channelId));
  let extraThinkingChannels = 0;
  const seenExtra = new Set<string>();

  for (const [chId, isThinking] of Object.entries(thinkingByChannel)) {
    if (isThinking && !runningChannelSet.has(chId) && !seenExtra.has(chId)) {
      seenExtra.add(chId);
      extraThinkingChannels += 1;
    }
  }
  for (const session of hermesSessions) {
    if (
      ACTIVE_SESSION_STATUSES.has(session.status) &&
      !runningChannelSet.has(session.channelId) &&
      !seenExtra.has(session.channelId)
    ) {
      seenExtra.add(session.channelId);
      extraThinkingChannels += 1;
    }
  }

  const runningTaskCount = runningTasks.length + extraThinkingChannels;
  const pendingApprovals = approvals.filter((a) => a.status === 'pending');
  const pendingApprovalCount = pendingApprovals.length;

  const leadTask = runningTasks[0] ?? null;
  let activeTask: SidebarActiveTaskSummary | null = null;
  if (leadTask) {
    const progress = resolveTaskProgress(leadTask);
    const breakdown = resolveTaskStepBreakdown(leadTask);
    activeTask = {
      id: leadTask.id,
      channelId: leadTask.channelId,
      title: resolveTaskDisplayTitle(leadTask),
      stepText: breakdown.activeStepText || leadTask.lastStep || 'Working…',
      progressPct: progress.pct,
      ratioLabel: progress.ratioLabel,
      isIndeterminate: progress.isIndeterminate,
      createdAtMs: leadTask.createdAtMs,
    };
  } else if (runningTaskCount > 0) {
    const firstActiveChannel = Array.from(seenExtra)[0] || activeChannel || 'session';
    activeTask = {
      id: `live-channel-${firstActiveChannel}`,
      channelId: firstActiveChannel,
      title: `Routing turn in #${firstActiveChannel}`,
      stepText: 'Thinking…',
      progressPct: 0,
      ratioLabel: 'live',
      isIndeterminate: true,
    };
  }

  const topApproval: SidebarPendingApprovalSummary | null = pendingApprovals[0]
    ? {
        id: pendingApprovals[0].id,
        channelId: pendingApprovals[0].channelId,
        title: pendingApprovals[0].title,
      }
    : null;

  const isGatewayConnected = Boolean(gatewayStatus?.connected);
  const gatewayLine = gatewayStatus
    ? isGatewayConnected
      ? `${gatewayStatus.activeModel || 'hermes-agent'} · ${gatewayStatus.profile || 'default'}`
      : 'Gateway offline · Open Ops'
    : lastSpokenLine;

  const bandPeak = peakBandEnergy(frequencyBands);

  if (isSpeaking) {
    const energy = clamp(Math.max(0.46, outputLevel, bandPeak), 0.46, 1);
    const mood: ExpressionMood = 'speaking';
    return {
      mode: 'speaking',
      mood,
      eyeState: resolveMoodEyeState(baseMood === 'happy' ? 'happy' : 'neutral'),
      viseme: amplitudeToViseme(
        energy,
        mood,
        tick,
        true,
        frequencyBands,
        lastSpokenLine
      ),
      energy,
      tone: 'emerald',
      pulseState: 'speaking',
      statusLabel: 'speaking',
      gatewayLine,
      runningTaskCount,
      pendingApprovalCount,
      activeTask,
      topApproval,
    };
  }

  if (isListening) {
    const energy = clamp(Math.max(0.32, inputLevel, bandPeak * 0.85), 0.32, 0.95);
    const mood: ExpressionMood = 'listening';
    return {
      mode: 'listening',
      mood,
      eyeState: 'open',
      viseme: 'rest',
      energy,
      tone: 'emerald',
      pulseState: 'listening',
      statusLabel: 'listening',
      gatewayLine,
      runningTaskCount,
      pendingApprovalCount,
      activeTask,
      topApproval,
    };
  }

  if (runningTaskCount > 0) {
    const mood: ExpressionMood = 'thinking';
    const energy = clamp(0.44 + Math.min(4, runningTaskCount - 1) * 0.09, 0.44, 0.78);
    return {
      mode: 'working',
      mood,
      eyeState: 'side',
      viseme: 'rest',
      energy,
      tone: 'amber',
      pulseState: 'thinking',
      statusLabel: runningTaskCount > 1 ? `${runningTaskCount} working` : 'working',
      gatewayLine,
      runningTaskCount,
      pendingApprovalCount,
      activeTask,
      topApproval,
    };
  }

  if (pendingApprovalCount > 0) {
    const mood: ExpressionMood = 'alert';
    return {
      mode: 'attention',
      mood,
      eyeState: 'wide',
      viseme: 'rest',
      energy: 0.42,
      tone: 'amber',
      pulseState: 'waiting',
      statusLabel:
        pendingApprovalCount > 1 ? `${pendingApprovalCount} approvals` : '1 approval',
      gatewayLine,
      runningTaskCount,
      pendingApprovalCount,
      activeTask,
      topApproval,
    };
  }

  if (gatewayStatus && !isGatewayConnected) {
    const mood: ExpressionMood = baseMood === 'thinking' ? 'neutral' : baseMood;
    return {
      mode: 'offline',
      mood,
      eyeState: resolveMoodEyeState(mood),
      viseme: 'closed',
      energy: 0.08,
      tone: 'rose',
      pulseState: 'error',
      statusLabel: 'offline',
      gatewayLine,
      runningTaskCount: 0,
      pendingApprovalCount: 0,
      activeTask: null,
      topApproval: null,
    };
  }

  const mood = baseMood;
  return {
    mode: 'idle',
    mood,
    eyeState: resolveMoodEyeState(mood),
    viseme: mood === 'happy' ? 'smile' : 'closed',
    energy: 0.16,
    tone: 'emerald',
    pulseState: gatewayStatus ? 'live' : 'idle',
    statusLabel: gatewayStatus
      ? 'online'
      : homeSessionDraft || !activeChannel
      ? 'new session'
      : `#${activeChannel}`,
    gatewayLine,
    runningTaskCount: 0,
    pendingApprovalCount: 0,
    activeTask: null,
    topApproval: null,
  };
}

/**
 * Maps pointer coordinates over the sidebar character card to a normalized gaze
 * vector centered on the portrait avatar so Hermes glances toward what the user hovers.
 */
export function computeSidebarPointerLookTarget(
  cardRect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number,
  portraitCenterOffsetPx = 44
): LookTarget {
  const cx = cardRect.left + Math.min(portraitCenterOffsetPx, cardRect.width * 0.25);
  const cy = cardRect.top + Math.min(portraitCenterOffsetPx, cardRect.height * 0.5);
  const normW = Math.max(96, cardRect.width * 0.72);
  const normH = Math.max(64, cardRect.height * 0.85);
  return {
    x: clamp((clientX - cx) / normW, -1, 1),
    y: clamp((clientY - cy) / normH, -1, 1),
  };
}
