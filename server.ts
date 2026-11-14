import "dotenv/config";
import express from "express";
import path from "node:path";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";

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

  app.post("/api/hermes/chat", async (req, res) => {
    try {
      const {
        message,
        channelId,
        sessionId,
        history = [],
        pendingApprovals = [],
        tasks = [],
      } = req.body ?? {};
      if (!message || typeof message !== "string") {
        res.status(400).json({ error: "Message is required." });
        return;
      }

      const resolvedSessionId =
        typeof sessionId === "string" && sessionId ? sessionId : `duet-${channelId || "general"}`;

      // 1. Prefer live local/Tailscale Hermes Agent Gateway (/v1/chat/completions) when reachable
      if (process.env.HERMES_API_URL || process.env.HERMES_API_KEY) {
        try {
          const gwMessages = [
            {
              role: "system",
              content: `You are Hermes Agent inside Hermes Duet (session ${resolvedSessionId}, lane #${channelId || "general"}). Respond in 1-3 crisp spoken sentences.`,
            },
            ...(Array.isArray(history)
              ? history.slice(-6).map((h: { role?: string; text?: string }) => ({
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
              res.json({
                reply: content,
                mood: "happy",
                suggestedCommand: "",
                sourceMode: "hermes-gateway",
                sessionId: resolvedSessionId,
              });
              return;
            }
          }
        } catch {
          // Fall through cleanly to standalone Hermes Duet Gemini bridge
        }
      }

      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({ error: "GEMINI_API_KEY is not configured." });
        return;
      }

      const ai = getGeminiClient();

      const systemInstruction = [
        "You are Hermes Agent (NousResearch/hermes-agent) speaking through Hermes Duet (DevvGwardo/hermes-duet).",
        "You appear on the user's Duet interface as a real-time audio-synced monochrome Braille portrait.",
        "Speak concisely (1-3 crisp sentences, <= 55 words) because every reply is spoken aloud via TTS with live facial lip-sync and Braille text decoding.",
        "Maintain genuine Hermes Agent & Hermes Duet awareness: Gateway API server (:8642, /v1/runs, /v1/chat/completions), MCP bridge tools (mcp__duet__request_approval, mcp__duet__request_payment, mcp__duet__post_brief, mcp__duet__save_page), ~/.hermes/skills/, persistent MEMORY.md, and cronjob_manage schedules.",
        "If the user asks to approve or reject a pending card, reference /approve <id> or the Approve button; remember a chat 'yes' does not bypass the explicit approval card button.",
        `Active lane: #${channelId || "general"} (session: ${resolvedSessionId}).`,
        `Pending mcp__duet gates: ${JSON.stringify(pendingApprovals)}.`,
        `Active background runs: ${JSON.stringify(tasks)}.`,
      ].join("\n");

      const transcriptContext = Array.isArray(history)
        ? history
            .slice(-6)
            .map((h: { role?: string; text?: string }) => `${h.role === "user" ? "User" : "Hermes"}: ${h.text ?? ""}`)
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
                  description: "Optional Hermes Duet command like /brief, /skills, /gateway, or /approve card-1.",
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
      let parsed: { reply?: string; mood?: string; suggestedCommand?: string };
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = { reply: raw || "Signal received.", mood: "neutral" };
      }

      const allowedMoods = new Set(["neutral", "happy", "focused", "alert", "thinking", "speaking"]);
      const mood = allowedMoods.has(String(parsed.mood)) ? parsed.mood : "speaking";

      res.json({
        reply: parsed.reply || "Signal received and logged to your Hermes lane.",
        mood,
        suggestedCommand: parsed.suggestedCommand || "",
        sourceMode: "gemini-bridge",
        sessionId: resolvedSessionId,
      });
    } catch {
      const { message = "", channelId = "general", pendingApprovals = [], tasks = [] } = req.body ?? {};
      const lower = String(message).toLowerCase();
      const pendingList = Array.isArray(pendingApprovals) ? pendingApprovals : [];
      const taskList = Array.isArray(tasks) ? tasks : [];
      let reply = `Hermes lane duet-${channelId} active. Try /brief, /skills, /gateway, or /approve to drive Hermes Agent.`;
      let mood = "happy";
      let suggestedCommand = "";

      if (lower.includes("brief")) {
        reply = `Post_brief queue ready: ${pendingList.length} mcp__duet gate${pendingList.length === 1 ? "" : "s"} waiting${pendingList[0]?.title ? `—top item is ${pendingList[0].title}` : ""}.`;
        mood = "focused";
        suggestedCommand = "/brief";
      } else if (lower.includes("skill")) {
        reply = `Four skills loaded from ~/.hermes/skills/: duet-bridge, morning-brief, playwright-parity, and mail-triage.`;
        mood = "focused";
        suggestedCommand = "/skills";
      } else if (lower.includes("gateway") || lower.includes("mcp") || lower.includes("doctor")) {
        reply = `Configure API_SERVER_ENABLED=true in ~/.hermes/.env and run hermes gateway on 127.0.0.1:8642 with mcp_servers.duet.`;
        mood = "focused";
        suggestedCommand = "/gateway";
      } else if (lower.includes("task") || lower.includes("status")) {
        const running = taskList.filter((t: { status?: string }) => t.status === "running").length;
        reply = `Tracking ${taskList.length} isolated Hermes runs, with ${running} executing cleanly.`;
        mood = "focused";
        suggestedCommand = "/tasks";
      } else if (lower.includes("approve")) {
        reply = pendingList[0]?.title
          ? `${pendingList[0].title} is queued behind mcp__duet. Run /approve ${pendingList[0].id} or tap Approve.`
          : "All mcp__duet approval gates in this lane are clear.";
        mood = "happy";
        suggestedCommand = pendingList[0]?.id ? `/approve ${pendingList[0].id}` : "";
      }

      res.status(200).json({
        reply,
        mood,
        suggestedCommand,
        sourceMode: "local-duet",
        sessionId: `duet-${channelId}`,
        fallback: true,
      });
    }
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
  app.get("/api/duet/status", async (_req, res) => {
    try {
      const r = await duetFetch("/api/state");
      res.json({ ok: r.ok, paired: r.ok, baseUrl: DUET_BASE_URL, device: DUET_DEVICE_NAME });
    } catch (err) {
      res.json({ ok: false, paired: false, baseUrl: DUET_BASE_URL, error: String(err).slice(0, 120) });
    }
  });

  app.get("/api/duet/state", async (_req, res) => {
    try {
      const r = await duetFetch("/api/state");
      if (!r.ok) {
        res.status(r.status).json({ error: `duet responded ${r.status}` });
        return;
      }
      res.status(200).json(await r.json());
    } catch {
      res.status(502).json({ error: "duet-unreachable" });
    }
  });

  app.post("/api/duet/messages", async (req, res) => {
    try {
      const { text, channel_id } = (req.body ?? {}) as { text?: string; channel_id?: string };
      if (!text || typeof text !== "string") {
        res.status(400).json({ error: "text is required" });
        return;
      }
      const r = await duetFetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, channel_id }),
      });
      res.status(r.ok ? 200 : r.status).json(await r.json());
    } catch {
      res.status(502).json({ error: "duet-unreachable" });
    }
  });

  app.post("/api/duet/cards/:cardId/act", async (req, res) => {
    try {
      const { action, value } = (req.body ?? {}) as { action?: string; value?: string };
      const r = await duetFetch(`/api/cards/${encodeURIComponent(req.params.cardId)}/act`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, value }),
      });
      res.status(r.ok ? 200 : r.status).json(await r.json());
    } catch {
      res.status(502).json({ error: "duet-unreachable" });
    }
  });

  // SSE passthrough: live items/tasks/channels from the Duet server.
  app.get("/api/duet/events", async (req, res) => {
    try {
      const upstream = await duetFetch("/api/events", { headers: { accept: "text/event-stream" } });
      if (!upstream.ok || !upstream.body) {
        res.status(502).json({ error: "duet-events-unavailable" });
        return;
      }
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      const nodeStream = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]);
      nodeStream.pipe(res);
      req.on("close", () => {
        nodeStream.destroy();
      });
    } catch {
      res.status(502).json({ error: "duet-unreachable" });
    }
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
