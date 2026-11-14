import "dotenv/config";
import express from "express";
import path from "node:path";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import {
  DEFAULT_UI_CONFIG,
  applyUiPatch,
  parseNaturalUiIntent,
  sanitizeUiPatch,
  type UiCustomizationConfig,
  type UiCustomizationPatch,
} from "./src/utils/uiCustomization.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in the server environment.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

const HERMES_API_URL = (process.env.HERMES_API_URL || "http://127.0.0.1:8642").replace(/\/+$/, "");
const HERMES_API_KEY = process.env.HERMES_API_KEY || "";
const HERMES_PROFILE = process.env.HERMES_PROFILE || "default";

// ---------------------------------------------------------------------------
// Hermes Duet adapter: this UI stays, but all state/runs/approvals come from
// the real Hermes Duet server. We pair as a device (same flow as the Duet web
// client): internal pair-code -> /api/pair -> duet_device cookie, stored locally.
const DUET_BASE_URL = (process.env.DUET_BASE_URL || "http://127.0.0.1:7456").replace(/\/+$/, "");
const DUET_INTERNAL_URL = (process.env.DUET_INTERNAL_URL || "http://127.0.0.1:7457").replace(/\/+$/, "");
const DUET_DEVICE_NAME = process.env.DUET_DEVICE_NAME || "hermes-agentis";
const DUET_DEVICE_FILE = path.join(__dirname, ".duet-device");
const DUET_INTERNAL_TOKEN =
  process.env.DUET_INTERNAL_TOKEN ||
  (() => {
    const candidates = [
      process.env.DUET_TOKEN_FILE,
      path.join(__dirname, "..", "hermes-duet", "data", "internal.token"),
    ].filter(Boolean) as string[];
    for (const file of candidates) {
      try {
        const t = readFileSync(file, "utf8").trim();
        if (t) return t;
      } catch {
        // try next candidate
      }
    }
    return "";
  })();

let duetDeviceToken: string | null = null;

async function loadDuetDeviceToken(): Promise<string | null> {
  if (duetDeviceToken) return duetDeviceToken;
  try {
    duetDeviceToken = readFileSync(DUET_DEVICE_FILE, "utf8").trim() || null;
  } catch {
    duetDeviceToken = null;
  }
  return duetDeviceToken;
}

async function pairWithDuet(): Promise<string | null> {
  if (!DUET_INTERNAL_TOKEN) return null;
  try {
    const pairRes = await fetch(`${DUET_INTERNAL_URL}/internal/pair`, {
      method: "POST",
      headers: { Authorization: `Bearer ${DUET_INTERNAL_TOKEN}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!pairRes.ok) return null;
    const pairData = (await pairRes.json()) as { code?: string };
    if (!pairData.code) return null;

    const redeemRes = await fetch(`${DUET_BASE_URL}/api/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: pairData.code, device_name: DUET_DEVICE_NAME }),
      signal: AbortSignal.timeout(5000),
    });
    if (!redeemRes.ok) return null;
    const setCookie = redeemRes.headers.get("set-cookie") || "";
    const cookiePair = setCookie.split(";")[0];
    if (!cookiePair.startsWith("duet_device=")) return null;
    duetDeviceToken = cookiePair.slice("duet_device=".length);
    try {
      writeFileSync(DUET_DEVICE_FILE, duetDeviceToken, { encoding: "utf8", mode: 0o600 });
    } catch {
      // non-fatal: next start re-pairs
    }
    console.log(`[duet] paired as device "${DUET_DEVICE_NAME}"`);
    return duetDeviceToken;
  } catch {
    return null;
  }
}

/** Authenticated call into the Duet server; re-pairs once on 401. */
async function duetFetch(pathname: string, init: RequestInit = {}, retried = false): Promise<Response> {
  let token = await loadDuetDeviceToken();
  if (!token) {
    token = await pairWithDuet();
    if (!token) throw new Error("duet-not-paired");
  }
  const res = await fetch(`${DUET_BASE_URL}${pathname}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(2500),
    headers: { ...(init.headers as Record<string, string> | undefined), cookie: `duet_device=${token}` },
  });
  if (res.status === 401 && !retried) {
    duetDeviceToken = null;
    try {
      rmSync(DUET_DEVICE_FILE);
    } catch {
      // ignore
    }
    return duetFetch(pathname, init, true);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Channel identity bridge: the canvas dots and standalone lanes key channels by
// slug ("ops"), while the real Duet server uses "chan-<slug>" ids. Resolve the
// slug before proxying, and create the real lane on first use so every canvas
// shape behaves as a genuine isolated hermes-agent lane (persona becomes the
// channel's standing instructions).
const duetChannelCache = new Map<string, string>(); // slug -> real channel id
let duetChannelCacheAt = 0;

async function refreshDuetChannelCache(): Promise<boolean> {
  if (duetChannelCache.size > 0 && Date.now() - duetChannelCacheAt < 15_000) return true;
  try {
    const r = await duetFetch("/api/state");
    if (!r.ok) return false;
    const snap = (await r.json().catch(() => null)) as {
      channels?: Array<{ id: string; slug?: string; name?: string }>;
    } | null;
    if (!snap?.channels) return false;
    duetChannelCache.clear();
    for (const ch of snap.channels) {
      const slug = String(ch.slug || ch.name || ch.id).replace(/^chan-/, "").toLowerCase();
      duetChannelCache.set(slug, ch.id);
    }
    duetChannelCacheAt = Date.now();
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a local (slug) channel id to the real Duet channel id, creating the
 * upstream lane when it does not exist yet (persona/topic pulled from the
 * standalone registry). Returns the real id, or null when Duet is unreachable.
 */
async function ensureDuetChannel(
  localId: string,
  meta?: { name?: string; topic?: string; persona?: string }
): Promise<string | null> {
  const slug = String(localId ?? "").replace(/^chan-/, "").toLowerCase() || "general";
  try {
    await refreshDuetChannelCache();
    const hit = duetChannelCache.get(slug);
    if (hit) return hit;
    const standalone = standaloneChannels.find((c) => c.id === slug);
    const name = meta?.name || standalone?.name || slug;
    const topic = meta?.topic ?? standalone?.topic;
    const persona = meta?.persona ?? standalone?.persona;
    const createRes = await duetFetch("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        ...(topic ? { topic } : {}),
        ...(persona ? { instructions: persona } : {}),
      }),
    });
    if (createRes.ok) {
      const created = (await createRes.json().catch(() => null)) as {
        channel?: { id?: string };
      } | null;
      if (created?.channel?.id) {
        duetChannelCache.set(slug, created.channel.id);
        duetChannelCacheAt = Date.now();
        return created.channel.id;
      }
    } else {
      // Creation refused (duplicate name, "already a general channel"): the lane
      // exists upstream; refresh the cache and match once more before giving up.
      duetChannelCacheAt = 0;
      if (await refreshDuetChannelCache()) {
        return duetChannelCache.get(slug) ?? null;
      }
    }
  } catch {
    // Duet unreachable: caller falls back to standalone handling.
  }
  return null;
}

// ---------------------------------------------------------------------------
// Standalone in-memory Duet fallback when no external hermes-duet daemon is
// reachable (e.g. AI Studio container). Keeps real Duet protocol shapes intact.
interface StandaloneDuetCard {
  type: "approval" | "payment" | "brief";
  title?: string;
  body?: string;
  status: "pending" | "approved" | "declined";
  draft?: string;
  action?: string;
  destination?: string;
  entries?: { title?: string; summary?: string }[];
}

interface StandaloneDuetItem {
  id: string;
  kind: "user" | "assistant" | "card" | "activity" | "system";
  created_at: number;
  updated_at?: number;
  channel_id?: string;
  text?: string;
  streaming?: boolean;
  run_id?: string | null;
  card?: StandaloneDuetCard;
  ui_patch?: UiCustomizationPatch;
}

interface StandaloneDuetTask {
  id: string;
  title: string;
  status: string;
  progress?: string;
  steps?: { text: string; done?: boolean }[];
  result?: string;
  channel_id?: string;
  created_at: number;
}

interface StandaloneDuetChannel {
  id: string;
  name: string;
  session_id: string;
  topic?: string | null;
  persona?: string | null;
  archived?: boolean;
  last_at?: number | null;
}

type StandaloneSessionStatus = "idle" | "thinking" | "running";

const standaloneBootTime = Date.now();

const standaloneChannels: StandaloneDuetChannel[] = [
  {
    id: "general",
    name: "general",
    session_id: "hermes-general",
    topic: "Primary Hermes Agent voice thread, daily check-ins, and morning brief",
    persona: "Calm primary Hermes coordinator styled after the main cyber-bob operator.",
  },
  {
    id: "ops",
    name: "ops",
    session_id: "hermes-ops",
    topic: "hermes gateway (:8642), cronjob_manage schedules, and payment gates",
    persona: "Steady ops & morning-brief keeper guarding cron schedules.",
  },
  {
    id: "launch",
    name: "launch",
    session_id: "hermes-launch",
    topic: "~/.hermes/skills/ workflows, save_page rebuilds, and QA checks",
    persona: "High-energy release and save_page builder running fast launch turns.",
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

const standalonePending: StandaloneDuetItem[] = [
  {
    id: "card-1",
    kind: "card",
    created_at: standaloneBootTime - 300_000,
    channel_id: "general",
    run_id: "run-duet-781",
    card: {
      type: "approval",
      title: "Send Release Dispatch via Mail MCP",
      body: "Dispatches the v2.4 Hermes Agent voice link & Duet MCP changelog to 184 recipients.",
      status: "pending",
      destination: "mail://beta-cohort (184 recipients)",
      draft: "Hermes Duet v2.4 is live: direct Hermes Gateway (/v1/runs) voice link, mcp__duet approval gating, and live Braille decoding are now active.",
    },
  },
  {
    id: "card-2",
    kind: "card",
    created_at: standaloneBootTime - 180_000,
    channel_id: "ops",
    run_id: "run-duet-784",
    card: {
      type: "payment",
      action: "pay",
      title: "Authorize Inference Burst Virtual Cap",
      body: "Itemized receipt: $45.00 overflow ceiling (under $500.00 DUET_MAX_TRANSACTION_LIMIT).",
      status: "pending",
      destination: "nous://inference-gateway (Single-use cap)",
      draft: "Authorize $45.00 single-use virtual card for local Hermes inference overflow.",
    },
  },
  {
    id: "brief-1",
    kind: "card",
    created_at: standaloneBootTime - 120_000,
    channel_id: "general",
    card: {
      type: "brief",
      title: "Morning Brief Decisions",
      status: "pending",
      entries: [
        {
          title: "Approve Mail MCP release dispatch via mcp__duet__request_approval",
          summary: "Hermes Agent prepared the v2.4 Duet release note for 184 subscribers in lane duet-general.",
        },
      ],
    },
  },
];

const standaloneTasks: StandaloneDuetTask[] = [
  {
    id: "task-101",
    title: "Rebuild standing morning-brief.html (save_page)",
    status: "running",
    progress: "72",
    channel_id: "launch",
    created_at: standaloneBootTime - 240_000,
    steps: [{ text: "Streaming update_task delta across Playwright parity lane", done: false }],
  },
  {
    id: "task-102",
    title: "Index ~/.hermes/skills/ & MCP connectors",
    status: "done",
    progress: "100",
    channel_id: "research",
    created_at: standaloneBootTime - 600_000,
    steps: [{ text: "Synced 4 skills and mcp_servers.duet capabilities to #research", done: true }],
  },
  {
    id: "task-103",
    title: "Audit ~/Downloads watcher rule (cronjob_manage)",
    status: "waiting",
    progress: "40",
    channel_id: "ops",
    created_at: standaloneBootTime - 420_000,
    steps: [{ text: "Waiting on confirmation to route invoice PDFs into #ops", done: false }],
  },
];

const standaloneItems: StandaloneDuetItem[] = [
  {
    id: "init-welcome-general",
    kind: "assistant",
    created_at: standaloneBootTime - 60_000,
    channel_id: "general",
    text: "Session hermes-general online (Cyber Bob). Two mcp__duet approval gates are waiting—tap Voice or type /help.",
  },
  {
    id: "init-welcome-ops",
    kind: "assistant",
    created_at: standaloneBootTime - 58_000,
    channel_id: "ops",
    text: "Session hermes-ops online (Seraph). Monitoring :8642 gateway, cronjob_manage schedules, and $45.00 cap approval.",
  },
  {
    id: "init-welcome-launch",
    kind: "assistant",
    created_at: standaloneBootTime - 56_000,
    channel_id: "launch",
    text: "Session hermes-launch online (Twintails). Tracking save_page rebuilds and QA parity checks cleanly.",
  },
  {
    id: "init-welcome-research",
    kind: "assistant",
    created_at: standaloneBootTime - 54_000,
    channel_id: "research",
    text: "Session hermes-research online (Yume). Isolated MEMORY.md synthesis and ~/.hermes/skills/ index ready.",
  },
  {
    id: "init-welcome-daemon",
    kind: "assistant",
    created_at: standaloneBootTime - 52_000,
    channel_id: "daemon",
    text: "Session hermes-daemon online (Neko). Silent watcher lane listening for cron triggers and ambient events.",
  },
];

const standaloneSessionStatus = new Map<string, StandaloneSessionStatus>();

function ensureStandaloneChannel(opts: {
  channelId: string;
  name?: string;
  sessionId?: string;
  topic?: string;
  persona?: string;
}): StandaloneDuetChannel {
  const cleanId =
    opts.channelId
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "") || "session";
  let existing = standaloneChannels.find((c) => c.id === cleanId);
  if (!existing) {
    existing = {
      id: cleanId,
      name: (opts.name || cleanId).replace(/^#/, ""),
      session_id: opts.sessionId?.trim() || `hermes-${cleanId}`,
      topic: opts.topic?.trim() || `Isolated hermes-agent session #${cleanId}`,
      persona: opts.persona?.trim() || "Focused hermes-agent sub-session running an independent context.",
      last_at: Date.now(),
    };
    standaloneChannels.push(existing);
  } else {
    if (opts.name) existing.name = opts.name.replace(/^#/, "");
    if (opts.sessionId?.trim()) existing.session_id = opts.sessionId.trim();
    if (opts.topic?.trim()) existing.topic = opts.topic.trim();
    if (opts.persona?.trim()) existing.persona = opts.persona.trim();
  }
  return existing;
}

function buildSessionSnapshot(ch: StandaloneDuetChannel) {
  const chItems = standaloneItems.filter((it) => (it.channel_id || "general") === ch.id);
  const turnCount = chItems.filter((it) => it.kind === "user").length;
  const lastAssistant = [...chItems]
    .reverse()
    .find((it) => (it.kind === "assistant" || it.kind === "user") && it.text?.trim());
  const latestTimestamp = chItems.reduce((acc, it) => Math.max(acc, it.created_at), ch.last_at ?? standaloneBootTime);
  const hasRunningTask = standaloneTasks.some(
    (t) => (t.channel_id || "general") === ch.id && t.status === "running"
  );
  const explicitStatus = standaloneSessionStatus.get(ch.id);
  const status = explicitStatus ?? (hasRunningTask ? "running" : "idle");

  return {
    sessionId: ch.session_id,
    channelId: ch.id,
    name: ch.name,
    persona: ch.persona || "Hermes Agent standalone session",
    topic: ch.topic || `Hermes session #${ch.name}`,
    status,
    turnCount,
    lastMessage: lastAssistant?.text?.trim() || ch.topic || "",
    updatedAtMs: latestTimestamp,
  };
}

function buildAllSessionSnapshots() {
  return standaloneChannels.filter((c) => !c.archived).map(buildSessionSnapshot);
}

const sseClients = new Set<express.Response>();

function broadcastStandaloneEvent(event: Record<string, unknown>) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}


async function fetchHermesGateway(pathname: string, init?: RequestInit, timeoutMs = 1500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
  }
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => {
    const hasDeepgramKey = Boolean(process.env.DEEPGRAM_API_KEY);
    const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);
    res.json({
      ok: true,
      hasGeminiKey,
      hasDeepgramKey,
      hermesApiUrl: HERMES_API_URL,
      hermesProfile: HERMES_PROFILE,
      ttsProvider: hasDeepgramKey ? "deepgram" : hasGeminiKey ? "gemini" : "browser",
    });
  });

  app.get("/api/hermes/gateway", async (_req, res) => {
    try {
      const healthRes = await fetchHermesGateway("/v1/health", { method: "GET" }, 1200);
      if (!healthRes.ok) {
        throw new Error(`Gateway status ${healthRes.status}`);
      }
      let skillsCount = 4;
      let toolsets: string[] = ["duet", "skills", "memory", "cronjob_manage"];
      try {
        const [skillsRes, toolsRes] = await Promise.all([
          fetchHermesGateway("/v1/skills", { method: "GET" }, 1200),
          fetchHermesGateway("/v1/toolsets", { method: "GET" }, 1200),
        ]);
        if (skillsRes.ok) {
          const sj = (await skillsRes.json()) as { data?: unknown[]; skills?: unknown[] };
          const list = sj.skills ?? sj.data;
          if (Array.isArray(list)) skillsCount = list.length;
        }
        if (toolsRes.ok) {
          const tj = (await toolsRes.json()) as { data?: string[]; toolsets?: string[] };
          const tlist = tj.toolsets ?? tj.data;
          if (Array.isArray(tlist) && tlist.length > 0) toolsets = tlist.slice(0, 8);
        }
      } catch {
        // Optional capabilities endpoints unavailable
      }
      res.json({
        connected: true,
        mode: "hermes-gateway",
        gatewayUrl: HERMES_API_URL,
        profile: HERMES_PROFILE,
        mcpBridge: "mcp__duet__*",
        skillsCount,
        toolsets,
      });
    } catch {
      res.json({
        connected: false,
        mode: "standalone-duet",
        gatewayUrl: HERMES_API_URL,
        profile: HERMES_PROFILE,
        mcpBridge: "mcp__duet__*",
        skillsCount: 4,
        toolsets: ["mcp__duet__*", "skills_list", "memory", "cronjob_manage"],
      });
    }
  });

  app.post("/api/hermes/runs/approve", async (req, res) => {
    const { runId, decision = "approve", draft } = req.body ?? {};
    let forwardedToGateway = false;
    if (runId && typeof runId === "string" && HERMES_API_KEY) {
      try {
        const gwRes = await fetchHermesGateway(
          `/v1/runs/${encodeURIComponent(runId)}/approval`,
          {
            method: "POST",
            body: JSON.stringify({ decision, draft }),
          },
          2000
        );
        forwardedToGateway = gwRes.ok;
      } catch {
        forwardedToGateway = false;
      }
    }
    res.json({ ok: true, forwardedToGateway, runId: runId ?? null, decision });
  });

  async function generateHermesReply(params: {
    message: string;
    channelId?: string;
    sessionId?: string;
    persona?: string;
    history?: Array<{ role?: string; text?: string }>;
    pendingApprovals?: Array<{ id?: string; title?: string }>;
    tasks?: Array<{ status?: string }>;
    uiConfig?: Partial<UiCustomizationConfig>;
  }) {
    const {
      message,
      channelId = "general",
      sessionId,
      persona,
      history = [],
      pendingApprovals = [],
      tasks = [],
      uiConfig,
    } = params;

    const currentUi: UiCustomizationConfig = applyUiPatch(
      DEFAULT_UI_CONFIG,
      sanitizeUiPatch(uiConfig ?? {})
    ).next;
    const heuristicPatch = parseNaturalUiIntent(message, currentUi);

    const resolvedSessionId =
      typeof sessionId === "string" && sessionId ? sessionId : `hermes-${channelId || "general"}`;
    const resolvedPersona =
      typeof persona === "string" && persona.trim()
        ? persona.trim()
        : "Isolated Hermes Agent session running independent conversation context.";

    try {
      // 1. Prefer live local/Tailscale Hermes Agent Gateway (/v1/chat/completions) when reachable
      if (process.env.HERMES_API_URL || process.env.HERMES_API_KEY) {
        try {
          const gwMessages = [
            {
              role: "system",
              content: `You are Hermes Agent inside Hermes Duet (isolated session ${resolvedSessionId}, lane #${channelId || "general"}). Persona: ${resolvedPersona}. Respond in 1-3 crisp spoken sentences.`,
            },
            ...(Array.isArray(history)
              ? history.slice(-6).map((h) => ({
                  role: h.role === "user" ? "user" : "assistant",
                  content: h.text ?? "",
                }))
              : []),
            { role: "user", content: message },
          ];
          const gwRes = await fetchHermesGateway(
            "/v1/chat/completions",
            {
              method: "POST",
              body: JSON.stringify({
                model: process.env.API_SERVER_MODEL_NAME || "hermes-agent",
                messages: gwMessages,
                user: resolvedSessionId,
              }),
            },
            3000
          );
          if (gwRes.ok) {
            const data = (await gwRes.json()) as {
              choices?: Array<{ message?: { content?: string } }>;
            };
            const content = data.choices?.[0]?.message?.content?.trim();
            if (content) {
              return {
                reply: content,
                mood: "happy",
                suggestedCommand: "",
                uiPatch: heuristicPatch ?? undefined,
                sourceMode: "hermes-gateway",
                sessionId: resolvedSessionId,
              };
            }
          }
        } catch {
          // Fall through cleanly to standalone Hermes Duet Gemini bridge
        }
      }

      if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not configured.");
      }

      const ai = getGeminiClient();

      const systemInstruction = [
        "You are Hermes Agent (NousResearch/hermes-agent) speaking through an isolated Hermes Duet session (DevvGwardo/hermes-duet).",
        "Each Braille shape on the canvas hosts its own separate hermes-agent session and isolated thread history.",
        `Assigned session persona: ${resolvedPersona}`,
        "Speak concisely (1-3 crisp sentences, <= 55 words) because every reply is spoken aloud via TTS with live facial lip-sync and Braille text decoding.",
        "DYNAMIC UI CONTROL: You have complete live control over every element of this web UI via the `uiPatch` object!",
        "Whenever the user asks to customize, restyle, theme, recolor, resize, move, hide, show, blur, slow/speed up, rename, switch views, or transform the interface (even creatively like 'retro submarine terminal', 'minimal zen focus', or 'pink neon cyberpunk'), return a cohesive `uiPatch` setting all matching properties:",
        "- `presetId`: optional base (`emerald-terminal`, `cyber-violet`, `solaris-amber`, `glacier-cyan`, `sakura-rose`, `zen-mono`)",
        "- Palette/glass: `accentPreset`, `accentHex`, `surfaceHex`, `panelAlpha` (0.32..0.95), `borderOpacity` (0.08..0.9), `glowIntensity` (0..2), `backgroundPresetId` (`aurora-drift` | `mesh-gradient` | `braille-rain` | `scanline-shimmer` | `nebula` | `constellation-drift` | `horizon-tide`), `backgroundOpacity` (0.15..0.85), `glassBlurPx` (0..28)",
        "- Layout/typography: `sidebarVisible`, `sidebarPosition` (`left`|`right`), `sidebarWidthPx` (236..420), `sidebarQueueVisible`, `sidebarChannelsVisible`, `showTopNav`, `composerStyle` (`docked`|`floating`|`minimal`), `cornerRadius` (`sharp`|`rounded`|`pill`), `density` (`compact`|`comfortable`|`airy`), `fontPreset` (`jakarta`|`mono`|`display`|`system`), `fontScale` (0.85..1.25), `workspaceTitle`",
        "- Character/stage/navigation: `portraitVisible`, `portraitScale` (0.6..1.45), `portraitTintHex` (`#RRGGBB` or `auto`), `horizonVisible`, `horizonOpacity` (0..1), `statusReadoutVisible`, `animationSpeed` (0.3..1.8), `reducedMotion`, `activeView` (`home`|`canvas`|`voice`|`queue`|`cli`), `showThinking`, `voiceMuted`, `openCustomizer`, `canvasAutoArrange`, `canvasMoodAll`, `resetAll`.",
        "Only populate `uiPatch` when the user asks to modify or navigate UI/visual/layout/stage settings; omit `uiPatch` for ordinary Q&A.",
        `Current UI state snapshot: ${JSON.stringify(currentUi)}`,
        `Isolated session: ${resolvedSessionId} (lane #${channelId || "general"}).`,
        `Pending mcp__duet gates: ${JSON.stringify(pendingApprovals)}.`,
        `Active background runs: ${JSON.stringify(tasks)}.`,
      ].join("\n");

      const transcriptContext = Array.isArray(history)
        ? history
            .slice(-6)
            .map((h) => `${h.role === "user" ? "User" : "Hermes"}: ${h.text ?? ""}`)
            .join("\n")
        : "";

      const prompt = transcriptContext
        ? `Recent thread:\n${transcriptContext}\n\nUser: ${message}`
        : message;

      const response = await Promise.race([
        ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents: prompt,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                reply: {
                  type: Type.STRING,
                  description: "Concise spoken response from Hermes Agent (1-3 sentences).",
                },
                mood: {
                  type: Type.STRING,
                  description: "Facial expression mood: neutral, happy, focused, alert, or thinking.",
                },
                suggestedCommand: {
                  type: Type.STRING,
                  description: "Optional Hermes Duet command like /brief, /skills, /gateway, /ui, or /approve card-1.",
                },
                uiPatch: {
                  type: Type.OBJECT,
                  description: "Optional UI customization patch to dynamically update theme, layout, character, horizon, typography, or background.",
                  properties: {
                    presetId: { type: Type.STRING },
                    accentPreset: { type: Type.STRING },
                    accentHex: { type: Type.STRING },
                    surfaceHex: { type: Type.STRING },
                    panelAlpha: { type: Type.NUMBER },
                    borderOpacity: { type: Type.NUMBER },
                    glowIntensity: { type: Type.NUMBER },
                    cornerRadius: { type: Type.STRING },
                    density: { type: Type.STRING },
                    fontPreset: { type: Type.STRING },
                    fontScale: { type: Type.NUMBER },
                    sidebarVisible: { type: Type.BOOLEAN },
                    sidebarPosition: { type: Type.STRING },
                    sidebarWidthPx: { type: Type.NUMBER },
                    sidebarQueueVisible: { type: Type.BOOLEAN },
                    sidebarChannelsVisible: { type: Type.BOOLEAN },
                    showTopNav: { type: Type.BOOLEAN },
                    composerStyle: { type: Type.STRING },
                    workspaceTitle: { type: Type.STRING },
                    portraitVisible: { type: Type.BOOLEAN },
                    portraitScale: { type: Type.NUMBER },
                    portraitTintHex: { type: Type.STRING },
                    horizonVisible: { type: Type.BOOLEAN },
                    horizonOpacity: { type: Type.NUMBER },
                    statusReadoutVisible: { type: Type.BOOLEAN },
                    animationSpeed: { type: Type.NUMBER },
                    reducedMotion: { type: Type.BOOLEAN },
                    backgroundPresetId: { type: Type.STRING },
                    backgroundOpacity: { type: Type.NUMBER },
                    glassBlurPx: { type: Type.NUMBER },
                    activeView: { type: Type.STRING },
                    showThinking: { type: Type.BOOLEAN },
                    voiceMuted: { type: Type.BOOLEAN },
                    openCustomizer: { type: Type.BOOLEAN },
                    canvasAutoArrange: { type: Type.BOOLEAN },
                    canvasMoodAll: { type: Type.STRING },
                    resetAll: { type: Type.BOOLEAN },
                  },
                },
              },
              required: ["reply", "mood"],
            },
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Hermes chat request timed out")), 6500)
        ),
      ]);

      const raw = (response.text ?? "{}").trim();
      let parsed: {
        reply?: string;
        mood?: string;
        suggestedCommand?: string;
        uiPatch?: UiCustomizationPatch;
      };
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = { reply: raw || "Signal received.", mood: "neutral" };
      }

      const allowedMoods = new Set(["neutral", "happy", "focused", "alert", "thinking", "speaking"]);
      const mood = allowedMoods.has(String(parsed.mood)) ? String(parsed.mood) : "speaking";

      const rawGeminiPatch = sanitizeUiPatch(parsed.uiPatch);
      const mergedPatchRaw: UiCustomizationPatch = {
        ...(heuristicPatch ?? {}),
        ...rawGeminiPatch,
      };
      const cleanUiPatch =
        Object.keys(mergedPatchRaw).length > 0 ? sanitizeUiPatch(mergedPatchRaw) : undefined;

      return {
        reply: parsed.reply || "Signal received and logged to your Hermes lane.",
        mood,
        suggestedCommand: parsed.suggestedCommand || "",
        uiPatch: cleanUiPatch && Object.keys(cleanUiPatch).length > 0 ? cleanUiPatch : undefined,
        sourceMode: "gemini-bridge",
        sessionId: resolvedSessionId,
      };
    } catch {
      if (heuristicPatch) {
        const applied = applyUiPatch(currentUi, heuristicPatch);
        return {
          reply: `Done — ${applied.summary.toLowerCase()}. Tell me if you want to tweak anything else or reset.`,
          mood: applied.sanitized.mood || "happy",
          suggestedCommand: "",
          uiPatch: applied.sanitized,
          sourceMode: "local-duet-ui",
          sessionId: resolvedSessionId,
          fallback: true,
        };
      }

      const lower = String(message).toLowerCase();
      const pendingList = Array.isArray(pendingApprovals) ? pendingApprovals : [];
      const taskList = Array.isArray(tasks) ? tasks : [];
      let reply = `Session ${resolvedSessionId} active in #${channelId}. Send a prompt or run /brief, /skills, or /ui.`;
      let mood = "happy";
      let suggestedCommand = "";

      if (lower.includes("brief")) {
        reply = `[${resolvedSessionId}] Post_brief queue ready: ${pendingList.length} mcp__duet gate${pendingList.length === 1 ? "" : "s"} waiting${pendingList[0]?.title ? `—top item is ${pendingList[0].title}` : ""}.`;
        mood = "focused";
        suggestedCommand = "/brief";
      } else if (lower.includes("skill")) {
        reply = `[${resolvedSessionId}] Four skills loaded from ~/.hermes/skills/: duet-bridge, morning-brief, playwright-parity, and mail-triage.`;
        mood = "focused";
        suggestedCommand = "/skills";
      } else if (lower.includes("gateway") || lower.includes("mcp") || lower.includes("doctor")) {
        reply = `[${resolvedSessionId}] Gateway configured on ${HERMES_API_URL} with mcp_servers.duet bridge active.`;
        mood = "focused";
        suggestedCommand = "/gateway";
      } else if (lower.includes("task") || lower.includes("status")) {
        const running = taskList.filter((t) => t.status === "running").length;
        reply = `[${resolvedSessionId}] Tracking ${taskList.length} Hermes runs, with ${running} executing cleanly.`;
        mood = "focused";
        suggestedCommand = "/tasks";
      } else if (lower.includes("approve")) {
        reply = pendingList[0]?.title
          ? `[${resolvedSessionId}] ${pendingList[0].title} is queued behind mcp__duet. Run /approve ${pendingList[0].id} or tap Approve.`
          : `[${resolvedSessionId}] All mcp__duet approval gates in this session are clear.`;
        mood = "happy";
        suggestedCommand = pendingList[0]?.id ? `/approve ${pendingList[0].id}` : "";
      }

      return {
        reply,
        mood,
        suggestedCommand,
        sourceMode: "local-duet",
        sessionId: resolvedSessionId,
        fallback: true,
      };
    }
  }

  app.post("/api/hermes/chat", async (req, res) => {
    const {
      message,
      channelId,
      sessionId,
      persona,
      history = [],
      pendingApprovals = [],
      tasks = [],
      uiConfig,
    } = req.body ?? {};
    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "Message is required." });
      return;
    }

    const result = await generateHermesReply({
      message,
      channelId,
      sessionId,
      persona,
      history,
      pendingApprovals,
      tasks,
      uiConfig,
    });
    res.status(200).json(result);
  });

  // Separate hermes-agent session registry endpoints
  app.get("/api/hermes/sessions", (_req, res) => {
    res.status(200).json({ sessions: buildAllSessionSnapshots() });
  });

  app.post("/api/hermes/sessions", async (req, res) => {
    const { channelId, name, sessionId, topic, persona } = (req.body ?? {}) as {
      channelId?: string;
      name?: string;
      sessionId?: string;
      topic?: string;
      persona?: string;
    };
    const rawKey = channelId || name;
    if (!rawKey || typeof rawKey !== "string") {
      res.status(400).json({ error: "channelId or name is required." });
      return;
    }
    const hadChannel = standaloneChannels.some(
      (c) =>
        c.id ===
        rawKey
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9-_]+/g, "-")
          .replace(/^-+|-+$/g, "")
    );
    const channel = ensureStandaloneChannel({ channelId: rawKey, name, sessionId, topic, persona });

    // Linked mode: make this lane real upstream too — a canvas shape becomes a
    // genuine Duet channel with its persona as standing instructions.
    let upstreamChannelId: string | null = null;
    try {
      upstreamChannelId = await ensureDuetChannel(channel.id);
    } catch {
      upstreamChannelId = null;
    }

    let welcomeItem: StandaloneDuetItem | null = null;
    const hasItems = standaloneItems.some((it) => (it.channel_id || "general") === channel.id);
    if (!hasItems) {
      welcomeItem = {
        id: `init-welcome-${channel.id}-${Date.now()}`,
        kind: "assistant",
        created_at: Date.now(),
        channel_id: channel.id,
        text: `Isolated session ${channel.session_id} ready (#${channel.name}). ${channel.topic}`,
      };
      standaloneItems.push(welcomeItem);
    }

    const snapshot = buildSessionSnapshot(channel);
    if (!hadChannel) {
      broadcastStandaloneEvent({ type: "channel", channel });
    }
    if (welcomeItem) {
      broadcastStandaloneEvent({ type: "item", item: welcomeItem });
    }
    broadcastStandaloneEvent({ type: "session", session: snapshot });
    res.status(200).json({ session: snapshot, channel, item: welcomeItem, upstream_channel_id: upstreamChannelId });
  });

  app.post("/api/hermes/sessions/:channelId/reset", (req, res) => {
    const channelId = req.params.channelId;
    const ch = ensureStandaloneChannel({ channelId });
    for (let i = standaloneItems.length - 1; i >= 0; i--) {
      if ((standaloneItems[i].channel_id || "general") === ch.id) {
        standaloneItems.splice(i, 1);
      }
    }
    standaloneSessionStatus.set(ch.id, "idle");
    const resetItem: StandaloneDuetItem = {
      id: `reset-${ch.id}-${Date.now()}`,
      kind: "assistant",
      created_at: Date.now(),
      channel_id: ch.id,
      text: `Fresh context opened for ${ch.session_id} (#${ch.name}). Prior messages in this shape were cleared.`,
    };
    standaloneItems.push(resetItem);
    const snapshot = buildSessionSnapshot(ch);
    broadcastStandaloneEvent({
      type: "session_reset",
      channelId: ch.id,
      session: snapshot,
      item: resetItem,
    });
    res.status(200).json({ ok: true, session: snapshot, item: resetItem });
  });

  app.delete("/api/hermes/sessions/:channelId", (req, res) => {
    const channelId = req.params.channelId;
    if (channelId === "general") {
      res.status(400).json({ error: "Cannot delete primary general session." });
      return;
    }
    const idx = standaloneChannels.findIndex((c) => c.id === channelId);
    if (idx >= 0) {
      standaloneChannels.splice(idx, 1);
    }
    for (let i = standaloneItems.length - 1; i >= 0; i--) {
      if ((standaloneItems[i].channel_id || "general") === channelId) {
        standaloneItems.splice(i, 1);
      }
    }
    standaloneSessionStatus.delete(channelId);
    broadcastStandaloneEvent({ type: "session_deleted", channelId });
    res.status(200).json({ ok: true, channelId });
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

      // 1. Primary TTS: Deepgram Aura-2 REST API (WAV linear16 for Web Audio AnalyserNode lip-sync)
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
          // Fall through to Gemini / browser fallback cleanly
        }
      }

      // 2. Secondary TTS: Gemini TTS (when GEMINI_API_KEY has available quota)
      if (process.env.GEMINI_API_KEY) {
        const ai = getGeminiClient();
        const styleMap: Record<string, string> = {
          happy: "Warm, bright, energetic cyber-assistant voice, crisp diction",
          alert: "Urgent, attentive, crisp tactical briefing voice",
          focused: "Calm, analytical, concise mission-control voice",
          thinking: "Thoughtful, measured, clear voice",
          neutral: "Clear, futuristic, friendly AI companion voice",
        };
        const style = styleMap[String(mood)] || styleMap.neutral;

        const synthesize = async () => {
          const response = await ai.models.generateContent({
            model: "gemini-3.8-flash-lite-tts",
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: cleanText.slice(0, 600),
                    speechMetadata: { style },
                  },
                ],
              },
            ],
            config: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: "Kore" },
                },
              },
            },
          });
          return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        };

        let base64Audio: string | undefined;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            base64Audio = await synthesize();
            if (base64Audio) break;
          } catch {
            if (attempt === 0) {
              await new Promise((r) => setTimeout(r, 200));
            }
          }
        }

        if (base64Audio) {
          res.json({
            audioBase64: base64Audio,
            mimeType: "audio/wav",
            provider: "gemini",
          });
          return;
        }
      }

      // 3. Clean graceful fallback so browser Web Speech & real-time viseme envelope animate with zero HTTP 500 errors
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

  // ----- Duet adapter routes: real state, runs, approvals, live events -----
  // Falls back cleanly to in-memory standalone Duet state when external Duet is absent.
  app.get("/api/duet/status", async (_req, res) => {
    try {
      const r = await duetFetch("/api/state");
      res.json({ ok: r.ok, paired: r.ok, mode: r.ok ? "duet-linked" : "standalone-duet", baseUrl: DUET_BASE_URL, device: DUET_DEVICE_NAME });
    } catch {
      res.json({ ok: true, paired: false, mode: "standalone-duet", baseUrl: DUET_BASE_URL, device: DUET_DEVICE_NAME });
    }
  });

  app.get("/api/duet/state", async (_req, res) => {
    try {
      const r = await duetFetch("/api/state");
      if (r.ok) {
        res.status(200).json(await r.json());
        return;
      }
    } catch {
      // External Duet daemon unreachable; serve in-memory standalone snapshot
    }
    res.status(200).json({
      items: standaloneItems,
      pending: standalonePending,
      tasks: standaloneTasks,
      channels: standaloneChannels,
      sessions: buildAllSessionSnapshots(),
    });
  });

  app.post("/api/duet/messages", async (req, res) => {
    const {
      text,
      channel_id = "general",
      session_id,
      persona,
      ui_config,
    } = (req.body ?? {}) as {
      text?: string;
      channel_id?: string;
      session_id?: string;
      persona?: string;
      ui_config?: Partial<UiCustomizationConfig>;
    };
    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "text is required" });
      return;
    }

    try {
      // Resolve the local slug ("ops") to the real Duet channel id, creating the
      // lane upstream on first use so canvas shapes run as real agent lanes.
      // The dot's persona rides along and becomes the channel's instructions.
      const upstreamChannelId =
        (await ensureDuetChannel(channel_id, persona ? { persona } : undefined)) ?? channel_id;
      const sendBody = JSON.stringify({ text, channel_id: upstreamChannelId });
      let r = await duetFetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: sendBody,
      });
      if (r.status === 404 && upstreamChannelId === channel_id) {
        // Pre-resolution failed (Duet busy or cache cold): force one resolution
        // pass and retry before falling back to the standalone run.
        const forced = await ensureDuetChannel(channel_id);
        if (forced && forced !== channel_id) {
          r = await duetFetch("/api/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, channel_id: forced }),
          });
        }
      }
      if (r.ok) {
        res.status(200).json(await r.json());
        return;
      }
    } catch {
      // Fall through to standalone in-memory Duet run
    }

    const channel = ensureStandaloneChannel({
      channelId: channel_id,
      sessionId: session_id,
      persona,
    });
    channel.last_at = Date.now();

    const userItem: StandaloneDuetItem = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind: "user",
      created_at: Date.now(),
      channel_id: channel.id,
      text,
    };
    standaloneItems.push(userItem);
    standaloneSessionStatus.set(channel.id, "thinking");
    broadcastStandaloneEvent({ type: "item", item: userItem });
    broadcastStandaloneEvent({ type: "session", session: buildSessionSnapshot(channel) });
    res.status(200).json({ item: userItem, session: buildSessionSnapshot(channel) });

    // Generate Hermes reply asynchronously in this shape's isolated session
    void (async () => {
      try {
        const history = standaloneItems
          .filter(
            (it) =>
              (it.kind === "user" || it.kind === "assistant") &&
              (it.channel_id || "general") === channel.id
          )
          .slice(-6)
          .map((it) => ({
            role: it.kind === "user" ? "user" : "hermes",
            text: it.text ?? "",
          }));
        const pendingApprovals = standalonePending
          .filter((p) => p.card && p.card.status === "pending" && p.card.type !== "brief")
          .map((p) => ({ id: p.id, title: p.card?.title }));

        const replyData = await generateHermesReply({
          message: text,
          channelId: channel.id,
          sessionId: channel.session_id,
          persona: channel.persona ?? undefined,
          history,
          pendingApprovals,
          tasks: standaloneTasks.filter((t) => (t.channel_id || "general") === channel.id),
          uiConfig: ui_config,
        });

        const assistantItem: StandaloneDuetItem = {
          id: `hermes-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          kind: "assistant",
          created_at: Date.now(),
          channel_id: channel.id,
          streaming: false,
          ui_patch: replyData.uiPatch,
          text: replyData.suggestedCommand
            ? `${replyData.reply}\n[Suggested: ${replyData.suggestedCommand}]`
            : replyData.reply,
        };
        standaloneItems.push(assistantItem);
        standaloneSessionStatus.set(channel.id, "idle");
        if (replyData.uiPatch) {
          broadcastStandaloneEvent({
            type: "ui_patch",
            channelId: channel.id,
            patch: replyData.uiPatch,
          });
        }
        broadcastStandaloneEvent({ type: "item", item: assistantItem });
        broadcastStandaloneEvent({ type: "session", session: buildSessionSnapshot(channel) });
      } catch {
        standaloneSessionStatus.set(channel.id, "idle");
        broadcastStandaloneEvent({ type: "session", session: buildSessionSnapshot(channel) });
      }
    })();
  });

  app.post("/api/duet/cards/:cardId/act", async (req, res) => {
    const { action, value } = (req.body ?? {}) as { action?: string; value?: string };
    try {
      const r = await duetFetch(`/api/cards/${encodeURIComponent(req.params.cardId)}/act`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, value }),
      });
      if (r.ok) {
        res.status(200).json(await r.json());
        return;
      }
    } catch {
      // Fall through to standalone in-memory card update
    }

    const item = standalonePending.find((p) => p.id === req.params.cardId);
    if (!item || !item.card) {
      res.status(404).json({ error: "card not found" });
      return;
    }
    item.card.status = action === "approve" ? "approved" : "declined";
    if (typeof value === "string") {
      item.card.draft = value;
    }
    item.updated_at = Date.now();
    broadcastStandaloneEvent({ type: "item", item });
    res.status(200).json({ ok: true, item });
  });

  // SSE passthrough: live items/tasks/channels from the Duet server (or standalone SSE hub).
  app.get("/api/duet/events", async (req, res) => {
    try {
      // Long-lived stream: the default 2.5s duetFetch timeout must NOT apply.
      // We own the lifecycle and abort upstream only when this client leaves.
      const upstreamController = new AbortController();
      const upstream = await duetFetch("/api/events", {
        headers: { accept: "text/event-stream" },
        signal: upstreamController.signal,
      });
      if (upstream.ok && upstream.body) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });
        const nodeStream = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]);
        // A stream error (upstream abort/restart) must end the response, never crash the server.
        nodeStream.on("error", () => {
          try {
            res.end();
          } catch {
            // response already closed
          }
        });
        nodeStream.pipe(res);
        const teardown = () => {
          upstreamController.abort();
          nodeStream.destroy();
        };
        req.on("close", teardown);
        res.on("close", teardown);
        return;
      }
    } catch {
      // Fall through to standalone SSE stream
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(": standalone-duet-connected\n\n");
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

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Hermes Duet server running on http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error("Server failed to start:", err);
  process.exit(1);
});
