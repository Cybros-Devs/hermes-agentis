# Branding — Hermes Duet // Cyber Comms

Brand kit v1.0 for **Hermes Duet // Cyber Comms** (repo: `hermes-agentis`) — "Cyberpunk voice-activated phone widget and interactive command-line interface for Hermes Duet with real-time audio-synced animated ASCII character video."

Style: cyberpunk-terminal meets the Hermes Duet house style. Charcoal `#0e0e0e`, panels `#161616`, off-white `#f3eee3`, gold `#ffd700`/`#ffbf00`/`#cd853f`, one committed neon accent **cyan `#22D3EE`**, hard offset shadows, halftone dots, no soft glows. Core motif: the ASCII/Braille character cell — the logo mark is the Braille character `⠓` (dots 1·2·5, the H of Hermes).

## Contents

| File | What it is |
|---|---|
| `brand.md` | The kit: names, taglines, voice, palette, typography, logo rules, do/don't |
| `brand-board.html` | One-page self-contained board: swatches, type, logo, art, infographic |
| `logo/wordmark.svg` | Primary dark wordmark (Braille mark + mono lockup + cyan cursor) |
| `logo/wordmark-light.svg` | Light variant |
| `logo/preview.html` | Light/dark preview with scale checks |
| `banner.jpg` | GitHub social banner concept, 1280×640 (generated via agy) |
| `avatar.jpg` | Square 1024 avatar / hero mark (generated via agy) |
| `infographic.jpg` | dense-modules × cyberpunk-neon product infographic, 16:9 (generated via agy) |
| `analysis.md`, `structured-content.md`, `prompts/infographic.md`, `source.md` | Infographic process files (baoyu-infographic skill) + verified source facts |

## Committed choices

- **Cyan over magenta** as the single neon accent: it already ships in the code (`#22D3EE` in `src/`), reads as CRT-terminal cyan, and complements gold. There is exactly one neon accent.
- **Taglines**: "Voice in. Character out." (primary) · "Talk to your agent. Watch it think." · "Every word, rendered live."
- All stats in the kit come from the repo itself (47 files on disk / 45 git-tracked, 9 components, 2 hooks, 6 tested engines, Duet wiring 7456/7457, gateway 8642). No API keys or tokens appear anywhere; repo credentials are env-based names only.
