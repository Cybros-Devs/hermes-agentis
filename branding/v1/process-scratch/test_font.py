import resvg_py
import io
from PIL import Image

svg = """<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200">
  <rect width="400" height="200" fill="#0e0e0e"/>
  <text x="30" y="80" fill="#ffd700" font-family="Consolas, monospace" font-size="36" font-weight="bold">Ap</text>
  <text x="30" y="130" fill="#f3eee3" font-family="Consolas, monospace" font-size="16">asciiPortraitEngine</text>
  <text x="30" y="160" fill="#22D3EE" font-family="Consolas, monospace" font-size="14">✓ .test.ts</text>
</svg>"""

png_bytes = resvg_py.svg_to_bytes(svg)
img = Image.open(io.BytesIO(png_bytes))
img.convert("RGB").save("test_font.jpg", quality=95)
print("Saved test_font.jpg")
