# Deploying

The site is served from two places:

| Host | How it updates | Headers |
|---|---|---|
| `eureka-web.com` (main) | `tools/deploy.py`, run by hand | `deploy/nginx/*.conf` |
| GitHub Pages | every push to `main` (`.github/workflows/pages.yml`) | GitHub's defaults; Pages cannot set headers |

Both serve the same committed files, and both name `https://eureka-web.com/` as the canonical URL, so nothing is rewritten on the way out.

## Main site

The main site does not follow git: pushing to GitHub does not update it. `tools/deploy.py` stages the deployable files (an allow-list, so a file added to the repository is never published by accident), backs up the current web root on the server, shows an rsync dry run, syncs, and then checks the live site: the served `index.html` must match the repository's, and every kind of file must arrive with the right content type and cache and security headers.

Nothing about the server is stored in this public repository. Set:

```bash
export EUREKAWEB_DEPLOY_TARGET=user@host        # ssh destination (required)
export EUREKAWEB_DEPLOY_KEY=~/.ssh/your-key     # identity file (optional)
export EUREKAWEB_DEPLOY_ROOT=/var/www/html      # web root (default shown)
```

then:

```bash
python3 tools/deploy.py --dry-run      # what would change; changes nothing
python3 tools/deploy.py                # deploy, asking before the sync
python3 tools/deploy.py --verify-only  # check the live site only
```

It refuses to run from a branch other than `main` or from a dirty working tree, and runs `stamp-assets.py --check`, `build-photos.py --check` and `check-site.py` first.

## nginx

`deploy/nginx/eurekaweb.conf` and `eurekaweb-security.conf` are the source of truth for the main site's compression, caching, error page and security headers. They live in `/etc/nginx/snippets/` on the server and are included from both server blocks of `/etc/nginx/sites-available/default`, one `include snippets/eurekaweb.conf;` line each. That file is otherwise managed by Certbot and is not kept here.

`python3 tools/deploy.py --nginx` installs the snippets, adds `http2` to the two `listen ... 443 ssl` lines (idempotently), runs `nginx -t` and reloads. Every file it touches is backed up as `*.bak-<timestamp>` first and restored if the configuration test fails.

Two things learned the hard way, both explained in the snippet comments:

- a server-level `types { }` block replaces nginx's whole MIME map instead of extending it, which together with `nosniff` stops stylesheets and scripts from loading at all;
- `add_header` is not inherited into a location that has an `add_header` of its own, so every location repeats the security snippet.
