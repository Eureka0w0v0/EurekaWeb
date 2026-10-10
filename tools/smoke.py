#!/usr/bin/env python3
"""Browser smoke test for Eureka Web.

Serves the working tree locally, drives headless Chrome over the DevTools
protocol (tools/cdp.py, standard library only) and checks that the page works
end to end on a desktop, a phone and a touch tablet, in both themes:

  - it loads with no exception, console error or failed request;
  - the five sections and twenty photo cards are there;
  - the whole page scrolls down and back up, and the brain scene mounts;
  - the career cards step 1 -> 2 -> 3 -> 1 with their geometry intact;
  - the language switch changes the copy to English and Japanese and back;
  - the theme toggle flips the theme and back;
  - the photo carousel steps, the lightbox opens and closes, Show All
    expands and collapses.

Plus three regression checks that do not depend on the device:

  - a slow site-config.json must not hold the page back;
  - maintenance mode still redirects;
  - the service worker keeps one cached copy per asset path.

    python3 tools/smoke.py            # everything
    python3 tools/smoke.py --quick    # desktop, light theme, regression checks

Exit status 1 when any check fails.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))

from cdp import DEVICES, Browser, CDPError, Page  # noqa: E402
from devserver import DevServer  # noqa: E402

SKIP_INTRO = 'try { sessionStorage.setItem("eurekaweb:intro-seen", "1"); } catch (error) {}'
SECTIONS = ("welcome-section", "hero-section", "language-section", "career-section", "photo-section")
PHOTO_CARDS = 20
COPY = {
    "zh": {"lang": "zh-CN", "railPhoto": "照片", "careerLayer1Title": "职业",
           "languageToggle": "切换语言", "themeToggle": "切换浅色或深色模式", "photoZoom": "放大的照片"},
    "en": {"lang": "en", "railPhoto": "Photos", "careerLayer1Title": "Career",
           "languageToggle": "Switch language", "themeToggle": "Switch between light and dark mode",
           "photoZoom": "Enlarged photo"},
    "ja": {"lang": "ja", "railPhoto": "写真", "careerLayer1Title": "職業",
           "languageToggle": "言語を切り替える", "themeToggle": "ライトモードとダークモードを切り替える",
           "photoZoom": "拡大した写真"},
}
CONFIG_DELAY_S = 2.0
# How long after DOMContentLoaded the page may take to start without the
# config. Generous for CI; the old blocking behaviour sat at the full delay.
CONFIG_INDEPENDENCE_BUDGET_MS = 800
CAREER_SETTLE_S = 2.8
PHOTO_BUTTON_TARGET_Y = 120
STEP_SETTLE_S = 1.6

# Scrolls with behavior "instant": the page sets scroll-behavior: smooth, and
# a smooth scroll restarted every frame barely moves.
SCROLL_TO = """(async (target) => {
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  const step = Math.max(40, Math.round(innerHeight * 0.1));
  const started = performance.now();
  while (performance.now() - started < 60000) {
    const max = document.scrollingElement.scrollHeight - innerHeight;
    const goal = Math.max(0, Math.min(target, max));
    const delta = goal - scrollY;
    if (Math.abs(delta) <= step) {
      scrollTo({ top: goal, behavior: "instant" });
      break;
    }
    scrollBy({ top: Math.sign(delta) * step, behavior: "instant" });
    await frame();
  }
  await frame();
  return scrollY;
})"""

CAREER_STATE = """(() => {
  const stack = document.querySelector(".career-card-stack");
  const layers = [...document.querySelectorAll("[data-career-layer]")];
  return {
    active: Number(stack.dataset.activeLayer),
    stackTransform: getComputedStyle(stack).transform,
    layers: layers.map((layer) => {
      const rect = layer.getBoundingClientRect();
      const style = getComputedStyle(layer);
      return { cx: rect.left + rect.width / 2, width: rect.width, z: Number(style.zIndex) || 0, opacity: Number(style.opacity) };
    }),
  };
})()"""

PHOTO_STATE = """(() => {
  const cards = [...document.querySelectorAll(".photo-stage .photo-card")]
    .map((card) => ({ card, rect: card.getBoundingClientRect(), style: getComputedStyle(card) }))
    .filter(({ rect, style }) => style.visibility !== "hidden" && Number(style.opacity) > 0.05
      && rect.right > 0 && rect.left < innerWidth && rect.bottom > 0 && rect.top < innerHeight);
  cards.sort((a, b) => b.rect.width - a.rect.width);
  const describe = ({ card, rect }) => ({
    slot: Number(card.dataset.photoSlot),
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    width: rect.width,
  });
  return {
    main: cards[0] ? describe(cards[0]) : null,
    visible: cards.map(describe),
    showAll: document.querySelector("#photo-show-all")?.getAttribute("aria-expanded"),
    zoomOpen: document.querySelector("#photo-zoom-overlay")?.classList.contains("is-active"),
  };
})()"""


class Results:
    def __init__(self) -> None:
        self.failures: list[str] = []
        self.passed = 0

    def check(self, label: str, condition: bool, detail: str = "") -> bool:
        if condition:
            self.passed += 1
        else:
            self.failures.append(f"{label}{': ' + detail if detail else ''}")
            print(f"    FAIL {label}{': ' + detail if detail else ''}", flush=True)
        return condition


def scroll_to(page: Page, y: float) -> float:
    return page.evaluate(f"{SCROLL_TO}({json.dumps(y)})", timeout=90)


def section_top(page: Page, section_id: str) -> float:
    return page.evaluate(
        f"document.getElementById({json.dumps(section_id)}).getBoundingClientRect().top + scrollY"
    )


def open_page(browser: Browser, server_url: str, device: str, dark: bool) -> Page:
    page = browser.new_page(DEVICES[device], dark=dark, init_script=SKIP_INTRO)
    page.navigate(server_url)
    # With the intro skipped, initApp removes the overlay as soon as it runs.
    page.wait_for("!document.getElementById('intro-overlay')", timeout=15, message="initApp never ran")
    return page


def check_structure(page: Page, results: Results, dark: bool, tag: str) -> None:
    found = page.evaluate(f"{json.dumps(SECTIONS)}.filter((id) => document.getElementById(id))")
    results.check(f"{tag} sections", found == list(SECTIONS), f"found {found}")
    cards = page.evaluate("document.querySelectorAll('.photo-queue-card').length")
    results.check(f"{tag} photo cards", cards == PHOTO_CARDS, f"{cards} cards")
    theme_dark = page.evaluate("document.documentElement.classList.contains('theme-dark')")
    results.check(f"{tag} theme follows system", theme_dark == dark, f"theme-dark={theme_dark}")
    lang = page.evaluate("document.documentElement.lang")
    results.check(f"{tag} default language", lang == COPY["zh"]["lang"], lang)


def check_scroll_and_brain(page: Page, results: Results, tag: str) -> None:
    scroll_to(page, section_top(page, "language-section"))
    try:
        page.wait_for("!!document.querySelector('#brain-three-mount canvas')", timeout=20)
        mounted = True
    except CDPError:
        mounted = False
    results.check(f"{tag} brain scene mounts", mounted)
    bottom = scroll_to(page, 1e9)
    max_scroll = page.evaluate("document.scrollingElement.scrollHeight - innerHeight")
    results.check(f"{tag} reaches the bottom", abs(bottom - max_scroll) < 2, f"{bottom} of {max_scroll}")
    top = scroll_to(page, 0)
    results.check(f"{tag} returns to the top", top < 2, f"scrollY={top}")


def check_career(page: Page, results: Results, tag: str) -> None:
    scroll_to(page, section_top(page, "career-section"))
    time.sleep(CAREER_SETTLE_S)
    page.evaluate("document.querySelector('.career-card-stack').focus({ preventScroll: true })")
    transforms = set()
    for key, expected in (("ArrowDown", 2), ("ArrowDown", 3), ("Home", 1)):
        state = page.evaluate(CAREER_STATE)
        transforms.add(state["stackTransform"])
        _check_career_layers(results, tag, state)
        page.press_key(key, key_code={"ArrowDown": 40, "Home": 36}[key])
        time.sleep(STEP_SETTLE_S)
        after = page.evaluate(CAREER_STATE)
        results.check(f"{tag} career {key} -> {expected}", after["active"] == expected, f"active={after['active']}")
    final = page.evaluate(CAREER_STATE)
    transforms.add(final["stackTransform"])
    _check_career_layers(results, tag, final)
    results.check(f"{tag} career stack stays centred", len(transforms) == 1, f"{transforms}")


def _check_career_layers(results: Results, tag: str, state: dict) -> None:
    layers = state["layers"]
    active = layers[state["active"] - 1]
    spread = max(layer["cx"] for layer in layers) - min(layer["cx"] for layer in layers)
    results.check(f"{tag} career layers aligned (layer {state['active']})", spread <= 30, f"spread {spread:.1f}px")
    results.check(f"{tag} career active layer in front (layer {state['active']})",
                  active["z"] == max(layer["z"] for layer in layers)
                  and active["width"] >= max(layer["width"] for layer in layers) - 0.5
                  and active["opacity"] > 0.99,
                  json.dumps(layers))


def check_pointer(page: Page, results: Results, tag: str) -> None:
    """Desktop only: the tilt card and the language parallax follow the mouse."""
    if page.device.touch:
        return
    scroll_to(page, section_top(page, "hero-section"))
    time.sleep(0.6)
    card = page.evaluate("(() => { const r = document.getElementById('feature-card').getBoundingClientRect();"
                         " return { x: r.left + r.width * 0.8, y: r.top + r.height * 0.3 }; })()")
    page.send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": card["x"], "y": card["y"]})
    try:
        page.wait_for("getComputedStyle(document.getElementById('feature-card')).transform !== 'none'"
                      " && document.getElementById('feature-card').style.transform.includes('rotateY(')"
                      " && !document.getElementById('feature-card').style.transform.includes('rotateY(0deg)')",
                      timeout=3)
        tilted = True
    except CDPError:
        tilted = False
    results.check(f"{tag} tilt card follows the pointer", tilted,
                  page.evaluate("document.getElementById('feature-card').style.transform"))

    scroll_to(page, section_top(page, "language-section"))
    time.sleep(0.6)
    spot = page.evaluate("(() => { const r = document.getElementById('language-universe').getBoundingClientRect();"
                         " return { x: r.left + r.width * 0.25, y: r.top + r.height * 0.25 }; })()")
    page.send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": spot["x"], "y": spot["y"]})
    try:
        page.wait_for("Number(document.getElementById('language-universe').style.getPropertyValue('--universe-x')) < -0.2",
                      timeout=3)
        moved = True
    except CDPError:
        moved = False
    results.check(f"{tag} language universe parallax follows the pointer", moved,
                  page.evaluate("document.getElementById('language-universe').style.getPropertyValue('--universe-x')"))


def check_language(page: Page, results: Results, tag: str) -> None:
    for language in ("en", "ja", "zh"):
        page.click_selector("#language-toggle")
        page.wait_for("document.getElementById('language-toggle').getAttribute('aria-expanded') === 'true'",
                      timeout=5, message="language menu did not open")
        page.click_selector(f'[data-language="{language}"]')
        expected = COPY[language]
        try:
            page.wait_for(f"document.documentElement.lang === {json.dumps(expected['lang'])}", timeout=8)
        except CDPError:
            pass
        time.sleep(2.0)
        state = page.evaluate(
            "({ lang: document.documentElement.lang,"
            " rail: document.querySelector('[data-i18n=\"railPhoto\"]').textContent.trim(),"
            " career: document.querySelector('[data-i18n=\"careerLayer1Title\"]').textContent.trim(),"
            " languageToggle: document.getElementById('language-toggle').getAttribute('aria-label'),"
            " themeToggle: document.getElementById('theme-toggle').getAttribute('aria-label'),"
            " themeTitle: document.getElementById('theme-toggle').getAttribute('title'),"
            " photoZoom: document.getElementById('photo-zoom-overlay').getAttribute('aria-label') })"
        )
        results.check(f"{tag} language {language}",
                      state == {"lang": expected["lang"], "rail": expected["railPhoto"],
                                "career": expected["careerLayer1Title"],
                                "languageToggle": expected["languageToggle"],
                                "themeToggle": expected["themeToggle"], "themeTitle": expected["themeToggle"],
                                "photoZoom": expected["photoZoom"]},
                      json.dumps(state, ensure_ascii=False))


# Every class the theme transition puts on <html> starts with "theme-";
# theme-dark is the only one that stays. The toggle ignores clicks until the
# rest are gone, so a test that clicks sooner is testing nothing.
THEME_SETTLED = "[...document.documentElement.classList].every((name) => !name.startsWith('theme-') || name === 'theme-dark')"


def check_theme(page: Page, results: Results, tag: str, dark: bool) -> None:
    for expected_dark in (not dark, dark):
        page.wait_for(THEME_SETTLED, timeout=10, message="theme transition never settled")
        page.click_selector("#theme-toggle")
        try:
            page.wait_for(
                f"document.documentElement.classList.contains('theme-dark') === {json.dumps(expected_dark)}",
                timeout=8)
            flipped = True
        except CDPError:
            flipped = False
        results.check(f"{tag} theme toggle -> {'dark' if expected_dark else 'light'}", flipped)
    page.wait_for(THEME_SETTLED, timeout=10, message="theme transition never settled")


def scroll_photo_stage_into_view(page: Page) -> None:
    """Run the whole drop-in, then come back up until Show All is on screen.

    At the very bottom of the page the sticky stage has already started to
    leave: the cards are visible but the button above them is not."""
    scroll_to(page, 1e9)
    time.sleep(2.0)
    button_top = page.evaluate("document.getElementById('photo-show-all').getBoundingClientRect().top")
    current = page.evaluate("scrollY")
    scroll_to(page, current + min(0.0, button_top - PHOTO_BUTTON_TARGET_Y))
    time.sleep(2.5)


def check_photos(page: Page, results: Results, tag: str) -> None:
    scroll_photo_stage_into_view(page)
    state = page.evaluate(PHOTO_STATE)
    if not results.check(f"{tag} photo carousel visible", bool(state["main"]), json.dumps(state)[:300]):
        return
    main_slot = state["main"]["slot"]
    neighbour = next((card for card in state["visible"] if card["slot"] == main_slot + 1), None)
    if results.check(f"{tag} photo neighbour visible", neighbour is not None):
        page.click(neighbour["x"], neighbour["y"])
        try:
            page.wait_for(f"({PHOTO_STATE}).main?.slot === {main_slot + 1}", timeout=6)
            stepped = True
        except CDPError:
            stepped = False
        results.check(f"{tag} photo carousel steps", stepped)
        time.sleep(1.0)

    state = page.evaluate(PHOTO_STATE)
    page.click(state["main"]["x"], state["main"]["y"])
    try:
        page.wait_for(f"({PHOTO_STATE}).zoomOpen", timeout=6)
        opened = True
    except CDPError:
        opened = False
    results.check(f"{tag} lightbox opens", opened)
    if opened:
        time.sleep(0.8)
        page.press_key("Escape", key_code=27)
        try:
            page.wait_for(f"!({PHOTO_STATE}).zoomOpen", timeout=6)
            closed = True
        except CDPError:
            closed = False
        results.check(f"{tag} lightbox closes", closed)
        time.sleep(0.8)

    for expected in ("true", "false"):
        page.click_selector("#photo-show-all")
        try:
            page.wait_for(f"({PHOTO_STATE}).showAll === {json.dumps(expected)}", timeout=6)
            toggled = True
        except CDPError:
            toggled = False
        results.check(f"{tag} show all -> {expected}", toggled)
        time.sleep(1.5)


def _career_steps_after_theme_change(page: Page, results: Results, label: str) -> None:
    page.wait_for(THEME_SETTLED, timeout=10, message="theme transition never settled")
    time.sleep(1.0)
    page.evaluate("document.querySelector('.career-card-stack').focus({ preventScroll: true })")
    page.press_key("ArrowDown", key_code=40)
    time.sleep(STEP_SETTLE_S)
    active = page.evaluate(CAREER_STATE)["active"]
    results.check(label, active == 2, f"active={active}")
    page.press_key("Home", key_code=36)
    time.sleep(STEP_SETTLE_S)


def check_career_after_theme(page: Page, results: Results, tag: str) -> None:
    """The career scene freezes while the theme changes and must let go after.

    Two ways out, both covered: changed elsewhere on the page, the cards wait
    for the visitor to scroll; changed with the cards on screen, they wait out
    a short cooldown."""
    scroll_photo_stage_into_view(page)
    page.wait_for(THEME_SETTLED, timeout=10, message="theme transition never settled")
    page.click_selector("#theme-toggle")
    time.sleep(0.2)
    page.wait_for(THEME_SETTLED, timeout=10, message="theme transition never settled")
    scroll_to(page, section_top(page, "career-section"))
    time.sleep(CAREER_SETTLE_S)
    _career_steps_after_theme_change(page, results, f"{tag} career unlocks after a theme change elsewhere")

    page.click_selector("#theme-toggle")
    time.sleep(0.2)
    _career_steps_after_theme_change(page, results, f"{tag} career unlocks after a theme change in view")


def run_configuration(browser: Browser, server_url: str, device: str, dark: bool, results: Results) -> None:
    tag = f"[{device}/{'dark' if dark else 'light'}]"
    print(f"  {tag}", flush=True)
    page = open_page(browser, server_url, device, dark)
    try:
        for step in (
            lambda: check_structure(page, results, dark, tag),
            lambda: check_scroll_and_brain(page, results, tag),
            lambda: check_pointer(page, results, tag),
            lambda: check_career(page, results, tag),
            lambda: check_language(page, results, tag),
            lambda: check_theme(page, results, tag, dark),
            lambda: check_photos(page, results, tag),
            lambda: check_career_after_theme(page, results, tag),
        ):
            try:
                step()
            except CDPError as error:
                results.check(f"{tag} step raised", False, str(error))
        results.check(f"{tag} no runtime errors", not page.errors, "; ".join(page.errors[:5]))
    finally:
        page.close()


def check_config_does_not_block(browser: Browser, results: Results) -> None:
    print("  [config] slow site-config.json", flush=True)
    timing_probe = (
        SKIP_INTRO
        + """
        new MutationObserver((records, observer) => {
          if (document.readyState !== "loading" && !document.getElementById("intro-overlay")) {
            window.__overlayGoneAt = performance.now();
            observer.disconnect();
          }
        }).observe(document, { childList: true, subtree: true });
        """
    )
    with DevServer(delays={"/site-config.json": CONFIG_DELAY_S}) as server:
        page = browser.new_page(DEVICES["desktop"], init_script=timing_probe)
        try:
            page.navigate(server.url)
            page.wait_for("window.__overlayGoneAt", timeout=CONFIG_DELAY_S + 10)
            gap = page.evaluate(
                "window.__overlayGoneAt - performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd"
            )
            results.check("[config] page starts without waiting for the config",
                          gap < CONFIG_INDEPENDENCE_BUDGET_MS, f"started {gap:.0f}ms after DOMContentLoaded")
        finally:
            page.close()


def check_maintenance_redirect(browser: Browser, results: Results) -> None:
    print("  [config] maintenance mode", flush=True)
    overrides = {"/site-config.json": b'{ "maintenance": true }'}
    with DevServer(overrides=overrides) as server:
        page = browser.new_page(DEVICES["desktop"], init_script=SKIP_INTRO)
        try:
            page.navigate(server.url)
            try:
                page.wait_for("location.pathname.endsWith('/maintenance/index.html')", timeout=10)
                redirected = True
            except CDPError:
                redirected = False
            results.check("[config] maintenance redirects", redirected,
                          page.evaluate("location.pathname"))
        finally:
            page.close()


def check_service_worker_cache(browser: Browser, server_url: str, results: Results) -> None:
    print("  [sw] one cached copy per asset", flush=True)
    page = browser.new_page(DEVICES["desktop"], init_script=SKIP_INTRO)
    try:
        page.navigate(server_url)
        page.wait_for("!!navigator.serviceWorker?.controller", timeout=15,
                      message="service worker never took control")
        urls = page.evaluate("""(async () => {
          const settle = () => new Promise((resolve) => setTimeout(resolve, 500));
          const assetCaches = async () => (await caches.keys()).filter((key) => key.startsWith("eureka-assets"));
          // One request through the worker first, so the stale copies below go
          // into the cache it actually uses rather than one the test invents.
          await (await fetch(`./css/base.css?v=warmup-${Date.now()}`)).text();
          await settle();
          const [name] = await assetCaches();
          const cache = await caches.open(name);
          const asset = new URL("./css/base.css", location.href).href;
          await cache.put(new Request(asset + "?v=stale-one"), new Response("/* stale */"));
          await cache.put(new Request(asset + "?v=stale-two"), new Response("/* stale */"));
          await (await fetch(`./css/base.css?v=probe-${Date.now()}`)).text();
          await settle();
          const entries = await Promise.all((await assetCaches())
            .map(async (key) => (await (await caches.open(key)).keys()).map((request) => request.url)));
          return entries.flat().filter((url) => new URL(url).pathname.endsWith("/css/base.css"));
        })()""")
        results.check("[sw] one cached copy per asset path", len(urls) == 1, json.dumps(urls))
    finally:
        page.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--quick", action="store_true", help="desktop/light plus the regression checks only")
    args = parser.parse_args()

    results = Results()
    started = time.monotonic()
    # Chrome is started before any server thread: subprocess forks to hand it
    # its pipe descriptors, and forking a multi-threaded process is unsafe.
    with Browser() as browser:
        with DevServer() as server:
            print(f"serving {server.url}", flush=True)
            configurations = [("desktop", False)] if args.quick else [
                ("desktop", False), ("desktop", True),
                ("mobile", False), ("mobile", True),
                ("tablet", False), ("tablet", True),
            ]
            for device, dark in configurations:
                run_configuration(browser, server.url, device, dark, results)
            check_service_worker_cache(browser, server.url, results)
        check_config_does_not_block(browser, results)
        check_maintenance_redirect(browser, results)

    elapsed = time.monotonic() - started
    print(f"\n{results.passed} passed, {len(results.failures)} failed in {elapsed:.0f}s")
    for failure in results.failures:
        print(f"  - {failure}")
    return 1 if results.failures else 0


if __name__ == "__main__":
    sys.exit(main())
