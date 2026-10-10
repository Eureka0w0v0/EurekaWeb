#!/usr/bin/env python3
"""Before/after comparison for refactors that must not change the page.

Walks the page the way a visitor would -- scrolling continuously from top to
bottom, stepping the career cards, using the photo carousel, Show All and the
lightbox, switching language and theme -- and at each stop records every
element's box and a set of computed styles once the page has settled.

    python3 tools/snapshot.py record  /tmp/before.json   # on the old code
    python3 tools/snapshot.py compare /tmp/before.json   # on the new code

`compare` prints every element whose geometry, style or classes moved beyond
a small tolerance, and exits 1 if anything did. Baselines are machine
specific (fonts and rasterisation differ between systems), so record and
compare on the same machine; they are not committed.

Excluded because they change on their own every frame: the WebGL brain, the
grain and welcome canvases, the connector lines and pills that follow the
brain, and the Mars clock. Infinite CSS animations are frozen at t=0 before
every capture so floating decorations do not read as differences.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))

from cdp import DEVICES, Browser, CDPError, Page  # noqa: E402
from devserver import DevServer  # noqa: E402
from smoke import PHOTO_STATE, SCROLL_TO, SKIP_INTRO, THEME_SETTLED, scroll_photo_stage_into_view  # noqa: E402

CONFIGURATIONS = (("desktop", False), ("desktop", True), ("mobile", False), ("tablet", True))
SETTLE_INTERVAL_S = 0.3
SETTLE_TIMEOUT_S = 15.0
LANGUAGE_SETTLE_S = 3.5
STABLE_CAPTURES = 2
INTERACTION_DELAY_S = 0.4
# Somewhere no element reacts to hover, so a pointer left resting on the
# last thing clicked cannot leave a :hover state in the capture.
NEUTRAL_POINTER = (2, -2)
CHECKPOINT_SPACING = 0.5  # viewport heights between scroll stops
MOTION_TOLERANCE = 3.0   # px: box geometry, transform translations, page height
STATIC_TOLERANCE = 0.05  # px: every other length -- static CSS must match
RATIO_TOLERANCE = 0.01   # unitless: opacity, scale, matrix coefficients
NUMBER = re.compile(r"-?\d+(?:\.\d+)?(?:e-?\d+)?")
UNIT = re.compile(r"-?\d+(?:\.\d+)?(?:e-?\d+)?([a-z%]*)")
NO_RUNNING_ANIMATIONS = """document.getAnimations().every((animation) =>
  animation.playState !== "running" || animation.effect?.getComputedTiming?.().iterations === Infinity)"""

CAPTURE = r"""((viewportOnly) => {
  for (const animation of document.getAnimations()) {
    const timing = animation.effect?.getComputedTiming?.();
    if (timing && timing.iterations === Infinity) {
      animation.pause();
      animation.currentTime = 0;
    }
  }
  const SKIP = ["#brain-three-mount", ".language-network", "#grain-canvas", "#welcome-canvas",
    "#mars-clock", "#intro-overlay", "script", "style", "noscript"];
  // Placed around the brain's projected outline, which turns every frame.
  const NO_GEOMETRY = [".language-node-field", ".language-node", ".brain-wrap"];
  const POSITIONAL = ["inset", "transform", "translate", "scale", "rotate"];
  const PROPS = ["display", "visibility", "opacity", "transform", "z-index", "position", "color",
    "background-color", "filter", "clip-path", "pointer-events", "font-size", "font-weight",
    "letter-spacing", "border-radius", "box-shadow", "backdrop-filter", "mix-blend-mode", "overflow",
    "translate", "scale", "rotate", "inset", "content"];
  const margin = innerHeight;
  const records = {};
  const keyOf = (el) => {
    const parts = [];
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      if (node.id) { parts.unshift(`#${node.id}`); break; }
      const siblings = node.parentElement ? [...node.parentElement.children].filter((c) => c.tagName === node.tagName) : [];
      const index = siblings.length > 1 ? `:${siblings.indexOf(node) + 1}` : "";
      parts.unshift(node.tagName.toLowerCase() + index);
    }
    return parts.join(">");
  };
  const visit = (el, geometry) => {
    if (SKIP.some((selector) => el.matches(selector))) return;
    const ownStyle = getComputedStyle(el);
    // An invisible element's position is not something a visitor can see,
    // and scroll-driven scenes leave hidden cards wherever timing put them.
    const invisible = ownStyle.display === "none" || ownStyle.visibility === "hidden" || Number(ownStyle.opacity) < 0.01;
    const keepGeometry = geometry && !invisible && !NO_GEOMETRY.some((selector) => el.matches(selector));
    const rect = el.getBoundingClientRect();
    const near = rect.bottom > -margin && rect.top < innerHeight + margin;
    if (!viewportOnly || near) {
      const style = getComputedStyle(el);
      const record = { c: [...el.classList].sort().join(" ") };
      if (keepGeometry) record.r = [rect.left, rect.top, rect.width, rect.height].map((v) => Math.round(v * 10) / 10);
      for (const prop of PROPS) {
        if (!keepGeometry && POSITIONAL.includes(prop)) continue;
        const value = style.getPropertyValue(prop);
        if (value) record[prop] = value;
      }
      for (const attr of ["aria-hidden", "aria-expanded", "aria-pressed", "data-active-layer", "hidden", "lang"]) {
        if (el.hasAttribute(attr)) record[attr] = el.getAttribute(attr);
      }
      if (el.children.length === 0) {
        const text = el.textContent.trim().replace(/\s+/g, " ");
        if (text) record.t = text.slice(0, 80);
      }
      records[keyOf(el)] = record;
    }
    for (const child of el.children) visit(child, keepGeometry);
  };
  visit(document.documentElement, true);
  return { scrollY: Math.round(scrollY), height: document.scrollingElement.scrollHeight, records };
})"""


def capture(page: Page, viewport_only: bool) -> dict:
    return page.evaluate(f"{CAPTURE}({json.dumps(viewport_only)})", timeout=60)


def settled_capture(page: Page, viewport_only: bool) -> dict:
    """Capture once nothing is moving any more, or give up and say so.

    Two conditions, because the page animates two ways. CSS transitions and
    finite CSS animations are visible to document.getAnimations(), so wait
    for none to be running -- comparing captures alone is not enough there,
    since the last stretch of an ease-out moves less than the tolerance and
    would read as settled while a colour is still mid-interpolation. Motion
    driven from requestAnimationFrame is invisible to that API, so also wait
    for STABLE_CAPTURES consecutive captures that agree."""
    time.sleep(INTERACTION_DELAY_S)
    deadline = time.monotonic() + SETTLE_TIMEOUT_S
    try:
        page.wait_for(NO_RUNNING_ANIMATIONS, timeout=SETTLE_TIMEOUT_S)
    except CDPError:
        pass
    previous = capture(page, viewport_only)
    stable = 0
    while stable < STABLE_CAPTURES:
        time.sleep(SETTLE_INTERVAL_S)
        current = capture(page, viewport_only)
        # Strict equality here, tolerance only when comparing runs: an
        # exponential follow moves less than the tolerance near its end and
        # would otherwise be recorded before it snaps to its target.
        differences = [] if previous.get("records") == current.get("records") else diff_snapshots(previous, current) or ["sub-tolerance motion"]
        stable = 0 if differences else stable + 1
        if differences and time.monotonic() >= deadline:
            current["unsettled"] = differences[:5]
            return current
        previous = current
    return previous


def _tolerances(prop: str, value: str, count: int) -> list[float]:
    """Per-number tolerance for one computed value.

    Box geometry and transform translations are what scroll- and
    timer-driven scenes move, and they settle a pixel or two apart between
    runs, so they get MOTION_TOLERANCE. Everything else -- radii, font
    sizes, shadows, insets -- is static CSS and must match almost exactly,
    or a one-pixel slip in a stylesheet refactor would go unseen."""
    if prop in ("transform", "translate") and value.startswith("matrix3d("):
        return [RATIO_TOLERANCE] * 12 + [MOTION_TOLERANCE] * 3 + [RATIO_TOLERANCE]
    if prop in ("transform", "translate") and value.startswith("matrix("):
        return [RATIO_TOLERANCE] * 4 + [MOTION_TOLERANCE] * 2
    if prop == "translate":
        return [MOTION_TOLERANCE] * count
    return [STATIC_TOLERANCE if unit == "px" else RATIO_TOLERANCE for unit in UNIT.findall(value)]


def numbers_close(prop: str, a: str, b: str) -> bool:
    if a == b:
        return True
    if NUMBER.sub("#", a) != NUMBER.sub("#", b):
        return False
    xs, ys = NUMBER.findall(a), NUMBER.findall(b)
    tolerances = _tolerances(prop, a, len(xs))
    for x, y, tolerance in zip(xs, ys, tolerances):
        if abs(float(x) - float(y)) > tolerance + 1e-9:
            return False
    return True


def diff_records(key: str, old: dict, new: dict) -> list[str]:
    lines = []
    for prop in sorted(set(old) | set(new)):
        a, b = old.get(prop), new.get(prop)
        if prop == "r" and a and b:
            if any(abs(x - y) > MOTION_TOLERANCE for x, y in zip(a, b)):
                lines.append(f"{key} box {a} -> {b}")
            continue
        if a is None or b is None:
            if (a or b) not in ("", "none", None):
                lines.append(f"{key} {prop}: {a!r} -> {b!r}")
            continue
        if not numbers_close(prop, str(a), str(b)):
            lines.append(f"{key} {prop}: {a!r} -> {b!r}")
    return lines


def diff_snapshots(old: dict, new: dict) -> list[str]:
    lines = []
    if abs(old.get("height", 0) - new.get("height", 0)) > MOTION_TOLERANCE:
        lines.append(f"page height {old.get('height')} -> {new.get('height')}")
    if abs(old.get("scrollY", 0) - new.get("scrollY", 0)) > 1:
        lines.append(f"scrollY {old.get('scrollY')} -> {new.get('scrollY')}")
    old_records, new_records = old.get("records", {}), new.get("records", {})
    for key in sorted(set(old_records) | set(new_records)):
        if key not in new_records:
            lines.append(f"{key} disappeared")
        elif key not in old_records:
            lines.append(f"{key} appeared")
        else:
            lines.extend(diff_records(key, old_records[key], new_records[key]))
    return lines


def journey(page: Page, shots: Path | None, label: str) -> dict:
    """The fixed walk. Every stop yields one named, settled capture."""
    stops: dict[str, dict] = {}

    def stop(name: str, viewport_only: bool = True) -> None:
        if not page.device.touch:
            x, y = NEUTRAL_POINTER
            page.send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": page.device.height + y})
        stops[name] = settled_capture(page, viewport_only)
        if shots:
            page.screenshot(shots / f"{label}-{len(stops):02d}-{name}.png")

    stop("load", viewport_only=False)
    viewport = page.evaluate("innerHeight")
    position = 0.0
    while True:
        max_scroll = page.evaluate("document.scrollingElement.scrollHeight - innerHeight")
        if position > max_scroll:
            break
        page.evaluate(f"{SCROLL_TO}({position})", timeout=90)
        stop(f"scroll-{int(position)}")
        position += viewport * CHECKPOINT_SPACING

    career_top = page.evaluate("document.getElementById('career-section').getBoundingClientRect().top + scrollY")
    page.evaluate(f"{SCROLL_TO}({career_top})", timeout=90)
    page.evaluate("document.querySelector('.career-card-stack').focus({ preventScroll: true })")
    stop("career-1")
    for key, code, name in (("ArrowDown", 40, "career-2"), ("ArrowDown", 40, "career-3"), ("Home", 36, "career-home")):
        page.press_key(key, key_code=code)
        stop(name)

    scroll_photo_stage_into_view(page)
    stop("photo-stage")
    state = page.evaluate(PHOTO_STATE)
    if state["main"]:
        neighbour = next((c for c in state["visible"] if c["slot"] == state["main"]["slot"] + 1), None)
        if neighbour:
            page.click(neighbour["x"], neighbour["y"])
            stop("photo-stepped")
        state = page.evaluate(PHOTO_STATE)
        page.click(state["main"]["x"], state["main"]["y"])
        try:
            page.wait_for(f"({PHOTO_STATE}).zoomOpen", timeout=6)
            stop("photo-zoom", viewport_only=False)
            page.press_key("Escape", key_code=27)
            page.wait_for(f"!({PHOTO_STATE}).zoomOpen", timeout=6)
        except CDPError:
            stops["photo-zoom"] = {"error": "lightbox did not open/close"}
        stop("photo-zoom-closed")
    page.click_selector("#photo-show-all")
    stop("photo-show-all", viewport_only=False)
    page.click_selector("#photo-show-all")
    stop("photo-collapsed")

    page.click_selector("#language-toggle")
    page.wait_for("document.getElementById('language-toggle').getAttribute('aria-expanded') === 'true'", timeout=5)
    stop("language-menu")
    page.click_selector('[data-language="ja"]')
    page.wait_for("document.documentElement.lang === 'ja'", timeout=8)
    # The heading's magnet spans are rebuilt only after every kinetic batch
    # has finished, which can come after a quiet stretch longer than the
    # settle window.
    time.sleep(LANGUAGE_SETTLE_S)
    stop("language-ja", viewport_only=False)

    page.wait_for(THEME_SETTLED, timeout=10)
    page.click_selector("#theme-toggle")
    page.wait_for(THEME_SETTLED, timeout=10)
    stop("theme-toggled", viewport_only=False)
    return stops


def run(configurations, shots: Path | None) -> dict:
    result = {}
    with Browser() as browser, DevServer() as server:
        for device, dark in configurations:
            label = f"{device}-{'dark' if dark else 'light'}"
            print(f"  {label}", flush=True)
            page = browser.new_page(DEVICES[device], dark=dark, init_script=SKIP_INTRO)
            try:
                page.navigate(server.url)
                page.wait_for("!document.getElementById('intro-overlay')", timeout=15)
                time.sleep(1.0)
                result[label] = {"stops": journey(page, shots, label), "errors": page.errors}
            finally:
                page.close()
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("mode", choices=("record", "compare"))
    parser.add_argument("baseline", type=Path)
    parser.add_argument("--only", help="comma-separated labels, e.g. desktop-light,mobile-light")
    parser.add_argument("--shots", type=Path, help="directory for a screenshot per stop")
    parser.add_argument("--limit", type=int, default=60, help="differences to print per stop")
    args = parser.parse_args()

    configurations = [
        (device, dark) for device, dark in CONFIGURATIONS
        if not args.only or f"{device}-{'dark' if dark else 'light'}" in args.only.split(",")
    ]
    if args.shots:
        args.shots.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    current = run(configurations, args.shots)

    if args.mode == "record":
        args.baseline.write_text(json.dumps(current))
        unsettled = sum(1 for c in current.values() for s in c["stops"].values() if s.get("unsettled"))
        print(f"recorded {sum(len(c['stops']) for c in current.values())} stops "
              f"({unsettled} unsettled) in {time.monotonic() - started:.0f}s -> {args.baseline}")
        return 0

    baseline = json.loads(args.baseline.read_text())
    total = 0
    for label, run_result in current.items():
        old_stops = baseline.get(label, {}).get("stops", {})
        new_stops = run_result["stops"]
        if run_result["errors"]:
            print(f"[{label}] runtime errors: {run_result['errors'][:3]}")
            total += len(run_result["errors"])
        for name in list(old_stops) + [n for n in new_stops if n not in old_stops]:
            if name not in new_stops or name not in old_stops:
                print(f"[{label}] stop {name} {'missing' if name not in new_stops else 'new'}")
                total += 1
                continue
            lines = diff_snapshots(old_stops[name], new_stops[name])
            if lines:
                total += len(lines)
                print(f"[{label}] {name}: {len(lines)} differences")
                for line in lines[: args.limit]:
                    print(f"    {line}")
    print(f"\n{'identical' if not total else f'{total} differences'} "
          f"({time.monotonic() - started:.0f}s)")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
