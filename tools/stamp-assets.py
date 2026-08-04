#!/usr/bin/env python3
"""Rewrite the ?v= cache stamps in index.html from the assets' own content.

Why this exists: netlify.toml marks css/js/images immutable for a year, so the
only thing that makes a visitor pick up a change is a different URL. That was
tracked by hand, which means a deploy is one forgotten edit away from shipping
a stylesheet nobody will ever see.

Both hosts serve straight from the repo -- Netlify has publish="." and no build
command, GitHub Pages uploads the checkout -- so the stamped index.html has to
be the committed one. Run this before committing; CI runs it with --check and
fails if the file on disk disagrees.

Stamps are the first 8 hex chars of the file's SHA-256, so re-running without
changing an asset is a no-op and the diff stays quiet.

    python3 tools/stamp-assets.py            # rewrite in place
    python3 tools/stamp-assets.py --check    # exit 1 if stale, touch nothing
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"

# Matches any "./path/file.ext?v=STAMP" wherever it appears, rather than keying
# off an attribute name. That matters: the photo cards carry their real URLs in
# data-full-src, data-preview-src and data-full-srcset, and srcset packs two
# URLs into one attribute with a " 1280w," descriptor between them -- so a
# pattern anchored on `src="..."` silently skips exactly the URLs that get
# fetched when someone opens a photo.
#
# The stamp is terminated by any character that cannot be in one, which is the
# closing quote in an attribute and the space before the width descriptor in a
# srcset.
REF = re.compile(r'(?P<path>\./[A-Za-z0-9._/-]+\.(?:css|js|png|webp|webmanifest))\?v=(?P<stamp>[A-Za-z0-9._-]+)')

_digest_cache: dict[Path, str] = {}


def digest(path: Path) -> str:
    if path not in _digest_cache:
        _digest_cache[path] = hashlib.sha256(path.read_bytes()).hexdigest()[:8]
    return _digest_cache[path]


def rewrite(html: str) -> tuple[str, list[tuple[str, str, str]]]:
    """Return the rewritten html plus (path, old, new) for every stamp changed."""
    changes: list[tuple[str, str, str]] = []

    def replace(match: re.Match[str]) -> str:
        rel = match.group("path")
        target = (ROOT / rel[2:]).resolve()
        # A reference to something that is not on disk is a broken link, not a
        # stale stamp. Leave it exactly as-is and let the caller notice.
        if not target.is_file():
            return match.group(0)
        new = digest(target)
        old = match.group("stamp")
        if new != old:
            changes.append((rel, old, new))
        return f"{rel}?v={new}"

    return REF.sub(replace, html), changes


def missing_targets(html: str) -> list[str]:
    out = []
    for match in REF.finditer(html):
        rel = match.group("path")
        if not (ROOT / rel[2:]).resolve().is_file():
            out.append(rel)
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="report staleness, change nothing")
    args = parser.parse_args()

    html = INDEX.read_text(encoding="utf-8")

    broken = missing_targets(html)
    if broken:
        print("index.html references files that do not exist:", file=sys.stderr)
        for rel in broken:
            print(f"  {rel}", file=sys.stderr)
        return 2

    stamped, changes = rewrite(html)

    if not changes:
        print(f"all {len(REF.findall(html))} asset stamps are current")
        return 0

    if args.check:
        print("stale cache stamps in index.html:", file=sys.stderr)
        for rel, old, new in changes:
            print(f"  {rel}  {old} -> {new}", file=sys.stderr)
        print("\nrun: python3 tools/stamp-assets.py", file=sys.stderr)
        return 1

    INDEX.write_text(stamped, encoding="utf-8")
    print(f"updated {len(changes)} stamp(s) in index.html:")
    for rel, old, new in changes:
        print(f"  {rel}  {old} -> {new}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
