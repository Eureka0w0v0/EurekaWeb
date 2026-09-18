# Eureka Web

Eureka's personal website, built with plain HTML, CSS and JavaScript. No Node toolchain required.

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

Both scripts depend only on Python 3 and ImageMagick. No Node.

### Cache-busting stamps (required)

`netlify.toml` gives CSS / JS / images a one-year `immutable` cache. If a file changes but its URL does not, returning visitors never receive the new version. The version stamp is a content hash, so **run this once before committing any asset change**:

```bash
python3 tools/stamp-assets.py          # rewrite ?v= from content hashes
python3 tools/stamp-assets.py --check  # check only; exit code 1 if stale
```

It covers three files: `index.html`, `404.html` and `manifest.webmanifest`. The latter two used to carry hand-written date stamps (the 404 favicon had none at all), so `--check` could not see them and a swapped icon would have been pinned by the immutable cache for a year.

`index.html` references `manifest.webmanifest`, and the manifest's own hash changes as soon as its stamps do, so the script iterates to a fixed point: changing one icon converges both the manifest and `index.html` in a single run.

A local asset referenced **without** `?v=` fails with exit code 2. The one exemption is `sw.js`: a service worker must keep a stable URL to be replaceable, so `netlify.toml` gives it `no-cache` separately.

Forgetting to run it is caught by GitHub Actions (the workflow runs `--check`). The script is idempotent; unchanged assets produce no diff.

It is not run automatically in CI because Netlify publishes the repository as-is with no build command. The stamps have to live in the commit, or the two hosts would serve different URLs.

### Adding a photo

```bash
python3 tools/add-photo.py ~/Desktop/IMG_1234.HEIC
python3 tools/add-photo.py shot.jpg --name kamakura-beach
```

Generates the preview / medium / full WebP tiers (longest edge 640 / 1280 / 1920, q92), **strips EXIF** (phone photos carry GPS), lowercases the file name, and prints a ready-to-paste `<article>` card.

The card is printed rather than inserted automatically: `script.js` reads the `data-photo-base` order in the photo section to choreograph the scroll animation, and machine edits there break it easily. Run `stamp-assets.py` again after pasting.

## Image tiers

| Directory | Purpose | Spec |
|---|---|---|
| `images/photo-preview/` | grid previews | small WebP |
| `images/medium/` | first tier when enlarged | ~1280w WebP |
| `images/full/` | high-res tier when enlarged | ~1920w WebP |
| `images/icons/` | avatar / UFO / alien / favicon | compressed WebP/PNG |
| `images/_originals/` | untouched originals, never referenced by the page | original JPG/PNG |

The page loads previews only; enlarging fetches medium/full on demand via `srcset`.  
`images/_originals/` is a local backup only (git-ignored) and is excluded from both the Netlify and GitHub Pages deploys.

## Maintenance mode

Config file: `site-config.json`

- Normal: `"maintenance": false`
- Maintenance page: `"maintenance": true`

## Deploying to Netlify

- Leave the build command empty
- Publish directory `.`, or just use the `netlify.toml` in the repo
- Long-lived caching for static assets and basic security headers are configured there
- `.netlifyignore` excludes `images/_originals/`

## Deploying to GitHub Pages

`.github/workflows/pages.yml` is included; it removes `images/_originals/` before deploying. The site is served at:

`https://<your-github-username>.github.io/<repo-name>/`

## Deploy size

Images the page actually downloads:

- preview + medium + full + icons ≈ **11 MB**
- `_originals/` backup ≈ **72 MB** (excluded from deploys)

## License

The code (HTML / CSS / JS / Python scripts) is released under the [MIT License](LICENSE).

The photos, avatar and illustrations under `images/` are personal work and are **not** covered by the MIT License. All rights reserved; please do not repost or reuse them without permission. Three.js under `vendor/` is distributed under its own MIT license.
