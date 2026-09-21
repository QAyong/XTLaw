#!/usr/bin/env python3
"""Derive XTLaw platform icon resources from the canonical logo.

The tracked ``apps/desktop/build/icon_1024.png`` file is the brand source of
truth. This script preserves that file and emits:

  apps/desktop/build/icon.iconset/  - all macOS iconset sizes
  apps/desktop/build/icon.icns      - via `iconutil` (macOS only)
  apps/desktop/build/icon.ico       - multi-size Windows application icon
  apps/desktop/build/icon.png       - 512px Windows/Linux package icon
  apps/desktop/build/tray-icon-mac.png - transparent macOS template icon

Run: python3 scripts/make-icon.py
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "apps" / "desktop" / "build"
SOURCE = BUILD / "icon_1024.png"

BASE = 1024


def windows_taskbar_variant(master: Image.Image) -> Image.Image:
    """Optically enlarge the white mark for Windows taskbar rendering."""
    luminance = master.convert("L")
    mark_alpha = ImageChops.multiply(
        luminance.point(lambda value: 255 if value > 32 else 0),
        master.getchannel("A"),
    )
    mark_bounds = mark_alpha.getbbox()
    if mark_bounds is None:
        raise ValueError("canonical logo does not contain a white XTLaw mark")

    mark = Image.new("RGBA", master.size, (0, 0, 0, 0))
    mark.paste(master, (0, 0), mark_alpha)
    mark = mark.crop(mark_bounds)
    enlarged_size = (
        round(mark.width * 1.12),
        round(mark.height * 1.12),
    )
    enlarged_mark = mark.resize(enlarged_size, Image.LANCZOS)

    background = master.copy()
    background.paste((0, 0, 0, 0), (0, 0), mark_alpha)
    offset = (
        (master.width - enlarged_mark.width) // 2,
        (master.height - enlarged_mark.height) // 2,
    )
    background.alpha_composite(enlarged_mark, offset)
    return background


def main() -> None:
    if not SOURCE.is_file():
        raise FileNotFoundError(f"canonical logo is missing: {SOURCE}")

    with Image.open(SOURCE) as source:
        master = source.convert("RGBA")
    if master.size != (BASE, BASE):
        raise ValueError(
            f"canonical logo must be {BASE}x{BASE}, got {master.width}x{master.height}"
        )

    BUILD.mkdir(parents=True, exist_ok=True)
    windows_icon = BUILD / "icon.ico"
    windows_master = windows_taskbar_variant(master)
    windows_master.save(
        windows_icon,
        format="ICO",
        sizes=[
            (16, 16),
            (24, 24),
            (32, 32),
            (48, 48),
            (64, 64),
            (128, 128),
            (256, 256),
        ],
    )
    package_icon = BUILD / "icon.png"
    master.resize((512, 512), Image.LANCZOS).save(package_icon)

    # macOS menu bar icons are template images: the opaque pixels are tinted
    # by the system. The XTLaw artwork has a black background and white mark,
    # so keep the white mark and make the background transparent.
    tray_icon = master.convert("L")
    tray_alpha = ImageChops.multiply(
        tray_icon.point(lambda luminance: 255 if luminance > 32 else 0),
        master.getchannel("A"),
    )
    tray_icon_mac = Image.new("RGBA", master.size, (0, 0, 0, 0))
    tray_icon_mac.putalpha(tray_alpha)
    mark_bounds = tray_alpha.getbbox()
    if mark_bounds is None:
        raise ValueError("canonical logo does not contain a white XTLaw mark")
    mark = tray_icon_mac.crop(mark_bounds).resize((768, 768), Image.LANCZOS)
    tray_icon_mac = Image.new("RGBA", master.size, (0, 0, 0, 0))
    tray_icon_mac.paste(mark, (128, 128), mark)
    tray_icon_mac_path = BUILD / "tray-icon-mac.png"
    tray_icon_mac.save(tray_icon_mac_path)

    iconset = BUILD / "icon.iconset"
    if iconset.exists():
        shutil.rmtree(iconset)
    iconset.mkdir()
    sizes = [16, 32, 128, 256, 512]
    for sz in sizes:
        master.resize((sz, sz), Image.LANCZOS).save(iconset / f"icon_{sz}x{sz}.png")
        master.resize((sz * 2, sz * 2), Image.LANCZOS).save(
            iconset / f"icon_{sz}x{sz}@2x.png"
        )

    iconutil = shutil.which("iconutil")
    if iconutil is None:
        print(f"used {SOURCE}")
        print(f"wrote {windows_icon}")
        print(f"wrote {package_icon}")
        print(f"wrote {tray_icon_mac_path}")
        print("skipped icon.icns (iconutil is unavailable)")
        return

    icns = BUILD / "icon.icns"
    subprocess.run(
        [iconutil, "-c", "icns", str(iconset), "-o", str(icns)], check=True
    )
    print(f"used {SOURCE}")
    print(f"wrote {windows_icon}")
    print(f"wrote {package_icon}")
    print(f"wrote {tray_icon_mac_path}")
    print(f"wrote {icns}")


if __name__ == "__main__":
    main()
