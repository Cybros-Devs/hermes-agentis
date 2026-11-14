# VOXCELL — structured content for infographic A (dense-modules × cyberpunk-neon, 16:9)

## Title
VOXCELL — voice to character, live

## Learning Objectives
1. See what Voxcell is in one read.
2. Follow the voice → agent → ASCII pipeline.
3. Take in the repo's real inventory: 16 components, 11 tested engines.

## Sections

### MOD-1 IDENTITY
- Key concept: what Voxcell is.
- Content (verbatim): "Cyberpunk voice-activated phone widget and interactive command-line interface for Hermes Duet with real-time audio-synced animated ASCII character video." Repo: hermes-agentis.
- Visual element: Braille dot-cell monogram (V: left column + mid-right dot) in a bordered panel.

### MOD-2 PIPELINE — VOICE → AGENT → ASCII
- Key concept: how one spoken sentence becomes an animated character.
- Content: 6 numbered nodes: 1 MIC (SpeechRecognition) → 2 SERVER (POST /api/hermes/chat) → 3 AGENT (Hermes Duet gateway 127.0.0.1:8642, model hermes-agent) → 4 TTS (Gemini TTS WAV) → 5 ANALYSER (Web Audio AnalyserNode) → 6 RENDER (audio-synced ASCII/Braille character).
- Visual element: horizontal flow with arrows; cyan for live nodes; gold for RENDER.

### MOD-3 COMPONENTS — 16 COMPONENTS · 2 HOOKS
- Key concept: the UI surface inventory.
- Content: AddSessionShapeModal, Ascii3DViewport, AsciiPortraitCanvas (highlight: the animated face), BrailleHorizonCanvas, BrailleSessionsCanvas, BrailleShapeCanvas, CanvasSessionNode, CommandTerminal, DecodedText, DuetOperationsPanel, MobileWorkspaceBar, PhoneVideoWidget, SidebarWorkspace, ThreadTraceTree, UiCustomizerStudio, VoiceWorkspacePane; hooks useDuet, useVoiceAgent.
- Visual element: 4×4 grid of chips with one gold highlight.

### MOD-4 ENGINES — 11 ENGINES · ALL TESTED
- Key concept: the engine bay, every one with a .test.ts.
- Content: ascii3dEngine, asciiCharacter, asciiPortraitEngine, brailleFieldEngine, brailleShapesEngine, canvasSessions, cliEngine, portraitLoadingEngine, textDecodeEngine, threadTrace, uiCustomization — each with "✓ .test.ts" badge.
- Visual element: engine list with test badges.

### MOD-5 WIRING — WIRED INTO HERMES DUET
- Key concept: real ports, real gateway.
- Content: voxcell → Duet app :7456/:7457; Hermes gateway :8642; model hermes-agent; @google/genai; stack chips "bun · vite · React 19 · Tailwind 4 · TypeScript".
- Visual element: port map with labeled arrows.

### MOD-6 QUICK REFERENCE
- Key concept: the numbers at a glance.
- Content (verbatim stats): 104 FILES (102 git-tracked) · 21,506 LOC · 16 COMPONENTS · 11 ENGINES · 2 HOOKS · 1 CHARACTER. NEW since v1: sprite portrait animation · UI customizer · canvas sessions · thinking trace.
- Visual element: big mono numerals in callout boxes.

## Data Points (all statistics copied exactly)
- 104 FILES, 102 git-tracked, 21,506 LOC
- 16 COMPONENTS, 2 HOOKS, 11 ENGINES, 1 CHARACTER
- Ports :7456, :7457, :8642; model hermes-agent

## Design Instructions
- Layout: dense-modules, 6 modules, coordinate labels MOD-1…MOD-6, grid cells, metadata in corners.
- Style: cyberpunk-neon brand-adapted — charcoal #0e0e0e, panels #161616, off-white #f3eee3, gold #ffd700, ONE neon cyan #22D3EE, hard offset shadows, halftone, no glow, no gradients.
- Aspect: 16:9 landscape. Language: English.
