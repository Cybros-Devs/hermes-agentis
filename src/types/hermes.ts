export type ExpressionMood =
  | 'neutral'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'happy'
  | 'focused'
  | 'alert';

export type MouthViseme = 'closed' | 'smile' | 'small' | 'mid' | 'wide' | 'round';

export type EyeState = 'open' | 'blink' | 'half' | 'wide' | 'happy' | 'side';

export type PhosphorTheme = 'gold' | 'cyan' | 'mono';

export type ChannelId = 'general' | 'ops' | 'launch' | 'research';

export interface Channel {
  id: ChannelId;
  name: string;
  description: string;
  unreadCount: number;
}

export interface ApprovalCard {
  id: string;
  channelId: ChannelId;
  title: string;
  actionType: 'send_message' | 'payment' | 'deploy' | 'calendar';
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
  title: string;
  status: 'running' | 'completed' | 'paused';
  progress: number;
  lastStep: string;
  updatedAt: string;
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
