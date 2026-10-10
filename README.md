# Eureka Web

Eureka's personal website, built with plain HTML, CSS and JavaScript. No Node toolchain required.

How the code is organised -- modules, events, state machines, the CSS files, the tooling -- is in [ARCHITECTURE.md](ARCHITECTURE.md).

## Running locally

### Option 1: VS Code task

Run the `Start Local Web Server` task, then open:

`http://localhost:5500`

### Option 2: terminal

```bash
python3 -m http.server 5500
```

Then open `http://localhost:5500` in a browser.

## What's inside

- Intro: the curtain is cut open along a diagonal seam, the kicker stays where it is and becomes body text, and the "Welcome" lettering condenses out of its own dust (plays once per session; `?intro` forces a replay)
- Theme toggle (light / dark with a ripple transition)
- Chinese / English / Japanese language switch
- "Welcome" canvas effect (shatters into dust on scroll)
- Programming-language nodes + a Three.js wireframe brain (sculpted after real anatomy: longitudinal fissure, temporal lobes, flat base, cerebellar folia, pons; lazy-loaded once in view; connector lines hug the projected silhouette every frame)
- Career card scroll layers (UFO / alien)
- Photo theatre: drop-in, carousel, Show All, click to enlarge
- Wordmark top-left, dot section navigation on the right
- Glassmorphism cards, 3D tilt, film grain
- `404.html` and a 1200×630 OG share image (`images/og-card.png`, rendered offline from the brain geometry)

## Maintenance scripts

These scripts need only Python 3, plus ImageMagick for `add-photo.py`. No Node.

### Cache-busting stamps (required)

The main site's nginx config (`deploy/nginx/eurekaweb.conf`) gives CSS / JS / images a one-year `immutable` cache. If a file changes but its URL does not, returning visitors never receive the new version. The version stamp is a content hash, so **run this once before committing any asset change**:

```bash
python3 tools/stamp-assets.py          # rewrite ?v= from content hashes
python3 tools/stamp-assets.py --check  # check only; exit code 1 if stale
```

It covers four documents -- `index.html`, `404.html`, `manifest.webmanifest` and `maintenance/index.html` -- and the import specifiers of every module under `js/`. References are resolved relative to the file that holds them, so `../images/...` from the maintenance page works. It also regenerates the `<link rel="modulepreload">` list in `index.html` from the static import graph of `js/main.js`.

Stamped files reference each other -- `index.html` references `manifest.webmanifest`, which references the icons, and modules import modules -- and a file's hash changes as soon as its stamps do, so the script iterates to a fixed point: changing one leaf module converges every module above it and `index.html` in a single run.

A local asset referenced **without** `?v=` fails with exit code 2. The one exemption is `sw.js`: a service worker must keep a stable URL to be replaceable, so the nginx config gives it `no-cache` separately.

Forgetting to run it is caught by GitHub Actions (the workflow runs `--check`). The script is idempotent; unchanged assets produce no diff.

It is not run automatically in CI because the main site is deployed from the committed files by `tools/deploy.py`. The stamps have to live in the commit, or the two hosts would serve different URLs.

### Adding a photo

```bash
python3 tools/add-photo.py ~/Desktop/IMG_1234.HEIC
python3 tools/add-photo.py shot.jpg --name kamakura-beach
```

Generates the preview / medium / full WebP tiers (longest edge 640 / 1280 / 1920, q92), **strips EXIF** (phone photos carry GPS), lowercases the file name, appends the photo to the end of the queue in `data/photos.json`, and regenerates the cards.

`data/photos.json` is the photo list: `insert` is the card that drops into the stack, `queue` is the stack in order. The cards in `index.html` are generated from it by `tools/build-photos.py`, between `photo-insert` / `photo-queue` marker comments, so the ordering state the scroll choreography in `js/photo/` reads (`data-photo-base`, the aria-label number) always follows the list. To reorder or remove a photo, edit the list and run:

```bash
python3 tools/build-photos.py          # regenerate the cards, then restamp
python3 tools/build-photos.py --check  # check only; exit code 1 if out of date
```

CI and `tools/deploy.py` both run the check.

## Image tiers

| Directory | Purpose | Spec |
|---|---|---|
| `images/photo-preview/` | grid previews | small WebP |
| `images/medium/` | first tier when enlarged | ~1280w WebP |
| `images/full/` | high-res tier when enlarged | ~1920w WebP |
| `images/icons/` | avatar / UFO / alien / favicon | compressed WebP/PNG |
| `images/_originals/` | untouched originals, never referenced by the page | original JPG/PNG |

The page loads previews only; enlarging fetches medium/full on demand via `srcset`.  
`images/_originals/` is a local backup only (git-ignored) and is never deployed: `tools/deploy.py` stages from an allow-list, and the Pages workflow removes it before uploading.

## Maintenance mode

Config file: `site-config.json`

- Normal: `"maintenance": false`
- Maintenance page: `"maintenance": true`

## Testing

Everything below needs only Python 3 and a local Chrome; set `CHROME` to point at a specific browser binary.

```bash
python3 tools/check-site.py      # static checks, no browser
python3 tools/smoke.py           # desktop, phone and touch tablet, light and dark
python3 tools/smoke.py --quick   # desktop, light, plus the regression checks
```

`smoke.py` serves the working tree locally and drives headless Chrome over the DevTools protocol (`tools/cdp.py`, standard library only). The page has to load with no exception, console error or failed request, scroll end to end, step the career cards, switch language and theme, and run the photo carousel, lightbox and Show All. It also checks that a slow `site-config.json` does not hold the page back, that maintenance mode still redirects, and that the service worker keeps one cached copy per asset. CI runs the stamp check, the photo-card check, `check-site.py` and the full smoke test before every Pages deploy.

For refactors that must not change the page, `tools/snapshot.py` records every element's box and computed styles at each stop of a fixed walk through the site, then compares a later run against it:

```bash
python3 tools/snapshot.py record /tmp/before.json    # on the old code
python3 tools/snapshot.py compare /tmp/before.json   # on the new code
```

Baselines depend on the machine's fonts and rasteriser, so record and compare on the same machine; they are not committed.

## Deploying

Pushing to `main` deploys GitHub Pages through `.github/workflows/pages.yml`. The main site, `https://eureka-web.com/`, does not follow git and is deployed with `tools/deploy.py`; both name it as the canonical URL. See [deploy/README.md](deploy/README.md) for the details and the nginx configuration.

## Deploy size

Images the page actually downloads:

- preview + medium + full + icons ≈ **11 MB**
- `_originals/` backup ≈ **72 MB** (excluded from deploys)

## License

The code (HTML / CSS / JS / Python scripts) is released under the [MIT License](LICENSE).

The photos, avatar and illustrations under `images/` are personal work and are **not** covered by the MIT License. All rights reserved; please do not repost or reuse them without permission. Three.js under `vendor/` is distributed under its own MIT license.
