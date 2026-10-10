#!/usr/bin/env python3
"""Static consistency checks for the site. No browser, no network.

    python3 tools/check-site.py      # exit 1 if any check fails

- Every absolute URL the site advertises about itself -- the canonical link,
  og:url, og:image, twitter:image, the sitemap entry and the robots.txt
  Sitemap line -- names the one canonical origin. The site is served from more
  than one host; if each copy calls itself the original, search engines split
  the ranking between them, which is exactly what a canonical link is for
  preventing.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CANONICAL = "https://eureka-web.com/"

# Every place the site states its own address, as (file, pattern, label).
SELF_REFERENCES = (
    ("index.html", r'<link rel="canonical" href="([^"]+)"', "canonical link"),
    ("index.html", r'<meta property="og:url" content="([^"]+)"', "og:url"),
    ("index.html", r'<meta property="og:image" content="([^"]+)"', "og:image"),
    ("index.html", r'<meta name="twitter:image" content="([^"]+)"', "twitter:image"),
    ("sitemap.xml", r"<loc>([^<]+)</loc>", "sitemap loc"),
    ("robots.txt", r"^Sitemap:\s*(\S+)", "robots.txt Sitemap"),
)


def check_self_references() -> list[str]:
    problems = []
    for name, pattern, label in SELF_REFERENCES:
        text = (ROOT / name).read_text(encoding="utf-8")
        found = re.findall(pattern, text, flags=re.MULTILINE)
        if not found:
            problems.append(f"{name}: no {label} found")
        for url in found:
            if not url.startswith(CANONICAL):
                problems.append(f"{name}: {label} is {url}, expected it under {CANONICAL}")
    return problems


CHECKS = (
    ("canonical origin", check_self_references),
)


def main() -> int:
    failed = False
    for title, check in CHECKS:
        problems = check()
        status = "ok" if not problems else f"{len(problems)} problem(s)"
        print(f"{title}: {status}")
        for problem in problems:
            print(f"  - {problem}")
        failed = failed or bool(problems)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
