# Source facts — hermes-agentis (verified 2026-11-13)

Collected from the repo at C:/Users/torre/hermes-agentis (main @ 2d983f5, clean, in sync with origin/main). No secrets — all keys are env-based; only variable names appear here.

## Identity
- Product name: "Hermes Duet // Cyber Comms" (metadata.json, index.html `<title>`)
- Description (verbatim): "Cyberpunk voice-activated phone widget and interactive command-line interface for Hermes Duet with real-time audio-synced animated ASCII character video."
- requestFramePermissions: ["microphone"] (metadata.json)
- Server system prompt line (server.ts): "You appear on the user's Duet interface as a real-time audio-synced monochrome Braille portrait."

## Components (src/components/)
Ascii3DViewport, AsciiPortraitCanvas, BrailleHorizonCanvas, CommandTerminal, DecodedText, DuetOperationsPanel, PhoneVideoWidget, SidebarWorkspace, VoiceWorkspacePane — 9 components.

## Hooks (src/hooks/)
- useDuet — fetches /api/duet/state, POSTs /api/duet/messages and /api/duet/cards/:id/act
- useVoiceAgent — browser SpeechRecognition (webkitSpeechRecognition fallback), plays server-synthesized Gemini TTS WAV through Web Audio AnalyserNode

## Engines (src/utils/, each with a .test.ts)
ascii3dEngine, asciiCharacter, asciiPortraitEngine, brailleFieldEngine, cliEngine, textDecodeEngine — 6 tested engines.

## Server (server.ts, express)
- Gemini via @google/genai (GEMINI_API_KEY env; never hard-coded)
- Hermes Duet wiring: DUET_BASE_URL 127.0.0.1:7456, DUET_INTERNAL_URL 127.0.0.1:7457, device name "hermes-agentis", DUET_INTERNAL_TOKEN from env/token file
- Hermes gateway: HERMES_API_URL 127.0.0.1:8642 default, model API_SERVER_MODEL_NAME "hermes-agent"
- Routes: /api/health, /api/hermes/gateway, /api/hermes/runs/approve, /api/hermes/chat, /api/hermes/tts

## Stack
bun + vite 8 + React 19 + Tailwind CSS 4 + TypeScript; @google/genai 2.4, express, motion, lucide-react. Fonts shipped in index.html: Archivo, JetBrains Mono, Plus Jakarta Sans.

## Stats
- 47 files on disk excluding node_modules/ and .git/ (45 git-tracked; the other 2 are gitignored local files)
- ~8,500 lines across src/ + server.ts (wc -l total: 8,562)
- Recent commits: "feat: wire the real Hermes Duet engine", "feat: responsive layout + agent thinking trace with toggle" (2d983f5)

## Pipeline (voice → agent → ASCII)
1. Mic captured; browser SpeechRecognition transcribes
2. Text POSTs to /api/hermes/chat on the local server
3. Server routes to the Hermes Duet agent (gateway 127.0.0.1:8642, model hermes-agent) or Gemini fallback
4. Reply text synthesizes to Gemini TTS WAV, returned as base64
5. Client decodes WAV via Web Audio, plays through an AnalyserNode
6. asciiPortraitEngine / brailleFieldEngine / AsciiPortraitCanvas / BrailleHorizonCanvas render the audio-synced animated ASCII/Braille character; CommandTerminal + DuetOperationsPanel show the session
