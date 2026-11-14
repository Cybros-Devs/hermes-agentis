import resvg_py
from PIL import Image
import io

def test_layout():
    W, H = 1920, 1080
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
      <rect width="{W}" height="{H}" fill="#0e0e0e"/>
      <text x="100" y="80" fill="#ffd700" font-family="Consolas" font-size="32" font-weight="bold">TEST</text>
    </svg>"""
    png_bytes = resvg_py.svg_to_bytes(svg, font_dirs=['C:/Windows/Fonts'])
    img = Image.open(io.BytesIO(png_bytes))
    print("Success, size:", img.size)

if __name__ == "__main__":
    test_layout()
