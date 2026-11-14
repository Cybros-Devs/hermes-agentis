# Hermes Duet // Cyber Comms — Voice In, Character Out

## Overview
A one-look anatomy of hermes-agentis: what the product is, how a spoken sentence becomes an animated ASCII character (voice → agent → ASCII), and what the repo is built from — components, tested engines, stack, and its wiring into Hermes Duet.

## Learning Objectives
The viewer will understand:
1. What Hermes Duet // Cyber Comms is and does.
2. The six-step voice → agent → ASCII pipeline.
3. The repo's components, engines, stats, and Duet wiring.

---

## MOD-1: IDENTITY — What it is

**Key Concept**: The product in one sentence.

**Content**:
- "Hermes Duet // Cyber Comms" — product name
- "Cyberpunk voice-activated phone widget and interactive command-line interface for Hermes Duet with real-time audio-synced animated ASCII character video."
- A client of Hermes Duet (repo: hermes-agentis)

**Visual Element**:
- Type: hero panel with a phone-widget silhouette and a terminal window
- Subject: phone widget + command line side by side
- Treatment: charcoal field, gold ASCII character face, cyan prompt cursor

**Text Labels**:
- Headline: "HERMES DUET // CYBER COMMS"
- Subhead: "Voice-activated phone widget + interactive CLI for Hermes Duet"
- Caption: "Real-time audio-synced animated ASCII character video"

---

## MOD-2: PIPELINE — Voice → Agent → ASCII

**Key Concept**: How one spoken sentence becomes an animated character.

**Content**:
- Step 1: Mic — browser SpeechRecognition transcribes speech to text
- Step 2: POST /api/hermes/chat — text goes to the local express server
- Step 3: Agent — Hermes Duet gateway at 127.0.0.1:8642 (model: hermes-agent), Gemini fallback
- Step 4: Voice — reply synthesizes to Gemini TTS WAV (base64)
- Step 5: Audio — Web Audio decodes and plays through an AnalyserNode
- Step 6: Render — audio-synced ASCII/Braille character drawn every frame

**Visual Element**:
- Type: numbered horizontal flow, 6 nodes with arrows
- Subject: mic → server → agent → speaker → waveform → ASCII face
- Treatment: cyan for live/data-in-flight nodes, gold for the render node

**Text Labels**:
- Headline: "VOICE → AGENT → ASCII"
- Node labels: "MIC", "SERVER", "AGENT", "TTS", "ANALYSER", "RENDER"
- Caption: "SpeechRecognition · /api/hermes/chat · gateway :8642 · Gemini TTS WAV · AnalyserNode"

---

## MOD-3: COMPONENT INVENTORY — The UI

**Key Concept**: Nine React components make the interface.

**Content**:
- Ascii3DViewport — 3D ASCII viewport
- AsciiPortraitCanvas — the animated ASCII character canvas
- BrailleHorizonCanvas — Braille dot-field horizon
- CommandTerminal — interactive command line
- DecodedText — decoded text stream
- DuetOperationsPanel — Duet operations + approvals
- PhoneVideoWidget — the phone-shaped widget
- SidebarWorkspace + VoiceWorkspacePane — workspace panes
- Hooks: useDuet (state, messages, card actions) · useVoiceAgent (mic, TTS, analyser)

**Visual Element**:
- Type: selection-array grid with icons, best-choice highlight on AsciiPortraitCanvas
- Subject: component chips in a 3×3 grid
- Treatment: mono labels, gold highlight on the character canvas

**Text Labels**:
- Headline: "9 COMPONENTS · 2 HOOKS"
- Labels: component names as listed above
- Highlight badge: "★ the animated face"

---

## MOD-4: ENGINE BAY — Tested, not vibes

**Key Concept**: Six engines, each with its own test file.

**Content**:
- ascii3dEngine — 3D ASCII rendering (ascii3dEngine.test.ts)
- asciiCharacter — character glyph logic (asciiCharacter.test.ts)
- asciiPortraitEngine — portrait field animation (asciiPortraitEngine.test.ts)
- brailleFieldEngine — Braille cell fields (brailleFieldEngine.test.ts)
- cliEngine — command-line behavior (cliEngine.test.ts)
- textDecodeEngine — text decode stream (textDecodeEngine.test.ts)

**Visual Element**:
- Type: specification scale / engine rack with green checkmarks per engine
- Subject: six engine slots with test badges
- Treatment: mono names, checkmark badges, one cyan "LIVE" indicator

**Text Labels**:
- Headline: "6 ENGINES · ALL TESTED"
- Labels: engine names as listed above
- Badge: "✓ .test.ts"

---

## MOD-5: DUET WIRING + STACK — How it plugs in

**Key Concept**: A real client of the Hermes Duet app, with real ports.

**Content**:
- Duet app: 127.0.0.1:7456 (base) · 127.0.0.1:7457 (internal)
- Hermes gateway: 127.0.0.1:8642 · model "hermes-agent"
- Gemini: @google/genai — model + TTS; keys env-based (GEMINI_API_KEY, HERMES_API_KEY, DUET_INTERNAL_TOKEN — names only, no values)
- Server routes: /api/health, /api/hermes/gateway, /api/hermes/runs/approve, /api/hermes/chat, /api/hermes/tts
- Stack: bun · vite · React 19 · Tailwind CSS 4 · TypeScript · express · motion
- Recent commit: "feat: wire the real Hermes Duet engine"

**Visual Element**:
- Type: mini port-map / circuit diagram connecting hermes-agentis to Duet app and gateway
- Subject: three nodes wired with labeled lines
- Treatment: gold wires, cyan port chips, mono labels

**Text Labels**:
- Headline: "WIRED INTO HERMES DUET"
- Labels: "hermes-agentis", "Duet app :7456/:7457", "Hermes gateway :8642", "@google/genai"
- Caption: "bun · vite · React 19 · Tailwind 4 · TypeScript"

---

## MOD-6: QUICK REFERENCE — The numbers

**Key Concept**: Repo stats at a glance.

**Content**:
- 47 — files on disk (45 git-tracked)
- ~8,500 — lines of code across src/ + server.ts (wc -l: 8,562)
- 9 — React components
- 6 — tested engines
- 2 — hooks
- 1 — animated character, rendered from your voice

**Visual Element**:
- Type: dense stat strip with large mono numerals
- Subject: six stats in a grid
- Treatment: gold numerals, ash captions, one cyan stat

**Text Labels**:
- Headline: "QUICK REFERENCE"
- Labels: "47 FILES", "~8,500 LOC", "9 COMPONENTS", "6 ENGINES", "2 HOOKS", "1 CHARACTER"

---

## Data Points (Verbatim)

### Statistics
- "47 files on disk (45 git-tracked)"
- "~8,500 lines of code across src/ + server.ts (wc -l: 8,562)"
- "9 components", "6 tested engines", "2 hooks"

### Quotes
- "Cyberpunk voice-activated phone widget and interactive command-line interface for Hermes Duet with real-time audio-synced animated ASCII character video." — metadata.json
- "You appear on the user's Duet interface as a real-time audio-synced monochrome Braille portrait." — server.ts
- "feat: wire the real Hermes Duet engine" — git log

### Key Terms
- **Braille portrait**: the animated character rendered from Braille dot cells, audio-synced
- **hermes-agent**: the model name the gateway serves
- **Duet wiring**: base 7456, internal 7457, gateway 8642 — all loopback

## Design Instructions

### Style Preferences
- cyberpunk-neon on dark: charcoal #0e0e0e base, panels #161616, off-white #f3eee3 ink
- Gold #ffd700 primary accent; ONE neon accent: cyan #22D3EE (flat neon — no glow, no blur, no bloom)
- Hard offset shadows (solid, +6/+6), subtle halftone dot texture, Braille/ASCII character motif

### Layout Preferences
- dense-modules: 6 typed modules (MOD-1..MOD-6), coordinate labels, dense but organized, every corner carries data

### Other Requirements
- Landscape 16:9; English; monospace treatment for technical labels; no watermark
