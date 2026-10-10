/* Entry point: wires every section to the page, in the order the page needs. */

import { redirectIfInMaintenance } from "./core/config.js?v=aee1329a";
import { handlePointerMove } from "./core/pointer.js?v=c2183471";
import { safeStorageSet } from "./core/storage.js?v=55891515";
import {
  reducedMotionQuery,
  syncInputDeviceClass,
  syncViewportHeightVar,
  visualViewportWidthChanged,
} from "./core/viewport.js?v=71b5eb94";
import { initGrainCanvas } from "./effects/grain.js?v=6ff60548";
import {
  applyLanguage,
  bindLanguageMenuReactions,
  closeLanguageMenu,
  languageOptions,
  languageSwitcher,
  languageToggle,
  resolveLanguage,
  switchLanguageWithAnimation,
  toggleLanguageMenu,
} from "./i18n/language.js?v=c4a9e128";
import { initJumpLinks, initSectionRail } from "./nav.js?v=2f0ea05b";
import {
  bindPhotoReactions,
  cancelPhotoSceneFrame,
  closePhotoZoom,
  handlePhotoCardKeydown,
  handlePhotoCarouselTouchEnd,
  handlePhotoCarouselTouchMove,
  handlePhotoCarouselTouchStart,
  handlePhotoCarouselWheel,
  handlePhotoMainCardClick,
  handlePhotoMainCardPointerPreload,
  handlePhotoMainCardTouchPreload,
  handlePhotoZoomClosePointerDown,
  handlePhotoZoomOverlayPointerDown,
  initPhotoCardHoverGlow,
  initPhotoQueueCards,
  invalidatePhotoLayoutCaches,
  photoSection,
  photoShowAllButton,
  photoStage,
  isPhotoZoomOpen,
  photoZoomCloseButton,
  photoZoomOverlay,
  requestPhotoSceneUpdate,
  stopPhotoZoomScroll,
  togglePhotoAllExpanded,
  updatePhotoScene,
} from "./photo.js?v=24e4d6d2";
import {
  bindBrainReactions,
  brainSceneController,
  brainSceneOnScreen,
  scheduleBrainSceneLoad,
} from "./sections/brain.js?v=cfe35dd0";
import {
  bindCareerReactions,
  careerCardStack,
  handleCareerLayerKeydown,
  handleCareerLayerTouchEnd,
  handleCareerLayerTouchMove,
  handleCareerLayerTouchStart,
  handleCareerLayerWheel,
  requestCareerSceneUpdate,
  updateCareerLayerClasses,
  updateCareerScene,
} from "./sections/career.js?v=9a6cba4b";
import {
  bindHeroReactions,
  bindTiltReactions,
  initCinematicParallax,
  measureMagnetChars,
  requestHeroParallaxUpdate,
  resetTilt,
  tiltCard,
  updateHeroParallax,
} from "./sections/hero.js?v=55fd101c";
import { runIntroAnimation } from "./sections/intro.js?v=6d0db08a";
import {
  activeLanguageNode,
  bindLanguageUniverseMotion,
  bindLanguageUniverseReactions,
  languageIndexButtons,
  languageNodeButtons,
  languageUniverse,
  requestLanguageNetworkSync,
  resetLanguageUniverseParallax,
  revealLanguageUniverse,
  setActiveLanguageNode,
} from "./sections/language-universe.js?v=9066230e";
import { initMarsClock } from "./sections/mars-clock.js?v=060a7c24";
import {
  bindWelcomeReactions,
  buildWelcomeCanvas,
  drawWelcome,
  requestWelcomeRender,
  requestWelcomeScatterUpdate,
} from "./sections/welcome.js?v=eec85c78";
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
} from "./theme.js?v=70ec6705";

syncInputDeviceClass();

initPhotoQueueCards();
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

async function initApp() {
  /* Order matters: listeners run in subscription order, and this is the
     order applyLanguage used to call these sections in. */
  bindLanguageMenuReactions();
  bindPhotoReactions();
  bindLanguageUniverseReactions();
  bindHeroReactions();
  bindBrainReactions();
  bindWelcomeReactions();
  bindCareerReactions();
  bindTiltReactions();
  bindLanguageUniverseMotion();

  redirectIfInMaintenance();

  const introPromise = runIntroAnimation();

  languageToggle?.addEventListener("click", () => {
    toggleLanguageMenu();
  });

  languageOptions.forEach((option) => {
    option.addEventListener("click", async () => {
      const nextLanguage = option.dataset.language || "zh";
      await switchLanguageWithAnimation(nextLanguage);
    });
  });

  languageNodeButtons.forEach((button) => {
    button.addEventListener("mouseenter", () => {
      setActiveLanguageNode(button.dataset.languageNode || "js");
    });
    button.addEventListener("focus", () => {
      setActiveLanguageNode(button.dataset.languageNode || "js");
    });
    button.addEventListener("click", () => {
      setActiveLanguageNode(button.dataset.languageNode || "js");
    });
    button.addEventListener("transitionend", requestLanguageNetworkSync);
  });

  languageIndexButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveLanguageNode(button.dataset.languageNode || "js");
    });
  });

  languageUniverse?.addEventListener("mouseleave", resetLanguageUniverseParallax);

  revealLanguageUniverse();

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

  window.addEventListener("pointermove", handlePointerMove, { passive: true });
  window.addEventListener("click", (event) => {
    if (!languageSwitcher?.contains(event.target)) {
      closeLanguageMenu();
    }
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (isPhotoZoomOpen()) {
        closePhotoZoom();
        return;
      }
      closeLanguageMenu();
    }

    /* aria-modal="true" tells a screen reader that nothing outside the dialog
       exists, so Tab leaving it puts the two in disagreement: focus lands on
       something the user has just been told is not there. The dialog holds
       exactly one focusable element, so trapping is simply keeping it. */
    if (isPhotoZoomOpen() && event.key === "Tab") {
      event.preventDefault();
      photoZoomCloseButton?.focus({ preventScroll: true });
    }
  });
  tiltCard?.addEventListener("mouseleave", resetTilt);
  window.addEventListener("resize", handleWindowResize, { passive: true });
  window.visualViewport?.addEventListener("resize", handleVisualViewportResize);
  window.addEventListener("scroll", requestWelcomeScatterUpdate, { passive: true });
  window.addEventListener("scroll", requestHeroParallaxUpdate, { passive: true });
  window.addEventListener("scroll", requestCareerSceneUpdate, { passive: true });
  window.addEventListener("scroll", requestPhotoSceneUpdate, { passive: true });
  window.addEventListener("scroll", requestLanguageNetworkSync, { passive: true });
  window.addEventListener("hashchange", requestCareerSceneUpdate);
  window.addEventListener("load", requestLanguageNetworkSync);
  careerCardStack?.addEventListener("wheel", handleCareerLayerWheel, { passive: false, capture: true });
  careerCardStack?.addEventListener("touchstart", handleCareerLayerTouchStart, { passive: true, capture: true });
  careerCardStack?.addEventListener("touchmove", handleCareerLayerTouchMove, { passive: false, capture: true });
  careerCardStack?.addEventListener("touchend", handleCareerLayerTouchEnd, { passive: true, capture: true });
  photoStage?.addEventListener("pointerover", handlePhotoMainCardPointerPreload);
  photoStage?.addEventListener("touchstart", handlePhotoMainCardTouchPreload, { passive: true });
  photoStage?.addEventListener("click", handlePhotoMainCardClick);
  photoStage?.addEventListener("keydown", handlePhotoCardKeydown);
  photoZoomCloseButton?.addEventListener("pointerdown", handlePhotoZoomClosePointerDown);
  photoZoomCloseButton?.addEventListener("mousedown", handlePhotoZoomClosePointerDown);
  photoZoomCloseButton?.addEventListener("touchstart", handlePhotoZoomClosePointerDown, { passive: false });
  photoZoomCloseButton?.addEventListener("click", handlePhotoZoomClosePointerDown);
  photoZoomOverlay?.addEventListener("pointerdown", handlePhotoZoomOverlayPointerDown);
  photoZoomOverlay?.addEventListener("mousedown", handlePhotoZoomOverlayPointerDown);
  photoZoomOverlay?.addEventListener("touchstart", handlePhotoZoomOverlayPointerDown, { passive: false });
  photoZoomOverlay?.addEventListener("click", handlePhotoZoomOverlayPointerDown);
  photoZoomOverlay?.addEventListener("wheel", stopPhotoZoomScroll, { passive: false });
  photoZoomOverlay?.addEventListener("touchmove", stopPhotoZoomScroll, { passive: false });
  photoShowAllButton?.addEventListener("click", togglePhotoAllExpanded);
  photoSection?.addEventListener("wheel", handlePhotoCarouselWheel, { passive: false, capture: true });
  photoSection?.addEventListener("touchstart", handlePhotoCarouselTouchStart, { passive: true, capture: true });
  photoSection?.addEventListener("touchmove", handlePhotoCarouselTouchMove, { passive: false, capture: true });
  photoSection?.addEventListener("touchend", handlePhotoCarouselTouchEnd, { passive: true, capture: true });
  photoSection?.addEventListener("touchcancel", handlePhotoCarouselTouchEnd, { passive: true, capture: true });
  careerCardStack?.addEventListener("keydown", handleCareerLayerKeydown);
  window.addEventListener("resize", measureMagnetChars, { passive: true });
  document.fonts?.ready?.then(requestLanguageNetworkSync);

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

  /* Initialize visual effects */
  initCinematicParallax();
  initGrainCanvas();
  initPhotoCardHoverGlow();
  initMarsClock();

  /* Bound before the intro is awaited. The intro runs ~3.5s, and until these
     exist a backgrounded tab keeps the photo rAF and the brain scene running;
     anything throwing above would have skipped them entirely. */
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

  initSectionRail();
  initJumpLinks();

  await introPromise;
}

initApp().catch((error) => {
  console.error("[EurekaWeb] initApp failed:", error);
});
