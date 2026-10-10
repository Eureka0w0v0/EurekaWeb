"""Static file server for the browser tests.

Serves the repository root on 127.0.0.1 with an ephemeral port. Three things
differ from `python3 -m http.server`: every response is `no-store`, so a test
never reads the browser's HTTP cache instead of the file on disk; individual
paths can be delayed to simulate a slow network for one request; and
individual paths can be answered with fixed bytes instead of the file, which
is how a test switches maintenance mode on without touching the repository.
"""

from __future__ import annotations

import functools
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent


class _Handler(SimpleHTTPRequestHandler):
    delays: dict[str, float] = {}
    overrides: dict[str, bytes] = {}

    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".webmanifest": "application/manifest+json",
        ".webp": "image/webp",
    }

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        delay = self.delays.get(path)
        if delay:
            time.sleep(delay)
        override = self.overrides.get(path)
        if override is None:
            super().do_GET()
            return
        self.send_response(200)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Length", str(len(override)))
        self.end_headers()
        self.wfile.write(override)

    def log_message(self, format: str, *args) -> None:  # noqa: A002 - stdlib signature
        return


class _Server(ThreadingHTTPServer):
    # socketserver's default listen backlog is 5. The page requests twenty
    # preview images at once; past the backlog macOS resets the connection,
    # which the browser reports as a failed request that is not the site's.
    request_queue_size = 128
    daemon_threads = True


class DevServer:
    """`with DevServer() as server: server.url` -> http://127.0.0.1:PORT/"""

    def __init__(self, root: Path = ROOT, delays: dict[str, float] | None = None,
                 overrides: dict[str, bytes] | None = None):
        handler = type("Handler", (_Handler,), {
            "delays": dict(delays or {}),
            "overrides": dict(overrides or {}),
        })
        self._httpd = _Server(("127.0.0.1", 0), functools.partial(handler, directory=str(root)))
        self._thread = threading.Thread(target=self._httpd.serve_forever, daemon=True)

    @property
    def url(self) -> str:
        host, port = self._httpd.server_address[:2]
        return f"http://{host}:{port}/"

    def __enter__(self) -> "DevServer":
        self._thread.start()
        return self

    def __exit__(self, *exc) -> None:
        self._httpd.shutdown()
        self._httpd.server_close()
        self._thread.join(timeout=5)
