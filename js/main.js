/* Entry point: wires every section to the page, in the order the page needs. */

import { redirectIfInMaintenance } from "./core/config.js?v=aee1329a";
import { handlePointerMove } from "./core/pointer.js?v=c2183471";
import { syncInputDeviceClass, syncViewportHeightVar, visualViewportWidthChanged } from "./core/viewport.js?v=c7860737";
import { initGrainCanvas } from "./effects/grain.js?v=0d4f5285";
import { initCinematicParallax } from "./effects/section-parallax.js?v=91133294";
import {
  applyPreferredLanguage,
  bindLanguageMenuReactions,
  closeLanguageMenu,
  wireLanguageMenu,
} from "./i18n/language.js?v=8b88be35";
import { initJumpLinks, initSectionRail } from "./nav.js?v=2bf12000";
import {
  bindPhotoReactions,
  cancelPhotoSceneFrame,
  handlePhotoZoomKeydown,
  initPhotoTheatre,
  invalidatePhotoLayoutCaches,
  requestPhotoSceneUpdate,
  updatePhotoScene,
} from "./photo/index.js?v=6439d3c5";
import {
  bindBrainReactions,
  pauseBrainScene,
  resizeBrainScene,
  resumeBrainScene,
  scheduleBrainSceneLoad,
} from "./sections/brain.js?v=bbf55c16";
import {
  bindCareerReactions,
  requestCareerSceneUpdate,
  updateCareerLayerClasses,
  updateCareerScene,
  wireCareerGestures,
} from "./sections/career.js?v=2c8dbca2";
import {
  bindHeroReactions,
  bindTiltReactions,
  measureMagnetChars,
  requestHeroParallaxUpdate,
  updateHeroParallax,
} from "./sections/hero.js?v=b2229141";
import { runIntroAnimation } from "./sections/intro.js?v=12b5e097";
import {
  bindLanguageUniverseMotion,
  bindLanguageUniverseReactions,
  languageUniverse,
  renderActiveLanguageNode,
  requestLanguageNetworkSync,
  wireLanguageUniverseControls,
} from "./sections/language-universe.js?v=a293ec96";
import { initMarsClock } from "./sections/mars-clock.js?v=060a7c24";
import {
  bindWelcomeReactions,
  drawWelcome,
  requestWelcomeRender,
  scheduleWelcomeRebuild,
} from "./sections/welcome.js?v=243e1157";
import { commitThemeState, followSystemTheme, resolveTheme, wireThemeToggle } from "./theme/index.js?v=1035ba95";

syncInputDeviceClass();
initPhotoTheatre();

/* Resize fires continuously -- dozens a second while a window is dragged, and
   once per address-bar collapse on a phone -- so the work is split by cost.
   Everything here is cheap or already rAF-coalesced downstream, and is run on
   a frame so a burst of events collapses into one pass. The welcome canvas is
   the exception, and waits for the trailing edge. */
let resizeFrame = 0;

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
      resizeBrainScene();
      requestLanguageNetworkSync();
    });
  }

  scheduleWelcomeRebuild();
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

function handleGlobalKeydown(event) {
  if (!handlePhotoZoomKeydown(event) && event.key === "Escape") {
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
  window.addEventListener("resize", measureMagnetChars, { passive: true });
  document.fonts?.ready?.then(requestLanguageNetworkSync);
}

/* The first full render: the copy and the theme are settled before the
   scenes that draw with them. */
async function renderFirstFrame() {
  syncViewportHeightVar();
  applyPreferredLanguage();
  renderActiveLanguageNode();
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
  followSystemTheme(updateHeroParallax);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelPhotoSceneFrame();
      pauseBrainScene();
    } else {
      resumeBrainScene();
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
  wireCareerGestures();
  await renderFirstFrame();

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
