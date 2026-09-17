#!/usr/bin/env python3
"""Rasterize the canonical PI-Desktop mark into its tracked 1024px asset.

``apps/desktop/build/icon-mark.svg`` is the brand source of truth and
``apps/desktop/build/icon_1024.png`` is its committed rasterization. The raster
stays a tracked file on purpose: every platform asset — the macOS Dock icon,
the installer icons, and the renderer marks — has to agree on one authored
image, so `scripts/make-icon.py` derives from the PNG and never rewrites it.

Run: python3 scripts/make-canonical-icon.py
"""

from __future__ import annotations

import re
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "apps" / "desktop" / "build"
SOURCE = BUILD / "icon-mark.svg"
TARGET = BUILD / "icon_1024.png"

VIEW_BOX = 800
BASE = 1024
# Straight edges only, so an exact 4x render downsampled once is enough to
# keep the corners clean without a real rasterizer.
SUPERSAMPLE = 4


def _attribute(tag: str, name: str) -> str:
    match = re.search(rf'{name}="([^"]*)"', tag)
    if match is None:
        raise ValueError(f"<{tag.split()[0][1:]}> is missing {name}")
    return match.group(1)


def _rgba(value: str) -> tuple[int, int, int, int]:
    """Read the ``#rgb`` / ``#rrggbb`` fills the mark is authored with."""
    digits = value.lstrip("#")
    if len(digits) == 3:
        digits = "".join(character * 2 for character in digits)
    if len(digits) != 6:
        raise ValueError(f"unsupported fill colour: {value}")
    return (
        int(digits[0:2], 16),
        int(digits[2:4], 16),
        int(digits[4:6], 16),
        255,
    )


def _subpaths(data: str) -> list[list[tuple[float, float]]]:
    """Split one path's ``d`` into polygons.

    Only absolute M/H/V/L/Z is accepted: the canonical mark is drawn with
    straight edges, and guessing at a curve would ship a wrong icon instead of
    failing the build.
    """
    tokens = re.findall(r"[MHLVZ]|-?(?:\d+\.?\d*|\.\d+)", data)
    # Anything the tokenizer did not claim (a curve command, an exponent, a
    # relative move) must fail the build rather than rasterize as straight
    # lines that silently differ from the authored mark.
    leftover = re.sub(r"[MHLVZ]|-?(?:\d+\.?\d*|\.\d+)|[\s,]+", "", data)
    if leftover:
        raise ValueError(f"unsupported path data: {leftover}")
    if not tokens:
        raise ValueError("path data is empty")
    polygons: list[list[tuple[float, float]]] = []
    current: list[tuple[float, float]] = []
    command = ""
    x = y = 0.0
    index = 0
    while index < len(tokens):
        token = tokens[index]
        if token in ("M", "H", "V", "L", "Z"):
            command = token
            index += 1
            if command == "Z":
                if len(current) > 2:
                    polygons.append(current)
                current = []
                continue
        if command == "M":
            x, y = float(tokens[index]), float(tokens[index + 1])
            index += 2
            if len(current) > 2:
                polygons.append(current)
            current = [(x, y)]
        elif command == "L":
            x, y = float(tokens[index]), float(tokens[index + 1])
            index += 2
            current.append((x, y))
        elif command == "H":
            x = float(tokens[index])
            index += 1
            current.append((x, y))
        elif command == "V":
            y = float(tokens[index])
            index += 1
            current.append((x, y))
        else:
            raise ValueError(f"unsupported path command: {command or token}")
    if len(current) > 2:
        polygons.append(current)
    return polygons


def main() -> None:
    if not SOURCE.is_file():
        raise FileNotFoundError(f"canonical mark is missing: {SOURCE}")
    svg = SOURCE.read_text(encoding="utf-8")

    plate = re.search(r"<rect[^>]*>", svg)
    if plate is None:
        raise ValueError("the canonical mark must declare its plate rect")
    plate_tag = plate.group(0)
    plate_width = float(_attribute(plate_tag, "width"))
    plate_height = float(_attribute(plate_tag, "height"))
    if plate_width != VIEW_BOX or plate_height != VIEW_BOX:
        raise ValueError("the plate must cover the whole viewBox")

    side = BASE * SUPERSAMPLE
    scale = side / VIEW_BOX
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    ImageDraw.Draw(canvas).rounded_rectangle(
        (0, 0, side - 1, side - 1),
        radius=float(_attribute(plate_tag, "rx")) * scale,
        fill=_rgba(_attribute(plate_tag, "fill")),
    )

    paths = re.findall(r'<path[^>]*\sd="([^"]*)"', svg, re.DOTALL)
    if not paths:
        raise ValueError("the canonical mark must declare at least one path")
    ink = _rgba(_attribute(re.search(r"<path[^>]*>", svg).group(0), "fill"))
    mask = Image.new("L", (side, side), 0)
    draw = ImageDraw.Draw(mask)
    for data in paths:
        for position, polygon in enumerate(_subpaths(re.sub(r"\s+", " ", data))):
            # First subpath is the shape, every later one is a hole in it:
            # the mark is authored as outer-boundary-then-hole.
            draw.polygon(
                [(px * scale, py * scale) for px, py in polygon],
                fill=255 if position == 0 else 0,
            )
    layer = Image.new("RGBA", (side, side), ink)
    layer.putalpha(mask)
    canvas = Image.alpha_composite(canvas, layer)

    canvas.resize((BASE, BASE), Image.LANCZOS).save(TARGET)
    print(f"used {SOURCE}")
    print(f"wrote {TARGET}")


if __name__ == "__main__":
    main()
