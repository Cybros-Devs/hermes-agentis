import type {
  ApprovalCard,
  BackgroundTask,
  BriefDecision,
  Channel,
  ChannelId,
  ExpressionMood,
  HermesCronJob,
  HermesMemoryItem,
  HermesSkill,
} from '../types/hermes';
import {
  CURATED_UI_PRESETS,
  DEFAULT_UI_CONFIG,
  getCuratedPreset,
  parseNaturalUiIntent,
  type UiCustomizationPatch,
} from './uiCustomization';

export const INITIAL_CHANNELS: Channel[] = [
  {
    id: 'general',
    name: '#general',
    sessionId: 'hermes-general',
    description: 'Primary Hermes Agent voice thread, daily check-ins, and morning brief',
    unreadCount: 0,
  },
  {
    id: 'ops',
    name: '#ops',
    sessionId: 'hermes-ops',
    description: 'hermes gateway (:8642), cronjob_manage schedules, and infra operations',
    unreadCount: 1,
  },
  {
    id: 'launch',
    name: '#launch',
    sessionId: 'hermes-launch',
    description: '~/.hermes/skills/ workflows, build artifacts, and QA checks',
    unreadCount: 2,
  },
  {
    id: 'research',
    name: '#research',
    sessionId: 'hermes-research',
    description: 'Isolated background runs and persistent MEMORY.md synthesis',
    unreadCount: 0,
  },
];

export const INITIAL_HERMES_SKILLS: HermesSkill[] = [
  {
    name: 'hermes-memory',
    source: '~/.hermes/skills/hermes-memory/SKILL.md',
    summary: 'Persists cross-session facts, project conventions, and user preferences to MEMORY.md',
    enabled: true,
  },
  {
    name: 'morning-brief',
    source: '~/.hermes/skills/morning-brief/SKILL.md',
    summary: 'Summarizes overnight cron runs and ranks top open agent decisions',
    enabled: true,
  },
  {
    name: 'playwright-parity',
    source: '~/.hermes/skills/playwright-parity/SKILL.md',
    summary: 'Headless browser verification & responsive layout checks via terminal tools',
    enabled: true,
  },
  {
    name: 'cron-orchestrator',
    source: '~/.hermes/skills/cron-orchestrator/SKILL.md',
    summary: 'Schedules isolated agent & no-agent jobs with cronjob_manage',
    enabled: true,
  },
];

export const INITIAL_HERMES_MEMORY: HermesMemoryItem[] = [
  {
    key: 'gateway.endpoint',
    scope: 'host',
    value: 'http://127.0.0.1:8642 (API_SERVER_ENABLED=true, OpenAI /v1/chat/completions)',
  },
  {
    key: 'session.scoping',
    scope: 'session',
    value: 'X-Hermes-Session-Key binds each lane/shape to an isolated Hermes memory scope',
  },
  {
    key: 'brief.cadence',
    scope: 'preference',
    value: 'Standing cron prep runs 07:30 local; morning brief summarizes at 08:00 local',
  },
];

export const INITIAL_HERMES_CRON: HermesCronJob[] = [
  {
    id: 'cron-standing-pages',
    schedule: '30 7 * * *',
    channelId: 'launch',
    mode: 'agent',
    summary: 'Rebuild standing brief artifacts 30m prior to morning brief',
  },
  {
    id: 'cron-morning-brief',
    schedule: '0 8 * * *',
    channelId: 'general',
    mode: 'agent',
    summary: 'Compile morning brief across #general, #ops, and #launch sessions',
  },
  {
    id: 'cron-downloads-watch',
    schedule: '*/30 9-18 * * 1-5',
    channelId: 'ops',
    mode: 'no-agent',
    summary: 'Watch ~/Downloads and enqueue invoice PDFs for #ops triage',
  },
];

export const INITIAL_BRIEF_DECISIONS: BriefDecision[] = [
  {
    id: 'brief-1',
    priority: 'high',
    title: 'Approve outbound release dispatch for beta cohort',
    detail: 'Hermes Agent drafted the v2.4 release note for 184 subscribers in session hermes-general.',
    suggestedCommand: '/approve card-1',
    resolved: false,
  },
  {
    id: 'brief-2',
    priority: 'medium',
    title: 'Review scheduled cronjob_manage watcher rule in #ops',
    detail: 'Invoice triage rule queued for confirmation in session hermes-ops.',
    suggestedCommand: '/tasks',
    resolved: false,
  },
  {
    id: 'brief-3',
    priority: 'low',
    title: 'Inspect standing morning-brief.html diff in #launch',
    detail: '07:30 scheduled rebuild logged 2 updated steps in hermes-launch.',
    suggestedCommand: '/switch launch',
    resolved: false,
  },
];

export const INITIAL_APPROVALS: ApprovalCard[] = [
  {
    id: 'card-1',
    channelId: 'general',
    title: 'Send Release Dispatch via Mail Tool',
    actionType: 'send_message',
    mcpTool: 'mail_dispatch',
    runId: 'run-hermes-781',
    destination: 'mail://beta-cohort (184 recipients)',
    summary: 'Dispatches the v2.4 Hermes Agent changelog with streaming tool-progress support.',
    draft:
      'Hermes Agent v2.4 is live: direct Gateway (/v1/chat/completions) streaming, X-Hermes-Session-Key isolation, and live Braille voice sync are active.',
    status: 'pending',
    createdAt: '08:05',
  },
];

const SEED_BOOT_MS = Date.now();

export const INITIAL_TASKS: BackgroundTask[] = [
  {
    id: 'task-101',
    channelId: 'launch',
    sessionId: 'hermes-launch',
    kind: 'Background',
    background: true,
    title: 'Rebuild standing morning-brief.html',
    status: 'running',
    rawStatus: 'running',
    progress: 67,
    progressLabel: '4/6',
    lastStep: 'Verifying responsive layout across Playwright parity lane',
    createdAtMs: SEED_BOOT_MS - 878_000,
    updatedAtMs: SEED_BOOT_MS - 18_000,
    updatedAt: '14:21',
    steps: [
      { text: 'Collect overnight thread summaries & tool outputs', done: true },
      { text: 'Compile static morning-brief.html bundle', done: true },
      { text: 'Verify desktop 1440×900 layout & contrast hierarchy', done: true },
      { text: 'Capture mobile 390×844 snapshot & scroll bounds', done: true },
      { text: 'Streaming tool progress across Playwright parity lane', done: false, active: true },
      { text: 'Publish signed artifact to #launch brief archive', done: false },
    ],
  },
  {
    id: 'task-102',
    channelId: 'research',
    sessionId: 'hermes-research',
    kind: 'Background',
    background: true,
    title: 'Index ~/.hermes/skills/ & toolsets',
    status: 'completed',
    rawStatus: 'done',
    progress: 100,
    progressLabel: '3/3',
    lastStep: 'Synced 4 skills and native Hermes toolsets to #research',
    agentDoneAtMs: SEED_BOOT_MS - 1_920_000,
    createdAtMs: SEED_BOOT_MS - 2_700_000,
    updatedAtMs: SEED_BOOT_MS - 1_920_000,
    updatedAt: '13:45',
    steps: [
      { text: 'Scan ~/.hermes/skills/ SKILL.md manifests', done: true },
      { text: 'Validate active Hermes toolset schemas', done: true },
      { text: 'Synced 4 skills and native Hermes toolsets to #research', done: true },
    ],
  },
  {
    id: 'task-103',
    channelId: 'ops',
    sessionId: 'hermes-ops',
    kind: 'Cron',
    background: true,
    title: 'Audit ~/Downloads watcher rule (cronjob_manage)',
    status: 'paused',
    rawStatus: 'waiting',
    progress: 40,
    progressLabel: '2/5',
    lastStep: 'Waiting on confirmation to route invoice PDFs into #ops',
    createdAtMs: SEED_BOOT_MS - 1_680_000,
    updatedAtMs: SEED_BOOT_MS - 420_000,
    updatedAt: '12:10',
    steps: [
      { text: 'Inspect active cronjob_manage watcher schedule (*/30 9-18 * * 1-5)', done: true },
      { text: 'Scan ~/Downloads for matching invoice & receipt patterns', done: true },
      { text: 'Waiting on confirmation to route invoice PDFs into #ops', done: false, active: true },
      { text: 'Summarize matched PDF invoices into #ops thread', done: false },
      { text: 'Persist watcher filter rules to MEMORY.md', done: false },
    ],
  },
];

export interface CliContext {
  activeChannel: ChannelId;
  availableChannels?: ChannelId[];
  approvals: ApprovalCard[];
  tasks: BackgroundTask[];
  brief: BriefDecision[];
  isMuted: boolean;
  skills?: HermesSkill[];
  memory?: HermesMemoryItem[];
  cronJobs?: HermesCronJob[];
  gatewayConnected?: boolean;
  gatewayUrl?: string;
  activeModel?: string;
}

export type CliExecutionResult =
  | {
      type: 'handled';
      output: string;
      mood: ExpressionMood;
      spokenText: string;
      switchChannel?: ChannelId;
      startNewSession?: boolean;
      newSessionPrompt?: string;
      approveCardId?: string;
      rejectCardId?: string;
      toggleMute?: boolean;
      clearTerminal?: boolean;
      setMood?: ExpressionMood;
      setShader?: 'solid' | 'wire' | 'depth' | 'holo' | 'norm';
      setDitherStyle?: 'braille';
      uiPatch?: UiCustomizationPatch;
    }
  | {
      type: 'chat';
      prompt: string;
    };

export const AVAILABLE_COMMANDS = [
  '/help',
  '/new',
  '/brief',
  '/tasks',
  '/skills',
  '/memory',
  '/cron',
  '/sessions',
  '/gateway',
  '/doctor',
  '/channels',
  '/switch',
  '/resume',
  '/approve',
  '/reject',
  '/ui',
  '/customize',
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
 * Pure parser and local executor for Hermes Agent slash commands.
 * Natural-language prompts (not starting with `/`) route to the active Hermes Agent session.
 */
export function executeCliInput(rawInput: string, ctx: CliContext): CliExecutionResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      type: 'handled',
      output: 'Empty input. Type /help for Hermes Agent commands or speak naturally.',
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
  const skills = ctx.skills ?? INITIAL_HERMES_SKILLS;
  const memory = ctx.memory ?? INITIAL_HERMES_MEMORY;
  const cronJobs = ctx.cronJobs ?? INITIAL_HERMES_CRON;

  switch (cmd) {
    case '/help': {
      return {
        type: 'handled',
        mood: 'happy',
        spokenText:
          'Hermes Agent command reference ready. Start a new session, inspect skills, memory, cron routines, or check gateway status.',
        output: [
          'HERMES AGENT // COMMAND REFERENCE',
          '  /new [prompt]        Start a fresh isolated Hermes Agent session on Home',
          '  /brief               Display open morning brief decisions',
          '  /tasks               List background & cron tasks per session',
          '  /skills              List loaded ~/.hermes/skills/ manifests',
          '  /memory              Inspect persistent MEMORY.md & host context',
          '  /cron                List scheduled cronjob_manage routines',
          '  /sessions            Show active X-Hermes-Session-Key IDs per lane',
          '  /gateway | /doctor   Inspect hermes gateway (:8642) & /v1/models status',
          '  /switch <channel>    Switch session lane (general|ops|launch|research|...)',
          '  /resume <session>    Resume lane by session ID (e.g. hermes-ops)',
          '  /approve <id>        Approve a pending action card',
          '  /reject <id>         Dismiss a pending action card',
          '  /ui <spec|preset>    Dynamically customize theme, layout, character & backdrop',
          '  /customize           Open the interactive UI Studio drawer',
          '  /mood <state>        Shift portrait (neutral|happy|focused|alert|thinking)',
          '  /mute                Toggle Hermes voice audio output',
          '  /status              Report gateway mode, session key, and active tasks',
          '  /clear               Clear terminal feed',
        ].join('\n'),
      };
    }

    case '/new': {
      return {
        type: 'handled',
        mood: 'happy',
        startNewSession: true,
        newSessionPrompt: argStr || undefined,
        spokenText: argStr ? '' : 'New Hermes Agent session armed on Home.',
        output: argStr
          ? `Starting fresh Hermes Agent session for: "${argStr}"`
          : 'New Hermes Agent session armed on Home. Prompt anything to start.',
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
        output: ['HERMES AGENT // MORNING BRIEF QUEUE', ...lines].join('\n'),
      };
    }

    case '/tasks': {
      const lines = ctx.tasks.map(
        (t) =>
          `  [${t.id}] ${t.status.toUpperCase().padEnd(9)} ${String(t.progress).padStart(3)}% · #${t.channelId} (${t.sessionId ?? `hermes-${t.channelId}`}) · ${t.title}`
      );
      return {
        type: 'handled',
        mood: 'focused',
        spokenText: `Tracking ${ctx.tasks.length} Hermes Agent runs across your active sessions.`,
        output: ['HERMES AGENT // SESSION & BACKGROUND TASKS', ...lines].join('\n'),
      };
    }

    case '/skills': {
      const lines = skills.map(
        (s) => `  ${s.enabled ? '[ON]' : '[--]'} ${s.name.padEnd(18)} ${s.source}\n       ${s.summary}`
      );
      return {
        type: 'handled',
        mood: 'focused',
        spokenText: `${skills.filter((s) => s.enabled).length} Hermes Agent skills active under ~/.hermes/skills.`,
        output: [
          'HERMES AGENT // ~/.hermes/skills/',
          ...lines,
        ].join('\n'),
      };
    }

    case '/memory': {
      const lines = memory.map(
        (m) => `  [${m.scope.toUpperCase()}] ${m.key}: ${m.value}`
      );
      return {
        type: 'handled',
        mood: 'focused',
        spokenText: `Loaded ${memory.length} persistent Hermes Agent memory entries.`,
        output: ['HERMES AGENT // PERSISTENT MEMORY (MEMORY.md)', ...lines].join('\n'),
      };
    }

    case '/cron': {
      const lines = cronJobs.map(
        (c) =>
          `  [${c.schedule.padEnd(17)}] #${c.channelId.padEnd(8)} (${c.mode}) · ${c.summary}`
      );
      return {
        type: 'handled',
        mood: 'focused',
        spokenText: `${cronJobs.length} scheduled cronjob_manage routines active.`,
        output: ['HERMES AGENT // CRONJOB_MANAGE SCHEDULES', ...lines].join('\n'),
      };
    }

    case '/channels':
    case '/sessions':
    case '/lanes': {
      const lines = INITIAL_CHANNELS.map(
        (ch) =>
          `  #${ch.id.padEnd(9)} key=${ch.sessionId.padEnd(16)} ${ch.id === ctx.activeChannel ? '[ACTIVE] ' : ''}${ch.description}`
      );
      return {
        type: 'handled',
        mood: 'neutral',
        spokenText: `Active Hermes session is hermes-${ctx.activeChannel}.`,
        output: [
          `ACTIVE SESSION KEY: X-Hermes-Session-Key: hermes-${ctx.activeChannel}`,
          ...lines,
        ].join('\n'),
      };
    }

    case '/gateway':
    case '/doctor': {
      const url = ctx.gatewayUrl || 'http://127.0.0.1:8642';
      const connected = Boolean(ctx.gatewayConnected);
      const model = ctx.activeModel || 'hermes-agent';
      return {
        type: 'handled',
        mood: connected ? 'happy' : 'focused',
        spokenText: connected
          ? 'Hermes Gateway is connected and streaming chat completions are online.'
          : 'Hermes Gateway is in local standby. Start hermes gateway with API_SERVER_ENABLED=true to connect.',
        output: [
          'HERMES AGENT DOCTOR // GATEWAY CHECK',
          `  hermes-agent API Server : ${url} (${connected ? 'CONNECTED' : 'LOCAL STANDBY'})`,
          `  Chat Endpoint           : POST /v1/chat/completions (stream: true, hermes.tool.progress)`,
          `  Responses / Models      : POST /v1/responses · GET /v1/models (${model})`,
          `  Active Session Header   : X-Hermes-Session-Key: hermes-${ctx.activeChannel}`,
        ].join('\n'),
      };
    }

    case '/switch':
    case '/resume': {
      const normalized = argStr.replace(/^#/, '').replace(/^(hermes|duet)-/, '').toLowerCase() as ChannelId;
      const validPool = ctx.availableChannels && ctx.availableChannels.length > 0
        ? ctx.availableChannels
        : VALID_CHANNELS;
      if (!validPool.includes(normalized)) {
        return {
          type: 'handled',
          mood: 'alert',
          spokenText: 'Unknown Hermes session.',
          output: `Unknown session "${argStr}". Valid sessions: ${validPool.join(', ')} (or hermes-<lane>).`,
        };
      }
      return {
        type: 'handled',
        mood: 'happy',
        switchChannel: normalized,
        spokenText: `Resumed Hermes session hermes-${normalized}.`,
        output: `Resumed Hermes session hermes-${normalized} (#${normalized}).`,
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
        spokenText: `Approved ${card.title}. Dispatching action to ${card.destination}.`,
        output: `APPROVED [${card.id}] (${card.mcpTool ?? 'agent_action'}): ${card.title} -> ${card.destination}`,
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
        spokenText: `Held ${card.title}. No outbound action executed.`,
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
        output: `Braille portrait expression set to "${nextMood}".`,
      };
    }

    case '/style': {
      const mode = argStr.toLowerCase();
      if (mode && mode !== 'braille') {
        return {
          type: 'handled',
          mood: 'alert',
          spokenText: 'Only braille halftone portrait mode is active.',
          output: 'Valid halftone portrait style: braille.',
        };
      }
      return {
        type: 'handled',
        mood: 'focused',
        setDitherStyle: 'braille',
        spokenText: 'Braille halftone portrait mode is active.',
        output: 'Monochrome halftone portrait mode: "BRAILLE".',
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
        spokenText: `Hermes session hermes-${ctx.activeChannel} active. ${pendingCount} pending actions and ${runningCount} background runs active.`,
        output: [
          `SESSION KEY: hermes-${ctx.activeChannel} (#${ctx.activeChannel})`,
          `GATEWAY: ${ctx.gatewayConnected ? `HERMES API SERVER (${ctx.gatewayUrl || 'http://127.0.0.1:8642'})` : 'LOCAL STANDBY'}`,
          `PENDING ACTIONS: ${pendingCount}`,
          `RUNNING TASKS: ${runningCount}`,
          `VOICE AUDIO: ${ctx.isMuted ? 'MUTED' : 'ACTIVE'}`,
        ].join('\n'),
      };
    }

    case '/customize': {
      const maybePatch = argStr
        ? parseNaturalUiIntent(`make ui ${argStr}`, DEFAULT_UI_CONFIG) ?? { openCustomizer: true }
        : { openCustomizer: true };
      return {
        type: 'handled',
        mood: 'happy',
        uiPatch: maybePatch,
        spokenText: argStr
          ? 'Updated UI customization and opened the live studio.'
          : 'UI Customization Studio open. Adjust any theme, layout, or stage element live.',
        output: 'UI CUSTOMIZATION STUDIO // Opening full theme, layout, character & backdrop controls.',
      };
    }

    case '/ui': {
      const lowerArg = argStr.toLowerCase();
      if (!lowerArg || lowerArg === 'studio' || lowerArg === 'open') {
        return {
          type: 'handled',
          mood: 'happy',
          uiPatch: { openCustomizer: true },
          spokenText: 'UI Studio opened. Every theme, layout, and stage token is live.',
          output: 'UI STUDIO // Opened customization drawer. Try /ui cyber-violet, /ui reset, or natural language.',
        };
      }
      if (lowerArg === 'reset' || lowerArg === 'default' || lowerArg === 'restore') {
        return {
          type: 'handled',
          mood: 'happy',
          uiPatch: { resetAll: true },
          spokenText: 'Restored default Emerald Terminal layout and backdrop.',
          output: 'UI RESET // Restored default Emerald Terminal theme, layout, character & backdrop.',
        };
      }
      const preset = getCuratedPreset(lowerArg);
      if (preset) {
        return {
          type: 'handled',
          mood: preset.mood ?? 'happy',
          uiPatch: { presetId: preset.id },
          spokenText: `Applied ${preset.name} UI preset across the workspace.`,
          output: `UI PRESET // Applied "${preset.name}" (${preset.subtitle}).`,
        };
      }
      const parsed =
        parseNaturalUiIntent(argStr, DEFAULT_UI_CONFIG) ??
        parseNaturalUiIntent(`make ui ${argStr}`, DEFAULT_UI_CONFIG);
      if (parsed) {
        return {
          type: 'handled',
          mood: 'happy',
          uiPatch: parsed,
          spokenText: 'Applied your requested UI customization across the workspace.',
          output: `UI UPDATED // ${Object.keys(parsed).join(', ')}`,
        };
      }
      const presetIds = CURATED_UI_PRESETS.map((p) => p.id).join(', ');
      return {
        type: 'handled',
        mood: 'alert',
        spokenText: 'Specify a UI preset, reset, or customization instructions.',
        output: `Usage: /ui <preset|reset|instructions>\nPresets: ${presetIds}\nExample: /ui violet mono sharp right sidebar braille rain`,
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
        spokenText: `Unrecognized command ${cmd}. Type slash help for Hermes Agent commands.`,
        output: `Unknown command "${cmd}". Type /help to list available Hermes Agent commands.`,
      };
    }
  }
}
