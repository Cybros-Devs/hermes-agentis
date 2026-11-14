# Branding — Voxcell

Brand kit **v2.0** for **Voxcell** (repo: `hermes-agentis`) — "Cyberpunk voice-activated phone widget and interactive command-line interface for Hermes Duet with real-time audio-synced animated ASCII character video."

**New in v2.0:** the product gets a name — **Voxcell** (2 syllables: VOX-CELL; vox = voice, cell = the Braille/ASCII character cell it animates; sounds like "voxel", spelled Voxcell). v1.0 branded it "Hermes Duet // Cyber Comms" and is archived untouched in `v1/`.

Style: cyberpunk-terminal meets the Hermes Duet house style. Charcoal `#0e0e0e`, panels `#161616`, off-white `#f3eee3`, gold `#ffd700`/`#ffbf00`/`#cd853f`, one committed neon accent **cyan `#22D3EE`**, hard offset shadows, halftone dots, no soft glows. Core motif: the ASCII/Braille character cell — the logo mark is the Braille character `⠧` (dots 1·2·3·6, the V of Voxcell).

## Contents

| File | What it is |
|---|---|
| `brand.md` | The kit: name system, taglines, voice, palette, typography, logo rules, do/don't |
| `brand-board.html` | One-page board: lockup, swatches, type, art, infographics, stats |
| `logo/wordmark.svg` | Primary dark wordmark (Braille V mark + mono lockup + cyan cursor) |
| `logo/wordmark-light.svg` | Light variant |
| `logo/preview.html` | Dark/light preview with scale checks |
| `banner.jpg` | GitHub social banner concept, 16:9, mark only (generated via agy) |
| `avatar.jpg` | Square avatar / hero mark (generated via agy) |
| `infographic.jpg` | dense-modules × cyberpunk-neon product overview, 16:9 (generated via agy) |
| `infographic-b.png` | periodic-table × cyberpunk-neon — the 11 tested engines, 16:9 (rendered from SVG: `generate-infographic-b.py`) |
| `analysis.md`, `structured-content.md`, `prompts/*.md`, `source.md` | Infographic process files (baoyu-infographic skill) + verified source facts |
| `readme/` | README art set — `hero.jpg` (16:9), `character.jpg` (square), `phone.jpg` (16:9), all generated via agy; prompts in `prompts/readme-*.md` |
| `v1/` | The complete v1.0 kit, archived (name: "Hermes Duet // Cyber Comms") |

## Committed choices

- **Name: Voxcell** — 2 syllables; the pipeline in one word (voice in, cells out). Alternates considered: Agentis (3), Glyphcast (2), Voxterm (2).
- **Cyan over magenta** as the single neon accent: it already ships in the code (`#22D3EE` in `src/`), reads as CRT-terminal cyan, complements gold. Exactly one neon accent.
- **Taglines**: "Voice in. Character out." (primary) · "Talk to your agent. Watch it think." · "The voice, cell by cell." · "Every word, rendered live."
- All stats verified from the repo on 2026-11-14 (104 files on disk / 102 git-tracked, 21,506 LOC, 16 components, 2 hooks, 11 tested engines, Duet wiring 7456/7457, gateway 8642). No API keys or tokens appear anywhere; repo credentials are env-based names only.
- In-app surfaces still read "Hermes Duet // Cyber Comms" (`metadata.json`, `index.html`) — renaming them in code is out of this kit's scope.

## Known defects (generated-image drift)

- `infographic.jpg`: title, tagline, all 6 stats, ports, and the 11-engine list verified correct; one component label is garbled ("Ascii3DViewpozit" for Ascii3DViewport) and one label is clipped at the frame edge. Inherent drift of image-model text rendering — regenerating trades this defect for new random ones, so it ships as-is.
- `infographic-b.png`: agy's image model timed out four times on this layout (full-detail and lean prompts; only low-res partials), so it is rendered programmatically from SVG (`generate-infographic-b.py`, resvg + Consolas) — pixel-exact engine names, exact palette, vision-verified defect-free. The lean prompt is kept at `prompts/infographic-b-lean.md` as process record.
- `readme/hero.jpg`: composition, palette and no-text verified; the face renders as dot-stipple rather than distinct typographic glyphs — inherent agy drift, ships as-is.
- `readme/character.jpg`: vision-verified on-spec (front-facing ASCII portrait in viewport panel, cyan waveform + cursor, flat colors, no text).
- `readme/phone.jpg`: no text, flat palette, hard shadow verified; one subtle luminance vignette behind the phone survives after a targeted regeneration (v1 had a colored gold radial wash, v3 is monochrome only) — within drift tolerance, ships as-is.
