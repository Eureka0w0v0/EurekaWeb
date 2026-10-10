/* Service worker for Eureka Web.

   Hand-written rather than generated with Workbox: the whole policy is three
   rules, and pulling a toolkit off a CDN would reintroduce exactly the kind of
   third-party dependency the three.js vendoring just removed.

   Every path here is relative. GitHub Pages serves this site from /EurekaWeb/
   and eureka-web.com serves it from /, so anything absolute would work on one
   host and 404 on the other.

   Two things must never be cached, and both are load-bearing:
     - site-config.json drives maintenance mode. A stale copy would leave the
       site stuck in (or out of) maintenance with no way to correct it.
     - sw.js itself. deploy/nginx/eurekaweb.conf marks *.js immutable for a
       year, which for this one file would mean the worker can never be
       replaced. There is a matching no-cache override there; this comment
       exists so the next person to touch either one finds the other. */

const VERSION = "2026-09-15-2";
const SHELL_CACHE = `eureka-shell-${VERSION}`;

/* Deliberately not versioned. Tying the name to VERSION meant a one-line CSS
   change emptied it: 6.1MB of images/full, 2.9MB of images/medium and 744KB
   of vendor/, re-downloaded by every returning visitor, to replace bytes that
   were still perfectly valid.

   Not versioned also means nothing ever swept it, and every deploy left the
   previous version of each changed file behind for good. cacheFirst now
   evicts those as it goes (see storeAsset). The "-2" retires the old cache
   once: the activate sweep deletes any eureka-* cache that is not current,
   which clears what had already piled up, at the price of one re-download. */
const ASSET_CACHE = "eureka-assets-2";

/* Only the documents needed to paint something useful. The heavy assets --
   images and the vendored three.js -- are deliberately left to runtime
   caching so a first visit does not stall on a multi-megabyte install.

   Nothing with a ?v= stamp belongs in this list. caches.match compares full
   URLs including the query, so a bare "./css/base.css" here can never answer
   the "./css/base.css?v=b8c10228" the page actually asks for -- it would
   just be downloaded on every install and never read. Stamped assets are
   cached correctly at runtime by cacheFirst, under the URL that gets
   requested.

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
            /* Only shells are swept by version. Retired asset caches -- the
               eureka-assets-* ones from when it was versioned, and the
               unversioned eureka-assets that preceded eureka-assets-2 -- are
               collected by the same rule, once, and then it finds nothing. */
            .filter((key) => key.startsWith("eureka-") && key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isNeverCached(url) {
  /* Compare the last path segment, not a suffix. endsWith would also have
     excluded a future legacy-sw.js or my-site-config.json, silently and for a
     reason nobody would think to look for. */
  const name = url.pathname.split("/").pop();
  return NEVER_CACHE.includes(name);
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
   stale -- it can only stop being asked for. If that convention is ever
   dropped, this must become stale-while-revalidate. */
async function cacheFirst(event) {
  const { request } = event;
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  /* No opaque check: the fetch handler returns early on any cross-origin
     request, and opaque responses only come from cross-origin no-cors. The
     condition could never be true, and reading it suggested this worker
     handles third-party assets, which it does not. */
  if (response && response.ok) {
    /* waitUntil, because respondWith settles as soon as the response is
       returned and the worker may be stopped right after; an unawaited put
       could be cut off half-way. */
    event.waitUntil(storeAsset(request, response.clone()));
  }
  return response;
}

/* A page only ever asks for an asset under its current stamp, so storing a
   new version of a path makes every other version of it unreachable: drop
   them. The cache then holds one entry per file instead of one per deploy. */
async function storeAsset(request, response) {
  const cache = await caches.open(ASSET_CACHE);
  await cache.put(request, response);
  const { pathname } = new URL(request.url);
  const others = (await cache.keys()).filter(
    (key) => key.url !== request.url && new URL(key.url).pathname === pathname
  );
  await Promise.all(others.map((key) => cache.delete(key)));
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
    event.respondWith(cacheFirst(event));
  }
});
