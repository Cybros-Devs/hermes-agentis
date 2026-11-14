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

export type ChannelId = 'general' | 'ops' | 'launch' | 'research';

export interface Channel {
  id: ChannelId;
  name: string;
  sessionId: string;
  description: string;
  unreadCount: number;
}

export interface ApprovalCard {
  id: string;
  channelId: ChannelId;
  title: string;
  actionType: 'send_message' | 'payment' | 'deploy' | 'calendar';
  mcpTool?: 'mcp__duet__request_approval' | 'mcp__duet__request_payment';
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

export interface BackgroundTask {
  id: string;
  channelId: ChannelId;
  sessionId?: string;
  title: string;
  status: 'running' | 'completed' | 'paused';
  progress: number;
  lastStep: string;
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
  scope: 'host' | 'duet' | 'preference';
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
  mode: 'hermes-gateway' | 'standalone-duet';
  gatewayUrl: string;
  profile: string;
  mcpBridge: string;
  skillsCount: number;
  toolsets: string[];
}

export interface TerminalEntry {
  id: string;
  channelId: ChannelId;
  role: 'user' | 'hermes' | 'system' | 'command';
  source: 'voice' | 'cli' | 'ui';
  text: string;
  timestamp: string;
  mood?: ExpressionMood;
  commandUsed?: string;
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
