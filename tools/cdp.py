"""Minimal Chrome DevTools Protocol client for the site's browser tests.

Standard library only, in keeping with the rest of tools/: no Node, no
websocket package. Chrome is started with --remote-debugging-pipe, which
speaks the protocol over two inherited file descriptors -- Chrome reads
commands from fd 3 and writes replies and events to fd 4, one JSON message
per NUL-terminated frame -- so there is no port to pick and no handshake.

    with Browser() as browser:
        page = browser.new_page(DEVICES["desktop"])
        page.navigate(url)
        title = page.evaluate("document.title")

Set CHROME to point at a specific binary; otherwise the usual macOS and Linux
locations are tried. Set CHROME_NO_SANDBOX=1 on CI runners whose kernel
refuses Chrome's sandbox (Ubuntu 24.04 restricts unprivileged user
namespaces, which the sandbox depends on).
"""

from __future__ import annotations

import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from dataclasses import dataclass
from pathlib import Path

COMMAND_TIMEOUT_S = 30.0
POLL_INTERVAL_S = 0.05

MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
LINUX_CANDIDATES = ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome")


class CDPError(RuntimeError):
    """A protocol command failed, or the page threw while evaluating."""


@dataclass(frozen=True)
class Device:
    """Viewport and input emulation for one test configuration."""

    name: str
    width: int
    height: int
    scale: float = 1.0
    mobile: bool = False
    touch: bool = False


DEVICES = {
    "desktop": Device("desktop", 1440, 900),
    # Phone-sized, touch-only: matches the site's compact layout and its
    # (hover: none) and (pointer: coarse) interaction rules at once.
    "mobile": Device("mobile", 390, 844, scale=2.0, mobile=True, touch=True),
    # Wide but touch-only: the case where width-based layout rules and
    # input-based interaction rules disagree, so both have to keep working.
    "tablet": Device("tablet", 1180, 820, scale=2.0, mobile=True, touch=True),
}


def find_chrome() -> str:
    explicit = os.environ.get("CHROME")
    if explicit:
        return explicit
    if sys.platform == "darwin" and Path(MAC_CHROME).exists():
        return MAC_CHROME
    for candidate in LINUX_CANDIDATES:
        found = shutil.which(candidate)
        if found:
            return found
    raise FileNotFoundError("Chrome not found; set CHROME to the browser binary")


class Browser:
    """One headless Chrome process and the pipe connection to it."""

    def __init__(self, chrome: str | None = None):
        self._chrome = chrome or find_chrome()
        self._profile = tempfile.mkdtemp(prefix="eurekaweb-cdp-")
        self._lock = threading.Condition()
        self._next_id = 0
        self._replies: dict[int, dict] = {}
        self._events: list[dict] = []
        self._listeners: list = []
        self._closed = False
        self._proc = None
        self._writer = None
        self._reader_thread = None

    # -- lifecycle -----------------------------------------------------------

    def __enter__(self) -> "Browser":
        self.start()
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    def start(self) -> None:
        cmd_read, cmd_write = os.pipe()
        reply_read, reply_write = os.pipe()

        def remap_fds() -> None:
            os.dup2(cmd_read, 3)
            os.dup2(reply_write, 4)

        args = [
            self._chrome,
            "--headless=new",
            "--remote-debugging-pipe",
            f"--user-data-dir={self._profile}",
            "--no-first-run",
            "--no-default-browser-check",
            "--hide-scrollbars",
            "--mute-audio",
            # WebGL in headless needs a software rasteriser.
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
            # Animation timing is what the tests measure; nothing may be
            # throttled for being "in the background".
            "--disable-background-timer-throttling",
            "--disable-renderer-backgrounding",
            "--disable-backgrounding-occluded-windows",
        ]
        if os.environ.get("CHROME_NO_SANDBOX") == "1":
            args.append("--no-sandbox")
        args.append("about:blank")

        self._proc = subprocess.Popen(
            args,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            preexec_fn=remap_fds,
            pass_fds=(3, 4),
        )
        os.close(cmd_read)
        os.close(reply_write)
        self._writer = os.fdopen(cmd_write, "wb", buffering=0)
        reader = os.fdopen(reply_read, "rb", buffering=0)
        self._reader_thread = threading.Thread(target=self._read_loop, args=(reader,), daemon=True)
        self._reader_thread.start()

    def close(self) -> None:
        with self._lock:
            self._closed = True
            self._lock.notify_all()
        if self._writer:
            try:
                self._writer.close()
            except OSError:
                pass
        if self._proc:
            self._proc.terminate()
            try:
                self._proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self._proc.kill()
                self._proc.wait(timeout=10)
        shutil.rmtree(self._profile, ignore_errors=True)

    # -- protocol ------------------------------------------------------------

    def _read_loop(self, reader) -> None:
        buffer = b""
        try:
            while True:
                chunk = reader.read(1 << 16)
                if not chunk:
                    break
                buffer += chunk
                while b"\0" in buffer:
                    frame, buffer = buffer.split(b"\0", 1)
                    self._dispatch(json.loads(frame))
        finally:
            reader.close()
            with self._lock:
                self._closed = True
                self._lock.notify_all()

    def _dispatch(self, message: dict) -> None:
        with self._lock:
            if "id" in message:
                self._replies[message["id"]] = message
            else:
                self._events.append(message)
                for listener in list(self._listeners):
                    listener(message)
            self._lock.notify_all()

    def send(self, method: str, params: dict | None = None, session: str | None = None,
             timeout: float = COMMAND_TIMEOUT_S) -> dict:
        with self._lock:
            self._next_id += 1
            message_id = self._next_id
        message = {"id": message_id, "method": method, "params": params or {}}
        if session:
            message["sessionId"] = session
        self._writer.write(json.dumps(message).encode() + b"\0")

        deadline = time.monotonic() + timeout
        with self._lock:
            while message_id not in self._replies:
                remaining = deadline - time.monotonic()
                if self._closed:
                    raise CDPError(f"{method}: browser connection closed")
                if remaining <= 0:
                    raise CDPError(f"{method}: no reply within {timeout}s")
                self._lock.wait(remaining)
            reply = self._replies.pop(message_id)
        if "error" in reply:
            raise CDPError(f"{method}: {reply['error'].get('message')} {reply['error'].get('data', '')}".strip())
        return reply.get("result", {})

    def add_listener(self, listener) -> None:
        with self._lock:
            self._listeners.append(listener)

    def remove_listener(self, listener) -> None:
        with self._lock:
            if listener in self._listeners:
                self._listeners.remove(listener)

    def wait_for_event(self, method: str, session: str | None = None, predicate=None,
                       timeout: float = COMMAND_TIMEOUT_S, since: int = 0) -> dict:
        """Return the first matching event recorded at or after index `since`."""
        deadline = time.monotonic() + timeout
        with self._lock:
            while True:
                for event in self._events[since:]:
                    if event.get("method") != method:
                        continue
                    if session and event.get("sessionId") != session:
                        continue
                    if predicate and not predicate(event.get("params", {})):
                        continue
                    return event
                remaining = deadline - time.monotonic()
                if remaining <= 0 or self._closed:
                    raise CDPError(f"timed out waiting for {method}")
                self._lock.wait(remaining)

    def event_count(self) -> int:
        with self._lock:
            return len(self._events)

    # -- pages ---------------------------------------------------------------

    def new_page(self, device: Device, *, dark: bool = False, reduced_motion: bool = False,
                 locale: str = "zh-CN", init_script: str | None = None) -> "Page":
        # A fresh browser context per page: its own localStorage, caches and
        # service workers, like a new incognito window. Without it a theme
        # stored by one test would decide the theme of the next.
        context = self.send("Target.createBrowserContext", {"disposeOnDetach": True})["browserContextId"]
        target = self.send("Target.createTarget", {"url": "about:blank", "browserContextId": context})["targetId"]
        session = self.send("Target.attachToTarget", {"targetId": target, "flatten": True})["sessionId"]
        page = Page(self, target, session, context)
        page.configure(device, dark=dark, reduced_motion=reduced_motion, locale=locale, init_script=init_script)
        return page


class Page:
    """One tab, with its console errors, exceptions and failed requests collected."""

    def __init__(self, browser: Browser, target_id: str, session_id: str, context_id: str):
        self.browser = browser
        self.target_id = target_id
        self.session = session_id
        self.context_id = context_id
        self.device: Device | None = None
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self._request_urls: dict[str, str] = {}
        browser.add_listener(self._collect)

    def _collect(self, message: dict) -> None:
        if message.get("sessionId") != self.session:
            return
        method = message.get("method")
        params = message.get("params", {})
        if method == "Runtime.exceptionThrown":
            details = params.get("exceptionDetails", {})
            description = (details.get("exception") or {}).get("description") or details.get("text", "")
            self.errors.append(f"exception: {description.splitlines()[0] if description else '?'}")
        elif method == "Runtime.consoleAPICalled" and params.get("type") in ("error", "assert"):
            text = " ".join(str(arg.get("value", arg.get("description", ""))) for arg in params.get("args", []))
            self.errors.append(f"console.{params['type']}: {text[:300]}")
        elif method == "Runtime.consoleAPICalled" and params.get("type") == "warning":
            text = " ".join(str(arg.get("value", arg.get("description", ""))) for arg in params.get("args", []))
            self.warnings.append(f"console.warn: {text[:300]}")
        elif method == "Log.entryAdded":
            entry = params.get("entry", {})
            line = f"log.{entry.get('level')}: {entry.get('text', '')[:300]} {entry.get('url', '')}".strip()
            if entry.get("level") == "error":
                self.errors.append(line)
            elif entry.get("level") == "warning":
                self.warnings.append(line)
        elif method == "Network.requestWillBeSent":
            self._request_urls[params.get("requestId")] = params.get("request", {}).get("url", "")
        elif method == "Network.loadingFailed" and not params.get("canceled"):
            url = self._request_urls.get(params.get("requestId"), "?")
            reason = params.get("blockedReason") or params.get("corsErrorStatus", {}).get("corsError") or ""
            self.errors.append(f"request failed: {params.get('errorText')} {reason} ({params.get('type')}) {url}".strip())
        elif method == "Network.responseReceived":
            response = params.get("response", {})
            if response.get("status", 0) >= 400:
                self.errors.append(f"http {response.get('status')}: {response.get('url')}")

    def send(self, method: str, params: dict | None = None, timeout: float = COMMAND_TIMEOUT_S) -> dict:
        return self.browser.send(method, params, session=self.session, timeout=timeout)

    def configure(self, device: Device, *, dark: bool, reduced_motion: bool, locale: str,
                  init_script: str | None) -> None:
        self.device = device
        for domain in ("Runtime", "Log", "Network", "Page"):
            self.send(f"{domain}.enable")
        # navigator.language decides the site's default language, and a
        # headless browser reports whatever the machine runs in. Pin it.
        user_agent = self.browser.send("Browser.getVersion")["userAgent"]
        self.send("Emulation.setUserAgentOverride", {"userAgent": user_agent, "acceptLanguage": locale})
        self.send("Emulation.setLocaleOverride", {"locale": locale})
        self.send("Emulation.setDeviceMetricsOverride", {
            "width": device.width,
            "height": device.height,
            "deviceScaleFactor": device.scale,
            "mobile": device.mobile,
        })
        # maxTouchPoints must be 1-16 whenever it is present, even when
        # disabling, so it is only sent alongside enabled=true.
        touch = {"enabled": True, "maxTouchPoints": 5} if device.touch else {"enabled": False}
        self.send("Emulation.setTouchEmulationEnabled", touch)
        features = [
            {"name": "prefers-color-scheme", "value": "dark" if dark else "light"},
            {"name": "prefers-reduced-motion", "value": "reduce" if reduced_motion else "no-preference"},
        ]
        self.send("Emulation.setEmulatedMedia", {"features": features})
        if init_script:
            self.send("Page.addScriptToEvaluateOnNewDocument", {"source": init_script})

    def navigate(self, url: str, timeout: float = COMMAND_TIMEOUT_S) -> None:
        since = self.browser.event_count()
        result = self.send("Page.navigate", {"url": url})
        if result.get("errorText"):
            raise CDPError(f"navigation to {url} failed: {result['errorText']}")
        self.browser.wait_for_event("Page.loadEventFired", session=self.session, timeout=timeout, since=since)

    def evaluate(self, expression: str, timeout: float = COMMAND_TIMEOUT_S):
        result = self.send("Runtime.evaluate", {
            "expression": expression,
            "returnByValue": True,
            "awaitPromise": True,
            "userGesture": True,
        }, timeout=timeout)
        if "exceptionDetails" in result:
            details = result["exceptionDetails"]
            description = (details.get("exception") or {}).get("description") or details.get("text")
            raise CDPError(f"evaluate failed: {description}")
        return result.get("result", {}).get("value")

    def wait_for(self, expression: str, timeout: float = 10.0, message: str | None = None):
        """Poll a JS expression until it returns something truthy.

        An evaluation that fails is retried rather than raised: when the
        thing being waited for is a navigation, the context the expression
        ran in is destroyed under it, and the next poll is the one that sees
        the new page."""
        deadline = time.monotonic() + timeout
        last_error = None
        while True:
            try:
                value = self.evaluate(expression)
                if value:
                    return value
            except CDPError as error:
                last_error = error
            if time.monotonic() >= deadline:
                detail = f" (last error: {last_error})" if last_error else ""
                raise CDPError((message or f"timed out waiting for: {expression}") + detail)
            time.sleep(POLL_INTERVAL_S)

    def press_key(self, key: str, code: str | None = None, key_code: int | None = None) -> None:
        params = {"key": key, "code": code or key, "windowsVirtualKeyCode": key_code or 0}
        self.send("Input.dispatchKeyEvent", {"type": "rawKeyDown", **params})
        self.send("Input.dispatchKeyEvent", {"type": "keyUp", **params})

    def click(self, x: float, y: float) -> None:
        if self.device and self.device.touch:
            point = [{"x": x, "y": y}]
            self.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": point})
            self.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
            return
        for kind in ("mouseMoved", "mousePressed", "mouseReleased"):
            self.send("Input.dispatchMouseEvent", {
                "type": kind, "x": x, "y": y, "button": "left" if kind != "mouseMoved" else "none",
                "clickCount": 1 if kind != "mouseMoved" else 0,
            })

    def click_selector(self, selector: str) -> None:
        rect = self.evaluate(
            f"(() => {{ const el = document.querySelector({json.dumps(selector)});"
            " if (!el) return null; const r = el.getBoundingClientRect();"
            " return {x: r.left + r.width / 2, y: r.top + r.height / 2}; })()"
        )
        if not rect:
            raise CDPError(f"no element for {selector}")
        self.click(rect["x"], rect["y"])

    def wheel(self, x: float, y: float, delta_y: float, delta_x: float = 0.0) -> None:
        self.send("Input.dispatchMouseEvent", {
            "type": "mouseWheel", "x": x, "y": y, "deltaX": delta_x, "deltaY": delta_y,
        })

    def screenshot(self, path: Path) -> None:
        data = self.send("Page.captureScreenshot", {"format": "png"})["data"]
        Path(path).write_bytes(base64.b64decode(data))

    def close(self) -> None:
        self.browser.remove_listener(self._collect)
        for method, params in (
            ("Target.closeTarget", {"targetId": self.target_id}),
            ("Target.disposeBrowserContext", {"browserContextId": self.context_id}),
        ):
            try:
                self.browser.send(method, params)
            except CDPError:
                # Already gone: disposeOnDetach may have beaten us to it.
                continue
