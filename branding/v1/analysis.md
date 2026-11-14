---
title: "Hermes Duet // Cyber Comms — product & architecture overview"
topic: technical/product
data_type: system/structure + process
complexity: complex
point_count: 24
source_language: en
user_language: en
---

## Main Topic
Hermes Duet // Cyber Comms (repo: hermes-agentis) is a cyberpunk voice-activated phone widget and interactive command-line interface for Hermes Duet with real-time audio-synced animated ASCII character video. This infographic explains what it is, how its voice → agent → ASCII pipeline works, and what it is built from.

## Learning Objectives
After viewing this infographic, the viewer should understand:
1. What Hermes Duet // Cyber Comms is and what it does for a Hermes Duet user.
2. How a spoken sentence becomes an animated ASCII character, step by step (voice → agent → ASCII).
3. What the repo contains — components, tested engines, stack — and how it wires into the Hermes Duet app and gateway.

## Target Audience
- **Knowledge Level**: Intermediate developers (familiar with React/TypeScript, curious about voice agents).
- **Context**: Evaluating or discovering the repo on GitHub; wants the architecture in one look.
- **Expectations**: What it does, how it works inside, how much is real (tested engines, real wiring).

## Content Type Analysis
- **Data Structure**: A system anatomy — one pipeline (linear process) + inventories (components, engines) + wiring (system structure) + quick-reference stats.
- **Key Relationships**: mic → server → Hermes agent → TTS → analyser → ASCII/Braille render; client ↔ Hermes Duet app (7456/7457) and gateway (8642).
- **Visual Opportunities**: pipeline flow with numbered steps; component grid; engine bay with test badges; port map; big stat numerals (47 files, 6 engines).

## Key Data Points (Verbatim)
- "Hermes Duet // Cyber Comms" (metadata.json)
- "Cyberpunk voice-activated phone widget and interactive command-line interface for Hermes Duet with real-time audio-synced animated ASCII character video." (metadata.json / index.html)
- "You appear on the user's Duet interface as a real-time audio-synced monochrome Braille portrait." (server.ts)
- Components: Ascii3DViewport, AsciiPortraitCanvas, BrailleHorizonCanvas, CommandTerminal, DecodedText, DuetOperationsPanel, PhoneVideoWidget, SidebarWorkspace, VoiceWorkspacePane
- Hooks: useDuet, useVoiceAgent
- Tested engines: ascii3dEngine, asciiCharacter, asciiPortraitEngine, brailleFieldEngine, cliEngine, textDecodeEngine (each with .test.ts)
- Duet wiring: 127.0.0.1:7456 (Duet base), 127.0.0.1:7457 (Duet internal), 127.0.0.1:8642 (Hermes gateway), model "hermes-agent"
- Stack: bun, vite, React 19, Tailwind CSS 4, TypeScript, @google/genai, express, motion
- 47 files on disk (45 git-tracked), ~8,500 LOC (wc -l: 8,562)
- Commits: "feat: wire the real Hermes Duet engine", "feat: responsive layout + agent thinking trace with toggle"
- Keys are env-based: GEMINI_API_KEY, HERMES_API_KEY, DUET_INTERNAL_TOKEN (names only; no values)

## Layout × Style Signals
- Content type: system/structure + inventory → dense-modules (task-selected)
- Tone: cyberpunk developer tool → cyberpunk-neon (task-selected)
- Audience: developers → technical labels, port numbers, real component names
- Complexity: complex (24 points) → high-density modules with coordinate labels

## Design Instructions (from user input)
- Layout: dense-modules. Style: cyberpunk-neon. Aspect: landscape (16:9). Language: English.
- Brand palette override: charcoal #0e0e0e base, panels #161616, off-white #f3eee3 ink, gold #ffd700 primary accent, ONE neon accent cyan #22D3EE. Flat neon — no blur/glow/bloom. Hard offset shadows, halftone dot texture, Braille/ASCII character motif. No text rendering issues: all labels in English, monospace treatment for technical labels.

## Recommended Combinations
1. **dense-modules + cyberpunk-neon** (SELECTED): 6-7 typed modules fit the anatomy (identity, pipeline, components, engines, wiring, stats); neon-on-dark matches the product's cyberpunk identity.
2. structural-breakdown + technical-schematic: exploded architecture view; strong alternative but weaker for inventory density.
3. dashboard + corporate-memphis: stats-first; loses the cyberpunk voice.
