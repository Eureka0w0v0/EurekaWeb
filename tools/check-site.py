#!/usr/bin/env python3
"""Static consistency checks for the site. No browser, no network.

    python3 tools/check-site.py      # exit 1 if any check fails

- Every absolute URL the site advertises about itself -- the canonical link,
  og:url, og:image, twitter:image, the sitemap entry and the robots.txt
  Sitemap line -- names the one canonical origin. The site is served from more
  than one host; if each copy calls itself the original, search engines split
  the ranking between them, which is exactly what a canonical link is for
  preventing.
- The ES modules under js/ form a clean graph: every import resolves, no
  module imports itself through a cycle, every module is reachable from
  js/main.js (anything else is dead code), and each module is imported under
  one URL only -- two stamps for one file would make the browser run two
  separate copies of it, each with its own state.
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


MODULE_ROOT = ROOT / "js"
ENTRY_MODULE = MODULE_ROOT / "main.js"
STATIC_IMPORT = re.compile(r"""(?:\bfrom\s*|^\s*import\s+)(["'])(?P<spec>\.\.?/[^"'\s]+)\1""", re.MULTILINE)
DYNAMIC_IMPORT = re.compile(r"""\bimport\s*\(\s*(["'])(?P<spec>\.\.?/[^"'\s]+)\1""")


def check_module_graph() -> list[str]:
    if not ENTRY_MODULE.is_file():
        return [f"{ENTRY_MODULE.relative_to(ROOT)} is missing"]
    problems: list[str] = []
    modules = sorted(path.resolve() for path in MODULE_ROOT.rglob("*.js"))
    edges: dict[Path, list[Path]] = {}
    urls: dict[Path, set[str]] = {}
    for module in modules:
        text = module.read_text(encoding="utf-8")
        edges[module] = []
        for pattern, static in ((STATIC_IMPORT, True), (DYNAMIC_IMPORT, False)):
            for match in pattern.finditer(text):
                spec = match.group("spec")
                path, _, query = spec.partition("?")
                target = (module.parent / path).resolve()
                if not target.is_file():
                    problems.append(f"{module.relative_to(ROOT)} imports {spec}, which does not exist")
                    continue
                if static:
                    edges[module].append(target)
                    urls.setdefault(target, set()).add(query)

    for target, queries in urls.items():
        if len(queries) > 1:
            problems.append(f"{target.relative_to(ROOT)} is imported under {len(queries)} different URLs: {sorted(queries)}")

    state: dict[Path, str] = {}
    stack: list[Path] = []

    def visit(module: Path) -> None:
        state[module] = "open"
        stack.append(module)
        for target in edges.get(module, []):
            if state.get(target) == "open":
                cycle = stack[stack.index(target):] + [target]
                problems.append("import cycle: " + " -> ".join(p.relative_to(MODULE_ROOT).as_posix() for p in cycle))
            elif target not in state:
                visit(target)
        stack.pop()
        state[module] = "done"

    visit(ENTRY_MODULE.resolve())
    for module in modules:
        if module not in state:
            problems.append(f"{module.relative_to(ROOT)} is not reachable from js/main.js")
    return problems


CHECKS = (
    ("canonical origin", check_self_references),
    ("module graph", check_module_graph),
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
