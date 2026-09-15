/* Service worker for Eureka Web.

   Hand-written rather than generated with Workbox: the whole policy is three
   rules, and pulling a toolkit off a CDN would reintroduce exactly the kind of
   third-party dependency the three.js vendoring just removed.

   Every path here is relative. GitHub Pages serves this site from /EurekaWeb/
   and Netlify serves it from /, so anything absolute would work on one host
   and 404 on the other.

   Two things must never be cached, and both are load-bearing:
     - site-config.json drives maintenance mode. A stale copy would leave the
       site stuck in (or out of) maintenance with no way to correct it.
     - sw.js itself. netlify.toml marks *.js immutable for a year, which for
       this one file would mean the worker can never be replaced. There is a
       matching header override in netlify.toml; this comment exists so the
       next person to touch either one finds the other. */

const VERSION = "2026-09-15-2";
const SHELL_CACHE = `eureka-shell-${VERSION}`;

/* Deliberately not versioned. Every asset URL carries a ?v= content hash, so
   an entry in here is either still referenced or unreachable -- which is
   exactly the guarantee cacheFirst already relies on. Tying the name to
   VERSION meant a one-line CSS change emptied it: 6.1MB of images/full, 2.9MB
   of images/medium and 744KB of vendor/, re-downloaded by every returning
   visitor, to replace bytes that were still perfectly valid. */
const ASSET_CACHE = "eureka-assets";

/* Only the documents needed to paint something useful. The heavy assets --
   images and the vendored three.js -- are deliberately left to runtime
   caching so a first visit does not stall on a multi-megabyte install.

   Nothing with a ?v= stamp belongs in this list. caches.match compares full
   URLs including the query, so a bare "./styles.css" here can never answer the
   "./styles.css?v=4c94b6f9" the page actually asks for -- it would just be
   downloaded on every install and never read. Both files are cached correctly
   at runtime by cacheFirst, under the URL that gets requested.

   Making this list carry the stamped URLs instead would take a warm cache one
   visit earlier, but only by having stamp-assets.py rewrite this file too --
   more coupling than the half-visit is worth. */
const SHELL = ["./", "./index.html"];

const NEVER_CACHE = ["site-config.json", "sw.js"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      /* addAll is atomic: one 404 would reject the whole install and leave the
         site with no worker at all. Cache what resolves and move on. */
      .then((cache) =>
        Promise.allSettled(SHELL.map((url) => cache.add(new Request(url, { cache: "reload" }))))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            /* Only shells are swept by version. The old eureka-assets-* caches
               from when this was versioned get collected by the same rule,
               once, and then it stops finding anything. */
            .filter((key) => key.startsWith("eureka-") && key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isNeverCached(url) {
  return NEVER_CACHE.some((name) => url.pathname.endsWith(name));
}

function isCacheableAsset(url) {
  return /\.(webp|png|jpe?g|svg|gif|woff2?|js|css)$/i.test(url.pathname);
}

/* Network-first, because the document is the one file whose URL never changes
   and therefore the only way a new deploy can announce itself.

   The timeout is the point of the race. Offline is the easy case -- fetch
   rejects and the catch runs. The case that hurts is a connection that is up
   but not moving: a captive portal, a hotel access point, one bar of signal.
   There fetch neither resolves nor rejects, and without a deadline the
   navigation hangs on a blank page while a complete copy of the document sits
   in the cache. Three seconds is longer than any real first byte and shorter
   than a visitor's patience.

   The cache lookup starts before the race rather than inside the catch, so by
   the time the deadline fires the answer is usually already in hand instead of
   adding its own latency on top. */
const NAVIGATION_TIMEOUT_MS = 3000;

async function networkFirst(request) {
  const cached = caches.match(request);

  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("navigation timeout")), NAVIGATION_TIMEOUT_MS);
      }),
    ]);
    if (response && response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    /* install uses allSettled, so any one of these can be missing without the
       worker failing to install. Ask for all three rather than assume. */
    const fallback =
      (await cached) || (await caches.match("./index.html")) || (await caches.match("./"));
    if (fallback) return fallback;
    throw error;
  }
}

/* Cache-first is safe here only because every asset URL carries a ?v= stamp:
   when the bytes change the URL changes, so a cached entry can never go
   stale, it just becomes unreferenced and gets swept on the next version
   bump. If that convention is ever dropped, this must become
   stale-while-revalidate. */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && (response.ok || response.type === "opaque")) {
    const cache = await caches.open(ASSET_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  /* Range requests (media seeking) must reach the network; a cached 200 would
     be handed back where a 206 was asked for. */
  if (request.headers.has("range")) return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (isNeverCached(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isCacheableAsset(url)) {
    event.respondWith(cacheFirst(request));
  }
});
