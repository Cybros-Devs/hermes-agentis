# Hermes Duet // Cyber Comms — Brand Kit v1.0

Repo: DevvGwardo/hermes-agentis · Kit date: 2026-11-13
Style thesis: **cyberpunk-terminal meets the Hermes Duet house style.** Charcoal field, gold signal, one neon accent, hard offset shadows, halftone dots, ASCII/Braille character motif. No soft glows, ever.

---

## 1. Names

| Context | Treatment | Rule |
|---|---|---|
| Formal lockup (docs, banner, README title) | `Hermes Duet // Cyber Comms` | The `//` is part of the name and is always gold |
| Short name (chat, UI header) | `Cyber Comms` | Two words, never "CyberComms" |
| Repo / package / code contexts | `hermes-agentis` | Lowercase, hyphenated, monospace when shown in terminal contexts |
| Terminal handle | `agentis` | Prompt-style shorthand |

Never write "HermesAgentis", "Hermes Agentis", or "Cyber-Comms". The product is a client **of** Hermes Duet — say "for Hermes Duet", never "by Hermes Duet".

## 2. Taglines

1. **Voice in. Character out.**
2. **Talk to your agent. Watch it think.**
3. **Every word, rendered live.**

Primary is #1 (it is the pipeline in three words). #2 for developer-facing surfaces (the agent thinking trace is a real feature). #3 for release notes and social.

## 3. Brand voice — 5 bullets

- **Terminal-concise.** One line beats a paragraph. If it fits in a prompt, write it like one.
- **Signal over hype.** State what the thing does; skip adjectives and "revolutionary" fog.
- **Warm machine.** Cyberpunk on the outside, Hermes house warmth underneath — gold accents, human pacing, no menace.
- **Name the engine.** Technical truth in plain words. Say "Braille portrait rendered at 60fps" not "stunning visuals".
- **Deadpan play.** Monospace wit (`$ speak --render`), at most one joke per screen.

## 4. Palette

| Role | Name | Hex | Usage |
|---|---|---|---|
| Base | Charcoal | `#0e0e0e` | Page/app field. ~60% of any composition |
| Surface | Panel | `#161616` | Cards, terminal chrome, logo panel |
| Ink | Off-white | `#f3eee3` | Primary text, crisp 1.5px borders |
| Ink secondary | Ash | `#b9b2a3` | Secondary text, metadata |
| Accent — primary | Gold | `#ffd700` | The `//`, key numbers, active selection, lit Braille dots |
| Accent — mid | Amber | `#ffbf00` | Hover states, progress bars |
| Accent — deep | Bronze | `#cd853f` | Gold-family fills at scale, light-mode gold |
| Neon accent (the ONE) | Cyan | `#22D3EE` | Live/active only: prompt cursor, "listening" mic, data-in-flight |

**Committed accent: cyan `#22D3EE`.** Chosen over magenta because it already appears in the shipped code (7 uses in `src/`), reads as CRT-terminal cyan, and complements gold instead of fighting it. **There is exactly one neon accent.** Magenta is banned.

Ratio: 60% charcoal / 30% panel+off-white / 10% gold+cyan, with gold leading and cyan reserved for "alive" states.

Legacy note: today's in-app surfaces use emerald `#34D399` on `#050C0A` (see `index.html`, `src/`). That green is **product-legacy**, not brand. New brand surfaces use this kit; the green may live on inside the app chrome until redesign.

Light mode: field `#f3eee3`, ink `#0e0e0e`, gold becomes bronze `#cd853f`, cyan becomes `#0891b2` (contrast), panel `#f7f4ec` with `#0e0e0e` borders.

## 5. Typography

| Role | Face | Weights |
|---|---|---|
| UI text, body, labels | Inter (system sans fallback) | 400 / 600 |
| Terminal, wordmark, numbers, code | JetBrains Mono | 400 / 600 / 700 |

- Wordmark: JetBrains Mono **600**, uppercase, slight positive tracking (0.02em). The `//` renders in gold.
- Numbers and stats always mono — a number in a mono face is a terminal readout, keep it that way.
- Never set body copy in mono; never set the wordmark in a proportional sans.
- The repo currently ships Archivo + Plus Jakarta Sans + JetBrains Mono (`index.html`). Acceptable stopgap in-app; new brand surfaces standardize on Inter/JetBrains Mono.

## 6. Logo

### Concept
The mark is the **Braille character `⠓` (dots 1·2·5)** — the "H" of Hermes drawn in the same 2×3 dot cell the product uses to animate its character video. A monogram you can *feel*. It sits in a bordered panel with a hard offset shadow, next to the monospace lockup and a cyan prompt cursor — the whole thing reads as one line of a terminal that is listening.

### Construction rules
- Dot grid: 2 columns × 3 rows. Dot diameter 1u, pitch 3u center-to-center, grid optically centered in the panel.
- Panel: `#161616`, border 1.5px `#f3eee3`, corner radius 8 (small — crisp, not bubbly).
- Shadow: **hard offset only**, +6/+6, solid `#000`, no blur. This is the house shadow; it replaces every glow.
- Lit dots: gold `#ffd700` (light mode: bronze `#cd853f`). Unlit dots: `#2a2a2a` — the empty positions stay visible so the cell structure is legible.
- Cyan prompt cursor (`#22D3EE`, ~0.5u × 3u) appears only in the full lockup, never in the mark alone.
- Minimum size: 24px panel height. Clear space: one full dot cell on all sides.
- Variants: dark (primary), light, single-ink mono. Files: `logo/wordmark.svg` (dark), `logo/wordmark-light.svg`.

### What never happens
No rotation, no gradient fills on dots, no glow, no drop-shadow blur, no animating the dots. The cursor may blink in-product; in print and SVG it is static.

## 7. Texture and effects

- **Halftone dots**: 3px pitch, 4–6% ink opacity, charcoal fields only. A quiet CRT screen-door, not a pattern takeover.
- **Hard offset shadows** (6/6 solid, never blurred) on every raised element.
- **Crisp borders**: 1.5px `#f3eee3` at 60–100% opacity.
- Neon cyan is a **flat color**, never a glow. Cyberpunk without the bloom.

## 8. Do / Don't

**Do**
- Charcoal field + gold signal + cyan "live" states, 60/30/10.
- Monospace for anything terminal, numeric, or wordmark.
- Use the Braille cell / ASCII character field as texture (rows of `⠓⠿·` at low opacity).
- Pair the mark with real terminal artifacts: prompts, carets, status lines.
- Keep photography out; this brand is drawn, not shot.

**Don't**
- No soft glows, blurs, or bloom — flat neon only.
- No second neon accent (no magenta, no electric purple, no default blue).
- No gradients as a primary device.
- Don't put off-white text on gold; gold is an accent, not a field.
- Don't stretch, rotate, outline, or re-space the wordmark.
- Don't use the legacy emerald `#34D399` on brand surfaces.
- No text or watermarks in generated hero art — the mark carries the name.

## 9. Applications in this kit

| Asset | File | Notes |
|---|---|---|
| Wordmark (dark, primary) | `logo/wordmark.svg` | Full lockup, crisp at any size |
| Wordmark (light) | `logo/wordmark-light.svg` | For light surfaces |
| Logo preview | `logo/preview.html` | Light/dark, multiple sizes |
| GitHub social banner | `banner.jpg` | 1280×640 concept, generated |
| Avatar / hero mark | `avatar.jpg` | 1024 square, generated |
| Infographic | `infographic.jpg` (+ `infographic.html` fallback) | dense-modules × cyberpunk-neon, landscape |
| Brand board | `brand-board.html` | One-page kit summary, phone-friendly |

## 10. Fact provenance (what this kit is built on)

- Name and description: `metadata.json`, `index.html` — "Hermes Duet // Cyber Comms", "Cyberpunk voice-activated phone widget and interactive command-line interface for Hermes Duet with real-time audio-synced animated ASCII character video."
- Components: `src/components/` (Ascii3DViewport, AsciiPortraitCanvas, BrailleHorizonCanvas, CommandTerminal, DecodedText, DuetOperationsPanel, PhoneVideoWidget, SidebarWorkspace, VoiceWorkspacePane), hooks `src/hooks/` (useDuet, useVoiceAgent), tested engines in `src/utils/`.
- Duet wiring: `server.ts` — Duet base `127.0.0.1:7456`, internal `7457`, Hermes gateway `127.0.0.1:8642`, `@google/genai` for model + TTS. All keys are env-based (`GEMINI_API_KEY`, `HERMES_API_KEY`, `DUET_INTERNAL_TOKEN`); no values appear in this kit.
- Repo stats: 47 files on disk excluding `node_modules`/`.git` (45 git-tracked), ~8,500 LOC across `src/` + `server.ts`, stack bun + vite + React 19 + Tailwind 4 + TypeScript.
