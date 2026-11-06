/* The slow scale and drift of a section as it crosses the viewport. */

import { isTouchFirst } from "../core/viewport.js?v=c7860737";

export function initCinematicParallax() {
  const sections = document.querySelectorAll("[data-theme-section]");
  if (!sections.length) return;

  /* An allowlist, deliberately down to one section. Scaling and fading every
     section on scroll is the dated "everything drifts in" look, and it was
     also doing real damage: hero already runs updateHeroParallax over its own
     children, so the container scale compounded with it, and welcome carries
     the sand canvas which is motion enough on its own. career and photo were
     never eligible — they measure themselves with getBoundingClientRect and an
     external scale() skews those coordinates. */
  const CINEMATIC_SECTIONS = new Set(["language"]);
  const parallaxSections = Array.from(sections)
    .filter((s) => CINEMATIC_SECTIONS.has(s.getAttribute("data-theme-section")))
    .map((sec) => ({
      sec,
      eyebrow: sec.querySelector(".eyebrow"),
      heading: sec.querySelector("h1, h2"),
    }));

  let cinematicFrame = 0;

  function updateCinematicParallax() {
    const vh = window.innerHeight;
    const center = vh / 2;
    const mobile = isTouchFirst();
    const strength = mobile ? 0.5 : 1.0;

    /* Measure everything first, then write. Interleaving the two forced a
       synchronous layout per section on every scroll frame. */
    for (let i = 0; i < parallaxSections.length; i++) {
      const entry = parallaxSections[i];
      const rect = entry.sec.getBoundingClientRect();
      entry.secCenter = rect.top + rect.height / 2;
    }

    for (let i = 0; i < parallaxSections.length; i++) {
      const { sec, eyebrow, heading, secCenter } = parallaxSections[i];
      const dist = Math.abs(secCenter - center);
      const proximity = 1 - Math.min(dist / vh, 1);

      const s = 1 + proximity * 0.02 * strength;
      const o = 0.92 + proximity * 0.08;

      sec.style.transform = "scale(" + s + ")";
      sec.style.opacity = o;

      /* Eyebrow & heading get a slightly faster parallax rate */
      if (eyebrow) {
        const shift = (secCenter - center) * -0.015 * strength;
        eyebrow.style.transform = "translate3d(0," + shift + "px,0)";
      }
      if (heading && heading !== eyebrow) {
        const shift = (secCenter - center) * -0.01 * strength;
        heading.style.transform = "translate3d(0," + shift + "px,0)";
      }
    }
  }

  function requestCinematicUpdate() {
    if (cinematicFrame) return;
    cinematicFrame = requestAnimationFrame(() => {
      cinematicFrame = 0;
      updateCinematicParallax();
    });
  }

  window.addEventListener("scroll", requestCinematicUpdate, { passive: true });
  updateCinematicParallax();
}
