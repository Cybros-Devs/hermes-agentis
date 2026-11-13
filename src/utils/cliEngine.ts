import type {
  ApprovalCard,
  BackgroundTask,
  BriefDecision,
  Channel,
  ChannelId,
  ExpressionMood,
} from '../types/hermes';

export const INITIAL_CHANNELS: Channel[] = [
  {
    id: 'general',
    name: '#general',
    description: 'Morning briefs, check-ins, and primary Hermes voice link',
    unreadCount: 0,
  },
  {
    id: 'ops',
    name: '#ops',
    description: 'Host automation, daemon health, and approval gates',
    unreadCount: 1,
  },
  {
    id: 'launch',
    name: '#launch',
    description: 'Release checklist, landing deliverables, and QA sweeps',
    unreadCount: 2,
  },
  {
    id: 'research',
    name: '#research',
    description: 'Background synthesis lanes and standing briefings',
    unreadCount: 0,
  },
];

export const INITIAL_BRIEF_DECISIONS: BriefDecision[] = [
  {
    id: 'brief-1',
    priority: 'high',
    title: 'Approve staging release notes & customer changelog',
    detail: 'Hermes drafted the v2.4 release email for 184 beta subscribers. Ready for review in #launch.',
    suggestedCommand: '/approve card-1',
    resolved: false,
  },
  {
    id: 'brief-2',
    priority: 'medium',
    title: 'Renew edge inference API quota before 18:00 PST',
    detail: 'Usage crossed 82% of monthly burst allocation; virtual cap authorization queued.',
    suggestedCommand: '/approve card-2',
    resolved: false,
  },
  {
    id: 'brief-3',
    priority: 'low',
    title: 'Archive 14 stale PR preview environments',
    detail: 'Background cleanup task detected idle sandboxes older than 72 hours.',
    suggestedCommand: '/tasks',
    resolved: false,
  },
];

export const INITIAL_APPROVALS: ApprovalCard[] = [
  {
    id: 'card-1',
    channelId: 'general',
    title: 'Send Release Dispatch to Beta Cohort',
    actionType: 'send_message',
    destination: 'postmark://beta-list (184 recipients)',
    summary: 'Dispatches the v2.4 Hermes Duet changelog and voice-link patch notes.',
    draft:
      'Hermes Duet v2.4 is live: real-time voice lanes, tighter approval gating, and zero-latency brief summaries are now active on your host.',
    status: 'pending',
    createdAt: '08:05',
  },
  {
    id: 'card-2',
    channelId: 'ops',
    title: 'Authorize Inference Burst Cap',
    actionType: 'payment',
    destination: 'compute.gateway.local // Monthly Quota',
    summary: 'Itemized ceiling for edge GPU overflow ($45.00 max, single-use cap).',
    draft: 'Authorize $45.00 single-use virtual limit for Compute Gateway burst tier.',
    amountCents: 4500,
    status: 'pending',
    createdAt: '08:12',
  },
];

export const INITIAL_TASKS: BackgroundTask[] = [
  {
    id: 'task-101',
    channelId: 'launch',
    title: 'Compile Playwright visual parity report',
    status: 'running',
    progress: 72,
    lastStep: 'Capturing mobile viewport snapshots & diffing baseline',
    updatedAt: '14:21',
  },
  {
    id: 'task-102',
    channelId: 'research',
    title: 'Synthesize weekly competitor MCP connectors',
    status: 'completed',
    progress: 100,
    lastStep: 'Delivered summary table to #research',
    updatedAt: '13:45',
  },
  {
    id: 'task-103',
    channelId: 'ops',
    title: 'Audit ~/Downloads inbox watcher rules',
    status: 'paused',
    progress: 40,
    lastStep: 'Waiting on confirmation to move invoice PDFs',
    updatedAt: '12:10',
  },
];

export interface CliContext {
  activeChannel: ChannelId;
  approvals: ApprovalCard[];
  tasks: BackgroundTask[];
  brief: BriefDecision[];
  isMuted: boolean;
}

export type CliExecutionResult =
  | {
      type: 'handled';
      output: string;
      mood: ExpressionMood;
      spokenText: string;
      switchChannel?: ChannelId;
      approveCardId?: string;
      rejectCardId?: string;
      toggleMute?: boolean;
      clearTerminal?: boolean;
      setMood?: ExpressionMood;
      setShader?: 'solid' | 'wire' | 'depth' | 'holo' | 'norm';
      setDitherStyle?: 'floyd' | 'bayer' | 'braille';
    }
  | {
      type: 'chat';
      prompt: string;
    };

export const AVAILABLE_COMMANDS = [
  '/help',
  '/brief',
  '/tasks',
  '/channels',
  '/switch',
  '/approve',
  '/reject',
  '/mood',
  '/style',
  '/mute',
  '/status',
  '/clear',
] as const;

const VALID_MOODS: ExpressionMood[] = [
  'neutral',
  'listening',
  'thinking',
  'speaking',
  'happy',
  'focused',
  'alert',
];

const VALID_CHANNELS: ChannelId[] = ['general', 'ops', 'launch', 'research'];

/**
 * Pure parser and local executor for Hermes Duet slash commands.
 * Natural-language prompts (not starting with `/`) are routed to the live Gemini agent.
 */
export function executeCliInput(rawInput: string, ctx: CliContext): CliExecutionResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      type: 'handled',
      output: 'Empty input. Type /help for commands or speak naturally to Hermes.',
      mood: 'neutral',
      spokenText: '',
    };
  }

  if (!trimmed.startsWith('/')) {
    return { type: 'chat', prompt: trimmed };
  }

  const [cmdRaw, ...args] = trimmed.split(/\s+/);
  const cmd = cmdRaw.toLowerCase();
  const argStr = args.join(' ').trim();

  switch (cmd) {
    case '/help': {
      return {
        type: 'handled',
        mood: 'happy',
        spokenText: 'Command reference loaded. You can inspect the morning brief, switch channels, approve cards, or speak naturally.',
        output: [
          'HERMES DUET // COMMAND LINE REFERENCE',
          '  /brief               Display today’s prioritized morning brief',
          '  /tasks               List active & completed background lanes',
          '  /channels            List available Hermes channels',
          '  /switch <channel>    Switch active channel (general|ops|launch|research)',
          '  /approve <id>        Approve a pending gate card (e.g. /approve card-1)',
          '  /reject <id>         Dismiss a pending gate card',
          '  /mood <state>        Test ASCII expression (neutral|happy|focused|alert|thinking)',
          '  /style <mode>        Switch halftone dither style (floyd|bayer|braille)',
          '  /mute                Toggle Hermes voice audio output',
          '  /status              Report link, lane, and pending approval counts',
          '  /clear               Clear terminal feed',
        ].join('\n'),
      };
    }

    case '/brief': {
      const pending = ctx.brief.filter((b) => !b.resolved);
      const lines = ctx.brief.map(
        (b, i) =>
          `  ${i + 1}. [${b.priority.toUpperCase()}] ${b.title} ${b.resolved ? '(RESOLVED)' : `-> ${b.suggestedCommand}`}`
      );
      return {
        type: 'handled',
        mood: 'focused',
        spokenText: `Morning brief has ${pending.length} open decisions. Top priority: ${pending[0]?.title ?? 'all clear'}.`,
        output: ['MORNING BRIEF // PRIORITY QUEUE', ...lines].join('\n'),
      };
    }

    case '/tasks': {
      const lines = ctx.tasks.map(
        (t) =>
          `  [${t.id}] ${t.status.toUpperCase().padEnd(9)} ${String(t.progress).padStart(3)}% · #${t.channelId} · ${t.title}`
      );
      return {
        type: 'handled',
        mood: 'focused',
        spokenText: `Tracking ${ctx.tasks.length} background tasks across your Hermes lanes.`,
        output: ['BACKGROUND LANES // ACTIVE TASKS', ...lines].join('\n'),
      };
    }

    case '/channels': {
      return {
        type: 'handled',
        mood: 'neutral',
        spokenText: `Currently tuned to channel ${ctx.activeChannel}.`,
        output: [
          `ACTIVE CHANNEL: #${ctx.activeChannel}`,
          '  #general   Morning briefs, check-ins, primary voice link',
          '  #ops       Host automation, daemon health, approval gates',
          '  #launch    Release checklist, deliverables, QA sweeps',
          '  #research  Background synthesis lanes and briefings',
        ].join('\n'),
      };
    }

    case '/switch': {
      const target = argStr.replace(/^#/, '').toLowerCase() as ChannelId;
      if (!VALID_CHANNELS.includes(target)) {
        return {
          type: 'handled',
          mood: 'alert',
          spokenText: 'Unknown channel. Choose general, ops, launch, or research.',
          output: `Unknown channel "${argStr}". Valid options: ${VALID_CHANNELS.join(', ')}.`,
        };
      }
      return {
        type: 'handled',
        mood: 'happy',
        switchChannel: target,
        spokenText: `Switched comms lane to ${target}.`,
        output: `Switched active Hermes lane to #${target}.`,
      };
    }

    case '/approve': {
      const targetId = argStr || ctx.approvals.find((c) => c.status === 'pending')?.id || '';
      const card = ctx.approvals.find((c) => c.id === targetId);
      if (!card) {
        return {
          type: 'handled',
          mood: 'alert',
          spokenText: 'No matching approval card found.',
          output: `No approval card found matching "${argStr || 'pending'}".`,
        };
      }
      if (card.status !== 'pending') {
        return {
          type: 'handled',
          mood: 'neutral',
          spokenText: `Card ${card.id} is already ${card.status}.`,
          output: `Card ${card.id} is already marked ${card.status}.`,
        };
      }
      return {
        type: 'handled',
        mood: 'happy',
        approveCardId: card.id,
        spokenText: `Approved ${card.title}. Executing action on ${card.destination}.`,
        output: `APPROVED [${card.id}]: ${card.title} -> ${card.destination}`,
      };
    }

    case '/reject': {
      const targetId = argStr || ctx.approvals.find((c) => c.status === 'pending')?.id || '';
      const card = ctx.approvals.find((c) => c.id === targetId);
      if (!card) {
        return {
          type: 'handled',
          mood: 'alert',
          spokenText: 'No matching approval card found.',
          output: `No approval card found matching "${argStr || 'pending'}".`,
        };
      }
      return {
        type: 'handled',
        mood: 'neutral',
        rejectCardId: card.id,
        spokenText: `Held ${card.title}. No external action taken.`,
        output: `DISMISSED [${card.id}]: ${card.title} (held locally)`,
      };
    }

    case '/mood': {
      const nextMood = argStr.toLowerCase() as ExpressionMood;
      if (!VALID_MOODS.includes(nextMood)) {
        return {
          type: 'handled',
          mood: 'alert',
          spokenText: 'Unsupported mood state.',
          output: `Valid moods: ${VALID_MOODS.join(', ')}.`,
        };
      }
      return {
        type: 'handled',
        mood: nextMood,
        setMood: nextMood,
        spokenText: `Expression matrix shifted to ${nextMood}.`,
        output: `ASCII expression set to "${nextMood}".`,
      };
    }

    case '/style': {
      const mode = argStr.toLowerCase();
      if (mode !== 'floyd' && mode !== 'bayer' && mode !== 'braille') {
        return {
          type: 'handled',
          mood: 'alert',
          spokenText: 'Invalid dither style. Choose floyd, bayer, or braille.',
          output: 'Valid halftone dither styles: floyd, bayer, braille.',
        };
      }
      return {
        type: 'handled',
        mood: 'focused',
        setDitherStyle: mode,
        spokenText: `Halftone portrait dither switched to ${mode}.`,
        output: `Monochrome halftone dither set to "${mode.toUpperCase()}".`,
      };
    }

    case '/shader': {
      const mode = argStr.toLowerCase();
      if (mode !== 'solid' && mode !== 'wire' && mode !== 'depth' && mode !== 'holo' && mode !== 'norm') {
        return {
          type: 'handled',
          mood: 'alert',
          spokenText: 'Invalid shader. Choose solid, wire, depth, holo, or norm.',
          output: 'Valid 3D ASCII shaders: solid, wire, depth, holo, norm.',
        };
      }
      return {
        type: 'handled',
        mood: 'focused',
        setShader: mode,
        spokenText: `3D ASCII shader switched to ${mode} mode.`,
        output: `3D SDF ASCII shader mode set to "${mode.toUpperCase()}".`,
      };
    }

    case '/mute': {
      return {
        type: 'handled',
        mood: 'neutral',
        toggleMute: true,
        spokenText: ctx.isMuted ? 'Audio output unmuted.' : '',
        output: ctx.isMuted ? 'Audio output UNMUTED.' : 'Audio output MUTED.',
      };
    }

    case '/status': {
      const pendingCount = ctx.approvals.filter((a) => a.status === 'pending').length;
      const runningCount = ctx.tasks.filter((t) => t.status === 'running').length;
      return {
        type: 'handled',
        mood: 'focused',
        spokenText: `Link nominal. ${pendingCount} approvals waiting and ${runningCount} background tasks running.`,
        output: [
          `CHANNEL: #${ctx.activeChannel}`,
          `PENDING APPROVALS: ${pendingCount}`,
          `RUNNING TASKS: ${runningCount}`,
          `VOICE AUDIO: ${ctx.isMuted ? 'MUTED' : 'ACTIVE'}`,
        ].join('\n'),
      };
    }

    case '/clear': {
      return {
        type: 'handled',
        mood: 'neutral',
        clearTerminal: true,
        spokenText: '',
        output: 'Terminal buffer cleared.',
      };
    }

    default: {
      return {
        type: 'handled',
        mood: 'alert',
        spokenText: `Unrecognized command ${cmd}. Type slash help for available commands.`,
        output: `Unknown command "${cmd}". Type /help to list available commands.`,
      };
    }
  }
}
