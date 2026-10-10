/* site-config.json and the maintenance redirect. */
/* Maintenance mode is a switch in site-config.json, read on every visit.

   It used to be awaited before anything else ran, which put one uncacheable
   round trip -- the file is no-store on every host and in the worker's
   NEVER_CACHE -- between every visitor and the page, for a switch that is
   almost never on. Now the request is only started: the intro and the page
   run at once, and in the rare case the answer is "maintenance" the redirect
   follows a moment later, while the intro overlay still covers the page.

   The deadline still matters, for a different reason: it bounds when that
   redirect can happen. A config that arrives after SITE_CONFIG_TIMEOUT_MS is
   ignored rather than pulling a visitor off a page they have started reading.
   Losing the race resolves rather than rejects -- "not in maintenance", the
   same answer every other failure path gives.

   The race uses a plain setTimeout, not `signal: AbortSignal.timeout?.(4000)`:
   where AbortSignal.timeout is missing that optional call is undefined,
   `signal: undefined` is no signal at all, and the guard silently vanished on
   the old browsers most likely to need it. */
const SITE_CONFIG_TIMEOUT_MS = 3000;
const SITE_CONFIG_DEFAULT = { maintenance: false };

async function loadSiteConfig() {
  const request = (async () => {
    try {
      const response = await fetch("./site-config.json", { cache: "no-store" });
      if (!response.ok) {
        return SITE_CONFIG_DEFAULT;
      }

      const config = await response.json();
      return config && typeof config === "object" ? config : SITE_CONFIG_DEFAULT;
    } catch (error) {
      console.error("Failed to load site config.", error);
      return SITE_CONFIG_DEFAULT;
    }
  })();

  const deadline = new Promise((resolve) => {
    setTimeout(() => resolve(SITE_CONFIG_DEFAULT), SITE_CONFIG_TIMEOUT_MS);
  });

  return Promise.race([request, deadline]);
}

export function redirectIfInMaintenance() {
  loadSiteConfig().then((siteConfig) => {
    if (siteConfig.maintenance) {
      window.location.replace("./maintenance/index.html");
    }
  });
}
