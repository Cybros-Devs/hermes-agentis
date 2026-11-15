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
    sessionId: 'duet-general',
    description: 'Primary Hermes Agent voice thread, daily check-ins, and morning brief',
    unreadCount: 0,
  },
  {
    id: 'ops',
    name: '#ops',
    sessionId: 'duet-ops',
    description: 'hermes gateway (:8642), cronjob_manage schedules, and payment gates',
    unreadCount: 1,
  },
  {
    id: 'launch',
    name: '#launch',
    sessionId: 'duet-launch',
    description: '~/.hermes/skills/ workflows, save_page rebuilds, and QA checks',
    unreadCount: 2,
  },
  {
    id: 'research',
    name: '#research',
    sessionId: 'duet-research',
    description: 'Isolated background runs and persistent MEMORY.md synthesis',
    unreadCount: 0,
  },
];

export const INITIAL_HERMES_SKILLS: HermesSkill[] = [
  {
    name: 'duet-bridge',
    source: '~/.hermes/skills/duet-bridge/SKILL.md',
    summary: 'Human-in-the-loop request_approval, request_payment, post_brief, and save_page via mcp__duet__*',
    enabled: true,
  },
  {
    name: 'morning-brief',
    source: '~/.hermes/skills/morning-brief/SKILL.md',
    summary: 'Rebuilds standing brief 30m ahead of schedule and ranks top 5 open decisions',
    enabled: true,
  },
  {
    name: 'playwright-parity',
    source: '~/.hermes/skills/playwright-parity/SKILL.md',
    summary: 'Browser verification & responsive snapshot diffs posted back via update_task',
    enabled: true,
  },
  {
    name: 'mail-triage',
    source: '~/.hermes/skills/mail-triage/SKILL.md',
    summary: 'Drafts replies and holds outbound sends behind mcp__duet__request_approval',
    enabled: true,
  },
];

export const INITIAL_HERMES_MEMORY: HermesMemoryItem[] = [
  {
    key: 'gateway.endpoint',
    scope: 'host',
    value: 'http://127.0.0.1:8642 (API_SERVER_ENABLED=true, OpenAI /v1/runs)',
  },
  {
    key: 'mcp.duet_shim',
    scope: 'duet',
    value: '~/.hermes/config.yaml -> mcp_servers.duet (tools: {}, mcp__duet__*)',
  },
  {
    key: 'brief.cadence',
    scope: 'preference',
    value: 'Standing pages refresh 07:30 local; post_brief delivers at 08:00 local',
  },
];

export const INITIAL_HERMES_CRON: HermesCronJob[] = [
  {
    id: 'cron-standing-pages',
    schedule: '30 7 * * *',
    channelId: 'launch',
    mode: 'agent',
    summary: 'Rebuild save_page deliverables 30m prior to morning brief',
  },
  {
    id: 'cron-morning-brief',
    schedule: '0 8 * * *',
    channelId: 'general',
    mode: 'agent',
    summary: 'Run post_brief across #general, #ops, and #launch lanes',
  },
  {
    id: 'cron-downloads-watch',
    schedule: '*/30 9-18 * * 1-5',
    channelId: 'ops',
    mode: 'no-agent',
    summary: 'Watch ~/Downloads and enqueue invoice PDFs for review',
  },
];

export const INITIAL_BRIEF_DECISIONS: BriefDecision[] = [
  {
    id: 'brief-1',
    priority: 'high',
    title: 'Approve Mail MCP release dispatch via mcp__duet__request_approval',
    detail: 'Hermes Agent prepared the v2.4 Duet release note for 184 subscribers in lane duet-general.',
    suggestedCommand: '/approve card-1',
    resolved: false,
  },
  {
    id: 'brief-2',
    priority: 'medium',
    title: 'Authorize single-use spend cap via mcp__duet__request_payment',
    detail: 'Itemized compute overflow ($45.00 / DUET_MAX_TRANSACTION_LIMIT $500) queued in lane duet-ops.',
    suggestedCommand: '/approve card-2',
    resolved: false,
  },
  {
    id: 'brief-3',
    priority: 'low',
    title: 'Review standing morning-brief.html diff from save_page run',
    detail: '07:30 scheduled rebuild logged 2 changed tasks in #launch.',
    suggestedCommand: '/tasks',
    resolved: false,
  },
];

export const INITIAL_APPROVALS: ApprovalCard[] = [
  {
    id: 'card-1',
    channelId: 'general',
    title: 'Send Release Dispatch via Mail MCP',
    actionType: 'send_message',
    mcpTool: 'mcp__duet__request_approval',
    runId: 'run-duet-781',
    destination: 'mail://beta-cohort (184 recipients)',
    summary: 'Dispatches the v2.4 Hermes Agent voice link & Duet MCP changelog.',
    draft:
      'Hermes Duet v2.4 is live: direct Hermes Gateway (/v1/runs) voice link, mcp__duet approval gating, and live Braille decoding are now active.',
    status: 'pending',
    createdAt: '08:05',
  },
  {
    id: 'card-2',
    channelId: 'ops',
    title: 'Authorize Inference Burst Virtual Cap',
    actionType: 'payment',
    mcpTool: 'mcp__duet__request_payment',
    runId: 'run-duet-784',
    destination: 'nous://inference-gateway (Single-use cap)',
    summary: 'Itemized receipt: $45.00 overflow ceiling (under $500.00 DUET_MAX_TRANSACTION_LIMIT).',
    draft: 'Authorize $45.00 single-use virtual card for local Hermes inference overflow.',
    amountCents: 4500,
    status: 'pending',
    createdAt: '08:12',
  },
];

const SEED_BOOT_MS = Date.now();

export const INITIAL_TASKS: BackgroundTask[] = [
  {
    id: 'task-101',
    channelId: 'launch',
    sessionId: 'duet-run-409',
    kind: 'Background',
    title: 'Rebuild standing morning-brief.html (save_page)',
    status: 'running',
    rawStatus: 'running',
    progress: 67,
    progressLabel: '4/6',
    lastStep: 'Streaming update_task delta across Playwright parity lane',
    createdAtMs: SEED_BOOT_MS - 878_000,
    updatedAtMs: SEED_BOOT_MS - 18_000,
    updatedAt: '14:21',
    steps: [
      { text: 'Collect overnight thread summaries & approval outcomes', done: true },
      { text: 'Compile static morning-brief.html bundle via save_page', done: true },
      { text: 'Verify desktop 1440×900 layout & contrast hierarchy', done: true },
      { text: 'Capture mobile 390×844 snapshot & scroll bounds', done: true },
      { text: 'Streaming update_task delta across Playwright parity lane', done: false, active: true },
      { text: 'Publish signed artifact to #launch brief archive', done: false },
    ],
  },
  {
    id: 'task-102',
    channelId: 'research',
    sessionId: 'duet-run-398',
    kind: 'Background',
    title: 'Index ~/.hermes/skills/ & MCP connectors',
    status: 'completed',
    rawStatus: 'done',
    progress: 100,
    progressLabel: '3/3',
    lastStep: 'Synced 4 skills and mcp_servers.duet capabilities to #research',
    createdAtMs: SEED_BOOT_MS - 2_700_000,
    updatedAtMs: SEED_BOOT_MS - 1_920_000,
    updatedAt: '13:45',
    steps: [
      { text: 'Scan ~/.hermes/skills/ SKILL.md manifests', done: true },
      { text: 'Validate mcp_servers.duet JSON-RPC schemas', done: true },
      { text: 'Synced 4 skills and mcp_servers.duet capabilities to #research', done: true },
    ],
  },
  {
    id: 'task-103',
    channelId: 'ops',
    sessionId: 'duet-run-402',
    kind: 'Cron',
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
      { text: 'Attach PDF summary cards to mcp__duet__request_approval', done: false },
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
 * Pure parser and local executor for Hermes Agent + Hermes Duet slash commands.
 * Natural-language prompts (not starting with `/`) route to the active Hermes Agent lane.
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
          'Hermes Agent command reference ready. Start a new session, inspect skills, memory, cron routines, or approve Duet gates.',
        output: [
          'HERMES AGENT + DUET // COMMAND REFERENCE',
          '  /new [prompt]        Start a fresh isolated Hermes Agent session on Home',
          '  /brief               Display ranked post_brief decisions',
          '  /tasks               List isolated background runs (start_task / save_page)',
          '  /skills              List loaded ~/.hermes/skills/ & mcp__duet tools',
          '  /memory              Inspect persistent MEMORY.md agent context',
          '  /cron                List scheduled cronjob_manage & save_routine jobs',
          '  /sessions            Show active Hermes --resume session IDs per lane',
          '  /gateway | /doctor   Inspect hermes gateway (:8642) & MCP shim status',
          '  /switch <channel>    Switch lane (general|ops|launch|research|...)',
          '  /resume <session>    Resume lane by session ID (e.g. duet-ops)',
          '  /approve <id>        Approve a pending mcp__duet gate card',
          '  /reject <id>         Dismiss a pending gate card',
          '  /ui <spec|preset>    Dynamically customize theme, layout, character & backdrop',
          '  /customize           Open the interactive UI Studio drawer',
          '  /mood <state>        Shift portrait (neutral|happy|focused|alert|thinking)',
          '  /mute                Toggle Hermes voice audio output',
          '  /status              Report gateway mode, lane, and pending gates',
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
        output: ['HERMES DUET // POST_BRIEF QUEUE', ...lines].join('\n'),
      };
    }

    case '/tasks': {
      const lines = ctx.tasks.map(
        (t) =>
          `  [${t.id}] ${t.status.toUpperCase().padEnd(9)} ${String(t.progress).padStart(3)}% · #${t.channelId} (${t.sessionId ?? 'lane'}) · ${t.title}`
      );
      return {
        type: 'handled',
        mood: 'focused',
        spokenText: `Tracking ${ctx.tasks.length} background Hermes runs across your Duet lanes.`,
        output: ['HERMES RUNS // START_TASK & SAVE_PAGE', ...lines].join('\n'),
      };
    }

    case '/skills': {
      const lines = skills.map(
        (s) => `  ${s.enabled ? '[ON]' : '[--]'} ${s.name.padEnd(18)} ${s.source}\n       ${s.summary}`
      );
      return {
        type: 'handled',
        mood: 'focused',
        spokenText: `${skills.filter((s) => s.enabled).length} Hermes Agent skills active, including duet-bridge and morning-brief.`,
        output: [
          'HERMES AGENT // ~/.hermes/skills/ & mcp__duet__*',
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
          `  #${ch.id.padEnd(9)} session=${ch.sessionId.padEnd(14)} ${ch.id === ctx.activeChannel ? '[ACTIVE] ' : ''}${ch.description}`
      );
      return {
        type: 'handled',
        mood: 'neutral',
        spokenText: `Active Hermes session is duet-${ctx.activeChannel}.`,
        output: [
          `ACTIVE SESSION: hermes --resume duet-${ctx.activeChannel}`,
          ...lines,
        ].join('\n'),
      };
    }

    case '/gateway':
    case '/doctor': {
      const url = ctx.gatewayUrl || 'http://127.0.0.1:8642';
      const connected = Boolean(ctx.gatewayConnected);
      return {
        type: 'handled',
        mood: connected ? 'happy' : 'focused',
        spokenText: connected
          ? 'Hermes Gateway is connected and mcp__duet tools are online.'
          : 'Hermes Gateway at 127.0.0.1:8642 is in standalone Duet mode. Start hermes gateway with API_SERVER_ENABLED=true to bind.',
        output: [
          'HERMES DUET DOCTOR // GATEWAY & MCP CHECK',
          `  hermes-agent API Server : ${url} (${connected ? 'CONNECTED' : 'STANDALONE FALLBACK'})`,
          '  Runs Endpoint           : POST /v1/runs · GET /v1/runs/{id}/events',
          '  MCP Bridge (~/.hermes)  : mcp_servers.duet -> server/mcp-shim.ts (tools: {})',
          '  Active Session Lane     : duet-' + ctx.activeChannel,
        ].join('\n'),
      };
    }

    case '/switch':
    case '/resume': {
      const normalized = argStr.replace(/^#/, '').replace(/^(duet|hermes)-/, '').toLowerCase() as ChannelId;
      const validPool = ctx.availableChannels && ctx.availableChannels.length > 0
        ? ctx.availableChannels
        : VALID_CHANNELS;
      if (!validPool.includes(normalized)) {
        return {
          type: 'handled',
          mood: 'alert',
          spokenText: 'Unknown Hermes lane.',
          output: `Unknown lane "${argStr}". Valid lanes: ${validPool.join(', ')} (or session duet-<lane>).`,
        };
      }
      return {
        type: 'handled',
        mood: 'happy',
        switchChannel: normalized,
        spokenText: `Resumed Hermes lane duet-${normalized}.`,
        output: `Resumed Hermes session duet-${normalized} (#${normalized}).`,
      };
    }

    case '/approve': {
      const targetId = argStr || ctx.approvals.find((c) => c.status === 'pending')?.id || '';
      const card = ctx.approvals.find((c) => c.id === targetId);
      if (!card) {
        return {
          type: 'handled',
          mood: 'alert',
          spokenText: 'No matching mcp__duet approval card found.',
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
        spokenText: `Approved ${card.title}. Resuming Hermes run on ${card.destination}.`,
        output: `APPROVED [${card.id}] (${card.mcpTool ?? 'mcp__duet__request_approval'}): ${card.title} -> ${card.destination}`,
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
        spokenText: `Held ${card.title}. No outbound MCP action executed.`,
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
        spokenText: `Hermes lane duet-${ctx.activeChannel} active. ${pendingCount} MCP gates pending and ${runningCount} background runs active.`,
        output: [
          `SESSION LANE: duet-${ctx.activeChannel} (#${ctx.activeChannel})`,
          `GATEWAY: ${ctx.gatewayConnected ? 'HERMES API SERVER (:8642)' : 'STANDALONE DUET MODE'}`,
          `PENDING MCP GATES: ${pendingCount}`,
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
        output: `Unknown command "${cmd}". Type /help to list available Hermes Agent + Duet commands.`,
      };
    }
  }
}
