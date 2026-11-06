/* Entry point: wires every section to the page, in the order the page needs. */

import { redirectIfInMaintenance } from "./core/config.js?v=aee1329a";
import { handlePointerMove } from "./core/pointer.js?v=c2183471";
import { safeStorageSet } from "./core/storage.js?v=55891515";
import {
  reducedMotionQuery,
  syncInputDeviceClass,
  syncViewportHeightVar,
  visualViewportWidthChanged,
} from "./core/viewport.js?v=c7860737";
import { initGrainCanvas } from "./effects/grain.js?v=074e3a5a";
import {
  applyLanguage,
  bindLanguageMenuReactions,
  closeLanguageMenu,
  resolveLanguage,
  wireLanguageMenu,
} from "./i18n/language.js?v=a2602265";
import { initJumpLinks, initSectionRail } from "./nav.js?v=2bf12000";
import {
  bindPhotoReactions,
  cancelPhotoSceneFrame,
  handlePhotoZoomKeydown,
  initPhotoTheatre,
  invalidatePhotoLayoutCaches,
  requestPhotoSceneUpdate,
  updatePhotoScene,
} from "./photo/index.js?v=1fd46847";
import {
  bindBrainReactions,
  brainSceneController,
  brainSceneOnScreen,
  scheduleBrainSceneLoad,
} from "./sections/brain.js?v=e377b90d";
import {
  bindCareerReactions,
  requestCareerSceneUpdate,
  updateCareerLayerClasses,
  updateCareerScene,
  wireCareerGestures,
} from "./sections/career.js?v=96cf31da";
import {
  bindHeroReactions,
  bindTiltReactions,
  initCinematicParallax,
  measureMagnetChars,
  requestHeroParallaxUpdate,
  updateHeroParallax,
} from "./sections/hero.js?v=8a3b28b2";
import { runIntroAnimation } from "./sections/intro.js?v=0fae4618";
import {
  activeLanguageNode,
  bindLanguageUniverseMotion,
  bindLanguageUniverseReactions,
  languageUniverse,
  requestLanguageNetworkSync,
  setActiveLanguageNode,
  wireLanguageUniverseControls,
} from "./sections/language-universe.js?v=9454bb4f";
import { initMarsClock } from "./sections/mars-clock.js?v=060a7c24";
import {
  bindWelcomeReactions,
  buildWelcomeCanvas,
  drawWelcome,
  requestWelcomeRender,
} from "./sections/welcome.js?v=55155a02";
import {
  activeTheme,
  commitThemeState,
  getStoredTheme,
  isThemeBusy,
  mediaQuery,
  resolveTheme,
  storageKey,
  themeToggle,
  triggerThemeWave,
} from "./theme.js?v=ce83fa63";

syncInputDeviceClass();

initPhotoTheatre();
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

/* Resize fires continuously -- dozens a second while a window is dragged, and
   once per address-bar collapse on a phone -- so the work is split by cost.

   Everything here is cheap or already rAF-coalesced downstream, and is run on
   a frame so a burst of events collapses into one pass.

   buildWelcomeCanvas is the exception and is deferred to the trailing edge
   instead. It calls buildWelcomeLayer, which allocates three fresh canvases
   per layer -- sample, texture and dust, around 22MB together at desktop size
   -- then runs a full getImageData scan and a nested sampling loop over the
   result. Doing that per resize event churned tens of megabytes a second; on
   iOS Safari, where total canvas memory is capped, that kind of churn is how
   you lose the WebGL context. The canvas is invisible mid-drag anyway. */
const RESIZE_SETTLE_MS = 150;
let resizeFrame = 0;
let welcomeRebuildTimer = 0;

function handleWindowResize() {
  if (!resizeFrame) {
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = 0;
      syncInputDeviceClass();
      invalidatePhotoLayoutCaches();
      syncViewportHeightVar();
      updateHeroParallax();
      requestCareerSceneUpdate();
      requestPhotoSceneUpdate();
      brainSceneController?.resize();
      requestLanguageNetworkSync();
    });
  }

  if (welcomeRebuildTimer) {
    window.clearTimeout(welcomeRebuildTimer);
  }
  welcomeRebuildTimer = window.setTimeout(() => {
    welcomeRebuildTimer = 0;
    buildWelcomeCanvas();
    requestWelcomeRender();
  }, RESIZE_SETTLE_MS);
}

function handleVisualViewportResize() {
  if (visualViewportWidthChanged()) {
    invalidatePhotoLayoutCaches();
  }

  syncViewportHeightVar();
}

/* Order matters: listeners run in subscription order, and this is the order
   applyLanguage used to call these sections in. Subscribed before anything
   can emit. */
function bindSectionReactions() {
  bindLanguageMenuReactions();
  bindPhotoReactions();
  bindLanguageUniverseReactions();
  bindHeroReactions();
  bindBrainReactions();
  bindWelcomeReactions();
  bindCareerReactions();
  bindTiltReactions();
  bindLanguageUniverseMotion();
}

function wireThemeToggle() {
  themeToggle?.addEventListener("click", async (event) => {
    /* Mirror the guard inside triggerThemeWave so the stored preference
       never flips while the wave silently refuses to run. */
    if (isThemeBusy()) {
      return;
    }

    const nextTheme = activeTheme === "dark" ? "light" : "dark";
    const rect = event.currentTarget.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;

    safeStorageSet(storageKey, nextTheme);
    await triggerThemeWave(originX, originY, nextTheme);
  });
}

function handleGlobalKeydown(event) {
  if (handlePhotoZoomKeydown(event)) {
    return;
  }

  if (event.key === "Escape") {
    closeLanguageMenu();
  }
}

/* Page-wide listeners. Several share an event (resize, scroll), and
   listeners on one target run in the order they were added -- which decides
   the order their rAF callbacks run within a frame -- so this order is kept. */
function wireGlobalListeners() {
  window.addEventListener("pointermove", handlePointerMove, { passive: true });
  window.addEventListener("keydown", handleGlobalKeydown);
  window.addEventListener("resize", handleWindowResize, { passive: true });
  window.visualViewport?.addEventListener("resize", handleVisualViewportResize);
  window.addEventListener("scroll", requestWelcomeRender, { passive: true });
  window.addEventListener("scroll", requestHeroParallaxUpdate, { passive: true });
  window.addEventListener("scroll", requestCareerSceneUpdate, { passive: true });
  window.addEventListener("scroll", requestPhotoSceneUpdate, { passive: true });
  window.addEventListener("scroll", requestLanguageNetworkSync, { passive: true });
  window.addEventListener("hashchange", requestCareerSceneUpdate);
  window.addEventListener("load", requestLanguageNetworkSync);
}

function wireSectionGestures() {
  wireCareerGestures();
  window.addEventListener("resize", measureMagnetChars, { passive: true });
  document.fonts?.ready?.then(requestLanguageNetworkSync);
}

/* The first full render: the copy and the theme are settled before the
   scenes that draw with them. */
async function renderFirstFrame() {
  syncViewportHeightVar();
  applyLanguage(resolveLanguage());
  setActiveLanguageNode(activeLanguageNode);
  updateCareerLayerClasses();
  await commitThemeState(resolveTheme());
  scheduleBrainSceneLoad(languageUniverse);
  drawWelcome();
  updateHeroParallax();
  updateCareerScene();
  updatePhotoScene();
  requestLanguageNetworkSync();
}

function wireLifecycle() {
  mediaQuery.addEventListener("change", (event) => {
    if (getStoredTheme()) {
      return;
    }

    commitThemeState(event.matches ? "dark" : "light").then(() => {
      updateHeroParallax();
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelPhotoSceneFrame();
      brainSceneController?.stop();
    } else {
      /* Only resume what is actually on screen -- otherwise switching back to
         the tab restarts the brain no matter where the page is scrolled. */
      if (brainSceneOnScreen) {
        brainSceneController?.start();
      }
      requestPhotoSceneUpdate();
    }
  });
}

async function initApp() {
  bindSectionReactions();
  redirectIfInMaintenance();

  const introPromise = runIntroAnimation();

  wireLanguageMenu();
  wireLanguageUniverseControls();
  wireThemeToggle();
  wireGlobalListeners();
  wireSectionGestures();
  await renderFirstFrame();

  /* Initialize visual effects */
  initCinematicParallax();
  initGrainCanvas();
  initMarsClock();

  /* Bound before the intro is awaited. The intro runs ~3.5s, and until these
     exist a backgrounded tab keeps the photo rAF and the brain scene running;
     anything throwing above would have skipped them entirely. */
  wireLifecycle();

  initSectionRail();
  initJumpLinks();

  await introPromise;
}

initApp().catch((error) => {
  console.error("[EurekaWeb] initApp failed:", error);
});
