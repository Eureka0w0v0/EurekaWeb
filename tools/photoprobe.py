#!/usr/bin/env python3
"""Frame-exact replay of the photo theatre, for refactors of js/photo/.

snapshot.py sees the theatre at rest. The weighted drop-in, the carousel glide,
a Show All reversed halfway and the chosen card gliding back into the queue
only exist between those stops, and they are what the theatre is for.

    python3 tools/photoprobe.py record  /tmp/photo.json   # on the old code
    python3 tools/photoprobe.py compare /tmp/photo.json   # on the new code

The page runs on a virtual clock: requestAnimationFrame only queues, and
performance.now and the frame timestamps advance when this script says so.
CSS transitions are switched off so a computed transform is the one last
written. A fixed journey then plays out one frame at a time -- scroll through
the drop-in, click and wheel the carousel, open the lightbox, toggle Show All
and reverse it mid-flight, scroll back up -- and after every frame the probe
reads what the theatre wrote: each card's inline styles, slot and tab order,
the title, the queue, Show All and the section's size.

Rows are compared exactly. Baselines depend on the machine's fonts, so record
and compare on the same machine; they are not committed.
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

# (device, reduced motion)
CONFIGURATIONS = (("desktop", False), ("mobile", False), ("tablet", False), ("desktop", True))
JOURNEY_TIMEOUT_S = 240.0
START_TICKS = 12
START_SETTLE_S = 1.5

VIRTUAL_CLOCK = r"""
(() => {
  const realFrame = window.requestAnimationFrame.bind(window);
  const callbacks = new Map();
  let nextId = 1;
  let now = 1000;
  window.requestAnimationFrame = (callback) => {
    callbacks.set(nextId, callback);
    return nextId++;
  };
  window.cancelAnimationFrame = (id) => {
    callbacks.delete(id);
  };
  Object.defineProperty(performance, "now", { value: () => now });
  window.__clock = {
    realFrame: () => new Promise((resolve) => realFrame(() => resolve())),
    tick(ms = 1000 / 60) {
      now += ms;
      const batch = [...callbacks.values()];
      callbacks.clear();
      for (const callback of batch) {
        callback(now);
      }
    },
  };
  addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = "*, *::before, *::after { transition: none !important; animation: none !important; }";
    document.head.append(style);
  });
})();
"""

JOURNEY = r"""(async () => {
  const clock = window.__clock;
  const section = document.getElementById("photo-section");
  const showAll = document.getElementById("photo-show-all");
  const rows = [];
  let previous = "";

  const cardRow = (card) => [
    card.style.transform, card.style.opacity, card.style.zIndex, card.style.filter,
    card.style.getPropertyValue("--photo-card-shadow-strength"),
    card.style.getPropertyValue("--photo-card-depth"),
    card.style.getPropertyValue("--photo-shine-x"),
    card.dataset.photoSlot, card.dataset.photoContentSlot, card.dataset.photoCloneSource,
    card.getAttribute("tabindex"), card.getAttribute("aria-label"), card.getAttribute("data-i18n-aria"),
    card.querySelector(".photo-card-image")?.getAttribute("src"),
  ].join("|");
  const read = (label) => {
    const title = document.querySelector(".photo-fixed-title");
    const queue = document.querySelector(".photo-queue");
    const row = {
      label,
      cards: [...document.querySelectorAll(".photo-stage .photo-card")].map(cardRow),
      section: [
        section.style.minHeight, section.style.paddingBottom,
        ...["--photo-queue-y", "--photo-queue-opacity", "--photo-queue-bleed", "--photo-insert-progress"]
          .map((name) => section.style.getPropertyValue(name)),
      ],
      title: [title?.className, title?.style.getPropertyValue("--photo-fixed-title-opacity"),
        title?.style.getPropertyValue("--photo-title-y")],
      queue: [queue?.style.height, queue?.style.zIndex],
      showAll: [showAll.className, showAll.textContent, showAll.getAttribute("aria-expanded"),
        ...["--photo-show-all-opacity", "--photo-show-all-x", "--photo-show-all-y"]
          .map((name) => showAll.style.getPropertyValue(name))],
      zoom: [document.getElementById("photo-zoom-overlay").className,
        document.documentElement.classList.contains("is-photo-zoom-open")],
    };
    const text = JSON.stringify({ ...row, label: "" });
    if (text !== previous) {
      rows.push(row);
      previous = text;
    }
  };
  const run = (label, frames) => {
    for (let i = 0; i < frames; i += 1) {
      clock.tick();
      read(`${label} +${i}`);
    }
  };
  /* A real frame, so the browser delivers the scroll event, then virtual ones. */
  const scrollAndRun = async (label, top, frames) => {
    scrollTo({ top, behavior: "instant" });
    await clock.realFrame();
    await clock.realFrame();
    run(label, frames);
  };
  const scrollThrough = async (label, from, to, stride, frames) => {
    const direction = Math.sign(to - from);
    for (let y = from; direction * (to - y) > 0; y += direction * stride) {
      await scrollAndRun(`${label} ${Math.round(y)}`, y, frames);
    }
    await scrollAndRun(`${label} ${Math.round(to)}`, to, frames);
  };
  const cards = () => [...document.querySelectorAll(".photo-stage .photo-card")];
  const cardAtSlot = (slot) => cards().find((card) => Number(card.dataset.photoSlot) === slot);
  const activeSlot = () => {
    const widest = cards().map((card) => ({ card, width: card.getBoundingClientRect().width }))
      .sort((a, b) => b.width - a.width)[0];
    return Number(widest.card.dataset.photoSlot);
  };
  const clickCard = (card) => {
    const rect = card.getBoundingClientRect();
    card.dispatchEvent(new MouseEvent("click", {
      bubbles: true, cancelable: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
    }));
  };
  const wheel = (deltaX) => {
    const rect = cardAtSlot(activeSlot()).getBoundingClientRect();
    section.dispatchEvent(new WheelEvent("wheel", {
      bubbles: true, cancelable: true, deltaX, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
    }));
  };

  const top = section.getBoundingClientRect().top + scrollY;
  const viewport = innerHeight;
  const bottom = () => document.scrollingElement.scrollHeight - innerHeight;
  await scrollThrough("drop-in", top - viewport, bottom(), viewport * 0.08, 4);
  run("drop-in settles", 90);

  /* Back up until Show All is on screen, as a visitor would stop. */
  const buttonTop = showAll.getBoundingClientRect().top;
  await scrollAndRun("to the stage", scrollY + Math.min(0, buttonTop - 120), 60);

  clickCard(cardAtSlot(activeSlot() + 1));
  run("click a neighbour", 60);
  clickCard(cardAtSlot(activeSlot() - 1));
  run("click back", 60);
  for (const [name, delta] of [["forward", 80], ["forward again", 80], ["back", -80]]) {
    wheel(delta);
    run(`wheel ${name}`, 50);
  }

  clickCard(cardAtSlot(activeSlot()));
  run("lightbox opens", 8);
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  run("lightbox closes", 8);

  showAll.click();
  run("show all, first half", 24);
  showAll.click();
  run("reversed halfway", 70);
  showAll.click();
  run("show all to the end", 80);
  showAll.click();
  run("collapse", 70);

  clickCard(cardAtSlot(activeSlot() + 1));
  run("step before leaving", 60);
  await scrollThrough("back up", scrollY, top - viewport * 0.4, viewport * 0.08, 4);
  run("reinsert settles", 60);
  await scrollThrough("away", scrollY, top - viewport * 1.4, viewport * 0.3, 2);
  run("reset", 20);
  await scrollThrough("in again", scrollY, top + viewport, viewport * 0.08, 4);
  run("settles again", 60);
  return rows;
})()"""


def capture(page: Page) -> list:
    # The page's startup awaits frames, which now only come from here.
    for _ in range(START_TICKS):
        page.evaluate("window.__clock.tick()")
        time.sleep(0.05)
    time.sleep(START_SETTLE_S)
    page.evaluate("for (let i = 0; i < 4; i += 1) window.__clock.tick()")
    return page.evaluate(JOURNEY, timeout=JOURNEY_TIMEOUT_S)


def run(configurations, root: Path) -> dict:
    result = {}
    with Browser() as browser, DevServer(root=root) as server:
        for device, reduced in configurations:
            label = f"{device}{'-reduced' if reduced else ''}"
            print(f"  {label}", flush=True)
            page = browser.new_page(DEVICES[device], reduced_motion=reduced, init_script=SKIP_INTRO + VIRTUAL_CLOCK)
            try:
                page.navigate(server.url)
                page.wait_for("!document.getElementById('intro-overlay')", timeout=15, message="initApp never ran")
                result[label] = {"rows": capture(page), "errors": page.errors}
            finally:
                page.close()
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("mode", choices=("record", "compare"))
    parser.add_argument("baseline", type=Path)
    parser.add_argument("--root", type=Path, default=ROOT,
                        help="site directory to serve, e.g. a worktree of the code before the change")
    parser.add_argument("--limit", type=int, default=20, help="differences to print per configuration")
    args = parser.parse_args()

    started = time.monotonic()
    try:
        current = run(CONFIGURATIONS, args.root.resolve())
    except CDPError as error:
        print(f"probe failed: {error}")
        return 1

    if args.mode == "record":
        args.baseline.write_text(json.dumps(current))
        rows = sum(len(c["rows"]) for c in current.values())
        print(f"recorded {rows} rows in {time.monotonic() - started:.0f}s -> {args.baseline}")
        return 0

    baseline = json.loads(args.baseline.read_text())
    total = 0
    for label, run_result in current.items():
        if run_result["errors"]:
            print(f"[{label}] runtime errors: {run_result['errors'][:3]}")
            total += len(run_result["errors"])
        lines = diff_exact(baseline.get(label, {}).get("rows"), run_result["rows"])
        total += len(lines)
        if lines:
            print(f"[{label}] {len(lines)} differences")
            for line in lines[: args.limit]:
                print(f"    {line}")
    print(f"\n{'identical' if not total else f'{total} differences'} ({time.monotonic() - started:.0f}s)")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
