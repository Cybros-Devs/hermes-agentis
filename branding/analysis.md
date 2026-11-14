---
title: "Voxcell — product & architecture overview (kit v2.0)"
topic: technical/product
data_type: system/structure + process
complexity: complex
point_count: 30
source_language: en
user_language: en
---

## Main Topic
Voxcell (repo: hermes-agentis) is a cyberpunk voice-activated phone widget and interactive command-line interface for Hermes Duet with real-time audio-synced animated ASCII character video. This infographic explains what it is, how its voice → agent → ASCII pipeline works, and what it is built from.

## Learning Objectives
After viewing this infographic, the viewer should understand:
1. What Voxcell is and what it does for a Hermes Duet user.
2. How a spoken sentence becomes an animated ASCII character, step by step (voice → agent → ASCII).
3. What the repo contains — 16 components, 11 tested engines, stack — and how it wires into the Hermes Duet app and gateway.

## Target Audience
- **Knowledge Level**: Intermediate developers (familiar with React/TypeScript, curious about voice agents).
- **Context**: Evaluating or discovering the repo on GitHub; wants the architecture in one look.
- **Expectations**: What it does, how it works inside, how much is real (tested engines, real wiring).

## Content Type Analysis
- **Data Structure**: A system anatomy — one pipeline (linear process) + inventories (components, engines) + wiring (system structure) + quick-reference stats.
- **Key Relationships**: mic → server → Hermes agent → TTS → analyser → ASCII/Braille render; client ↔ Hermes Duet app (7456/7457) and gateway (8642).
- **Visual Opportunities**: pipeline flow with numbered steps; component grid; engine bay with test badges; port map; big stat numerals (104 files, 11 engines); NEW-since-v1 markers (sprite animation, UI customizer, canvas sessions, thread trace).

## Key Data Points (Verbatim)
- 104 FILES (102 git-tracked) · 21,506 LOC · 16 COMPONENTS · 11 ENGINES · 2 HOOKS · 1 CHARACTER
- All 11 engines carry a .test.ts
- Ports: :7456 :7457 :8642; model hermes-agent
- New since v1: sprite-based ASCII portrait animation, UI customization system, portrait loading state, canvas sessions, agent thinking trace

## User Design Instructions
- Brand: cyberpunk-terminal, charcoal field, gold signal, ONE neon accent cyan, hard offset shadows, no glow, halftone dots, Braille/ASCII cell motif.
- Name treatment: Voxcell everywhere; repo stays hermes-agentis.
