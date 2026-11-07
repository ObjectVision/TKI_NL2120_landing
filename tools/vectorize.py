"""Vectorize the hero illustration and logo from the concept art.

Usage: python tools/vectorize.py
Writes assets/images/hero.svg and assets/images/logo.svg.
"""
import re
import tempfile
from pathlib import Path

import vtracer
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "conceptart" / "landing_v1.jpeg"
OUT = ROOT / "assets" / "images"

HERO_BOX = (600, 82, 1448, 540)   # x0, y0, x1, y1 in source pixels
HERO_MASKS = [(0, 60, 82, 135),   # tail of the heading ("en")
              (0, 212, 125, 332)]  # tail of the intro text
LOGO_BOX = (44, 3, 112, 71)


def trace(img: Image.Image, scale: int, out: Path, post=None, **opts) -> None:
    w, h = img.size
    big = img.resize((w * scale, h * scale), Image.LANCZOS)
    with tempfile.TemporaryDirectory() as tmp:
        png = Path(tmp) / "in.png"
        svg = Path(tmp) / "out.svg"
        big.save(png)
        vtracer.convert_image_to_svg_py(str(png), str(svg), **opts)
        text = svg.read_text(encoding="utf-8")
    # Make it scalable: drop fixed size, add viewBox.
    text = re.sub(
        r'<svg[^>]*>',
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w * scale} {h * scale}" '
        f'preserveAspectRatio="xMidYMid meet" aria-hidden="true">',
        text, count=1,
    )
    text = re.sub(r'<\?xml[^>]*\?>\s*|<!--.*?-->\s*', '', text, flags=re.S)
    if post:
        text = post(text, w * scale, h * scale)
    out.write_text(text, encoding="utf-8")
    print(f"{out.relative_to(ROOT)}: {out.stat().st_size / 1024:.0f} KB")


def drop_background(text: str, w: int, h: int) -> str:
    """Remove the first path when it is the full-canvas background rectangle."""
    m = re.search(r'<path d="(M0 0 [^"]*)"[^>]*/>\s*', text)
    if m and f" {w} 0 " in m.group(1) and f" {w} {h} " in m.group(1) and "M" not in m.group(1)[1:]:
        text = text[:m.start()] + text[m.end():]
    return text


def clip_circle(text: str, w: int, h: int) -> str:
    """Clip the logo to its round badge so the corners are transparent."""
    r = min(w, h) / 2 - 14
    head, rest = text.split(">", 1)
    body = rest.rsplit("</svg>", 1)[0]
    return (f'{head}><defs><clipPath id="logo-clip"><circle cx="{w/2}" cy="{h/2}" r="{r}"/>'
            f'</clipPath></defs><g clip-path="url(#logo-clip)">{body}</g></svg>')


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    src = Image.open(SRC).convert("RGB")

    hero = src.crop(HERO_BOX)
    bg = src.getpixel((300, 500))  # plain hero background colour
    draw = ImageDraw.Draw(hero)
    for box in HERO_MASKS:
        draw.rectangle(box, fill=bg)
    trace(hero, 2, OUT / "hero.svg",
          colormode="color", hierarchical="stacked", mode="spline",
          filter_speckle=8, color_precision=6, layer_difference=20,
          corner_threshold=60, length_threshold=4.0, splice_threshold=45,
          path_precision=1, post=drop_background)

    logo = src.crop(LOGO_BOX)
    trace(logo, 6, OUT / "logo.svg",
          colormode="color", hierarchical="stacked", mode="spline",
          filter_speckle=10, color_precision=5, layer_difference=32,
          corner_threshold=60, length_threshold=4.0, splice_threshold=45,
          path_precision=1, post=clip_circle)


if __name__ == "__main__":
    main()
