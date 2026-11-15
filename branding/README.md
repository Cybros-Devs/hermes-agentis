# Branding — Voxcell

Brand kit **v2.1** for **Voxcell** (repo: `hermes-agentis`) — "Cyberpunk voice-activated phone widget and interactive command-line interface for Hermes Duet with real-time audio-synced animated ASCII character video."

**New in v2.1:** the branding now uses the **actual project character** — the retro-shojo manga portrait shipped at `public/assets/aistudio/image_9fdb5ec4.png` (12-frame sprite sheet `image_f0b5dc2e.png`), rendered in-product as a Braille dither — and the palette is aligned to the app's real theme: abyss green `#050C0A`, sage/mint ink, single accent emerald `#34D399`. v2.0's gold/cyan palette is retired. v1.0 ("Hermes Duet // Cyber Comms") is archived untouched in `v1/`.

Style: retro-shojo ink meets the terminal. Abyss green `#050C0A` field, panels `#0A1410`, off-white `#ECF3F0`, sage `#8FA399`, character highlights mint `#A7F3D0`, one committed accent **emerald `#34D399`**, hard offset shadows, halftone dots, no soft glows. Core motif: the ASCII/Braille character cell — the logo mark is the Braille character `⠧` (dots 1·2·3·6, the V of Voxcell).

## Contents

| File | What it is |
|---|---|
| `brand.md` | The kit: name system, taglines, voice, palette, typography, logo rules, do/don't |
| `brand-board.html` | One-page board: lockup, swatches, type, art, infographics, stats |
| `logo/wordmark.svg` | Primary dark wordmark (Braille V mark + mono lockup + emerald cursor) |
| `logo/wordmark-light.svg` | Light variant |
| `logo/preview.html` | Dark/light preview with scale checks |
| `banner.jpg` | GitHub social banner, 16:9, the character + Braille-dither wave (generated via agy) |
| `avatar.jpg` | Square avatar / hero mark, the character in her ink style (generated via agy) |
| `infographic.jpg` | dense-modules × bold-graphic product overview, 16:9, the character, project palette (generated via agy) |
| `infographic-b.png` | periodic-table × cyberpunk-neon — 11 engines as of v2.0, kept as process record (repo now ships 14); SVG render: `generate-infographic-b.py` |
| `analysis.md`, `structured-content.md`, `prompts/*.md`, `source.md` | Infographic process files (baoyu-infographic skill) + verified source facts |
| `readme/` | README art set — `hero.jpg`, `character.jpg`, `phone.jpg`, `terminal.jpg` (16:9/square), all generated via agy; prompts in `prompts/readme-*.md` |
| `v1/` | The complete v1.0 kit, archived (name: "Hermes Duet // Cyber Comms") |

## Committed choices

- **Name: Voxcell** — 2 syllables; the pipeline in one word (voice in, cells out). Alternates considered: Agentis (3), Glyphcast (2), Voxterm (2).
- **Accent: emerald `#34D399`** as the single accent — it ships in the code (`--ui-accent` in `src/index.css`), reads as the app's own "live" color, and matches the sage/mint character tones. v2.0's cyan (and gold) are retired.
- **Taglines**: "Voice in. Character out." (primary) · "Talk to your agent. Watch it think." · "The voice, cell by cell." · "Every word, rendered live."
- All stats verified from the repo on 2026-11-14 after two cybros merges (142 git-tracked files, 27,143 LOC, 16 components, 2 hooks, 14 tested engines, Duet wiring 7456/7457, gateway 8642). No API keys or tokens appear anywhere; repo credentials are env-based names only.
- In-app surfaces still read "Hermes Duet // Cyber Comms" (`metadata.json`, `index.html`) — renaming them in code is out of this kit's scope.

## Known defects (generated-image drift)

- `infographic.jpg` (v2.0, superseded): title, tagline, all 6 stats, ports, and the 11-engine list verified correct; one component label was garbled ("Ascii3DViewpozit" for Ascii3DViewport) and one label clipped at the frame edge — inherent drift of image-model text rendering. The v2.1 character-based regeneration is queued (see below).
- `infographic-b.png`: agy's image model timed out four times on this layout (full-detail and lean prompts; only low-res partials), so it is rendered programmatically from SVG (`generate-infographic-b.py`, resvg + Consolas) — pixel-exact engine names, exact palette, vision-verified defect-free. The lean prompt is kept at `prompts/infographic-b-lean.md` as process record.
- `readme/hero.jpg`, `readme/character.jpg`, `readme/phone.jpg`, `readme/terminal.jpg`, `branding/avatar.jpg`, `branding/banner.jpg` (v2.1, the character): vision-verified — same likeness across all six (retro-shojo ink, black curled bob, blunt bangs, headband, choker), project palette, no legible text or watermarks, no glow (phone: one faint monochrome vignette, within drift tolerance).
- `infographic.jpg` (v2.1, the character): title, subtitle, all six module headers, all stats (142 FILES · 27,143 LOC · 16 COMPONENTS · 14 ENGINES · 2 HOOKS · 1 CHARACTER), ports, and all 14 engine names verified correct; character present in MOD-1 and MOD-6. Known drift, ships as-is per policy: one component typo ("PhoneVideoMidget" for PhoneVideoWidget), "real-time" duplicated in MOD-1, one sub-label repeated from ANALYSER into RENDER, one garbled footer decoration, and an invented "SYS: 1.0.4" metadata chrome line.
