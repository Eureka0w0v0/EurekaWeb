# Architecture

Eureka Web has no build step: the files in this repository are the files that are served. The page is plain HTML, ES modules and CSS. The tooling is Python 3 standard library, plus a local Chrome for the browser tests and ImageMagick for preparing photos.

This document maps the code and the rules that hold it together. [README.md](README.md) covers day-to-day use, and [deploy/README.md](deploy/README.md) covers the servers.

## Repository layout

| Path | What it is |
|---|---|
| `index.html` | The page. Hand-written, apart from two generated regions: the `modulepreload` list and the photo cards. |
| `css/` | The stylesheets, split by feature and linked in cascade order. |
| `js/` | The ES modules. The entry point is `js/main.js`. |
| `vendor/` | three.js r185, imported lazily when the language section comes near. |
| `images/` | Photo tiers, icons and the share image. See *Image tiers* in the README. |
| `data/photos.json` | The photo list that the cards are generated from. It is read at build time only. |
| `site-config.json` | Runtime switches. Today the only one is maintenance mode. |
| `sw.js` | The service worker. |
| `404.html`, `maintenance/` | Standalone pages. |
| `tools/` | Stamping, generation, checks, browser tests and deployment. |
| `deploy/` | The nginx snippets the main site runs, and how they are installed. |

## JavaScript

### Modules

| Module | Responsibility |
|---|---|
| `main.js` | Entry point. Wires every section to the page, in the order the page needs. |
| `theme.js` | Light/dark theme: state, the transition waves, and the participant hooks. |
| `nav.js` | The section rail and in-page jump links. |
| `core/config.js` | `site-config.json` and the maintenance redirect. |
| `core/dom.js` | The document's two root elements. |
| `core/events.js` | `pageEvents`, the publish/subscribe hub. |
| `core/frames.js` | Promises that resolve after animation frames or a delay. |
| `core/machine.js` | `createMachine`, for explicit state machines. |
| `core/math.js` | Clamping, easing, interpolation and a seeded random. |
| `core/pointer.js` | Pointer moves, coalesced into one `pointer:frame` per animation frame. |
| `core/storage.js` | `localStorage` access that survives storage being unavailable. |
| `core/style-writes.js` | Style and attribute writes that skip the DOM when nothing changed. |
| `core/viewport.js` | The viewport questions (compact, touch-first, wide) and the stable app height. |
| `i18n/translations.js` | All page copy, in Chinese, English and Japanese. |
| `i18n/language.js` | The active language, the language menu, and the letter-by-letter switch. |
| `sections/intro.js` | The intro curtain, shown once per session. |
| `sections/welcome.js` | The Welcome word, drawn to a canvas and scattered into dust on scroll. |
| `sections/hero.js` | Parallax, the tilt card and the magnetic heading. |
| `sections/mars-clock.js` | Coordinated Mars Time next to the Mars address. |
| `sections/language-universe.js` | The language pills, the connector lines and the insight panel. |
| `sections/brain.js` | The three.js wireframe brain: seeded geometry, render loop and projected silhouettes. |
| `sections/career.js` | The career card stack, its gestures, and how it holds still during a theme change. |
| `photo/dom.js`, `photo/config.js` | The photo theatre's elements, timing and spacing constants. |
| `photo/state.js` | Everything the theatre remembers between frames, its state machines, and the frame scheduler. |
| `photo/layout.js` | Where each card goes: pure layout math over the per-frame context. |
| `photo/scene.js` | `updatePhotoScene`, the per-frame pipeline that lays out and draws the theatre. |
| `photo/cards.js` | DOM writes for the cards, the title, the queue and Show All. |
| `photo/carousel.js` | Stepping the carousel: wheel, swipe, settling and the touch gesture. |
| `photo/expand.js` | Show All. |
| `photo/interaction.js` | Clicks, keys and hovers on the cards. |
| `photo/zoom.js` | The lightbox, and preloading the photos it is likely to open next. |
| `photo/hover-glow.js` | The glow that follows the pointer across a card. |
| `effects/grain.js` | The film-grain overlay canvas. |

### Dependency rules

Imports point down this list, or sideways within a layer. A layer may import from the layers below it, never from the layers above it:

```
main.js
  ├── sections/   effects/   (may import theme, i18n, core)
  ├── photo/                 (may import i18n, core)
  ├── nav.js                 (core)
  ├── theme.js               (core)
  ├── i18n/                  (core)
  └── core/                  (nothing outside core)
```

`tools/check-site.py` enforces the graph mechanically. Every import must resolve, the graph must have no cycles, every module must be reachable from `js/main.js`, and each module must be imported under exactly one URL. Two `?v=` stamps for one file would make the browser run two copies of it, each with its own state.

When a lower layer needs something to happen in a higher one, it does not import upwards. It uses one of three mechanisms:

- **Events.** The shared layers announce what changed on `pageEvents`, and each section subscribes in its own `bind…Reactions()` function. Listeners run synchronously, in subscription order. `main.js` subscribes the sections in a fixed order (`bindSectionReactions`), which keeps the order the direct calls used to run in.
- **Participants.** Sections that must hold still during a theme change (today, the career scene) register with `addThemeTransitionParticipant({ isBusy, prepare, wantsGeometryLockedWave, freeze, scheduleResume, finish })`.
- **Registration.** `photo/scene.js` registers `updatePhotoScene` with `setPhotoSceneUpdater`. Any photo module can then call `requestPhotoSceneUpdate()` without importing the scene that draws.

### Page events

| Event | Emitted by | When |
|---|---|---|
| `language:will-change` | `i18n/language.js` | An animated language switch is starting. |
| `language:change` | `i18n/language.js` | The new language's copy is being applied, `{ language, copy, animated }`. |
| `language:did-change` | `i18n/language.js` | The animated switch has finished, or fallen back to an instant one. |
| `theme:will-transition` | `theme.js` | A theme transition is starting. |
| `theme:snapshot` | `theme.js` | Inside a view transition's update callback. Only what is on screen is redrawn, because only that is captured. |
| `theme:applied` | `theme.js` | The theme has just been applied. |
| `theme:render-now` | `theme.js` | Redraw everything now. |
| `theme:render-frame` | `theme.js` | Redraw on the next frame, cheaply where off screen. |
| `pointer:frame` | `core/pointer.js` | At most once per animation frame, carrying the latest `pointermove` event. |
| `brain:frame` | `sections/brain.js` | After each brain frame is drawn. The connector lines follow it. |

### State machines

Any state that moves through three or more phases is an explicit machine from `core/machine.js`. A machine is a table of states and the events each state accepts. `send(event)` throws on an event the current state does not accept, so an impossible transition fails loudly at the spot that caused it.

| Machine | Where | States | Notes |
|---|---|---|---|
| theme transition | `theme.js` | `idle` → `running` ⇄ `lite` → `idle` | `lite` is a running transition on the lighter snapshot path for touch devices. |
| career theme lock | `sections/career.js` | `idle`, `frozen`, `resuming`, `restoring` | Holds the card scene still while a theme transition captures it, then lets it go. |
| photo carousel | `photo/state.js` | `inactive`, `active`, `settling`, `reinserting`, `reinserted` | Every frame chooses between `enable`, `replay` and `reset` from the scroll position. Gestures `settle` and `step`, and arriving at the target is `converge`. |
| photo show all | `photo/state.js` | `collapsed`, `expanding`, `expanded`, `collapsing` | A `toggle` mid-animation reverses from where the cards actually are. |
| photo touch gesture | `photo/state.js` | `idle`, `tracking`, `locked`, `released` | Decides between a swipe and a vertical scroll. `locked` makes one swipe step exactly one card. |
| photo lightbox | `photo/state.js` | `closed`, `open` | |

The full transition tables are in the code, next to comments on what each state means.

### Startup

`initApp()` in `main.js` runs these steps in order:

1. Subscribe the sections to the page events.
2. Start the maintenance check without awaiting it. `site-config.json` is fetched in the background with a 3-second deadline. A `"maintenance": true` answer redirects to `maintenance/` while the intro still covers the page; a late or failed answer means "not in maintenance".
3. Start the intro.
4. Wire the controls, the global listeners and the section gestures. Listeners that share an event run in registration order, and so do the animation frames they request, so this order is preserved.
5. Render the first frame. Language and theme are settled before the scenes that draw with them. The brain is scheduled to load when the language section comes near.
6. Start the effects. Then wire the lifecycle handlers: follow the system theme when no theme is stored, and pause the brain and the photo frames while the tab is hidden. Then wire the navigation.
7. Wait for the intro to finish.

## CSS

The stylesheets in `css/` are linked from `index.html` in this order:

`base`, `intro`, `page`, `transitions`, `layout`, `controls`, `hero`, `language`, `career`, `photo`, `responsive`, `effects`, `chrome`

The link order is the cascade order. A rule may override a rule from an earlier file, and `responsive.css` relies on coming after the feature files that it narrows. The header of `css/base.css` describes each file and documents the `--z-*` stacking tokens. The header of `css/responsive.css` documents the breakpoints. The CSS is desktop-first: base rules describe the wide layout, and `max-width` blocks narrow it.

## Generated content and cache stamps

nginx serves CSS, JS and images with a one-year `immutable` cache. So every local URL carries a `?v=` stamp, the first eight hex digits of the file's SHA-256, and the stamps are committed. `tools/stamp-assets.py` maintains them:

- It stamps every asset reference in `index.html`, `404.html`, `manifest.webmanifest` and `maintenance/index.html`, and every import specifier in `js/**/*.js`.
- It iterates to a fixed point, because stamped files reference each other (module → module, `index.html` → manifest → icons).
- It regenerates the `modulepreload` list in `index.html` from `js/main.js`'s static import graph. The browser then fetches the whole graph at once instead of one level per round trip.

`tools/build-photos.py` generates the photo cards from `data/photos.json`. `data-photo-base` and the aria-label number follow the list order, so they cannot drift from it.

Both tools have a `--check` mode. CI runs both checks, and so does `tools/deploy.py` before it publishes anything.

## Service worker

`sw.js` follows three rules:

- **Navigations are network-first, with a 3-second deadline.** The document is the only file whose URL never changes, so it is how a new deploy reaches returning visitors. On a stalled connection, the cached copy is served instead.
- **Stamped assets are cache-first.** A changed file has a new URL, so a cached entry can never be stale. When a new version of a path is stored, the older versions of that path are deleted.
- **`site-config.json` and `sw.js` are never cached.**

## Testing

| Tool | What it proves |
|---|---|
| `tools/check-site.py` | Static checks: one canonical origin everywhere the site names itself, and a clean module graph. |
| `tools/stamp-assets.py --check` | Every stamp matches its file's content. |
| `tools/build-photos.py --check` | The photo cards match `data/photos.json`. |
| `tools/smoke.py` | The page works end to end on a desktop, a phone and a touch tablet, in both themes. It also checks that a slow config does not block the page, that maintenance mode redirects, and that the service worker keeps one copy per asset. Use `--quick` for desktop only, plus those three checks. |
| `tools/snapshot.py` | A golden master for refactors. It records each element's box and computed styles at fixed stops through the site, then compares a later run with that record. |

The browser tools drive a local Chrome through `tools/cdp.py`, a DevTools Protocol client that talks over a pipe instead of a debugging port. They serve the working tree with `tools/devserver.py` on an ephemeral local port. Neither needs a third-party package. CI runs the three checks and the full smoke test, and Pages deploys only if they pass.

## Deploying

There are two hosts with the same files.

- **GitHub Pages** deploys from `main` through `.github/workflows/pages.yml`.
- **The main site, `https://eureka-web.com/`,** is published with `tools/deploy.py`. The script runs the preflight checks, stages an allow-listed copy of the site, backs up the server, then syncs. With `--nginx`, it also installs the nginx snippets from `deploy/nginx/`. It then verifies the live site. The target host and key are read from environment variables and are never committed.

See [deploy/README.md](deploy/README.md) for the details.
