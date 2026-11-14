# Voxcell — Brand Kit v2.0

Repo: DevvGwardo/hermes-agentis · Kit date: 2026-11-14
Supersedes v1.0 (archived whole in `branding/v1/`): v1 branded it "Hermes Duet // Cyber Comms"; v2 gives the product a real name — **Voxcell** — two syllables. Style thesis unchanged: **cyberpunk-terminal meets the Hermes Duet house style.** Charcoal field, gold signal, one neon accent, hard offset shadows, halftone dots, ASCII/Braille character motif. No soft glows, ever.

---

## 1. The name

**Voxcell** · VOX-CELL · 2 syllables.

- **Vox** — Latin, voice. The input. You talk; nothing else touches the product.
- **cell** — the Braille/ASCII character cell, the atom the whole product is made of. The logo mark, the portrait engine, the animated face: all cells.
- The name **is** the pipeline: voice in, cells out. Bonus resonance: it sounds like *voxel*, the unit of a rendered picture — a picture here made of character cells. The echo is deliberate; the spelling stays Voxcell.

Naming system:

| Context | Treatment | Rule |
|---|---|---|
| Product name (everywhere) | `Voxcell` | One word, capital V, double L. |
| Formal lockup (docs, README title) | `Voxcell // for Hermes Duet` | The `//` is part of it and is always gold |
| Repo / package / code contexts | `hermes-agentis` | Unchanged; lowercase, hyphenated, monospace in terminal contexts |
| Terminal handle / CLI | `voxcell` | Prompt-style shorthand |
| Speech | "vox-cell" | Two beats, stress on VOX |

Never write "VoxCell", "Vox Cell", "VOXCELL" in body text (caps are for the wordmark and stat numerals), and never adopt the "Voxel" spelling — the homophone is spoken resonance, not brand.
The product is a client **of** Hermes Duet — say "for Hermes Duet", never "by Hermes Duet".

Adoption note: in-app surfaces still read "Hermes Duet // Cyber Comms" (`metadata.json`, `index.html` title). Renaming them is a code change, deliberately out of this kit's scope.

## 2. Taglines

1. **Voice in. Character out.** (primary — the pipeline in three words; even truer under the new name)
2. **Talk to your agent. Watch it think.** (developer-facing; the thinking trace is a real feature)
3. **The voice, cell by cell.** (social; the name tagline)
4. **Every word, rendered live.** (release notes)

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

**There is exactly one neon accent: cyan `#22D3EE`.** Magenta is banned. Ratio: 60% charcoal / 30% panel+off-white / 10% gold+cyan, gold leading, cyan reserved for "alive" states.

Light mode: field `#f3eee3`, ink `#0e0e0e`, gold → bronze `#cd853f`, cyan → `#0891b2`, panel `#f7f4ec` with `#0e0e0e` borders.

## 5. Typography

| Role | Face | Weights |
|---|---|---|
| UI text, body, labels | Inter (system sans fallback) | 400 / 600 |
| Terminal, wordmark, numbers, code | JetBrains Mono | 400 / 600 / 700 |

- Wordmark: JetBrains Mono **600**, uppercase, positive tracking. Numbers and stats always mono.
- Never set body copy in mono; never set the wordmark in a proportional sans.

## 6. Logo

### Concept
The mark is the **Braille character `⠧` (dots 1·2·3·6)** — the V of Voxcell in the same 2×3 dot cell the product animates its character video with. Left column full, one dot mid-right: a V you can *feel*. It sits in a bordered panel with a hard offset shadow, next to the monospace lockup and a cyan prompt cursor — one line of a terminal that is listening.

### Construction rules
- Dot grid: 2 columns × 3 rows. Dot diameter 1u, pitch 3u center-to-center, grid optically centered in the panel.
- Panel: `#161616`, border 1.5px `#f3eee3`, corner radius 8.
- Shadow: **hard offset only**, +6/+6, solid `#000`, no blur. The house shadow; it replaces every glow.
- Lit dots: gold `#ffd700` (light mode: bronze `#cd853f`). Unlit dots: `#2a2a2a` — empty positions stay visible so the cell structure is legible.
- Cyan prompt cursor (`#22D3EE`, ~0.5u × 3u) appears only in the full lockup, never in the mark alone.
- Minimum size: 24px panel height. Clear space: one full dot cell on all sides.
- Variants: dark (primary), light, single-ink mono. Files: `logo/wordmark.svg`, `logo/wordmark-light.svg`.

### What never happens
No rotation, no gradient fills on dots, no glow, no blur, no animating the dots. The cursor may blink in-product; in print and SVG it is static.

## 7. Texture and effects

- **Halftone dots**: 3px pitch, 4–6% ink opacity, charcoal fields only.
- **Hard offset shadows** (6/6 solid, never blurred) on every raised element.
- **Crisp borders**: 1.5px `#f3eee3` at 60–100% opacity.
- Neon cyan is a **flat color**, never a glow. Cyberpunk without the bloom.

## 8. Do / Don't

**Do**
- Charcoal field + gold signal + cyan "live" states, 60/30/10.
- Monospace for anything terminal, numeric, or wordmark.
- Use the Braille cell / ASCII character field as texture (rows of `⠧⠿·` at low opacity).
- Pair the mark with real terminal artifacts: prompts, carets, status lines.

**Don't**
- No soft glows, blurs, or bloom — flat neon only.
- No second neon accent (no magenta, no electric purple, no default blue).
- No gradients as a primary device; no off-white text on gold.
- Don't stretch, rotate, outline, or re-space the wordmark.
- Never write the name as "Voxel", "VoxCell", or "Vox Cell".
- No photography; this brand is drawn, not shot.
- No text or watermarks in generated hero art — the mark carries the name.

## 9. Applications in this kit

| Asset | File | Notes |
|---|---|---|
| Wordmark (dark, primary) | `logo/wordmark.svg` | V-cell + VOXCELL lockup + cyan cursor |
| Wordmark (light) | `logo/wordmark-light.svg` | For light surfaces |
| Logo preview | `logo/preview.html` | Light/dark, multiple sizes |
| GitHub social banner | `banner.jpg` | 16:9 concept, generated via agy, mark only |
| Avatar / hero mark | `avatar.jpg` | Square, generated via agy, mark only |
| Infographic A — product overview | `infographic.jpg` | dense-modules × cyberpunk-neon, 16:9 |
| Infographic B — engine bay | `infographic-b.png` | periodic-table × cyberpunk-neon, 16:9 — SVG render, pixel-exact text |
| Brand board | `brand-board.html` | One-page kit summary, phone-friendly |

## 10. Facts policy

Every number in this kit comes from the repo (104 files / 102 git-tracked, 21,506 LOC, 16 components, 2 hooks, 11 tested engines, Duet wiring 7456/7457, gateway 8642 — verified 2026-11-14, see `source.md`). No API keys or tokens appear anywhere; repo credentials are env-based names only.
