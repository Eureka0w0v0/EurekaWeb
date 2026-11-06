#!/usr/bin/env python3
"""Records how the page is wired, for refactors that move wiring code.

The order things are wired in is behaviour on this page: listeners on one
target run in the order they were added, that decides the order their
animation frames run in within a frame, and pageEvents listeners run in
subscription order. None of it shows up in a screenshot until something
flickers, and the middle of a theme change shows up nowhere else either.

    python3 tools/wiringprobe.py record  /tmp/wiring.json   # on the old code
    python3 tools/wiringprobe.py compare /tmp/wiring.json   # on the new code

Per device it records:

  - listeners      addEventListener calls, in order, per target and event type
  - subscriptions  pageEvents.on calls, in order, per event, by subscriber
  - frames         who requested an animation frame, in order, after one scroll
                   and after one resize
  - theme          a theme change seen from the inside, with the career cards
                   off screen and in view: the page events, the view
                   transition, every WAAPI animation and every class change
  - language       the page events of an animated language switch

Handlers and callers are recorded by name, so code that moves between files
compares equal; the order is the thing being compared. Use --ignore for a
rename that is intended.
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

from brainprobe import diff_exact  # noqa: E402
from cdp import DEVICES, Browser, CDPError, Page  # noqa: E402
from devserver import ROOT, DevServer  # noqa: E402
from smoke import CAREER_SETTLE_S, SKIP_INTRO, THEME_SETTLED, scroll_to, section_top  # noqa: E402

CONFIGURATIONS = ("desktop", "mobile", "tablet")
EVENTS_MODULE = "js/core/events.js"
LOAD_SETTLE_S = 1.0
THEME_SETTLE_S = 1.2
TRACE_QUIET_TIMEOUT_S = 15.0
LANGUAGE_SETTLE_S = 2.0
# Loops that request a frame every frame, whatever else is going on.
FRAME_LOOPS = ("animateBrain", "renderGrain")
# Fired continuously while the pointer or the brain moves.
NOISY_EVENTS = ("pointer:frame", "brain:frame")

INSTRUMENT = r"""
(() => {
  const wiring = (window.__wiring = {
    listeners: [], subscriptions: [], frames: [], emits: [], animations: [], mutations: [],
  });

  const describe = (target) => {
    if (target === window) return "window";
    if (target === document) return "document";
    if (target === window.visualViewport) return "visualViewport";
    if (target instanceof MediaQueryList) return `media ${target.media}`;
    if (!(target instanceof Element)) return target?.constructor?.name ?? String(target);
    const key = target.dataset.languageNode || target.dataset.language || "";
    return target.id ? `#${target.id}` : `${target.tagName.toLowerCase()}.${target.classList[0] ?? ""}[${key}]`;
  };

  /* Stack line 0 is "Error" and line 1 is this function. */
  const callerAt = (depth) => {
    const line = new Error().stack.split("\n")[depth + 1] ?? "";
    return line.match(/^\s*at (?:async )?([^\s(]+) \(/)?.[1] ?? "<anonymous>";
  };

  const addEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    const flags = typeof options === "object" && options ? options : { capture: Boolean(options) };
    wiring.listeners.push([
      describe(this), type, listener?.name || "<anonymous>",
      Boolean(flags.capture), Boolean(flags.passive), Boolean(flags.once),
    ]);
    return addEventListener.call(this, type, listener, options);
  };

  const requestFrame = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => {
    wiring.frames.push(callerAt(2));
    return requestFrame(callback);
  };

  const animate = Element.prototype.animate;
  Element.prototype.animate = function (keyframes, options) {
    wiring.animations.push([
      describe(this), Object.keys(keyframes).join(","), options?.duration, options?.easing,
      options?.fill, options?.pseudoElement ?? null,
    ]);
    return animate.call(this, keyframes, options);
  };

  if (document.startViewTransition) {
    const start = document.startViewTransition;
    document.startViewTransition = function (...args) {
      wiring.emits.push("startViewTransition");
      return start.apply(this, args);
    };
  }

  wiring.subscribed = (type) => wiring.subscriptions.push([type, callerAt(3)]);
  wiring.emitted = (type) => wiring.emits.push(type);

  wiring.watch = () => {
    const names = [
      ["html", document.documentElement], ["body", document.body],
      ["wave", document.querySelector(".theme-wave")],
      ["wave-core", document.querySelector(".theme-wave-core")],
      ["career-scene", document.querySelector(".career-scene")],
      ["career-stack", document.querySelector(".career-card-stack")],
    ];
    const nameOf = new Map(names.map(([name, element]) => [element, name]));
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const value = record.target.getAttribute("class") ?? "";
        wiring.mutations.push([nameOf.get(record.target), [...value.split(/\s+/)].sort().join(" ")]);
      }
    });
    for (const [, element] of names) {
      if (element) observer.observe(element, { attributes: true, attributeFilter: ["class"] });
    }
  };
})();
"""

# A request still pending from earlier would absorb the one being measured, so
# the page has to go a couple of frames with nothing but its loops first.
FRAMES_AFTER = """(async ([action, loops]) => {
  const wiring = window.__wiring;
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  for (let attempt = 0; attempt < 120; attempt += 1) {
    wiring.frames.length = 0;
    await frame();
    await frame();
    if (wiring.frames.every((name) => name === "<anonymous>" || loops.includes(name))) {
      break;
    }
  }
  wiring.frames.length = 0;
  if (action === "scroll") {
    scrollTo({ top: scrollY + 40, behavior: "instant" });
  } else {
    window.dispatchEvent(new Event("resize"));
  }
  await frame();
  await frame();
  await frame();
  return wiring.frames.slice();
})"""

TRACE_RESET = """(() => {
  const wiring = window.__wiring;
  wiring.emits.length = 0;
  wiring.animations.length = 0;
  wiring.mutations.length = 0;
})()"""

TRACE_READ = """(() => {
  const { animations, emits, mutations } = window.__wiring;
  return { animations, emits, mutations };
})()"""

WIRING_READ = """(() => {
  const { listeners, subscriptions } = window.__wiring;
  return { listeners, subscriptions };
})()"""


def group_listeners(rows: list) -> dict:
    """Keyed by target and event: only listeners sharing both have an order."""
    grouped: dict[str, list] = {}
    for target, event, *rest in rows:
        grouped.setdefault(f"{target} {event}", []).append(rest)
    return grouped


def group_subscriptions(rows: list) -> dict:
    grouped: dict[str, list] = {}
    for event, subscriber in rows:
        grouped.setdefault(event, []).append(subscriber)
    return grouped


def collapse(rows: list) -> list:
    """Drop rows that repeat the one before: a frame more or less of the same
    state is timing, a different sequence of states is the page."""
    kept: list = []
    for row in rows:
        if not kept or kept[-1] != row:
            kept.append(row)
    return kept


def wait_for_trace_to_stop(page: Page) -> None:
    """A theme change's last steps land frames after its classes clear, and a
    machine under load draws few frames, so wait for the log rather than a clock."""
    size = "(({ animations, emits, mutations }) => animations.length + emits.length + mutations.length)(window.__wiring)"
    previous = None
    deadline = time.monotonic() + TRACE_QUIET_TIMEOUT_S
    while time.monotonic() < deadline:
        time.sleep(THEME_SETTLE_S)
        current = page.evaluate(size)
        if current == previous:
            return
        previous = current


def read_trace(page: Page) -> dict:
    trace = page.evaluate(TRACE_READ)
    trace["emits"] = collapse([name for name in trace["emits"] if name not in NOISY_EVENTS])
    trace["mutations"] = collapse(trace["mutations"])
    return trace


def theme_trace(page: Page) -> dict:
    page.wait_for(THEME_SETTLED, timeout=10, message="theme transition never settled")
    page.evaluate(TRACE_RESET)
    page.click_selector("#theme-toggle")
    time.sleep(0.2)
    page.wait_for(THEME_SETTLED, timeout=10, message="theme transition never settled")
    wait_for_trace_to_stop(page)
    return read_trace(page)


def capture(page: Page) -> dict:
    page.evaluate("window.__wiring.watch()")
    record: dict = {"frames": {}, "theme": {}}
    for action in ("scroll", "resize"):
        frames = page.evaluate(f"{FRAMES_AFTER}({json.dumps([action, FRAME_LOOPS])})", timeout=60)
        record["frames"][action] = [name for name in frames if name not in FRAME_LOOPS]

    scroll_to(page, 0)
    record["theme"]["cards off screen"] = theme_trace(page)
    scroll_to(page, section_top(page, "career-section"))
    time.sleep(CAREER_SETTLE_S)
    record["theme"]["cards in view"] = theme_trace(page)

    scroll_to(page, 0)
    page.evaluate(TRACE_RESET)
    page.click_selector("#language-toggle")
    page.wait_for("document.getElementById('language-toggle').getAttribute('aria-expanded') === 'true'", timeout=5)
    page.click_selector('[data-language="en"]')
    page.wait_for("document.documentElement.lang === 'en'", timeout=8)
    time.sleep(LANGUAGE_SETTLE_S)
    record["language"] = read_trace(page)["emits"]

    wired = page.evaluate(WIRING_READ)
    record["listeners"] = group_listeners(wired["listeners"])
    record["subscriptions"] = group_subscriptions(wired["subscriptions"])
    return record


def instrumented_events_module(root: Path) -> bytes:
    source = (root / EVENTS_MODULE).read_text(encoding="utf-8")
    for anchor in ("listeners.get(type).push(listener);", "emit(type, detail) {"):
        if anchor not in source:
            raise CDPError(f"{EVENTS_MODULE} no longer contains {anchor!r}")
    return (source
            .replace("listeners.get(type).push(listener);",
                     "listeners.get(type).push(listener); window.__wiring.subscribed(type);")
            .replace("emit(type, detail) {", "emit(type, detail) { window.__wiring.emitted(type);")
            .encode())


def run(configurations, root: Path) -> dict:
    result = {}
    overrides = {f"/{EVENTS_MODULE}": instrumented_events_module(root)}
    with Browser() as browser, DevServer(root=root, overrides=overrides) as server:
        for device in configurations:
            print(f"  {device}", flush=True)
            page = browser.new_page(DEVICES[device], init_script=SKIP_INTRO + INSTRUMENT)
            try:
                page.navigate(server.url)
                page.wait_for("!document.getElementById('intro-overlay')", timeout=15, message="initApp never ran")
                time.sleep(LOAD_SETTLE_S)
                result[device] = {"record": capture(page), "errors": page.errors, "warnings": page.warnings}
            finally:
                page.close()
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("mode", choices=("record", "compare"))
    parser.add_argument("baseline", type=Path)
    parser.add_argument("--only", help="comma-separated devices, e.g. desktop,mobile")
    parser.add_argument("--root", type=Path, default=ROOT,
                        help="site directory to serve, e.g. a worktree of the code before the change")
    parser.add_argument("--limit", type=int, default=60, help="differences to print per device")
    parser.add_argument("--ignore", action="append", default=[], metavar="REGEX",
                        help="drop differences matching this pattern (an intended change); repeatable")
    args = parser.parse_args()

    configurations = [device for device in CONFIGURATIONS if not args.only or device in args.only.split(",")]
    started = time.monotonic()
    try:
        current = run(configurations, args.root.resolve())
    except CDPError as error:
        print(f"probe failed: {error}")
        return 1

    if args.mode == "record":
        args.baseline.write_text(json.dumps(current))
        print(f"recorded {len(current)} devices in {time.monotonic() - started:.0f}s -> {args.baseline}")
        return 0

    baseline = json.loads(args.baseline.read_text())
    ignored_patterns = [re.compile(pattern) for pattern in args.ignore]
    total = ignored = 0
    for device, run_result in current.items():
        if run_result["errors"]:
            print(f"[{device}] runtime errors: {run_result['errors'][:3]}")
            total += len(run_result["errors"])
        # The site warns when an animation falls back; a clean run takes no fallback.
        fallbacks = [warning for warning in run_result["warnings"] if "[EurekaWeb]" in warning]
        if fallbacks:
            print(f"[{device}] fallbacks taken: {fallbacks[:3]}")
            total += len(fallbacks)
        lines = diff_exact(baseline.get(device, {}).get("record"), run_result["record"])
        kept = [line for line in lines if not any(p.search(line) for p in ignored_patterns)]
        ignored += len(lines) - len(kept)
        total += len(kept)
        if kept:
            print(f"[{device}] {len(kept)} differences")
            for line in kept[: args.limit]:
                print(f"    {line}")
    note = f", {ignored} intended difference(s) ignored" if ignored else ""
    print(f"\n{'identical' if not total else f'{total} differences'}{note} ({time.monotonic() - started:.0f}s)")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
