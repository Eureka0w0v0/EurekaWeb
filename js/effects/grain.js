/* The film-grain overlay canvas. */

import { isTouchFirst, shouldReduceMotion } from "../core/viewport.js?v=71b5eb94";
import { activeTheme } from "../theme.js?v=70ec6705";

/* ═══════════════════════════════════════════════════════════════
   Effect 2: Scroll Velocity Grain / Distortion
   ═══════════════════════════════════════════════════════════════ */

export function initGrainCanvas() {
  const canvas = document.getElementById("grain-canvas");
  if (!canvas) return;

  /* Skip on mobile & reduced-motion */
  if (isTouchFirst() || shouldReduceMotion()) {
    canvas.style.display = "none";
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const GRAIN_W = 128;
  const GRAIN_H = 128;
  canvas.width = GRAIN_W;
  canvas.height = GRAIN_H;
  /* Scale up via CSS for pixelated grain */
  canvas.style.imageRendering = "pixelated";

  let lastScrollY = window.scrollY;
  let scrollVelocity = 0;
  let currentOpacity = 0.03;
  const BASE_OPACITY = 0.03;
  const MAX_OPACITY = 0.12;
  const DECAY = 0.92;
  let grainRunning = false;
  let grainFrame = 0;
  let lastGrainTime = 0;
  const GRAIN_INTERVAL = 50; /* ~20fps */

  /* Allocated once. Re-creating this buffer every frame churned roughly
     1.3 MB/s of garbage for as long as the page stayed visible. */
  const grainImageData = ctx.createImageData(GRAIN_W, GRAIN_H);
  const grainPixels = grainImageData.data;

  function renderGrain(timestamp) {
    if (!grainRunning) return;
    grainFrame = requestAnimationFrame(renderGrain);

    if (timestamp - lastGrainTime < GRAIN_INTERVAL) return;
    lastGrainTime = timestamp;

    const isDark = activeTheme === "dark";
    const base = isDark ? 200 : 40;

    for (let i = 0; i < grainPixels.length; i += 4) {
      const v = base + ((Math.random() * 55) | 0);
      grainPixels[i] = v;
      grainPixels[i + 1] = v;
      grainPixels[i + 2] = v;
      grainPixels[i + 3] = 255;
    }
    ctx.putImageData(grainImageData, 0, 0);

    /* Decay velocity toward base */
    currentOpacity = currentOpacity * DECAY + BASE_OPACITY * (1 - DECAY);
    if (currentOpacity < BASE_OPACITY + 0.001) {
      /* Settled. The grain is uniform random noise, so once the opacity stops
         moving one frame is indistinguishable from the next -- the loop was
         redrawing 16384 pixels twenty times a second to produce a picture
         nobody could tell from the previous one. Park it; the canvas keeps
         its last frame, and onScroll wakes it. */
      currentOpacity = BASE_OPACITY;
      canvas.style.opacity = currentOpacity;
      stop();
      return;
    }
    canvas.style.opacity = currentOpacity;
  }

  function onScroll() {
    const nowY = window.scrollY;
    scrollVelocity = Math.abs(nowY - lastScrollY);
    lastScrollY = nowY;
    currentOpacity = Math.min(MAX_OPACITY, BASE_OPACITY + scrollVelocity * 0.003);
    canvas.style.opacity = currentOpacity;
    start();
  }

  function start() {
    if (grainRunning) return;
    grainRunning = true;
    grainFrame = requestAnimationFrame(renderGrain);
  }

  function stop() {
    grainRunning = false;
    if (grainFrame) {
      cancelAnimationFrame(grainFrame);
      grainFrame = 0;
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });

  document.addEventListener("visibilitychange", () => {
    /* Only resume if there is still something to animate -- coming back to a
       settled page should leave it settled, not restart the loop. */
    if (document.hidden) {
      stop();
    } else if (currentOpacity > BASE_OPACITY + 0.001) {
      start();
    }
  });

  start();
}
