# Infographic A generation prompt — VOXCELL (kit v2.0)

Assembled per baoyu-infographic skill: base template × dense-modules layout × cyberpunk-neon style (brand-adapted), landscape 16:9, English. Executed via agy (Antigravity CLI) image generation.

---

Create a professional infographic following these specifications:

## Image Specifications
- **Type**: Infographic
- **Layout**: dense-modules
- **Style**: cyberpunk-neon
- **Aspect Ratio**: 16:9 (landscape)
- **Language**: English

## Core Principles
- Follow the layout structure precisely for information architecture
- Apply style aesthetics consistently throughout
- Keep information concise, highlight keywords and core concepts
- Maintain clear visual hierarchy

## Text Requirements
- All text must match the specified style treatment
- Main titles should be prominent and readable
- Key concepts should be visually emphasized
- Labels should be clear and appropriately sized
- Use English for all text content

## Layout Guidelines (dense-modules, grid-cell variant)
- 6 distinct modules, each serving a specific information function
- Every module contains concrete data: names, numbers, ports, parameters
- Compact spacing; smaller text acceptable to maximize information density
- Each module identified by coordinate label (MOD-1 … MOD-6)
- Modules in strict rectangular cells divided by thick lines, Swiss grid feel
- Data callout boxes with highlighted numbers; comparison arrows and progression indicators
- Metadata in corners (grid coordinates, small barcodes)
- Every corner contains useful information or metadata; no decorative-only empty space

## Style Guidelines (cyberpunk-neon, brand-adapted)
- Neon on dark: charcoal #0e0e0e background, panels #161616, off-white #f3eee3 ink
- Primary accent gold #ffd700; exactly ONE neon accent: cyan #22D3EE
- Flat neon — crisp neon outlines and fills, NO glow, NO blur, NO bloom, NO gradients
- Hard solid offset shadows (+6/+6) on every raised element
- Subtle halftone dot texture on the charcoal field
- Braille dot cells and ASCII character fields as the core motif
- Glitch/scanline hints allowed as crisp 1px lines, never blurred
- Digital/tech monospace type treatment for all technical labels

## Module Content

**MOD-1 IDENTITY**: "VOXCELL" — voice-activated phone widget + interactive CLI for Hermes Duet; caption "real-time audio-synced animated ASCII character video"; repo "hermes-agentis"; Braille dot-cell V monogram (left column of 3 dots + 1 middle-right dot) in a bordered panel.

**MOD-2 PIPELINE "VOICE → AGENT → ASCII"**: 6 numbered nodes with arrows: 1 MIC (SpeechRecognition) → 2 SERVER (POST /api/hermes/chat) → 3 AGENT (Hermes Duet gateway 127.0.0.1:8642, model hermes-agent) → 4 TTS (Gemini TTS WAV) → 5 ANALYSER (Web Audio AnalyserNode) → 6 RENDER (audio-synced ASCII/Braille character). Cyan for live nodes, gold for RENDER.

**MOD-3 COMPONENTS "16 COMPONENTS · 2 HOOKS"**: grid of AddSessionShapeModal, Ascii3DViewport, AsciiPortraitCanvas (highlight: the animated face), BrailleHorizonCanvas, BrailleSessionsCanvas, BrailleShapeCanvas, CanvasSessionNode, CommandTerminal, DecodedText, DuetOperationsPanel, MobileWorkspaceBar, PhoneVideoWidget, SidebarWorkspace, ThreadTraceTree, UiCustomizerStudio, VoiceWorkspacePane; hooks useDuet, useVoiceAgent.

**MOD-4 ENGINES "11 ENGINES · ALL TESTED"**: ascii3dEngine, asciiCharacter, asciiPortraitEngine, brailleFieldEngine, brailleShapesEngine, canvasSessions, cliEngine, portraitLoadingEngine, textDecodeEngine, threadTrace, uiCustomization — each with a "✓ .test.ts" badge.

**MOD-5 WIRING "WIRED INTO HERMES DUET"**: port map — voxcell → Duet app :7456/:7457, Hermes gateway :8642, @google/genai; stack chips "bun · vite · React 19 · Tailwind 4 · TypeScript".

**MOD-6 QUICK REFERENCE**: stats — 104 FILES (102 git-tracked) · 21,506 LOC · 16 COMPONENTS · 11 ENGINES · 2 HOOKS · 1 CHARACTER; strip "NEW: sprite portrait animation · UI customizer · canvas sessions · thinking trace".

## Text Labels (English)
- Title: "VOXCELL"
- Subtitle: "VOICE IN. CHARACTER OUT."
- Module headers: "MOD-1 IDENTITY", "MOD-2 VOICE → AGENT → ASCII", "MOD-3 16 COMPONENTS · 2 HOOKS", "MOD-4 11 ENGINES · ALL TESTED", "MOD-5 WIRED INTO HERMES DUET", "MOD-6 QUICK REFERENCE"
- Node labels: "MIC", "SERVER", "AGENT", "TTS", "ANALYSER", "RENDER"
- Port labels: ":7456", ":7457", ":8642", "hermes-agent"
- Stat labels: "104 FILES", "21,506 LOC", "16 COMPONENTS", "11 ENGINES", "2 HOOKS", "1 CHARACTER"
- Footer: "github.com/DevvGwardo/hermes-agentis"

No watermark. All facts from the repo (metadata.json, src/, server.ts, git) — nothing invented. Save the image to the absolute path C:/Users/torre/hermes-agentis/branding/infographic.jpg
