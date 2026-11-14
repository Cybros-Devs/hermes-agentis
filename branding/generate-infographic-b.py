#!/usr/bin/env python3
"""Generate infographic-b (THE VOXCELL ENGINE BAY) as SVG -> PNG.

Why programmatic: agy's image model timed out 4x on this layout (5m/8m print
timeouts, only low-res partials). Rendering from SVG gives pixel-exact engine
names, the exact brand palette, and no text drift. Brand rules per brand.md:
charcoal #0e0e0e field, #161616 cells, off-white #f3eee3 ink, gold #ffd700,
ONE neon cyan #22D3EE, hard +6/+6 black offset shadows, halftone field, no
glow, no gradients, mono for everything technical.

Run:  python generate-infographic-b.py   (writes infographic-b.png)
Facts from src/utils/ — 11 engines, each with a .test.ts. Nothing invented.
"""
import io
import resvg_py
from PIL import Image

W, H = 1920, 1080
CHARCOAL, PANEL, INK, ASH = "#0e0e0e", "#161616", "#f3eee3", "#b9b2a3"
GOLD, CYAN, UNLIT, DOT = "#ffd700", "#22D3EE", "#2a2a2a", "#1f1f1f"

ENGINES = [
    # symbol, name, role, category, stroke
    ("Ap", "asciiPortraitEngine",   "the animated face",     "RENDER", GOLD),
    ("A3", "ascii3dEngine",         "3D viewport field",     "RENDER", GOLD),
    ("Ac", "asciiCharacter",        "sprite animation",      "RENDER", GOLD),
    ("Bf", "brailleFieldEngine",    "dot-cell field",        "RENDER", GOLD),
    ("Bs", "brailleShapesEngine",   "session shapes",        "RENDER", GOLD),
    ("Pl", "portraitLoadingEngine", "loading state",         "IO",     CYAN),
    ("Td", "textDecodeEngine",      "decoded text",          "IO",     CYAN),
    ("Cs", "canvasSessions",        "session nodes",         "OTHERS", INK),
    ("Cl", "cliEngine",             "command terminal",      "OTHERS", INK),
    ("Tt", "threadTrace",           "agent thinking trace",  "OTHERS", INK),
    ("Uc", "uiCustomization",       "UI customizer",         "OTHERS", INK),
]

def cell(x, y, w, h, num, sym, name, role, stroke, dashed=False):
    s = [f'<g>']
    s.append(f'<rect x="{x+6}" y="{y+6}" width="{w}" height="{h}" rx="10" fill="#000000"/>')
    dash = ' stroke-dasharray="8 6"' if dashed else ''
    op = ' stroke-opacity="0.7"' if stroke == INK else ''
    s.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{PANEL}" stroke="{stroke}" stroke-width="1.5"{op}{dash}/>')
    # corner number (atomic-number style)
    s.append(f'<text x="{x+w-24}" y="{y+44}" text-anchor="end" font-family="Consolas" font-size="20" fill="{ASH}">{num:02d}</text>')
    # symbol
    s.append(f'<text x="{x+28}" y="{y+92}" font-family="Consolas" font-weight="bold" font-size="64" fill="{stroke}">{sym}</text>')
    # name + role
    s.append(f'<text x="{x+28}" y="{y+148}" font-family="Consolas" font-size="26" fill="{INK}">{name}</text>')
    s.append(f'<text x="{x+28}" y="{y+180}" font-family="Segoe UI" font-size="21" fill="{ASH}">{role}</text>')
    # .test.ts check — drawn as a path, not a glyph, so no font gamble
    cx, cy = x + 30, y + h - 20
    s.append(f'<path d="M {cx} {cy} l 8 9 l 16 -18" fill="none" stroke="{CYAN}" stroke-width="3.5" stroke-linecap="square"/>')
    s.append(f'<text x="{x+62}" y="{y+h-12}" font-family="Consolas" font-size="21" fill="{CYAN}">.test.ts</text>')
    s.append('</g>')
    return "\n".join(s)

svg = []
svg.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">')
# halftone field
svg.append(f'<defs><pattern id="ht" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="1.3" fill="{DOT}"/></pattern></defs>')
svg.append(f'<rect width="{W}" height="{H}" fill="{CHARCOAL}"/>')
svg.append(f'<rect width="{W}" height="{H}" fill="url(#ht)"/>')

# --- header: V-cell mark + title ---
svg.append(f'<rect x="84" y="62" width="84" height="84" rx="10" fill="#000000"/>')
svg.append(f'<rect x="78" y="56" width="84" height="84" rx="10" fill="{PANEL}" stroke="{INK}" stroke-width="1.5"/>')
for cx, cy, lit in [(103, 76, 1), (103, 98, 1), (103, 120, 1), (137, 76, 0), (137, 98, 1), (137, 120, 0)]:
    svg.append(f'<circle cx="{cx}" cy="{cy}" r="5.5" fill="{GOLD if lit else UNLIT}"/>')
svg.append(f'<text x="196" y="108" font-family="Consolas" font-weight="bold" font-size="46" fill="{INK}">THE <tspan fill="{GOLD}">VOXCELL</tspan> ENGINE BAY</text>')
svg.append(f'<text x="196" y="150" font-family="Consolas" font-size="22" fill="{ASH}">11 ENGINES &#183; ALL TESTED &#183; 1 REPO &#183; every one carries .test.ts</text>')
# corner metadata
svg.append(f'<text x="{W-72}" y="76" text-anchor="end" font-family="Consolas" font-size="17" fill="{ASH}">ENG-BAY / MOD-B</text>')
svg.append(f'<text x="{W-72}" y="102" text-anchor="end" font-family="Consolas" font-size="17" fill="{ASH}">hermes-agentis / src/utils</text>')
svg.append(f'<g stroke="{ASH}" stroke-width="4">')
for i in range(18):
    x0 = W - 72 - i * 14
    ln = 10 if i % 3 else 22
    svg.append(f'<line x1="{x0-ln}" y1="126" x2="{x0}" y2="126"/>')
svg.append('</g>')

# --- grid: 4 columns x 3 rows, 11 engines + 1 legend cell ---
m, gap = 84, 22
cw = (W - 2 * m - 3 * gap) // 4          # 429
ch = 224
rows_y = [228, 228 + ch + gap, 228 + 2 * (ch + gap)]
order = ENGINES[:5] + [ENGINES[5], ENGINES[6], ENGINES[7], ENGINES[8]] + [ENGINES[9], ENGINES[10], None]
for i, e in enumerate(order):
    r, c = divmod(i, 4)
    x, y = m + c * (cw + gap), rows_y[r]
    if e is None:  # legend / key cell
        svg.append(f'<rect x="{x+6}" y="{y+6}" width="{cw}" height="{ch}" rx="10" fill="#000000"/>')
        svg.append(f'<rect x="{x}" y="{y}" width="{cw}" height="{ch}" rx="10" fill="{CHARCOAL}" stroke="{UNLIT}" stroke-width="1.5" stroke-dasharray="8 6"/>')
        svg.append(f'<text x="{x+28}" y="{y+56}" font-family="Consolas" font-size="24" fill="{ASH}">LEGEND</text>')
        for j, (col, lab, cnt) in enumerate([(GOLD, "RENDER", "5"), (CYAN, "IO", "2"), (INK, "OTHERS", "4")]):
            ly = y + 96 + j * 34
            svg.append(f'<line x1="{x+28}" y1="{ly}" x2="{x+76}" y2="{ly}" stroke="{col}" stroke-width="5"/>')
            svg.append(f'<text x="{x+92}" y="{ly+8}" font-family="Consolas" font-size="22" fill="{INK}">{lab} &#183; {cnt}</text>')
        svg.append(f'<path d="M {x+28} {y+ch-28} l 8 9 l 16 -18" fill="none" stroke="{CYAN}" stroke-width="3.5" stroke-linecap="square"/>')
        svg.append(f'<text x="{x+60}" y="{y+ch-20}" font-family="Consolas" font-size="22" fill="{INK}">11 / 11 TESTED</text>')
    else:
        svg.append(cell(x, y, cw, ch, i + 1, e[0], e[1], e[2], e[4]))

# scanline hints (crisp 1px, never blurred)
for y in (206, 934, 956):
    svg.append(f'<line x1="{m}" y1="{y}" x2="{W-m}" y2="{y}" stroke="#242424" stroke-width="1"/>')

# --- footer ---
svg.append(f'<text x="{m}" y="{H-48}" font-family="Consolas" font-size="22" fill="{CYAN}">github.com/DevvGwardo/hermes-agentis</text>')
svg.append(f'<text x="{W-m}" y="{H-48}" text-anchor="end" font-family="Consolas" font-size="22" fill="{GOLD}">VOICE IN. CHARACTER OUT.</text>')
svg.append(f'<text x="{W-m}" y="{H-20}" text-anchor="end" font-family="Consolas" font-size="15" fill="{ASH}">KIT v2.0 &#183; 2026-11-14 &#183; 1920x1080 &#183; SVG RENDER, NO MODEL DRIFT</text>')
svg.append('</svg>')
svg = "\n".join(svg)

png = resvg_py.svg_to_bytes(svg, font_dirs=['C:/Windows/Fonts'], monospace_family='Consolas',
                            sans_serif_family='Segoe UI', shape_rendering='geometric_precision',
                            text_rendering='geometric_precision')
img = Image.open(io.BytesIO(png)).convert("RGB")
img.save("infographic-b.png", optimize=True)
print("rendered infographic-b.png", img.size)
