# Infographic A generation prompt — VOXCELL (kit v2.1, actual character)

Assembled per baoyu-infographic skill: base template × dense-modules layout × bold-graphic style (project-adapted), landscape 16:9, English. Executed via agy (Antigravity CLI) image generation. Features the ACTUAL project character; stats recounted from the repo post-cybros merge (2026-11-14).

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

## Style Guidelines (bold-graphic, project-adapted)
- Bold comic/pop-art style: thick black outlines, high contrast, halftone dot patterns, comic panel borders
- Palette from the actual product: near-black green #050C0A background, panels #0A1410, off-white #ECF3F0 ink, sage #8FA399 midtones
- Character highlights in mint #A7F3D0; exactly ONE accent color: emerald #34D399 (live/active only)
- Flat colors — NO glow, NO blur, NO bloom, NO gradients
- Hard solid offset shadows (+6/+6 black) on every raised element
- Braille dot-matrix cells and ASCII glyph fields as the core texture motif
- Monospace terminal type treatment for all technical labels; comic lettering for emphasis words

## The Character (use her exact likeness from the reference images)
The character from C:/Users/torre/hermes-agentis/public/assets/aistudio/image_9fdb5ec4.png (12-frame sprite sheet at C:/Users/torre/hermes-agentis/public/assets/aistudio/image_f0b5dc2e.png, product render at C:/Users/torre/hermes-agentis/blueprint-out/ui/brandref/sheet_states.png): a young woman in 1960s retro shojo manga 1-bit ink style — shoulder-length black hair with outward-curled ends, thick blunt bangs with a jagged white highlight band, large heavily-lashed retro anime eyes, small upturned nose, full lips, white headband, black choker, white collared garment, bust-up three-quarter view. Draw her in high-contrast black-and-white ink with bold line weights.

## Module Content

**MOD-1 IDENTITY**: "VOXCELL" — voice-activated phone widget + interactive CLI for Hermes Duet; caption "real-time audio-synced animated ASCII character video"; repo "hermes-agentis"; the character herself drawn in the module (from the reference images), speaking into the pipeline.

**MOD-2 PIPELINE "VOICE → AGENT → ASCII"**: 6 numbered nodes with arrows: 1 MIC (SpeechRecognition) → 2 SERVER (POST /api/hermes/chat) → 3 AGENT (Hermes Duet gateway 127.0.0.1:8642, model hermes-agent) → 4 TTS (Gemini TTS WAV) → 5 ANALYSER (Web Audio AnalyserNode) → 6 RENDER (audio-synced Braille-dither character). Emerald #34D399 markers for live nodes, mint #A7F3D0 for RENDER.

**MOD-3 COMPONENTS "16 COMPONENTS · 2 HOOKS"**: grid of AddSessionShapeModal, Ascii3DViewport, AsciiPortraitCanvas (highlight: the animated face), BrailleHorizonCanvas, BrailleSessionsCanvas, BrailleShapeCanvas, CanvasSessionNode, CommandTerminal, DecodedText, DuetOperationsPanel, MobileWorkspaceBar, PhoneVideoWidget, SidebarWorkspace, ThreadTraceTree, UiCustomizerStudio, VoiceWorkspacePane; hooks useDuet, useVoiceAgent.

**MOD-4 ENGINES "14 ENGINES · ALL TESTED"**: ascii3dEngine, asciiCharacter, asciiPortraitEngine, brailleFieldEngine, brailleIdleLoops, brailleShapesEngine, canvasSessions, cliEngine, homeSession, portraitLoadingEngine, textDecodeEngine, threadScroll, threadTrace, uiCustomization — each with a "✓ .test.ts" badge.

**MOD-5 WIRING "WIRED INTO HERMES DUET"**: port map — voxcell → Duet app :7456/:7457, Hermes gateway :8642, @google/genai; stack chips "bun · vite · React 19 · Tailwind 4 · TypeScript".

**MOD-6 QUICK REFERENCE**: stats — 142 FILES · 27,143 LOC · 16 COMPONENTS · 14 ENGINES · 2 HOOKS · 1 CHARACTER (her, drawn small as a Braille-dither portrait); strip "SPRITE-SHEET PORTRAIT · 12 FRAMES · LIVE LIP-SYNC".

## Text Labels (English)
- Title: "VOXCELL"
- Subtitle: "VOICE IN. CHARACTER OUT."
- Module headers: "MOD-1 IDENTITY", "MOD-2 VOICE → AGENT → ASCII", "MOD-3 16 COMPONENTS · 2 HOOKS", "MOD-4 14 ENGINES · ALL TESTED", "MOD-5 WIRED INTO HERMES DUET", "MOD-6 QUICK REFERENCE"
- Node labels: "MIC", "SERVER", "AGENT", "TTS", "ANALYSER", "RENDER"
- Port labels: ":7456", ":7457", ":8642", "hermes-agent"
- Stat labels: "142 FILES", "27,143 LOC", "16 COMPONENTS", "14 ENGINES", "2 HOOKS", "1 CHARACTER"
- Footer: "github.com/DevvGwardo/hermes-agentis"

No watermark. All facts from the repo (metadata.json, src/, server.ts, git) — nothing invented. Save the image to the absolute path C:/Users/torre/hermes-agentis/branding/infographic.jpg
