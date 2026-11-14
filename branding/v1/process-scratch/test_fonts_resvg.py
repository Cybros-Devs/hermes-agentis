import resvg_py
import io
from PIL import Image

svg = """<svg xmlns="http://www.w3.org/2000/svg" width="800" height="300">
  <rect width="800" height="300" fill="#0e0e0e"/>
  <text x="40" y="60" fill="#ffd700" font-family="Consolas, monospace" font-size="32" font-weight="bold">Consolas: THE VOXCELL ENGINE BAY</text>
  <text x="40" y="110" fill="#22D3EE" font-family="'Segoe UI', sans-serif" font-size="24">Segoe UI: 11 ENGINES · ALL TESTED · 1 REPO</text>
  <text x="40" y="160" fill="#f3eee3" font-family="Consolas, monospace" font-size="20">&#x2713; .test.ts   Ap  A3  Ac  Bf  Bs  Cs  Cl  Pl  Td  Tt  Uc</text>
</svg>"""

png = resvg_py.svg_to_bytes(svg)
img = Image.open(io.BytesIO(png))
img.convert("RGB").save("test_fonts_resvg.jpg", quality=95)
print("Saved test_fonts_resvg.jpg successfully!")
