#!/usr/bin/env python3
"""Build the three WebP tiers for a photo and add it to the photo theatre.

Adding a photo used to mean running ImageMagick three times with the right
numbers, then hand-writing an <article> with six URLs in it across three
attributes. This does both, with the tiers matched to what the existing 21
photos already use:

    preview   longest edge  640   q92   the card face
    medium    longest edge 1280   q92   srcset 1280w
    full      longest edge 1920   q92   srcset 1920w, and the zoom target

Two things it fixes on the way through:

  * EXIF is stripped. These are personal photos straight off a phone, and
    phone photos carry GPS coordinates. Nothing on the page reads EXIF, so
    there is no reason to publish it.

  * Output names are lowercased and cleaned. The existing set is a mix of
    IMG_5077.webp and 353ada2ec7798bf29b0ea234c88fc0c3.webp, which is only
    survivable because GitHub Pages and nginx both happen to be
    case-sensitive in the same way. New files should not add to that.

    python3 tools/add-photo.py ~/Desktop/IMG_1234.HEIC
    python3 tools/add-photo.py shot.jpg --name kamakura-beach

The photo is appended to the end of the queue in data/photos.json, and
tools/build-photos.py then regenerates the cards in index.html and restamps.
To put it somewhere else in the order, move its name in data/photos.json and
run build-photos.py again.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / "images"
PHOTOS = ROOT / "data" / "photos.json"

TIERS = [
    ("photo-preview", 640),
    ("medium", 1280),
    ("full", 1920),
]
QUALITY = 92


def magick() -> str:
    for candidate in ("magick", "convert"):
        found = shutil.which(candidate)
        if found:
            return found
    sys.exit("ImageMagick not found. Install it with: brew install imagemagick")


def safe_name(raw: str) -> str:
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", raw).strip("-.").lower()
    return stem or "photo"


def build(binary: str, source: Path, name: str, force: bool) -> list[Path]:
    written = []
    for directory, edge in TIERS:
        out_dir = IMAGES / directory
        out_dir.mkdir(parents=True, exist_ok=True)
        out = out_dir / f"{name}.webp"

        if out.exists() and not force:
            sys.exit(f"{out.relative_to(ROOT)} already exists (pass --force to overwrite)")

        subprocess.run(
            [
                binary,
                str(source),
                "-auto-orient",  # bake in EXIF rotation before stripping it
                "-strip",  # drops GPS and camera metadata
                "-resize",
                f"{edge}x{edge}>",  # fit inside, never enlarge
                "-quality",
                str(QUALITY),
                str(out),
            ],
            check=True,
        )
        written.append(out)
    return written


def read_photos() -> dict:
    return json.loads(PHOTOS.read_text(encoding="utf-8"))


def is_listed(name: str) -> bool:
    data = read_photos()
    return name == data["insert"] or name in data["queue"]


def add_to_queue(name: str) -> int:
    """Append name to the queue in data/photos.json; returns its position."""
    data = read_photos()
    data["queue"].append(name)
    PHOTOS.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return len(data["queue"])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", type=Path, help="original image (jpg/png/heic/…)")
    parser.add_argument("--name", help="output basename; defaults to the source stem, lowercased")
    parser.add_argument("--force", action="store_true", help="overwrite existing tiers")
    args = parser.parse_args()

    if not args.source.is_file():
        sys.exit(f"no such file: {args.source}")

    binary = magick()
    name = safe_name(args.name or args.source.stem)
    if not args.force and is_listed(name):
        sys.exit(f"{name} is already in data/photos.json (pass --force to rebuild its tiers)")

    written = build(binary, args.source, name, args.force)

    print("\nwrote:")
    for path in written:
        size = path.stat().st_size
        print(f"  {path.relative_to(ROOT)}  {size / 1024:.0f} KB")

    if is_listed(name):
        print(f"\n{name} was already listed; its tiers are rebuilt and its place is unchanged.")
    else:
        position = add_to_queue(name)
        print(f"\nadded to data/photos.json as queue card {position}")
    print("Keep the original in images/_originals/ -- it is gitignored and never deployed.\n", flush=True)
    return subprocess.run([sys.executable, str(ROOT / "tools" / "build-photos.py")], check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main())
