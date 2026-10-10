#!/usr/bin/env python3
"""Deploy the site to the main host (eureka-web.com).

The main site does not follow git: it is a copy of the deployable files
rsynced into nginx's web root, so pushing to GitHub does not update it. This
script is that copy, written down:

  1. preflight  on main, working tree clean, stamps current, site checks pass
  2. stage      copy only the files the site serves -- an allow-list, so a
                file added to the repo is never published by accident -- and
                check that every asset the pages reference made it in
  3. back up    tar the current web root on the server, keep the last five
  4. dry run    show what rsync would change, then ask
  5. sync       rsync --delete into the web root
  6. verify     fetch the live site and check the stamps, content types and
                cache and security headers

    python3 tools/deploy.py                 # steps 1-6, asks before step 5
    python3 tools/deploy.py --dry-run       # steps 1-4, change nothing
    python3 tools/deploy.py --yes           # do not ask
    python3 tools/deploy.py --nginx         # also install deploy/nginx/*.conf
    python3 tools/deploy.py --verify-only   # step 6 against the live site

Everything about the server comes from the environment, so none of it lives
in this public repository:

  EUREKAWEB_DEPLOY_TARGET  ssh destination, e.g. ubuntu@203.0.113.7 (required)
  EUREKAWEB_DEPLOY_KEY     ssh identity file (optional)
  EUREKAWEB_DEPLOY_ROOT    web root on the server (default /var/www/html)
  EUREKAWEB_SITE_URL       public URL to verify (default https://eureka-web.com/)
"""

from __future__ import annotations

import argparse
import gzip
import os
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_WEB_ROOT = "/var/www/html"
DEFAULT_SITE_URL = "https://eureka-web.com/"
BACKUPS_KEPT = 5
HTTP_TIMEOUT_S = 15

# What the site serves. Files are taken if present; directories are walked
# for the listed extensions only.
DEPLOY_FILES = (
    "index.html", "404.html", "sw.js", "site-config.json", "manifest.webmanifest",
    "robots.txt", "sitemap.xml", "styles.css", "script.js",
)
DEPLOY_DIRS = {
    "css": (".css",),
    "js": (".js",),
    "vendor": (".js",),
    "maintenance": (".html", ".css", ".js"),
    "images": (".webp", ".png", ".jpg", ".jpeg", ".svg", ".ico"),
}
NEVER_DEPLOY = ("images/_originals/",)
# nginx's own placeholder page lives in the web root; --delete must not take it.
REMOTE_KEEP = ("index.nginx-debian.html",)

# A relative asset reference in a page or manifest. The lookahead stops ".js"
# matching the front of ".json".
LOCAL_REF = re.compile(r'(?P<path>(?:\.\.?/)+[A-Za-z0-9._/-]+\.(?:css|js|png|webp|webmanifest|jpe?g|svg|ico))(?![A-Za-z0-9])(?:\?v=[A-Za-z0-9._-]+)?')
# In scripts only real imports count; a path mentioned in a comment is not a
# dependency.
IMPORT_REF = re.compile(r"""(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["'](?P<path>\.\.?/[^"'?]+)(?:\?[^"']*)?["']""")
SECURITY_HEADERS = ("x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy")


class DeployError(RuntimeError):
    pass


# -- helpers ---------------------------------------------------------------


def run(args: list[str], *, check: bool = True, capture: bool = False, stdin: bytes | None = None) -> str:
    result = subprocess.run(args, input=stdin, capture_output=capture, check=False)
    if check and result.returncode != 0:
        detail = (result.stderr or b"").decode(errors="replace").strip() if capture else ""
        raise DeployError(f"command failed ({result.returncode}): {shlex.join(args)}\n{detail}".strip())
    return (result.stdout or b"").decode(errors="replace") if capture else ""


class Remote:
    def __init__(self, target: str, key: str | None):
        self.target = target
        self.ssh = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15"]
        if key:
            self.ssh += ["-i", key]

    def run(self, script: str, *, capture: bool = False, stdin: bytes | None = None) -> str:
        return run(self.ssh + [self.target, script], capture=capture, stdin=stdin)

    def rsync(self, source: Path, web_root: str, *, dry_run: bool) -> str:
        args = ["rsync", "-az", "--delete", "--itemize-changes", "-e", shlex.join(self.ssh)]
        args += [f"--exclude={name}" for name in REMOTE_KEEP]
        if dry_run:
            args.append("--dry-run")
        args += [f"{source}/", f"{self.target}:{web_root}/"]
        return run(args, capture=True)


def fetch(url: str) -> tuple[int, dict[str, str], bytes]:
    """GET with gzip offered, as a browser would; the body comes back decoded."""
    request = urllib.request.Request(url, headers={
        "Accept-Encoding": "gzip",
        "User-Agent": "eurekaweb-deploy-check",
    })
    try:
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_S) as response:
            status, headers, body = response.status, response.headers, response.read()
    except urllib.error.HTTPError as error:
        status, headers, body = error.code, error.headers, error.read()
    headers = {key.lower(): value for key, value in headers.items()}
    if headers.get("content-encoding") == "gzip":
        body = gzip.decompress(body)
    return status, headers, body


# -- steps -----------------------------------------------------------------


def preflight(allow_branch: bool) -> None:
    branch = run(["git", "-C", str(ROOT), "rev-parse", "--abbrev-ref", "HEAD"], capture=True).strip()
    if branch != "main" and not allow_branch:
        raise DeployError(f"on branch {branch}; the main site should match main (--allow-branch to override)")
    dirty = run(["git", "-C", str(ROOT), "status", "--porcelain"], capture=True).strip()
    if dirty:
        raise DeployError(f"working tree is not clean:\n{dirty}")
    for script in ("stamp-assets.py", "check-site.py"):
        args = [sys.executable, str(ROOT / "tools" / script)] + (["--check"] if script == "stamp-assets.py" else [])
        run(args)
    print("preflight: clean tree, stamps current, site checks pass")


def collect() -> list[Path]:
    files = [ROOT / name for name in DEPLOY_FILES if (ROOT / name).is_file()]
    for directory, extensions in DEPLOY_DIRS.items():
        base = ROOT / directory
        if not base.is_dir():
            continue
        for path in sorted(base.rglob("*")):
            rel = path.relative_to(ROOT).as_posix()
            if path.is_file() and path.suffix.lower() in extensions and not rel.startswith(NEVER_DEPLOY):
                files.append(path)
    return files


def stage(destination: Path) -> int:
    files = collect()
    for path in files:
        target = destination / path.relative_to(ROOT)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)

    missing = []
    for document in destination.rglob("*"):
        if document.suffix not in (".html", ".js", ".webmanifest") or not document.is_file():
            continue
        if document.relative_to(destination).parts[0] == "vendor":
            continue
        pattern = IMPORT_REF if document.suffix == ".js" else LOCAL_REF
        for match in pattern.finditer(document.read_text(encoding="utf-8")):
            target = (document.parent / match.group("path")).resolve()
            if not target.is_relative_to(destination.resolve()) or not target.is_file():
                missing.append(f"{document.relative_to(destination)} -> {match.group('path')}")
    if missing:
        raise DeployError("staged pages reference files that are not staged:\n  " + "\n  ".join(missing))
    print(f"stage: {len(files)} files, every referenced asset present")
    return len(files)


def back_up(remote: Remote, web_root: str) -> None:
    parent, name = os.path.split(web_root.rstrip("/"))
    stamp = time.strftime("%Y%m%d-%H%M%S")
    remote.run(
        "set -e; "
        f"tar czf \"$HOME/html-backup-{stamp}.tar.gz\" -C {shlex.quote(parent)} {shlex.quote(name)}; "
        f"ls -1t \"$HOME\"/html-backup-*.tar.gz | tail -n +{BACKUPS_KEPT + 1} | xargs -r rm --"
    )
    print(f"backup: ~/html-backup-{stamp}.tar.gz on the server (keeping the last {BACKUPS_KEPT})")


def install_nginx(remote: Remote) -> None:
    """Install the snippets, enable HTTP/2 on the TLS listeners, reload.

    The server block itself belongs to Certbot, so it is edited in exactly one
    way: `http2` is added to the two `listen ... 443 ssl` lines, idempotently.
    Every file touched is backed up first and restored if `nginx -t` fails."""
    stamp = time.strftime("%Y%m%d-%H%M%S")
    snippets = sorted((ROOT / "deploy" / "nginx").glob("*.conf"))
    for snippet in snippets:
        remote_path = f"/etc/nginx/snippets/{snippet.name}"
        remote.run(f"sudo cp -p {remote_path} {remote_path}.bak-{stamp} 2>/dev/null || true; "
                   f"sudo tee {remote_path} >/dev/null", stdin=snippet.read_bytes())
    site = "/etc/nginx/sites-available/default"
    remote.run(
        f"sudo cp -p {site} {site}.bak-{stamp} && "
        f"sudo sed -i -E '/http2/!s/^([[:space:]]*listen ([[]::[]]:)?443 ssl)(( ipv6only=on)?;.*)$/\\1 http2\\3/' {site}"
    )
    test = subprocess.run(remote.ssh + [remote.target, "sudo nginx -t"], capture_output=True)
    if test.returncode != 0:
        restore = [f"sudo cp -p {site}.bak-{stamp} {site}"]
        restore += [f"sudo cp -p /etc/nginx/snippets/{s.name}.bak-{stamp} /etc/nginx/snippets/{s.name} 2>/dev/null || true"
                    for s in snippets]
        remote.run("; ".join(restore))
        raise DeployError("nginx -t failed; restored the previous configuration:\n"
                          + test.stderr.decode(errors="replace"))
    remote.run("sudo systemctl reload nginx")
    print(f"nginx: snippets installed, http2 enabled, reloaded (backups *.bak-{stamp})")


def verify(site_url: str, *, expect_http2: bool) -> None:
    problems: list[str] = []

    def expect(label: str, condition: bool, detail: str = "") -> None:
        if not condition:
            problems.append(f"{label}{': ' + detail if detail else ''}")

    status, headers, body = fetch(site_url)
    html = body.decode("utf-8", errors="replace")
    expect("index status", status == 200, str(status))
    expect("index content-type", headers.get("content-type", "").startswith("text/html"), headers.get("content-type", ""))
    expect("index cache-control", headers.get("cache-control") == "no-cache", headers.get("cache-control", ""))
    for header in SECURITY_HEADERS:
        expect(f"index {header}", header in headers)

    local = (ROOT / "index.html").read_text(encoding="utf-8")
    expect("live index.html matches the repo", html == local)

    refs = [m.group(0) for m in LOCAL_REF.finditer(html) if "?v=" in m.group(0)]
    samples = {
        "script": next((r for r in refs if ".js?v=" in r), None),
        "style": next((r for r in refs if ".css?v=" in r), None),
        "image": next((r for r in refs if ".webp?v=" in r), None),
    }
    for kind, ref in samples.items():
        if not ref:
            problems.append(f"no {kind} reference found in the live index.html")
            continue
        url = urllib.request.urljoin(site_url, ref)
        status, headers, _ = fetch(url)
        expected_type = {"script": "javascript", "style": "text/css", "image": "image/webp"}[kind]
        expect(f"{kind} status", status == 200, f"{status} {url}")
        expect(f"{kind} content-type", expected_type in headers.get("content-type", ""), headers.get("content-type", ""))
        expect(f"{kind} cache-control", "immutable" in headers.get("cache-control", ""), headers.get("cache-control", ""))
        if kind != "image":
            expect(f"{kind} gzip", headers.get("content-encoding") == "gzip", headers.get("content-encoding", "none"))
        for header in SECURITY_HEADERS:
            expect(f"{kind} {header}", header in headers)

    for path, cache_control, content_type in (
        ("sw.js", "no-cache", "javascript"),
        ("site-config.json", "no-store", "application/json"),
        ("manifest.webmanifest", "max-age=3600", "application/manifest+json"),
    ):
        status, headers, _ = fetch(urllib.request.urljoin(site_url, path))
        expect(f"{path} status", status == 200, str(status))
        expect(f"{path} cache-control", cache_control in headers.get("cache-control", ""), headers.get("cache-control", ""))
        expect(f"{path} content-type", content_type in headers.get("content-type", ""), headers.get("content-type", ""))

    status, _, body = fetch(urllib.request.urljoin(site_url, "this-page-does-not-exist"))
    expect("404 status", status == 404, str(status))
    expect("404 is the site's own page", b"Eureka Web" in body)

    if shutil.which("curl"):
        version = run(["curl", "-s", "-o", "/dev/null", "--http2", "-w", "%{http_version}", site_url], capture=True).strip()
        if expect_http2:
            expect("http/2", version == "2", f"served over HTTP/{version}")
        elif version != "2":
            print(f"note: {site_url} is served over HTTP/{version}; --nginx enables HTTP/2")

    if problems:
        raise DeployError("live site check failed:\n  " + "\n  ".join(problems))
    print(f"verify: {site_url} serves the repo's index.html with the expected headers")


# -- main --------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="stop after showing what would change")
    parser.add_argument("--yes", action="store_true", help="do not ask before syncing")
    parser.add_argument("--nginx", action="store_true", help="install deploy/nginx/*.conf and enable HTTP/2")
    parser.add_argument("--verify-only", action="store_true", help="only check the live site")
    parser.add_argument("--allow-branch", action="store_true", help="deploy from a branch other than main")
    args = parser.parse_args()

    site_url = os.environ.get("EUREKAWEB_SITE_URL", DEFAULT_SITE_URL)
    try:
        if args.verify_only:
            verify(site_url, expect_http2=False)
            return 0

        target = os.environ.get("EUREKAWEB_DEPLOY_TARGET")
        if not target:
            raise DeployError("set EUREKAWEB_DEPLOY_TARGET to the ssh destination, e.g. user@host")
        remote = Remote(target, os.environ.get("EUREKAWEB_DEPLOY_KEY"))
        web_root = os.environ.get("EUREKAWEB_DEPLOY_ROOT", DEFAULT_WEB_ROOT)

        preflight(args.allow_branch)
        with tempfile.TemporaryDirectory(prefix="eurekaweb-stage-") as staging:
            stage_dir = Path(staging) / "site"
            stage_dir.mkdir()
            stage(stage_dir)
            changes = remote.rsync(stage_dir, web_root, dry_run=True)
            print("dry run:\n" + (changes.strip() or "  (no changes)"))
            if args.dry_run:
                return 0
            if not args.yes and input("sync these changes? [y/N] ").strip().lower() != "y":
                print("aborted; nothing changed")
                return 1
            back_up(remote, web_root)
            remote.rsync(stage_dir, web_root, dry_run=False)
            print("sync: done")
        if args.nginx:
            install_nginx(remote)
        verify(site_url, expect_http2=args.nginx)
        return 0
    except DeployError as error:
        print(f"deploy: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
