import resvg_py
import io
from PIL import Image

svg = """<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
  <rect width="200" height="100" fill="#0e0e0e"/>
  <text x="20" y="50" fill="#ffd700" font-family="monospace" font-size="20">HELLO</text>
</svg>"""

png_bytes = resvg_py.svg_to_bytes(svg)
img = Image.open(io.BytesIO(png_bytes))
print(f"Success! Rendered size: {img.size}, mode: {img.mode}")
