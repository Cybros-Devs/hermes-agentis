import "dotenv/config";
import express from "express";
import path from "node:path";
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
      ttsProvider: hasDeepgramKey ? "deepgram" : hasGeminiKey ? "gemini" : "browser",
    });
  });

  app.post("/api/hermes/chat", async (req, res) => {
    try {
      const { message, channelId, history = [], pendingApprovals = [], tasks = [] } = req.body ?? {};
      if (!message || typeof message !== "string") {
        res.status(400).json({ error: "Message is required." });
        return;
      }

      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({ error: "GEMINI_API_KEY is not configured." });
        return;
      }

      const ai = getGeminiClient();

      const systemInstruction = [
        "You are Hermes, the AI messenger companion inside Hermes Duet (inspired by NousResearch/hermes-agent and DevvGwardo/hermes-duet).",
        "You appear on the user's futuristic phone video widget as an animated cyberpunk ASCII character.",
        "Speak concisely (1-3 crisp sentences, <= 55 words) because every reply is spoken aloud via TTS with live facial lip-sync.",
        "Maintain Hermes Duet domain awareness: channels (#general, #ops, #launch, #research), approval gates (send_message, payment), morning briefs, and background tasks.",
        "If the user asks to approve or reject a pending card in natural language, acknowledge clearly and mention the /approve <id> command or button.",
        `Active channel: #${channelId || "general"}.`,
        `Pending approvals: ${JSON.stringify(pendingApprovals)}.`,
        `Background tasks: ${JSON.stringify(tasks)}.`,
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
                  description: "Concise spoken response from Hermes (1-3 sentences).",
                },
                mood: {
                  type: Type.STRING,
                  description: "Facial expression mood: neutral, happy, focused, alert, or thinking.",
                },
                suggestedCommand: {
                  type: Type.STRING,
                  description: "Optional relevant Hermes Duet CLI command like /brief or /approve card-1.",
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
        reply: parsed.reply || "Signal received and logged to your active lane.",
        mood,
        suggestedCommand: parsed.suggestedCommand || "",
      });
    } catch {
      const { message = "", pendingApprovals = [], tasks = [] } = req.body ?? {};
      const lower = String(message).toLowerCase();
      const pendingList = Array.isArray(pendingApprovals) ? pendingApprovals : [];
      const taskList = Array.isArray(tasks) ? tasks : [];
      let reply = `Hermes link active. Received: "${String(message).slice(0, 80)}". Use /brief, /tasks, or /approve to drive your lanes.`;
      let mood = "happy";
      let suggestedCommand = "";

      if (lower.includes("brief")) {
        reply = `Morning brief ready: ${pendingList.length} approval gate${pendingList.length === 1 ? "" : "s"} waiting${pendingList[0]?.title ? `—top item is ${pendingList[0].title}` : ""}.`;
        mood = "focused";
        suggestedCommand = "/brief";
      } else if (lower.includes("task") || lower.includes("status")) {
        const running = taskList.filter((t: { status?: string }) => t.status === "running").length;
        reply = `Tracking ${taskList.length} background lanes, with ${running} running cleanly.`;
        mood = "focused";
        suggestedCommand = "/tasks";
      } else if (lower.includes("approve")) {
        reply = pendingList[0]?.title
          ? `${pendingList[0].title} is queued for sign-off. Say or click Approve to dispatch.`
          : "All approval gates in this lane are currently clear.";
        mood = "happy";
        suggestedCommand = pendingList[0]?.id ? `/approve ${pendingList[0].id}` : "";
      }

      res.status(200).json({ reply, mood, suggestedCommand, fallback: true });
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
