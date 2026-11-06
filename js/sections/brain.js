/* The three.js wireframe brain: when it loads and when it runs. What it is
   lives in brain/, which only this module imports. */

import { pageEvents } from "../core/events.js?v=8c4a4d4a";
import { isElementInViewport, reducedMotionQuery, shouldReduceMotion } from "../core/viewport.js?v=c7860737";
import { activeTheme } from "../theme.js?v=875a3d80";
import { createBrainWireframeScene } from "./brain/scene.js?v=bdf9a911";

export const brainWrap = document.querySelector(".brain-wrap");
export const brainMount = document.querySelector("#brain-three-mount");

export let brainSceneController = null;
/* Whether the brain is close enough to the viewport to be worth rendering.
   Defaults to true so that a browser without IntersectionObserver keeps the
   old always-on behaviour instead of a scene that never starts. */
let brainSceneOnScreen = true;

export function bindBrainReactions() {
  const setTheme = ({ theme }) => {
    brainSceneController?.setTheme(theme);
  };
  pageEvents.on("theme:snapshot", ({ theme }) => {
    const universe = brainMount?.closest("#language-universe") || null;
    if (isElementInViewport(universe) || isElementInViewport(brainMount)) {
      brainSceneController?.setTheme(theme);
    }
  });
  pageEvents.on("theme:applied", setTheme);
  pageEvents.on("theme:render-now", setTheme);
  pageEvents.on("theme:render-frame", setTheme);

  /* Re-read on change like the theme query does. Everything that consults
     shouldReduceMotion() asks per call rather than caching, so turning the
     preference on mid-session takes effect from the next frame; this listener
     exists so the layers that latch -- the brain scene, the grain canvas --
     settle instead of running on with a stale answer. */
  reducedMotionQuery.addEventListener?.("change", () => {
    if (reducedMotionQuery.matches) {
      brainSceneController?.stop();
    }
  });
}

export function resizeBrainScene() {
  brainSceneController?.resize();
}

export function pauseBrainScene() {
  brainSceneController?.stop();
}

/* Only resume what is actually on screen -- otherwise switching back to the
   tab restarts the brain no matter where the page is scrolled. */
export function resumeBrainScene() {
  if (brainSceneOnScreen) {
    brainSceneController?.start();
  }
}

/* observeTarget is what has to come near the viewport before three.js is
   fetched: the whole language section, passed in by initApp, so the load
   starts while the visitor is still approaching it. */
export function scheduleBrainSceneLoad(observeTarget = brainMount) {
  if (!brainMount || brainSceneController || shouldReduceMotion()) {
    return;
  }

  let loading = false;

  const loadBrain = async () => {
    if (loading || brainSceneController || shouldReduceMotion()) {
      return;
    }

    loading = true;
    try {
      brainSceneController = await createBrainWireframeScene(brainMount);
      if (brainSceneController && activeTheme) {
        brainSceneController.setTheme?.(activeTheme);
      }
    } finally {
      loading = false;
    }
  };

  const target = observeTarget || brainMount;

  if (typeof IntersectionObserver === "function" && target) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }

        observer.disconnect();
        loadBrain().then(() => watchBrainSceneVisibility(target));
      },
      {
        root: null,
        rootMargin: "220px 0px",
        threshold: 0.01,
      }
    );

    observer.observe(target);
    return;
  }

  const idle = window.requestIdleCallback || ((cb) => window.setTimeout(cb, 900));
  idle(() => {
    loadBrain().then(() => watchBrainSceneVisibility(target));
  });
}

/* The loader's observer disconnects the moment the scene exists, which left
   nothing watching afterwards: a WebGL scene three screens above the fold kept
   rendering at 60fps because only visibilitychange ever stopped it. This
   second observer outlives the load and owns the running state from then on.

   The margin is smaller than the loader's 220px -- that one buys time to
   download three.js, this one only needs the scene warm before it is seen. */
function watchBrainSceneVisibility(target) {
  if (!brainSceneController || !target || typeof IntersectionObserver !== "function") {
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      brainSceneOnScreen = entries.some((entry) => entry.isIntersecting);
      if (brainSceneOnScreen) {
        if (!document.hidden) {
          brainSceneController?.start();
        }
      } else {
        brainSceneController?.stop();
      }
    },
    { root: null, rootMargin: "120px 0px", threshold: 0 }
  );

  observer.observe(target);
}
