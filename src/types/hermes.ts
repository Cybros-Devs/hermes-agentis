export type ExpressionMood =
  | 'neutral'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'happy'
  | 'focused'
  | 'alert';

export type MouthViseme =
  | 'closed'
  | 'rest'
  | 'smile'
  | 'mbp'
  | 'fv'
  | 'lth'
  | 'small'
  | 'mid'
  | 'round'
  | 'ee'
  | 'wide';

export type EyeState = 'open' | 'blink' | 'half' | 'wide' | 'happy' | 'side';

export type PhosphorTheme = 'gold' | 'cyan' | 'mono';

export type ChannelId = string;

export type HermesSessionRuntimeStatus = 'idle' | 'thinking' | 'speaking' | 'running';

export interface HermesAgentSession {
  sessionId: string;
  channelId: ChannelId;
  name: string;
  persona: string;
  topic: string;
  status: HermesSessionRuntimeStatus;
  turnCount: number;
  lastMessage?: string;
  updatedAtMs: number;
}

export interface Channel {
  id: ChannelId;
  name: string;
  sessionId: string;
  description: string;
  persona?: string;
  unreadCount: number;
}

export interface ApprovalCard {
  id: string;
  channelId: ChannelId;
  title: string;
  actionType: 'send_message' | 'payment' | 'deploy' | 'calendar' | 'tool';
  mcpTool?: string;
  runId?: string;
  destination: string;
  summary: string;
  draft: string;
  amountCents?: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface BriefDecision {
  id: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  suggestedCommand: string;
  resolved: boolean;
}

export interface TaskStepItem {
  text: string;
  done?: boolean;
  active?: boolean;
}

export interface BackgroundTask {
  id: string;
  channelId: ChannelId;
  sessionId?: string;
  kind?: string;
  background?: boolean;
  handoverId?: string;
  title: string;
  status: 'running' | 'completed' | 'paused';
  rawStatus?: string;
  progress: number;
  progressLabel?: string;
  lastStep: string;
  steps?: TaskStepItem[];
  result?: string;
  agentDoneAtMs?: number;
  confirmedAtMs?: number;
  createdAtMs?: number;
  updatedAtMs?: number;
  updatedAt: string;
}

export interface HermesSkill {
  name: string;
  source: string;
  summary: string;
  enabled: boolean;
}

export interface HermesMemoryItem {
  key: string;
  scope: 'host' | 'session' | 'preference';
  value: string;
}

export interface HermesCronJob {
  id: string;
  schedule: string;
  channelId: ChannelId;
  mode: 'agent' | 'no-agent';
  summary: string;
}

export interface HermesGatewayStatus {
  connected: boolean;
  mode: 'hermes-gateway' | 'local-standby';
  gatewayUrl: string;
  profile: string;
  activeModel: string;
  models: string[];
  sessionHeader: string;
  skillsCount: number;
  toolsets: string[];
  hermesHomeFound?: boolean;
  error?: string;
}

export interface TerminalEntry {
  id: string;
  channelId: ChannelId;
  role: 'user' | 'hermes' | 'system' | 'command' | 'activity';
  source: 'voice' | 'cli' | 'ui';
  text: string;
  timestamp: string;
  mood?: ExpressionMood;
  commandUsed?: string;
  streaming?: boolean;
  /** Epoch ms from the Hermes server; used to keep items chronologically ordered. */
  createdAtMs?: number;
}

export interface VoiceState {
  isListening: boolean;
  isSpeaking: boolean;
  isThinking: boolean;
  isMuted: boolean;
  micSupported: boolean;
  interimTranscript: string;
  inputLevel: number;
  outputLevel: number;
  frequencyBands: number[];
}
