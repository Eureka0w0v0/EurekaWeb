#!/usr/bin/env python3
"""Rewrite the ?v= cache stamps in the site's documents from the assets' content.

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

# Every document that references a long-cached asset by URL. index.html is the
# obvious one; the other two were stamped by hand until they drifted.
#
# manifest.webmanifest points at the PWA icons and 404.html at the favicon.
# Both were carrying hand-written date stamps -- or, in the 404's case, no
# stamp at all -- while index.html moved to content hashes, so --check passed
# while an icon replacement would have been invisible behind netlify.toml's
# year of immutable caching.
SOURCES = ("index.html", "404.html", "manifest.webmanifest")

# A local reference with no ?v= is normally a mistake, because these paths are
# served immutable for a year. sw.js is the deliberate exception: a service
# worker has to keep one stable URL to be replaceable at all, which is why
# netlify.toml gives that one file no-cache instead.
UNSTAMPED_OK = frozenset({"./sw.js"})

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

# Same paths, but with the stamp optional, so an unstamped reference can be
# reported rather than silently skipped by REF.
ANY_REF = re.compile(r'(?P<path>\./[A-Za-z0-9._/-]+\.(?:css|js|png|webp|webmanifest))(?P<query>\?v=[A-Za-z0-9._-]+)?')

def digest(path: Path, pending: dict[str, str]) -> str:
    """SHA-256 prefix of a file, preferring this run's rewritten copy of it.

    One of the documents being stamped is itself a stamped asset: index.html
    references ./manifest.webmanifest, whose own bytes change the moment its
    icon stamps are rewritten. Hashing the version on disk would therefore
    stamp index.html with a hash that is stale before the run finishes -- one
    pass would leave the tree in a state --check rejects. Reading from the
    in-progress text closes that loop.
    """
    try:
        rel = f"./{path.relative_to(ROOT).as_posix()}"
    except ValueError:
        rel = None

    if rel is not None and rel in pending:
        return hashlib.sha256(pending[rel].encode("utf-8")).hexdigest()[:8]
    return hashlib.sha256(path.read_bytes()).hexdigest()[:8]


def rewrite(html: str, pending: dict[str, str]) -> str:
    """Return html with every ?v= stamp set from the referenced file's content."""

    def replace(match: re.Match[str]) -> str:
        rel = match.group("path")
        target = (ROOT / rel[2:]).resolve()
        # A reference to something that is not on disk is a broken link, not a
        # stale stamp. Leave it exactly as-is and let the caller notice.
        if not target.is_file():
            return match.group(0)
        return f"{rel}?v={digest(target, pending)}"

    return REF.sub(replace, html)


def stamp_all(documents: dict[str, str]) -> dict[str, str]:
    """Rewrite every document until the stamps stop moving.

    The dependency chain is index.html -> manifest.webmanifest -> icons, so a
    single pass in the wrong order settles only part of it. Iterating to a
    fixpoint keeps this correct no matter what order SOURCES happens to list,
    and without hard-coding which document references which.
    """
    pending = dict(documents)
    for _ in range(len(documents) + 2):
        nxt = {f"./{name}": rewrite(text, {f"./{k}": v for k, v in pending.items()})
               for name, text in pending.items()}
        nxt = {name[2:]: text for name, text in nxt.items()}
        if nxt == pending:
            return pending
        pending = nxt
    raise RuntimeError("cache stamps did not converge; check for a reference cycle")


def missing_targets(html: str) -> list[str]:
    out = []
    for match in REF.finditer(html):
        rel = match.group("path")
        if not (ROOT / rel[2:]).resolve().is_file():
            out.append(rel)
    return out


def unstamped_refs(html: str) -> list[str]:
    """Local asset references carrying no ?v= at all, sw.js aside."""
    out = []
    for match in ANY_REF.finditer(html):
        rel = match.group("path")
        if match.group("query") or rel in UNSTAMPED_OK:
            continue
        if (ROOT / rel[2:]).resolve().is_file():
            out.append(rel)
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="report staleness, change nothing")
    args = parser.parse_args()

    documents = {name: (ROOT / name).read_text(encoding="utf-8") for name in SOURCES}

    failed = False
    for name, text in documents.items():
        for rel in missing_targets(text):
            print(f"{name} references a file that does not exist: {rel}", file=sys.stderr)
            failed = True
        for rel in unstamped_refs(text):
            print(f"{name} references {rel} with no ?v= stamp", file=sys.stderr)
            failed = True
    if failed:
        return 2

    stamped = stamp_all(documents)
    total = sum(len(REF.findall(text)) for text in documents.values())

    changes: list[tuple[str, str, str, str]] = []
    for name, text in documents.items():
        before = dict(REF.findall(text))
        after = dict(REF.findall(stamped[name]))
        for rel, old in before.items():
            if after.get(rel) != old:
                changes.append((name, rel, old, after[rel]))

    if not changes:
        print(f"all {total} asset stamps are current")
        return 0

    if args.check:
        print("stale cache stamps:", file=sys.stderr)
        for name, rel, old, new in changes:
            print(f"  {name}: {rel}  {old} -> {new}", file=sys.stderr)
        print("\nrun: python3 tools/stamp-assets.py", file=sys.stderr)
        return 1

    for name in SOURCES:
        if stamped[name] != documents[name]:
            (ROOT / name).write_text(stamped[name], encoding="utf-8")
    print(f"updated {len(changes)} stamp(s):")
    for name, rel, old, new in changes:
        print(f"  {name}: {rel}  {old} -> {new}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
