# Voxcell — Brand Kit v2.1

Repo: DevvGwardo/hermes-agentis · Kit date: 2026-11-14
v2.1 supersedes v2.0 in place: all art now features the **actual project character** (the retro-shojo manga portrait at `public/assets/aistudio/image_9fdb5ec4.png`, animated from the 12-frame sprite sheet `image_f0b5dc2e.png` and rendered live as a Braille dither), and the palette is aligned to the product's own theme — near-black green `#050C0A`, sage/mint ink, emerald `#34D399` as the single accent (the colors the app actually ships in `src/index.css` and `AsciiPortraitCanvas.tsx`). v2.0's charcoal/gold/cyan palette is retired. Style thesis: **retro-shojo ink meets the terminal.** Hard offset shadows, halftone dots, Braille/ASCII character motif. No soft glows, ever.

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

## 3. The character (v2.1)

Voxcell's face is not an invented mascot — it is the actual character the product ships:

- **Source art**: `public/assets/aistudio/image_9fdb5ec4.png` — a young woman in 1960s retro shojo manga 1-bit ink style: shoulder-length black hair with outward-curled ends, thick blunt bangs with a jagged white highlight band, large heavily-lashed retro anime eyes, small upturned nose, full lips, white headband, black choker, white collared garment; bust-up, three-quarter view.
- **Animation**: the 12-frame sprite sheet `image_f0b5dc2e.png` (4×3 grid, same pose, blinks + lip-sync mouth shapes).
- **In-product render**: Braille dot-matrix + Bayer dither in white and sage on the abyss-green field, mint `#A7F3D0` when listening (see `asciiPortraitEngine.ts`, `AsciiPortraitCanvas.tsx`, and `tools/blueprint/` captures).
- **Brand rule**: every generated asset must use HER exact likeness — pass the reference images to the generator; never substitute a generic face. Her ink style (bold line weights, 1-bit contrast) IS the house illustration style.

## 4. Brand voice — 5 bullets

- **Terminal-concise.** One line beats a paragraph. If it fits in a prompt, write it like one.
- **Signal over hype.** State what the thing does; skip adjectives and "revolutionary" fog.
- **Warm machine.** Cyberpunk on the outside, Hermes house warmth underneath — gold accents, human pacing, no menace.
- **Name the engine.** Technical truth in plain words. Say "Braille portrait rendered at 60fps" not "stunning visuals".
- **Deadpan play.** Monospace wit (`$ speak --render`), at most one joke per screen.

## 5. Palette

| Role | Name | Hex | Usage |
|---|---|---|---|
| Base | Abyss green | `#050C0A` | App field (`src/index.css`). ~60% of any composition |
| Surface | Panel | `#0A1410` | Cards, terminal chrome, logo panel, portrait viewport |
| Ink | Off-white | `#ECF3F0` | Primary text (`--ui-text`), crisp 1.5px borders |
| Ink secondary | Sage | `#8FA399` | Secondary text, metadata, midtone dither |
| Character midtone | Sage green | `#7E968F` | Portrait low-tone (`AsciiPortraitCanvas`) |
| Character highlight | Mint | `#A7F3D0` | Listening state, lit Braille dots, waveform, the `//` |
| Character bright | White | `#FFFFFF` | Dense portrait highlights (headband, cheek, nose bridge) |
| Accent (the ONE) | Emerald | `#34D399` | Live/active only: prompt cursor, "listening" mic, `--ui-accent` |

**There is exactly one accent: emerald `#34D399`** — it ships in the product as `--ui-accent` (`src/index.css`). Gold and cyan are retired with v2.0; magenta stays banned. Ratio: 60% abyss green / 30% panel+off-white / 10% mint+emerald, mint leading, emerald reserved for "alive" states.

Light mode: field `#F2F7F4`, ink `#0A1410`, mint → emerald-dark `#059669`, panel `#F2F7F4` with `#0A1410` borders.

## 6. Typography

| Role | Face | Weights |
|---|---|---|
| UI text, body, labels | Inter (system sans fallback) | 400 / 600 |
| Terminal, wordmark, numbers, code | JetBrains Mono | 400 / 600 / 700 |

- Wordmark: JetBrains Mono **600**, uppercase, positive tracking. Numbers and stats always mono.
- Never set body copy in mono; never set the wordmark in a proportional sans.

## 7. Logo

### Concept
The mark is the **Braille character `⠧` (dots 1·2·3·6)** — the V of Voxcell in the same 2×3 dot cell the product animates its character video with. Left column full, one dot mid-right: a V you can *feel*. It sits in a bordered panel with a hard offset shadow, next to the monospace lockup and an emerald prompt cursor — one line of a terminal that is listening.

### Construction rules
- Dot grid: 2 columns × 3 rows. Dot diameter 1u, pitch 3u center-to-center, grid optically centered in the panel.
- Panel: `#0A1410`, border 1.5px `#ECF3F0`, corner radius 8.
- Shadow: **hard offset only**, +6/+6, solid `#000`, no blur. The house shadow; it replaces every glow.
- Lit dots: mint `#A7F3D0` (light mode: emerald-dark `#059669`). Unlit dots: `#2A3A30` — empty positions stay visible so the cell structure is legible.
- Emerald prompt cursor (`#34D399`, ~0.5u × 3u) appears only in the full lockup, never in the mark alone.
- Minimum size: 24px panel height. Clear space: one full dot cell on all sides.
- Variants: dark (primary), light, single-ink mono. Files: `logo/wordmark.svg`, `logo/wordmark-light.svg`.

### What never happens
No rotation, no gradient fills on dots, no glow, no blur, no animating the dots. The cursor may blink in-product; in print and SVG it is static.

## 8. Texture and effects

- **Halftone dots**: 3px pitch, 4–6% ink opacity, abyss-green fields only.
- **Hard offset shadows** (6/6 solid, never blurred) on every raised element.
- **Crisp borders**: 1.5px `#ECF3F0` at 60–100% opacity.
- Emerald is a **flat color**, never a glow. Cyberpunk without the bloom.

## 9. Do / Don't

**Do**
- Abyss-green field + mint signal + emerald "live" states, 60/30/10.
- Monospace for anything terminal, numeric, or wordmark.
- Use the Braille cell / ASCII character field as texture (rows of `⠧⠿·` at low opacity).
- Pair the mark with real terminal artifacts: prompts, carets, status lines.

**Don't**
- No soft glows, blurs, or bloom — flat neon only.
- No second accent (no magenta, no electric purple, no default blue; gold and cyan retired with v2.0).
- No gradients as a primary device; no off-white text on gold.
- Don't stretch, rotate, outline, or re-space the wordmark.
- Never write the name as "Voxel", "VoxCell", or "Vox Cell".
- No photography; this brand is drawn, not shot.
- No text or watermarks in generated hero art — the mark carries the name.

## 10. Applications in this kit

| Asset | File | Notes |
|---|---|---|
| Wordmark (dark, primary) | `logo/wordmark.svg` | V-cell + VOXCELL lockup + emerald cursor (v2.1 palette) |
| Wordmark (light) | `logo/wordmark-light.svg` | For light surfaces (v2.1 palette) |
| Logo preview | `logo/preview.html` | Light/dark, multiple sizes |
| GitHub social banner | `banner.jpg` | 16:9, generated via agy, the character + Braille-dither wave |
| Avatar / hero mark | `avatar.jpg` | Square, generated via agy, the character in her ink style |
| Infographic A — product overview | `infographic.jpg` | dense-modules × bold-graphic, project palette, the character, 16:9 |
| Infographic B — engine bay | `infographic-b.png` | periodic-table × cyberpunk-neon — 14 tested engines, 16:9 (SVG render, pixel-exact text; v2.0 palette, kept as process record) |
| Brand board | `brand-board.html` | One-page kit summary, phone-friendly (v2.0 palette) |
| README art | `readme/` | hero.jpg, character.jpg, phone.jpg — the character, via agy |

## 11. Facts policy

Every number in this kit comes from the repo (142 git-tracked files, 27,143 LOC in ts/tsx/css, 16 components, 2 hooks, 14 tested engines in `src/utils/`, Duet wiring 7456/7457, gateway 8642 — recounted 2026-11-14 after the two cybros merges; see `source.md` for the v2.0 snapshot). The character's identity comes from the shipped asset `public/assets/aistudio/image_9fdb5ec4.png` and its 12-frame sprite sheet — not invented. No API keys or tokens appear anywhere; repo credentials are env-based names only.
