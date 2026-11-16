import "dotenv/config";
import express from "express";
import os from "node:os";
import path from "node:path";
import { createServer as createHttpServer } from "node:http";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_UI_CONFIG,
  applyUiPatch,
  parseNaturalUiIntent,
  sanitizeUiPatch,
  type UiCustomizationConfig,
  type UiCustomizationPatch,
} from "./src/utils/uiCustomization.ts";
import {
  applyStreamingDeltaToSteps,
  applyToolProgressToSteps,
  deriveTurnTaskTitle,
  finalizeTurnTaskSteps,
} from "./src/utils/taskInsights.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgFlag(name: string): string | undefined {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === `--${name}` && args[i + 1]) return args[i + 1];
    if (arg.startsWith(`--${name}=`)) return arg.slice(name.length + 3);
  }
  return undefined;
}

const PORT = Number(parseArgFlag("port") || process.env.PORT || 3000);
const HOST = parseArgFlag("host") || "0.0.0.0";

const HERMES_API_URL = (process.env.HERMES_API_URL || "http://127.0.0.1:8642").replace(/\/+$/, "");
const HERMES_API_KEY = process.env.HERMES_API_KEY || "";
const HERMES_PROFILE = process.env.HERMES_PROFILE || "default";
const HERMES_DEFAULT_MODEL = process.env.API_SERVER_MODEL_NAME || "hermes-agent";
const HERMES_CHAT_TIMEOUT_MS = Number(process.env.HERMES_CHAT_TIMEOUT_MS || 300_000);

// ---------------------------------------------------------------------------
// Native Hermes Agent session, thread, task, and local ~/.hermes discovery
// ---------------------------------------------------------------------------
interface HermesCard {
  type: "approval" | "brief";
  title?: string;
  body?: string;
  status: "pending" | "approved" | "declined";
  draft?: string;
  action?: string;
  destination?: string;
  entries?: { title?: string; summary?: string }[];
}

interface HermesItem {
  id: string;
  kind: "user" | "assistant" | "card" | "activity" | "system";
  created_at: number;
  updated_at?: number;
  channel_id?: string;
  text?: string;
  streaming?: boolean;
  run_id?: string | null;
  card?: HermesCard;
  ui_patch?: UiCustomizationPatch;
  activity?: {
    run_id: string;
    status: string;
    summary?: string;
    error?: string;
    steps?: { name: string; label?: string; status: string }[];
  };
}

interface HermesTask {
  id: string;
  title: string;
  status: string;
  kind?: string;
  background?: boolean;
  handover_id?: string;
  session_id?: string;
  progress?: string;
  steps?: { text: string; done?: boolean; active?: boolean }[];
  result?: string;
  channel_id?: string;
  agent_done_at?: number;
  confirmed_at?: number;
  created_at: number;
  updated_at?: number;
}

interface HermesChannel {
  id: string;
  name: string;
  session_id: string;
  topic?: string | null;
  persona?: string | null;
  archived?: boolean;
  last_at?: number | null;
}

type SessionRuntimeStatus = "idle" | "thinking" | "speaking" | "running";

const bootTime = Date.now();

const channels: HermesChannel[] = [
  {
    id: "general",
    name: "general",
    session_id: "hermes-general",
    topic: "Primary Hermes Agent voice thread, daily check-ins, and morning brief",
    persona: "Calm primary Hermes Agent coordinator styled after the main cyber-bob operator.",
  },
  {
    id: "ops",
    name: "ops",
    session_id: "hermes-ops",
    topic: "hermes gateway (:8642), cronjob_manage schedules, and infra operations",
    persona: "Steady ops & cron keeper monitoring gateway health and scheduled jobs.",
  },
  {
    id: "launch",
    name: "launch",
    session_id: "hermes-launch",
    topic: "~/.hermes/skills/ workflows, build artifacts, and QA checks",
    persona: "High-energy release and QA builder running fast iteration turns.",
  },
  {
    id: "research",
    name: "research",
    session_id: "hermes-research",
    topic: "Isolated background runs and persistent MEMORY.md synthesis",
    persona: "Quiet deep-research session focused on long-horizon synthesis.",
  },
  {
    id: "daemon",
    name: "daemon",
    session_id: "hermes-daemon",
    topic: "Background cron watcher & ambient signal daemon",
    persona: "Stealthy background daemon monitoring cron watchers and ambient events.",
  },
];

const pendingCards: HermesItem[] = [
  {
    id: "card-1",
    kind: "card",
    created_at: bootTime - 300_000,
    channel_id: "general",
    run_id: "run-hermes-781",
    card: {
      type: "approval",
      title: "Send Release Dispatch via Mail Tool",
      body: "Dispatches the v2.4 Hermes Agent changelog to 184 recipients.",
      status: "pending",
      destination: "mail://beta-cohort (184 recipients)",
      draft:
        "Hermes Agent v2.4 is live: direct Gateway (/v1/chat/completions) streaming, X-Hermes-Session-Key isolation, and live Braille voice sync are active.",
    },
  },
  {
    id: "brief-1",
    kind: "card",
    created_at: bootTime - 120_000,
    channel_id: "general",
    card: {
      type: "brief",
      title: "Morning Brief Decisions",
      status: "pending",
      entries: [
        {
          title: "Approve outbound release dispatch for beta cohort",
          summary: "Hermes Agent drafted the v2.4 release note for 184 subscribers in hermes-general.",
        },
      ],
    },
  },
];

const tasks: HermesTask[] = [
  {
    id: "task-101",
    title: "Rebuild standing morning-brief.html",
    status: "running",
    kind: "Background",
    background: true,
    session_id: "hermes-launch",
    progress: "4/6",
    channel_id: "launch",
    created_at: bootTime - 878_000,
    updated_at: bootTime - 18_000,
    steps: [
      { text: "Collect overnight thread summaries & tool outputs", done: true },
      { text: "Compile static morning-brief.html bundle", done: true },
      { text: "Verify desktop 1440×900 layout & contrast hierarchy", done: true },
      { text: "Capture mobile 390×844 snapshot & scroll bounds", done: true },
      { text: "Streaming tool progress across Playwright parity lane", done: false },
      { text: "Publish signed artifact to #launch brief archive", done: false },
    ],
  },
  {
    id: "task-102",
    title: "Index ~/.hermes/skills/ & toolsets",
    status: "done",
    kind: "Background",
    background: true,
    session_id: "hermes-research",
    progress: "3/3",
    channel_id: "research",
    agent_done_at: bootTime - 1_920_000,
    created_at: bootTime - 2_700_000,
    updated_at: bootTime - 1_920_000,
    steps: [
      { text: "Scan ~/.hermes/skills/ SKILL.md manifests", done: true },
      { text: "Validate active Hermes toolset schemas", done: true },
      { text: "Synced 4 skills and native Hermes toolsets to #research", done: true },
    ],
  },
  {
    id: "task-103",
    title: "Audit ~/Downloads watcher rule (cronjob_manage)",
    status: "waiting",
    kind: "Cron",
    background: true,
    session_id: "hermes-ops",
    progress: "2/5",
    channel_id: "ops",
    created_at: bootTime - 1_680_000,
    updated_at: bootTime - 420_000,
    steps: [
      { text: "Inspect active cronjob_manage watcher schedule (*/30 9-18 * * 1-5)", done: true },
      { text: "Scan ~/Downloads for matching invoice & receipt patterns", done: true },
      { text: "Waiting on confirmation to route invoice PDFs into #ops", done: false },
      { text: "Summarize matched PDF invoices into #ops thread", done: false },
      { text: "Persist watcher filter rules to MEMORY.md", done: false },
    ],
  },
];

const items: HermesItem[] = [
  {
    id: "init-welcome-general",
    kind: "assistant",
    created_at: bootTime - 60_000,
    channel_id: "general",
    text: "Session hermes-general online (Cyber Bob). Bound to X-Hermes-Session-Key: hermes-general — tap Voice or type /help.",
  },
  {
    id: "init-welcome-ops",
    kind: "assistant",
    created_at: bootTime - 58_000,
    channel_id: "ops",
    text: "Session hermes-ops online (Seraph). Monitoring :8642 gateway health and cronjob_manage schedules.",
  },
  {
    id: "init-welcome-launch",
    kind: "assistant",
    created_at: bootTime - 56_000,
    channel_id: "launch",
    text: "Session hermes-launch online (Twintails). Tracking ~/.hermes/skills/ workflows and QA checks.",
  },
  {
    id: "init-welcome-research",
    kind: "assistant",
    created_at: bootTime - 54_000,
    channel_id: "research",
    text: "Session hermes-research online (Yume). Isolated MEMORY.md synthesis and ~/.hermes/skills/ index ready.",
  },
  {
    id: "init-welcome-daemon",
    kind: "assistant",
    created_at: bootTime - 52_000,
    channel_id: "daemon",
    text: "Session hermes-daemon online (Neko). Silent watcher lane listening for cron triggers and ambient events.",
  },
];

const sessionStatusMap = new Map<string, SessionRuntimeStatus>();
const activeRunAborts = new Map<string, AbortController>();

function normalizeChannelKey(raw?: string | null): string {
  return String(raw ?? "")
    .replace(/^(chan|hermes|duet)-/i, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ensureChannel(opts: {
  channelId: string;
  name?: string;
  sessionId?: string;
  topic?: string;
  persona?: string;
}): HermesChannel {
  const cleanId = normalizeChannelKey(opts.channelId) || "session";
  let existing = channels.find((c) => c.id === cleanId);
  if (!existing) {
    existing = {
      id: cleanId,
      name: (opts.name || cleanId).replace(/^#/, ""),
      session_id: opts.sessionId?.trim() || `hermes-${cleanId}`,
      topic: opts.topic?.trim() || `Isolated hermes-agent session #${cleanId}`,
      persona:
        opts.persona?.trim() ||
        "Focused hermes-agent session running an independent X-Hermes-Session-Key context.",
      last_at: Date.now(),
    };
    channels.push(existing);
  } else {
    if (opts.name) existing.name = opts.name.replace(/^#/, "");
    if (opts.sessionId?.trim()) existing.session_id = opts.sessionId.trim();
    if (opts.topic?.trim()) existing.topic = opts.topic.trim();
    if (opts.persona?.trim()) existing.persona = opts.persona.trim();
  }
  return existing;
}

function buildSessionSnapshot(ch: HermesChannel) {
  const chItems = items.filter((it) => (it.channel_id || "general") === ch.id);
  const turnCount = chItems.filter((it) => it.kind === "user").length;
  const lastMsg = [...chItems]
    .reverse()
    .find((it) => (it.kind === "assistant" || it.kind === "user") && it.text?.trim());
  const latestTimestamp = chItems.reduce(
    (acc, it) => Math.max(acc, it.created_at),
    ch.last_at ?? bootTime
  );
  const hasRunningTask = tasks.some(
    (t) => (t.channel_id || "general") === ch.id && t.status === "running"
  );
  const explicitStatus = sessionStatusMap.get(ch.id);
  const status = explicitStatus ?? (hasRunningTask ? "running" : "idle");

  return {
    sessionId: ch.session_id,
    channelId: ch.id,
    name: ch.name,
    persona: ch.persona || "Hermes Agent session",
    topic: ch.topic || `Hermes session #${ch.name}`,
    status,
    turnCount,
    lastMessage: lastMsg?.text?.trim() || ch.topic || "",
    updatedAtMs: latestTimestamp,
  };
}

function buildAllSessionSnapshots() {
  return channels.filter((c) => !c.archived).map(buildSessionSnapshot);
}

const sseClients = new Set<express.Response>();

function broadcastEvent(event: Record<string, unknown>) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

// ---------------------------------------------------------------------------
// Safe read-only local ~/.hermes inspection (optional when running on host)
// ---------------------------------------------------------------------------
function resolveHermesHome(): string {
  return process.env.HERMES_HOME || path.join(os.homedir(), ".hermes");
}

function readLocalHermesContext() {
  const hermesHome = resolveHermesHome();
  const hermesHomeFound = existsSync(hermesHome);

  const discoveredSkills: Array<{ name: string; source: string; summary: string; enabled: boolean }> = [];
  try {
    const skillsDir = path.join(hermesHome, "skills");
    if (existsSync(skillsDir)) {
      const entries = readdirSync(skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillMd = path.join(skillsDir, entry.name, "SKILL.md");
        let summary = `Loaded Hermes skill from ~/.hermes/skills/${entry.name}/SKILL.md`;
        if (existsSync(skillMd)) {
          try {
            const raw = readFileSync(skillMd, "utf8").slice(0, 1000);
            const descMatch = raw.match(/description:\s*([^\n]+)/i);
            if (descMatch?.[1]) {
              summary = descMatch[1].replace(/^["'>|\s]+|["'\s]+$/g, "").slice(0, 160);
            }
          } catch {
            // ignore unreadable skill manifest
          }
        }
        discoveredSkills.push({
          name: entry.name,
          source: `~/.hermes/skills/${entry.name}/SKILL.md`,
          summary,
          enabled: true,
        });
      }
    }
  } catch {
    // ignore host fs error
  }

  const discoveredMemory: Array<{ key: string; scope: "host" | "session" | "preference"; value: string }> = [
    {
      key: "gateway.endpoint",
      scope: "host",
      value: `${HERMES_API_URL} (OpenAI /v1/chat/completions + /v1/responses + /v1/models)`,
    },
    {
      key: "session.scoping",
      scope: "session",
      value: "X-Hermes-Session-Key binds each lane/shape to an isolated Hermes memory scope",
    },
  ];
  try {
    const memoryMd = path.join(hermesHome, "MEMORY.md");
    if (existsSync(memoryMd)) {
      const raw = readFileSync(memoryMd, "utf8").trim();
      if (raw) {
        const lines = raw
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("#"))
          .slice(0, 4);
        lines.forEach((line, i) => {
          discoveredMemory.push({
            key: `memory.md[${i + 1}]`,
            scope: "host",
            value: line.slice(0, 180),
          });
        });
      }
    }
  } catch {
    // ignore
  }

  const discoveredCron: Array<{
    id: string;
    schedule: string;
    channelId: string;
    mode: "agent" | "no-agent";
    summary: string;
  }> = [];
  try {
    const cronFile = path.join(hermesHome, "cron", "jobs.json");
    if (existsSync(cronFile)) {
      const parsed = JSON.parse(readFileSync(cronFile, "utf8")) as Array<{
        id?: string;
        name?: string;
        schedule?: string;
        cron?: string;
        prompt?: string;
        command?: string;
        channel?: string;
      }>;
      if (Array.isArray(parsed)) {
        for (const job of parsed.slice(0, 12)) {
          discoveredCron.push({
            id: job.id || job.name || `cron-${discoveredCron.length + 1}`,
            schedule: job.schedule || job.cron || "* * * * *",
            channelId: normalizeChannelKey(job.channel) || "ops",
            mode: job.command && !job.prompt ? "no-agent" : "agent",
            summary: (job.prompt || job.command || job.name || "Scheduled Hermes job").slice(0, 140),
          });
        }
      }
    }
  } catch {
    // ignore
  }

  return {
    hermesHomeFound,
    skills:
      discoveredSkills.length > 0
        ? discoveredSkills
        : [
            {
              name: "hermes-memory",
              source: "~/.hermes/skills/hermes-memory/SKILL.md",
              summary: "Persists cross-session facts, project conventions, and user preferences to MEMORY.md",
              enabled: true,
            },
            {
              name: "morning-brief",
              source: "~/.hermes/skills/morning-brief/SKILL.md",
              summary: "Summarizes overnight cron runs and ranks top open agent decisions",
              enabled: true,
            },
            {
              name: "playwright-parity",
              source: "~/.hermes/skills/playwright-parity/SKILL.md",
              summary: "Headless browser verification & responsive layout checks via terminal tools",
              enabled: true,
            },
            {
              name: "cron-orchestrator",
              source: "~/.hermes/skills/cron-orchestrator/SKILL.md",
              summary: "Schedules isolated agent & no-agent jobs with cronjob_manage",
              enabled: true,
            },
          ],
    memory: discoveredMemory,
    cronJobs:
      discoveredCron.length > 0
        ? discoveredCron
        : [
            {
              id: "cron-standing-pages",
              schedule: "30 7 * * *",
              channelId: "launch",
              mode: "agent" as const,
              summary: "Rebuild standing brief artifacts 30m prior to morning brief",
            },
            {
              id: "cron-morning-brief",
              schedule: "0 8 * * *",
              channelId: "general",
              mode: "agent" as const,
              summary: "Compile morning brief across #general, #ops, and #launch sessions",
            },
            {
              id: "cron-downloads-watch",
              schedule: "*/30 9-18 * * 1-5",
              channelId: "ops",
              mode: "no-agent" as const,
              summary: "Watch ~/Downloads and enqueue invoice PDFs for #ops triage",
            },
          ],
  };
}

// ---------------------------------------------------------------------------
// Direct Hermes Agent Gateway client (OpenAI-compatible + hermes.tool.progress)
// ---------------------------------------------------------------------------
async function fetchHermesGateway(
  pathname: string,
  init?: RequestInit,
  timeoutMs = 2000,
  externalSignal?: AbortSignal
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (HERMES_API_KEY) {
    headers.Authorization = `Bearer ${HERMES_API_KEY}`;
  }
  try {
    return await fetch(`${HERMES_API_URL}${pathname}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

async function probeHermesGateway() {
  const ctx = readLocalHermesContext();
  let connected = false;
  let models: string[] = [];
  let skillsCount = ctx.skills.length;
  let toolsets = ["terminal", "file_ops", "web_search", "memory", "skills", "cronjob_manage"];
  let errorMsg: string | undefined;

  // 1. Standard NousResearch/hermes-agent API Server endpoint: GET /v1/models
  try {
    const modelsRes = await fetchHermesGateway("/v1/models", { method: "GET" }, 1500);
    if (modelsRes.ok) {
      connected = true;
      const body = (await modelsRes.json().catch(() => null)) as {
        data?: Array<{ id?: string }>;
        models?: Array<{ id?: string } | string>;
      } | null;
      if (Array.isArray(body?.data)) {
        models = body.data.map((m) => m.id).filter((id): id is string => Boolean(id));
      } else if (Array.isArray(body?.models)) {
        models = body.models
          .map((m) => (typeof m === "string" ? m : m.id))
          .filter((id): id is string => Boolean(id));
      }
    } else if (modelsRes.status === 401 || modelsRes.status === 403) {
      errorMsg = `Gateway responded HTTP ${modelsRes.status} (check HERMES_API_KEY)`;
    }
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err);
  }

  // 2. Fallback health check (/v1/health or /health) if /v1/models failed
  if (!connected) {
    for (const healthPath of ["/v1/health", "/health"]) {
      try {
        const hRes = await fetchHermesGateway(healthPath, { method: "GET" }, 1200);
        if (hRes.ok) {
          connected = true;
          errorMsg = undefined;
          break;
        }
      } catch {
        // try next
      }
    }
  }

  // 3. Optional capability endpoints (/v1/skills, /v1/toolsets) when connected
  if (connected) {
    try {
      const [skillsRes, toolsRes] = await Promise.all([
        fetchHermesGateway("/v1/skills", { method: "GET" }, 1000).catch(() => null),
        fetchHermesGateway("/v1/toolsets", { method: "GET" }, 1000).catch(() => null),
      ]);
      if (skillsRes?.ok) {
        const sj = (await skillsRes.json().catch(() => null)) as {
          data?: unknown[];
          skills?: unknown[];
        } | null;
        const list = sj?.skills ?? sj?.data;
        if (Array.isArray(list) && list.length > 0) skillsCount = list.length;
      }
      if (toolsRes?.ok) {
        const tj = (await toolsRes.json().catch(() => null)) as {
          data?: string[];
          toolsets?: string[];
        } | null;
        const tlist = tj?.toolsets ?? tj?.data;
        if (Array.isArray(tlist) && tlist.length > 0) toolsets = tlist.slice(0, 10);
      }
    } catch {
      // Optional capability endpoints absent on some builds
    }
  }

  const activeModel = process.env.API_SERVER_MODEL_NAME || models[0] || HERMES_DEFAULT_MODEL;
  if (models.length === 0) models = [activeModel];

  return {
    connected,
    mode: connected ? ("hermes-gateway" as const) : ("local-standby" as const),
    gatewayUrl: HERMES_API_URL,
    profile: HERMES_PROFILE,
    activeModel,
    models,
    sessionHeader: "X-Hermes-Session-Key",
    skillsCount,
    toolsets,
    hermesHomeFound: ctx.hermesHomeFound,
    ...(errorMsg && !connected ? { error: errorMsg } : {}),
  };
}

interface StreamTurnHandlers {
  onDelta?: (accumulatedText: string) => void;
  onToolProgress?: (eventPayload: {
    toolName: string;
    label: string;
    status: string;
    summary: string;
  }) => void;
  abortSignal?: AbortSignal;
}

async function callHermesGatewayTurn(
  params: {
    message: string;
    channelId: string;
    sessionId: string;
    persona?: string;
    history?: Array<{ role?: string; text?: string }>;
    uiConfig?: Partial<UiCustomizationConfig>;
  },
  handlers: StreamTurnHandlers = {}
): Promise<{
  reply: string;
  mood: "happy" | "focused" | "alert" | "neutral";
  uiPatch?: UiCustomizationPatch;
  sourceMode: "hermes-gateway" | "local-ui-patch" | "gateway-offline";
  sessionId: string;
  error?: string;
}> {
  const { message, channelId, sessionId, persona, history = [], uiConfig } = params;

  const currentUi: UiCustomizationConfig = applyUiPatch(
    DEFAULT_UI_CONFIG,
    sanitizeUiPatch(uiConfig ?? {})
  ).next;
  const heuristicPatch = parseNaturalUiIntent(message, currentUi);
  const resolvedPersona =
    typeof persona === "string" && persona.trim()
      ? persona.trim()
      : "Isolated Hermes Agent session running independent conversation context.";

  const gwMessages = [
    {
      role: "system",
      content: `You are Hermes Agent (session ${sessionId}, lane #${channelId}). Persona: ${resolvedPersona}. Respond concisely in 1-3 clear spoken sentences unless the user requests detailed output.`,
    },
    ...history.slice(-6).map((h) => ({
      role: h.role === "user" ? "user" : "assistant",
      content: h.text ?? "",
    })),
    { role: "user", content: message },
  ];

  let gatewayFailure = "Gateway unreachable";
  try {
    const gwRes = await fetchHermesGateway(
      "/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "X-Hermes-Session-Key": sessionId,
          Accept: "text/event-stream, application/json",
        },
        body: JSON.stringify({
          model: HERMES_DEFAULT_MODEL,
          messages: gwMessages,
          user: sessionId,
          stream: Boolean(handlers.onDelta),
        }),
      },
      HERMES_CHAT_TIMEOUT_MS,
      handlers.abortSignal
    );

    if (!gwRes.ok) {
      gatewayFailure = `gateway HTTP ${gwRes.status}`;
    } else {
      const contentType = gwRes.headers.get("content-type") || "";
      if (contentType.includes("text/event-stream") && gwRes.body) {
        // Stream OpenAI chat.completion.chunk + Hermes `event: hermes.tool.progress` frames
        const reader = gwRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let currentEvent = "message";
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let newlineIdx: number;
          while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
            const rawLine = buffer.slice(0, newlineIdx);
            buffer = buffer.slice(newlineIdx + 1);
            const line = rawLine.replace(/\r$/, "");

            if (line === "") {
              currentEvent = "message";
              continue;
            }
            if (line.startsWith(":")) {
              // Keepalive comment (`: keepalive`) — ignore per SSE spec
              continue;
            }
            if (line.startsWith("event:")) {
              currentEvent = line.slice("event:".length).trim();
              continue;
            }
            if (!line.startsWith("data:")) continue;

            const dataStr = line.slice("data:".length).trim();
            if (dataStr === "[DONE]") continue;

            try {
              const payload = JSON.parse(dataStr) as Record<string, unknown>;
              if (currentEvent === "hermes.tool.progress") {
                const toolName = String(
                  payload.tool || payload.name || payload.tool_name || "tool"
                );
                const status = String(payload.status || "running");
                const detail = String(
                  payload.summary || payload.label || payload.message || payload.args || ""
                ).trim();
                handlers.onToolProgress?.({
                  toolName,
                  label: detail ? `${toolName}: ${detail}` : toolName,
                  status,
                  summary: detail ? `${toolName}: ${detail}` : `Running ${toolName}`,
                });
                continue;
              }

              const choices = payload.choices as
                | Array<{ delta?: { content?: string }; message?: { content?: string } }>
                | undefined;
              const delta = choices?.[0]?.delta?.content ?? choices?.[0]?.message?.content;
              if (typeof delta === "string" && delta.length > 0) {
                accumulated += delta;
                handlers.onDelta?.(accumulated);
              }
            } catch {
              // ignore partial/non-JSON frame
            }
          }
        }

        const finalText = accumulated.trim();
        if (finalText) {
          return {
            reply: finalText,
            mood: "happy",
            uiPatch: heuristicPatch ? sanitizeUiPatch(heuristicPatch) : undefined,
            sourceMode: "hermes-gateway",
            sessionId,
          };
        }
        gatewayFailure = "stream completed with empty content";
      } else {
        const data = (await gwRes.json().catch(() => null)) as {
          choices?: Array<{ message?: { content?: string } }>;
        } | null;
        const content = data?.choices?.[0]?.message?.content?.trim();
        if (content) {
          return {
            reply: content,
            mood: "happy",
            uiPatch: heuristicPatch ? sanitizeUiPatch(heuristicPatch) : undefined,
            sourceMode: "hermes-gateway",
            sessionId,
          };
        }
        gatewayFailure = "gateway response contained no content";
      }
    }
  } catch (err) {
    if (handlers.abortSignal?.aborted) {
      throw err;
    }
    gatewayFailure = err instanceof Error ? err.message : String(err);
  }

  // If the user issued a natural-language UI customization, apply it locally cleanly!
  if (heuristicPatch) {
    const applied = applyUiPatch(currentUi, heuristicPatch);
    return {
      reply: `Updated workspace UI: ${applied.summary}.`,
      mood: "happy",
      uiPatch: sanitizeUiPatch(heuristicPatch),
      sourceMode: "local-ui-patch",
      sessionId,
    };
  }

  return {
    reply: `Hermes Gateway at ${HERMES_API_URL} is in local standby (${gatewayFailure}). Run "hermes gateway" with API_SERVER_ENABLED=true in ~/.hermes/.env to route live turns, or use /help, /skills, /memory, /cron, and /ui locally.`,
    mood: "focused",
    sourceMode: "gateway-offline",
    sessionId,
    error: gatewayFailure,
  };
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => {
    const hasDeepgramKey = Boolean(process.env.DEEPGRAM_API_KEY);
    res.json({
      ok: true,
      hasDeepgramKey,
      hermesApiUrl: HERMES_API_URL,
      hermesProfile: HERMES_PROFILE,
      ttsProvider: hasDeepgramKey ? "deepgram" : "browser",
    });
  });

  app.get("/api/hermes/gateway", async (_req, res) => {
    const status = await probeHermesGateway();
    res.json(status);
  });

  app.get("/api/hermes/context", (_req, res) => {
    res.json(readLocalHermesContext());
  });

  app.get("/api/hermes/state", (_req, res) => {
    res.status(200).json({
      items,
      pending: pendingCards,
      tasks,
      channels,
      sessions: buildAllSessionSnapshots(),
    });
  });

  app.get("/api/hermes/channels/:channelId/items", (req, res) => {
    const slug = normalizeChannelKey(req.params.channelId) || "general";
    const chItems = items
      .filter((it) => (it.channel_id || "general") === slug)
      .sort((a, b) => a.created_at - b.created_at);
    res.status(200).json({ items: chItems, has_more: false });
  });

  app.post("/api/hermes/channels/:channelId/seen", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.post("/api/hermes/messages", async (req, res) => {
    const {
      text,
      channel_id = "general",
      name,
      topic,
      session_id,
      persona,
      ui_config,
    } = (req.body ?? {}) as {
      text?: string;
      channel_id?: string;
      name?: string;
      topic?: string;
      session_id?: string;
      persona?: string;
      ui_config?: Partial<UiCustomizationConfig>;
    };
    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "text is required" });
      return;
    }

    const channel = ensureChannel({
      channelId: channel_id,
      name,
      sessionId: session_id,
      topic,
      persona,
    });
    channel.last_at = Date.now();

    const userItem: HermesItem = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind: "user",
      created_at: Date.now(),
      channel_id: channel.id,
      text,
    };
    items.push(userItem);
    sessionStatusMap.set(channel.id, "thinking");

    // Abort any prior in-flight run on this lane and settle any active turn task
    activeRunAborts.get(channel.id)?.abort();
    for (const prevTask of tasks) {
      if (
        prevTask.channel_id === channel.id &&
        prevTask.id.startsWith("task-turn-") &&
        (prevTask.status === "running" || prevTask.status === "queued")
      ) {
        const finalizedPrev = finalizeTurnTaskSteps(
          prevTask.steps ?? [],
          "cancelled",
          "Superseded by newer turn"
        );
        prevTask.steps = finalizedPrev.steps;
        prevTask.progress = finalizedPrev.progress;
        prevTask.status = "cancelled";
        prevTask.updated_at = Date.now();
        broadcastEvent({ type: "task", task: prevTask });
      }
    }

    const runController = new AbortController();
    activeRunAborts.set(channel.id, runController);

    const runId = `run-${Date.now().toString(36)}`;
    const turnStartMs = Date.now();
    const turnTask: HermesTask = {
      id: `task-turn-${runId}`,
      title: deriveTurnTaskTitle(text, `#${channel.name}`),
      status: "running",
      kind: "In chat",
      background: false,
      session_id: channel.session_id,
      channel_id: channel.id,
      progress: "0/1",
      steps: [{ text: `Working in ${channel.session_id}`, done: false, active: true }],
      created_at: turnStartMs,
      updated_at: turnStartMs,
    };
    tasks.push(turnTask);
    if (tasks.length > 200) {
      const evictIdx = tasks.findIndex(
        (t) => t.id.startsWith("task-turn-") && t.status !== "running" && t.status !== "queued"
      );
      if (evictIdx >= 0) tasks.splice(evictIdx, 1);
    }

    broadcastEvent({ type: "item", item: userItem });
    broadcastEvent({ type: "task", task: turnTask });
    broadcastEvent({ type: "session", session: buildSessionSnapshot(channel) });
    res.status(200).json({
      item: userItem,
      session: buildSessionSnapshot(channel),
      task: turnTask,
    });

    const assistantId = `hermes-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    let streamedPlaceholderCreated = false;
    let toolSeq = 0;

    void (async () => {
      try {
        const history = items
          .filter(
            (it) =>
              (it.kind === "user" || it.kind === "assistant") &&
              (it.channel_id || "general") === channel.id &&
              it.id !== userItem.id
          )
          .slice(-6)
          .map((it) => ({
            role: it.kind === "user" ? "user" : "hermes",
            text: it.text ?? "",
          }));

        const replyData = await callHermesGatewayTurn(
          {
            message: text,
            channelId: channel.id,
            sessionId: channel.session_id,
            persona: channel.persona ?? undefined,
            history,
            uiConfig: ui_config,
          },
          {
            abortSignal: runController.signal,
            onToolProgress: ({ toolName, label, status, summary }) => {
              const normalizedStatus = (status || "running").toLowerCase();
              const isGenericRunning = /^running\s+/i.test(summary.trim());
              const toolKey = toolName.trim().toLowerCase();

              // Settle an existing open placeholder activity entry for the same run + tool instead of creating duplicate lines
              const existingIdx = items.findIndex(
                (it) =>
                  it.kind === "activity" &&
                  it.run_id === runId &&
                  it.activity?.steps?.[0]?.name?.toLowerCase() === toolKey &&
                  (it.activity?.steps?.[0]?.status === "running" || /^running\s+/i.test((it.text ?? "").trim()))
              );

              if (existingIdx >= 0 && (!isGenericRunning || normalizedStatus !== "running")) {
                const existing = items[existingIdx];
                existing.text = summary;
                existing.updated_at = Date.now();
                existing.activity = {
                  run_id: runId,
                  status,
                  summary,
                  steps: [{ name: toolName, label, status }],
                };
                broadcastEvent({ type: "item", item: existing });
              } else {
                toolSeq += 1;
                const activityItem: HermesItem = {
                  id: `act-${runId}-${toolSeq}`,
                  kind: "activity",
                  created_at: Date.now(),
                  channel_id: channel.id,
                  run_id: runId,
                  text: summary,
                  activity: {
                    run_id: runId,
                    status,
                    summary,
                    steps: [{ name: toolName, label, status }],
                  },
                };
                items.push(activityItem);
                broadcastEvent({ type: "item", item: activityItem });
              }

              const updatedSteps = applyToolProgressToSteps(turnTask.steps ?? [], {
                toolName,
                label,
                status,
                summary,
              });
              turnTask.steps = updatedSteps.steps;
              turnTask.progress = updatedSteps.progress;
              turnTask.updated_at = Date.now();
              if (sessionStatusMap.get(channel.id) !== "running") {
                sessionStatusMap.set(channel.id, "running");
                broadcastEvent({ type: "session", session: buildSessionSnapshot(channel) });
              }
              broadcastEvent({ type: "task", task: turnTask });
            },
            onDelta: (accumulated) => {
              const streamed = applyStreamingDeltaToSteps(turnTask.steps ?? []);
              if (streamed.changed) {
                turnTask.steps = streamed.steps;
                turnTask.progress = streamed.progress;
                turnTask.updated_at = Date.now();
                broadcastEvent({ type: "task", task: turnTask });
              }
              if (!streamedPlaceholderCreated) {
                streamedPlaceholderCreated = true;
                const placeholder: HermesItem = {
                  id: assistantId,
                  kind: "assistant",
                  created_at: Date.now(),
                  channel_id: channel.id,
                  streaming: true,
                  run_id: runId,
                  text: accumulated,
                };
                items.push(placeholder);
                sessionStatusMap.set(channel.id, "speaking");
                broadcastEvent({ type: "item", item: placeholder });
                broadcastEvent({ type: "session", session: buildSessionSnapshot(channel) });
              } else {
                const existing = items.find((it) => it.id === assistantId);
                if (existing) existing.text = accumulated;
                broadcastEvent({ type: "delta", item_id: assistantId, text: accumulated });
              }
            },
          }
        );

        if (runController.signal.aborted) return;

        const existingPlaceholder = items.find((it) => it.id === assistantId);
        const finalAssistant: HermesItem = existingPlaceholder ?? {
          id: assistantId,
          kind: "assistant",
          created_at: Date.now(),
          channel_id: channel.id,
          run_id: runId,
        };
        finalAssistant.streaming = false;
        finalAssistant.ui_patch = replyData.uiPatch;
        finalAssistant.text = replyData.reply;
        finalAssistant.updated_at = Date.now();
        if (!existingPlaceholder) {
          items.push(finalAssistant);
        }

        const settledAt = Date.now();
        const finalStepLabel =
          replyData.sourceMode === "local-ui-patch"
            ? "Updated workspace UI"
            : replyData.sourceMode === "gateway-offline"
            ? "Gateway standby response"
            : "Completed response";
        const finalized = finalizeTurnTaskSteps(turnTask.steps ?? [], "done", finalStepLabel);
        turnTask.steps = finalized.steps;
        turnTask.progress = finalized.progress;
        turnTask.status = "done";
        turnTask.result = replyData.reply.slice(0, 200);
        turnTask.agent_done_at = settledAt;
        turnTask.updated_at = settledAt;

        sessionStatusMap.set(channel.id, "idle");
        if (replyData.uiPatch) {
          broadcastEvent({
            type: "ui_patch",
            channelId: channel.id,
            patch: replyData.uiPatch,
          });
        }
        broadcastEvent({ type: "task", task: turnTask });
        broadcastEvent({ type: "item", item: finalAssistant });
        broadcastEvent({ type: "session", session: buildSessionSnapshot(channel) });
      } catch (err) {
        sessionStatusMap.set(channel.id, "idle");
        if (runController.signal.aborted) {
          const stoppedAt = Date.now();
          if (turnTask.status === "running" || turnTask.status === "queued") {
            const finalized = finalizeTurnTaskSteps(
              turnTask.steps ?? [],
              "cancelled",
              "Stopped by operator"
            );
            turnTask.steps = finalized.steps;
            turnTask.progress = finalized.progress;
            turnTask.status = "cancelled";
            turnTask.updated_at = stoppedAt;
            broadcastEvent({ type: "task", task: turnTask });
          }

          const existing = items.find((it) => it.id === assistantId);
          if (existing) {
            existing.streaming = false;
            existing.text = existing.text ? `${existing.text} [stopped]` : "Turn stopped.";
            broadcastEvent({ type: "item", item: existing });
          } else {
            const stoppedItem: HermesItem = {
              id: assistantId,
              kind: "activity",
              created_at: Date.now(),
              channel_id: channel.id,
              run_id: runId,
              text: "Turn stopped by operator",
              activity: { run_id: runId, status: "stopped", summary: "Turn stopped by operator" },
            };
            items.push(stoppedItem);
            broadcastEvent({ type: "item", item: stoppedItem });
          }
        } else {
          const errAt = Date.now();
          const errText = err instanceof Error ? err.message : "Run error";
          const finalized = finalizeTurnTaskSteps(
            turnTask.steps ?? [],
            "failed",
            errText.slice(0, 120)
          );
          turnTask.steps = finalized.steps;
          turnTask.progress = finalized.progress;
          turnTask.status = "failed";
          turnTask.updated_at = errAt;
          broadcastEvent({ type: "task", task: turnTask });

          const errItem: HermesItem = {
            id: assistantId,
            kind: "activity",
            created_at: Date.now(),
            channel_id: channel.id,
            run_id: runId,
            text: errText,
            activity: { run_id: runId, status: "error", error: String(err) },
          };
          items.push(errItem);
          broadcastEvent({ type: "item", item: errItem });
        }
        broadcastEvent({ type: "session", session: buildSessionSnapshot(channel) });
      } finally {
        if (activeRunAborts.get(channel.id) === runController) {
          activeRunAborts.delete(channel.id);
        }
      }
    })();
  });

  app.post("/api/hermes/chat", async (req, res) => {
    const {
      message,
      channelId = "general",
      sessionId,
      persona,
      history = [],
      uiConfig,
    } = req.body ?? {};
    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "Message is required." });
      return;
    }

    const resolvedSessionId =
      typeof sessionId === "string" && sessionId ? sessionId : `hermes-${channelId || "general"}`;
    const result = await callHermesGatewayTurn({
      message,
      channelId,
      sessionId: resolvedSessionId,
      persona,
      history,
      uiConfig,
    });
    res.status(200).json(result);
  });

  app.post("/api/hermes/sessions/:channelId/abort", (req, res) => {
    const slug = normalizeChannelKey(req.params.channelId) || "general";
    const controller = activeRunAborts.get(slug);
    if (controller) {
      controller.abort();
      activeRunAborts.delete(slug);
    }
    sessionStatusMap.set(slug, "idle");
    for (const task of tasks) {
      if (
        task.channel_id === slug &&
        task.id.startsWith("task-turn-") &&
        (task.status === "running" || task.status === "queued")
      ) {
        const finalized = finalizeTurnTaskSteps(
          task.steps ?? [],
          "cancelled",
          "Stopped by operator"
        );
        task.steps = finalized.steps;
        task.progress = finalized.progress;
        task.status = "cancelled";
        task.updated_at = Date.now();
        broadcastEvent({ type: "task", task });
      }
    }
    const ch = channels.find((c) => c.id === slug);
    if (ch) {
      broadcastEvent({ type: "session", session: buildSessionSnapshot(ch) });
    }
    res.status(200).json({ ok: true, aborted: Boolean(controller), channelId: slug });
  });

  app.get("/api/hermes/sessions", (_req, res) => {
    res.status(200).json({ sessions: buildAllSessionSnapshots() });
  });

  app.post("/api/hermes/sessions", (req, res) => {
    const { channelId, name, sessionId, topic, persona, skipWelcome, requireFresh } =
      (req.body ?? {}) as {
        channelId?: string;
        name?: string;
        sessionId?: string;
        topic?: string;
        persona?: string;
        skipWelcome?: boolean;
        requireFresh?: boolean;
      };
    const rawKey = channelId || name;
    if (!rawKey || typeof rawKey !== "string") {
      res.status(400).json({ error: "channelId or name is required." });
      return;
    }

    const baseKey = normalizeChannelKey(rawKey) || "session";
    const resolvedKey = requireFresh
      ? (() => {
          const taken = new Set(channels.map((c) => c.id));
          if (!taken.has(baseKey)) return baseKey;
          let n = 2;
          while (taken.has(`${baseKey}-${n}`)) n++;
          return `${baseKey}-${n}`;
        })()
      : baseKey;

    const hadChannel = channels.some((c) => c.id === resolvedKey);
    const channel = ensureChannel({
      channelId: resolvedKey,
      name: name || resolvedKey,
      sessionId,
      topic,
      persona,
    });

    let welcomeItem: HermesItem | null = null;
    const hasItems = items.some((it) => (it.channel_id || "general") === channel.id);
    if (!hasItems && !skipWelcome) {
      welcomeItem = {
        id: `init-welcome-${channel.id}-${Date.now()}`,
        kind: "assistant",
        created_at: Date.now(),
        channel_id: channel.id,
        text: `Isolated session ${channel.session_id} ready (#${channel.name}). ${channel.topic}`,
      };
      items.push(welcomeItem);
    }

    const snapshot = buildSessionSnapshot(channel);
    if (!hadChannel) {
      broadcastEvent({ type: "channel", channel });
    }
    if (welcomeItem) {
      broadcastEvent({ type: "item", item: welcomeItem });
    }
    broadcastEvent({ type: "session", session: snapshot });
    res.status(200).json({
      resolvedChannelId: channel.id,
      session: snapshot,
      channel,
      item: welcomeItem,
    });
  });

  app.post("/api/hermes/sessions/:channelId/reset", (req, res) => {
    const slug = normalizeChannelKey(req.params.channelId) || "general";
    activeRunAborts.get(slug)?.abort();
    const ch = ensureChannel({ channelId: slug });
    for (let i = items.length - 1; i >= 0; i--) {
      if ((items[i].channel_id || "general") === ch.id) {
        items.splice(i, 1);
      }
    }
    for (let i = tasks.length - 1; i >= 0; i--) {
      if ((tasks[i].channel_id || "general") === ch.id && tasks[i].id.startsWith("task-turn-")) {
        tasks.splice(i, 1);
      }
    }
    sessionStatusMap.set(ch.id, "idle");
    const resetItem: HermesItem = {
      id: `reset-${ch.id}-${Date.now()}`,
      kind: "assistant",
      created_at: Date.now(),
      channel_id: ch.id,
      text: `Fresh context opened for ${ch.session_id} (#${ch.name}). Prior messages in this session were cleared.`,
    };
    items.push(resetItem);
    const snapshot = buildSessionSnapshot(ch);
    broadcastEvent({
      type: "session_reset",
      channelId: ch.id,
      session: snapshot,
      item: resetItem,
    });
    res.status(200).json({ ok: true, session: snapshot, item: resetItem });
  });

  app.delete("/api/hermes/sessions/:channelId", (req, res) => {
    const channelId = normalizeChannelKey(req.params.channelId);
    if (channelId === "general") {
      res.status(400).json({ error: "Cannot delete primary general session." });
      return;
    }
    activeRunAborts.get(channelId)?.abort();
    const idx = channels.findIndex((c) => c.id === channelId);
    if (idx >= 0) channels.splice(idx, 1);
    for (let i = items.length - 1; i >= 0; i--) {
      if ((items[i].channel_id || "general") === channelId) {
        items.splice(i, 1);
      }
    }
    for (let i = tasks.length - 1; i >= 0; i--) {
      if ((tasks[i].channel_id || "general") === channelId) {
        tasks.splice(i, 1);
      }
    }
    sessionStatusMap.delete(channelId);
    broadcastEvent({ type: "session_deleted", channelId });
    res.status(200).json({ ok: true, channelId });
  });

  app.post("/api/hermes/cards/:cardId/act", (req, res) => {
    const { action, value } = (req.body ?? {}) as { action?: string; value?: string };
    const item = pendingCards.find((p) => p.id === req.params.cardId);
    if (!item || !item.card) {
      res.status(404).json({ error: "card not found" });
      return;
    }
    item.card.status = action === "approve" ? "approved" : "declined";
    if (typeof value === "string") item.card.draft = value;
    item.updated_at = Date.now();
    broadcastEvent({ type: "item", item });
    res.status(200).json({ ok: true, item });
  });

  app.post("/api/hermes/tasks/:taskId/confirm", (req, res) => {
    const task = tasks.find((t) => t.id === req.params.taskId);
    if (!task) {
      res.status(404).json({ error: "task not found" });
      return;
    }
    const now = Date.now();
    task.status = "done";
    task.agent_done_at = task.agent_done_at ?? now;
    task.confirmed_at = now;
    task.updated_at = now;
    broadcastEvent({ type: "task", task });
    res.status(200).json({ ok: true, task });
  });

  app.post("/api/hermes/tasks/:taskId/reopen", (req, res) => {
    const task = tasks.find((t) => t.id === req.params.taskId);
    if (!task) {
      res.status(404).json({ error: "task not found" });
      return;
    }
    delete task.confirmed_at;
    task.status = task.agent_done_at ? "done" : "waiting";
    task.updated_at = Date.now();
    broadcastEvent({ type: "task", task });
    res.status(200).json({ ok: true, task });
  });

  app.post("/api/hermes/tasks/:taskId/cancel", (req, res) => {
    const task = tasks.find((t) => t.id === req.params.taskId);
    if (!task) {
      res.status(404).json({ error: "task not found" });
      return;
    }
    const chSlug = normalizeChannelKey(task.channel_id || "general") || "general";
    if (task.id.startsWith("task-turn-")) {
      const controller = activeRunAborts.get(chSlug);
      if (controller) {
        controller.abort();
        activeRunAborts.delete(chSlug);
      }
      sessionStatusMap.set(chSlug, "idle");
      const finalized = finalizeTurnTaskSteps(
        task.steps ?? [],
        "cancelled",
        "Stopped by operator"
      );
      task.steps = finalized.steps;
      task.progress = finalized.progress;
      const ch = channels.find((c) => c.id === chSlug);
      if (ch) {
        broadcastEvent({ type: "session", session: buildSessionSnapshot(ch) });
      }
    }
    task.status = "cancelled";
    task.updated_at = Date.now();
    broadcastEvent({ type: "task", task });
    res.status(200).json({ ok: true, task });
  });

  app.post("/api/hermes/tasks/clear", (req, res) => {
    const { channelId } = (req.body ?? {}) as { channelId?: string };
    const chSlug = channelId ? normalizeChannelKey(channelId) : "";
    let removed = 0;
    for (let i = tasks.length - 1; i >= 0; i--) {
      const t = tasks[i];
      if (chSlug && (t.channel_id || "general") !== chSlug) continue;
      if (t.confirmed_at || t.status === "cancelled") {
        tasks.splice(i, 1);
        removed += 1;
      }
    }
    res.status(200).json({ ok: true, removed });
  });

  app.post("/api/hermes/tasks/:taskId/message", (req, res) => {
    const { text } = (req.body ?? {}) as { text?: string };
    if (!text || typeof text !== "string" || !text.trim()) {
      res.status(400).json({ error: "text is required" });
      return;
    }
    const task = tasks.find((t) => t.id === req.params.taskId);
    if (!task) {
      res.status(404).json({ error: "task not found" });
      return;
    }
    if (task.status !== "running" && task.status !== "queued" && task.status !== "waiting") {
      res.status(409).json({ error: "task is not active" });
      return;
    }
    const clean = text.trim();
    task.steps = [...(task.steps ?? []), { text: `Steer: ${clean}`, done: false }];
    const doneCount = task.steps.filter((s) => s.done).length;
    task.progress = `${doneCount}/${task.steps.length}`;
    task.updated_at = Date.now();
    broadcastEvent({ type: "task", task });
    res.status(200).json({ ok: true, task });
  });

  app.get("/api/hermes/events", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(": hermes-agent-connected\n\n");
    sseClients.add(res);
    const keepalive = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch {
        clearInterval(keepalive);
        sseClients.delete(res);
      }
    }, 25000);
    req.on("close", () => {
      clearInterval(keepalive);
      sseClients.delete(res);
    });
  });

  app.post("/api/hermes/tts", async (req, res) => {
    try {
      const { text, mood = "neutral" } = req.body ?? {};
      if (!text || typeof text !== "string") {
        res.status(400).json({ error: "Text is required for speech synthesis." });
        return;
      }

      const cleanText = text.replace(/[\r\n]+/g, " ").trim().slice(0, 1200);
      if (!cleanText) {
        res.status(200).json({ audioBase64: null, fallback: "speechSynthesis", provider: "browser" });
        return;
      }

      const deepgramKey = process.env.DEEPGRAM_API_KEY;
      if (deepgramKey && deepgramKey !== "MY_DEEPGRAM_API_KEY") {
        const voiceByMood: Record<string, string> = {
          happy: "aura-2-thalia-en",
          focused: "aura-2-andromeda-en",
          thinking: "aura-2-helena-en",
          alert: "aura-2-stella-en",
          neutral: "aura-2-thalia-en",
          speaking: "aura-2-thalia-en",
          listening: "aura-2-thalia-en",
        };
        const model = voiceByMood[String(mood)] || "aura-2-thalia-en";

        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 7000);
          const dgRes = await fetch(
            `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}&encoding=linear16&container=wav&sample_rate=24000`,
            {
              method: "POST",
              headers: {
                Authorization: `Token ${deepgramKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ text: cleanText }),
              signal: controller.signal,
            }
          );
          clearTimeout(timer);

          if (dgRes.ok) {
            const wavBuf = Buffer.from(await dgRes.arrayBuffer());
            if (wavBuf.length > 44) {
              res.json({
                audioBase64: wavBuf.toString("base64"),
                mimeType: "audio/wav",
                provider: "deepgram",
                model,
              });
              return;
            }
          }
        } catch {
          // Fall through to browser fallback cleanly
        }
      }

      res.status(200).json({
        audioBase64: null,
        fallback: "speechSynthesis",
        provider: "browser",
      });
    } catch {
      res.status(200).json({
        audioBase64: null,
        fallback: "speechSynthesis",
        provider: "browser",
      });
    }
  });

  const httpServer = createHttpServer(app);

  let vite: { close: () => Promise<void>; middlewares: express.RequestHandler } | null = null;
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const hmrConfig = process.env.DISABLE_HMR === "true" ? false : { server: httpServer };
    vite = await createViteServer({
      server: { middlewareMode: true, hmr: hmrConfig },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  httpServer.listen(PORT, HOST, () => {
    console.log(`Hermes Agent server running on http://${HOST}:${PORT}`);
  });

  const shutdown = () => {
    httpServer.close(() => {
      void vite?.close().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

createServer().catch((err) => {
  console.error("Server failed to start:", err);
  process.exit(1);
});
