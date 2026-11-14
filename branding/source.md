# Source facts — hermes-agentis → Voxcell (verified 2026-11-14)

Collected from the repo at C:/Users/torre/hermes-agentis (branch branding/kit @ 7504199, clean). No secrets — all keys are env-based; only variable names appear here.

## Identity
- Product brand name (this kit, v2): **Voxcell** — 2 syllables (VOX-CELL). Supersedes v1.0's "Hermes Duet // Cyber Comms" (archived in branding/v1/).
- In-app surfaces still say "Hermes Duet // Cyber Comms" (metadata.json name, index.html `<title>`). Adopting Voxcell in-app is a code change, out of scope for this kit.
- Description (verbatim, metadata.json): "Cyberpunk voice-activated phone widget and interactive command-line interface for Hermes Duet with real-time audio-synced animated ASCII character video."
- requestFramePermissions: ["microphone"] (metadata.json)
- Server system prompt line (server.ts): "You appear on the user's Duet interface as a real-time audio-synced monochrome Braille portrait."

## Components (src/components/) — 16
AddSessionShapeModal, Ascii3DViewport, AsciiPortraitCanvas, BrailleHorizonCanvas, BrailleSessionsCanvas, BrailleShapeCanvas, CanvasSessionNode, CommandTerminal, DecodedText, DuetOperationsPanel, MobileWorkspaceBar, PhoneVideoWidget, SidebarWorkspace, ThreadTraceTree, UiCustomizerStudio, VoiceWorkspacePane.

## Hooks (src/hooks/) — 2
- useDuet — fetches /api/duet/state, POSTs /api/duet/messages and /api/duet/cards/:id/act
- useVoiceAgent — browser SpeechRecognition (webkitSpeechRecognition fallback), plays server-synthesized Gemini TTS WAV through Web Audio AnalyserNode

## Engines (src/utils/, each with a .test.ts) — 11, all tested
ascii3dEngine, asciiCharacter, asciiPortraitEngine, brailleFieldEngine, brailleShapesEngine, canvasSessions, cliEngine, portraitLoadingEngine, textDecodeEngine, threadTrace, uiCustomization.

## Server (server.ts, express)
- Gemini via @google/genai (GEMINI_API_KEY env; never hard-coded)
- Hermes Duet wiring: DUET_BASE_URL 127.0.0.1:7456, DUET_INTERNAL_URL 127.0.0.1:7457, device name "hermes-agentis", DUET_INTERNAL_TOKEN from env/token file
- Hermes gateway: HERMES_API_URL 127.0.0.1:8642 default, model API_SERVER_MODEL_NAME "hermes-agent"
- Routes: /api/health, /api/hermes/gateway, /api/hermes/runs/approve, /api/hermes/chat, /api/hermes/tts

## Stack
bun + vite 8 + React 19 + Tailwind CSS 4 + TypeScript; @google/genai 2.4, express, motion, lucide-react. Fonts shipped in index.html: Archivo, JetBrains Mono, Plus Jakarta Sans.

## Stats (2026-11-14)
- 104 files on disk excluding node_modules/ and .git/ (102 git-tracked)
- 21,506 lines across src/ + server.ts (wc -l)
- 16 components · 2 hooks · 11 tested engines · 1 animated character

## New since v1.0 kit (2026-11-13)
- Sprite-based ASCII portrait animation (c1e465a)
- UI customization system — UiCustomizerStudio + uiCustomization engine (08912d1)
- Portrait loading state — portraitLoadingEngine + assets (7504199)
- Canvas sessions — BrailleSessionsCanvas, BrailleShapeCanvas, CanvasSessionNode, canvasSessions engine, AddSessionShapeModal (33adb95 and prior)
- Agent thinking trace — ThreadTraceTree + threadTrace engine
- Mobile workspace bar + responsive layout (fade2b8)

## Pipeline (voice → agent → ASCII) — unchanged
1. Mic captured; browser SpeechRecognition transcribes
2. Text POSTs to /api/hermes/chat on the local server
3. Server routes to the Hermes Duet agent (gateway 127.0.0.1:8642, model hermes-agent) or Gemini fallback
4. Reply text synthesizes to Gemini TTS WAV, returned as base64
5. Client decodes WAV via Web Audio, plays through an AnalyserNode
6. asciiPortraitEngine / brailleFieldEngine / AsciiPortraitCanvas / BrailleHorizonCanvas render the audio-synced animated ASCII/Braille character; CommandTerminal + DuetOperationsPanel show the session
