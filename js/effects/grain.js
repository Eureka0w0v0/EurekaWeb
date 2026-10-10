/* The film-grain overlay canvas: a 128x128 noise tile scaled up behind the
   page, brighter while the page scrolls and fading back to a faint base. */

import { isTouchFirst, shouldReduceMotion } from "../core/viewport.js?v=71b5eb94";
import { activeTheme } from "../theme.js?v=ad29e4e7";

const GRAIN_W = 128;
const GRAIN_H = 128;
const BASE_OPACITY = 0.03;
const MAX_OPACITY = 0.12;
const DECAY = 0.92;
const GRAIN_INTERVAL = 50; /* ~20fps */

/* There is one grain canvas, set up once by initGrainCanvas. */
const grain = {
  canvas: null,
  ctx: null,
  /* Allocated once. Re-creating this buffer every frame churned roughly
     1.3 MB/s of garbage for as long as the page stayed visible. */
  imageData: null,
  running: false,
  frame: 0,
  lastTime: 0,
  lastScrollY: 0,
  opacity: BASE_OPACITY,
};

function paintGrainNoise() {
  const pixels = grain.imageData.data;
  const base = activeTheme === "dark" ? 200 : 40;

  for (let i = 0; i < pixels.length; i += 4) {
    const v = base + ((Math.random() * 55) | 0);
    pixels[i] = v;
    pixels[i + 1] = v;
    pixels[i + 2] = v;
    pixels[i + 3] = 255;
  }
  grain.ctx.putImageData(grain.imageData, 0, 0);
}

function renderGrain(timestamp) {
  if (!grain.running) return;
  grain.frame = requestAnimationFrame(renderGrain);

  if (timestamp - grain.lastTime < GRAIN_INTERVAL) return;
  grain.lastTime = timestamp;

  paintGrainNoise();

  /* Decay velocity toward base */
  grain.opacity = grain.opacity * DECAY + BASE_OPACITY * (1 - DECAY);
  if (grain.opacity < BASE_OPACITY + 0.001) {
    /* Settled. The grain is uniform random noise, so once the opacity stops
       moving one frame is indistinguishable from the next -- the loop was
       redrawing 16384 pixels twenty times a second to produce a picture
       nobody could tell from the previous one. Park it; the canvas keeps
       its last frame, and the next scroll wakes it. */
    grain.opacity = BASE_OPACITY;
    grain.canvas.style.opacity = grain.opacity;
    stopGrain();
    return;
  }
  grain.canvas.style.opacity = grain.opacity;
}

function onGrainScroll() {
  const nowY = window.scrollY;
  const scrollVelocity = Math.abs(nowY - grain.lastScrollY);
  grain.lastScrollY = nowY;
  grain.opacity = Math.min(MAX_OPACITY, BASE_OPACITY + scrollVelocity * 0.003);
  grain.canvas.style.opacity = grain.opacity;
  startGrain();
}

function startGrain() {
  if (grain.running) return;
  grain.running = true;
  grain.frame = requestAnimationFrame(renderGrain);
}

function stopGrain() {
  grain.running = false;
  if (grain.frame) {
    cancelAnimationFrame(grain.frame);
    grain.frame = 0;
  }
}

/* Only resume if there is still something to animate -- coming back to a
   settled page should leave it settled, not restart the loop. */
function onGrainVisibilityChange() {
  if (document.hidden) {
    stopGrain();
  } else if (grain.opacity > BASE_OPACITY + 0.001) {
    startGrain();
  }
}

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

  canvas.width = GRAIN_W;
  canvas.height = GRAIN_H;
  /* Scale up via CSS for pixelated grain */
  canvas.style.imageRendering = "pixelated";

  grain.canvas = canvas;
  grain.ctx = ctx;
  grain.imageData = ctx.createImageData(GRAIN_W, GRAIN_H);
  grain.lastScrollY = window.scrollY;

  window.addEventListener("scroll", onGrainScroll, { passive: true });
  document.addEventListener("visibilitychange", onGrainVisibilityChange);

  startGrain();
}
