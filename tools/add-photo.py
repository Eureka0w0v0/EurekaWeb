#!/usr/bin/env python3
"""Build the three WebP tiers for a photo and print the card markup to paste.

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
    survivable because GitHub Pages and Netlify both happen to be
    case-sensitive in the same way. New files should not add to that.

    python3 tools/add-photo.py ~/Desktop/IMG_1234.HEIC
    python3 tools/add-photo.py shot.jpg --name kamakura-beach

Cards are printed, not inserted. The photo section's markup carries ordering
state (data-photo-base, aria-label) that the scroll choreography in script.js
reads, and quietly rewriting that by machine is a good way to break a very
hand-tuned animation.
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / "images"

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


def next_index() -> int:
    """Highest data-photo-base already in index.html, plus one."""
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    found = [int(n) for n in re.findall(r'data-photo-base="(\d+)"', html)]
    return max(found, default=0) + 1


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


def card(name: str, index: int) -> str:
    preview = f"./images/photo-preview/{name}.webp"
    medium = f"./images/medium/{name}.webp"
    full = f"./images/full/{name}.webp"
    # ?v=new is a placeholder; tools/stamp-assets.py replaces it with the
    # content hash on the next run, which is also what makes it obvious in a
    # diff when someone forgets to run it.
    return f"""                <article class="photo-card photo-queue-card" data-photo-base="{index}" aria-label="照片 {index}">
                  <img
                  class="photo-card-image"
                  src="{preview}?v=new"
                  data-preview-src="{preview}?v=new"
                  data-full-src="{full}?v=new"
                  data-full-srcset="{medium}?v=new 1280w, {full}?v=new 1920w"
                  data-full-sizes="(max-width: 900px) 92vw, min(88vw, 1200px)"
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable="false"
                  />
                </article>"""


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
    index = next_index()

    written = build(binary, args.source, name, args.force)

    print("\nwrote:")
    for path in written:
        size = path.stat().st_size
        print(f"  {path.relative_to(ROOT)}  {size / 1024:.0f} KB")

    print(f"\nPaste into the .photo-queue in index.html (next free index is {index}):\n")
    print(card(name, index))
    print("\nThen run:  python3 tools/stamp-assets.py")
    print("Keep the original in images/_originals/ -- it is gitignored and never deployed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
