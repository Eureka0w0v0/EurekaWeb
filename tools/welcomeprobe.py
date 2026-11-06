#!/usr/bin/env python3
"""Pixel-exact record of the welcome canvas, which snapshot.py cannot see.

The welcome word is drawn to a canvas from particles spawned with Math.random,
so two page loads never paint the same dust. This reseeds Math.random, rebuilds
the word in the same task, and reads the canvas back at fixed scroll positions:

    python3 tools/welcomeprobe.py record  /tmp/welcome.json   # on the old code
    python3 tools/welcomeprobe.py compare /tmp/welcome.json   # on the new code

Painting does not use Math.random, so the film grain, which does, cannot
disturb the canvas between the rebuild and the last stop.

Each stop is kept as the premultiplied sum of every 64px tile rather than as
one hash. The same text drawn on two page loads differs by one level of alpha
in a handful of glyph edge pixels, so a hash of the bytes never repeats; a real
change to the word or the dust moves a tile by thousands. Baselines depend on
the machine's fonts and rasteriser, so record and compare on the same machine.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))

from brainprobe import diff_exact  # noqa: E402
from cdp import DEVICES, Browser, CDPError, Page  # noqa: E402
from devserver import ROOT, DevServer  # noqa: E402
from smoke import SKIP_INTRO  # noqa: E402

CONFIGURATIONS = (("desktop", False), ("desktop", True), ("mobile", False), ("tablet", True))
# Shares of the welcome section's height: resting, starting to crumble, well
# into it, nearly gone, gone.
SCROLL_STOPS = (0, 0.05, 0.15, 0.3, 0.45, 0.6, 0.72)
LOAD_SETTLE_S = 1.0
TILE_PX = 64
# Rasteriser noise reaches a few dozen units in a tile; see the docstring.
TILE_TOLERANCE = 128

CAPTURE = """(async ([stops, tilePx]) => {
  const moduleUrl = (suffix) => [...document.querySelectorAll('link[rel="modulepreload"]')]
    .map((link) => link.href).find((href) => href.includes(suffix));
  const { buildWelcomeCanvas, drawWelcome } = await import(moduleUrl("/sections/welcome.js"));
  const canvas = document.getElementById("welcome-canvas");
  const section = document.getElementById("welcome-section");
  const context = canvas.getContext("2d");

  let state = 20260427;
  const random = Math.random;
  Math.random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  buildWelcomeCanvas();
  Math.random = random;

  const tileSums = () => {
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const columns = Math.ceil(canvas.width / tilePx);
    const sums = new Array(columns * Math.ceil(canvas.height / tilePx)).fill(0);
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        const alpha = data[offset + 3];
        sums[Math.floor(y / tilePx) * columns + Math.floor(x / tilePx)] +=
          alpha + ((data[offset] + data[offset + 1] + data[offset + 2]) * alpha) / 255;
      }
    }
    return sums.map(Math.round);
  };

  const results = [];
  for (const share of stops) {
    scrollTo({ top: section.offsetTop + section.offsetHeight * share, behavior: "instant" });
    drawWelcome();
    results.push({
      share,
      width: canvas.width,
      height: canvas.height,
      styleWidth: canvas.style.width,
      styleHeight: canvas.style.height,
      progress: document.body.style.getPropertyValue("--welcome-progress"),
      tiles: tileSums(),
    });
  }
  return results;
})"""


def run(configurations, root: Path) -> dict:
    result = {}
    with Browser() as browser, DevServer(root=root) as server:
        for device, dark in configurations:
            label = f"{device}-{'dark' if dark else 'light'}"
            print(f"  {label}", flush=True)
            page = browser.new_page(DEVICES[device], dark=dark, init_script=SKIP_INTRO)
            try:
                page.navigate(server.url)
                page.wait_for("!document.getElementById('intro-overlay')", timeout=15, message="initApp never ran")
                time.sleep(LOAD_SETTLE_S)
                stops = page.evaluate(f"{CAPTURE}({json.dumps([SCROLL_STOPS, TILE_PX])})", timeout=60)
                result[label] = {"stops": stops, "errors": page.errors}
            finally:
                page.close()
    return result


def diff_stops(old: list, new: list) -> list[str]:
    if len(old) != len(new):
        return [f"{len(old)} stops -> {len(new)}"]
    lines = []
    for index, (before, after) in enumerate(zip(old, new)):
        fixed = ({k: v for k, v in before.items() if k != "tiles"}, {k: v for k, v in after.items() if k != "tiles"})
        lines.extend(diff_exact(*fixed, f"[{index}]"))
        if len(before["tiles"]) != len(after["tiles"]):
            lines.append(f"[{index}].tiles: length {len(before['tiles'])} -> {len(after['tiles'])}")
            continue
        moved = [abs(a - b) for a, b in zip(before["tiles"], after["tiles"]) if abs(a - b) > TILE_TOLERANCE]
        if moved:
            lines.append(f"[{index}].tiles: {len(moved)} of {len(before['tiles'])} moved, by up to {max(moved)}")
    return lines


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("mode", choices=("record", "compare"))
    parser.add_argument("baseline", type=Path)
    parser.add_argument("--root", type=Path, default=ROOT,
                        help="site directory to serve, e.g. a worktree of the code before the change")
    args = parser.parse_args()

    started = time.monotonic()
    try:
        current = run(CONFIGURATIONS, args.root.resolve())
    except CDPError as error:
        print(f"probe failed: {error}")
        return 1

    if args.mode == "record":
        args.baseline.write_text(json.dumps(current))
        print(f"recorded {len(current)} configurations in {time.monotonic() - started:.0f}s -> {args.baseline}")
        return 0

    baseline = json.loads(args.baseline.read_text())
    lines = []
    for label, run_result in current.items():
        lines.extend(f"[{label}] runtime error: {error}" for error in run_result["errors"][:3])
        lines.extend(f"[{label}] {line}" for line in diff_stops(baseline.get(label, {}).get("stops", []), run_result["stops"]))
    for line in lines:
        print(f"    {line}")
    print(f"\n{'identical' if not lines else f'{len(lines)} differences'} ({time.monotonic() - started:.0f}s)")
    return 1 if lines else 0


if __name__ == "__main__":
    sys.exit(main())
