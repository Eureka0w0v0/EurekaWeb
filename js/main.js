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
import { initGrainCanvas } from "./effects/grain.js?v=1b1ff6c7";
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
} from "./i18n/language.js?v=651a14fb";
import { initJumpLinks, initSectionRail } from "./nav.js?v=2bf12000";
import { initPhotoQueueCards } from "./photo/cards.js?v=f9b5c68e";
import {
  handlePhotoCarouselTouchEnd,
  handlePhotoCarouselTouchMove,
  handlePhotoCarouselTouchStart,
  handlePhotoCarouselWheel,
} from "./photo/carousel.js?v=1d3e910b";
import {
  photoSection,
  photoShowAllButton,
  photoStage,
  photoZoomCloseButton,
  photoZoomOverlay,
} from "./photo/dom.js?v=64ce044a";
import { bindPhotoReactions, togglePhotoAllExpanded } from "./photo/expand.js?v=41907812";
import { initPhotoCardHoverGlow } from "./photo/hover-glow.js?v=a03d1150";
import {
  handlePhotoCardKeydown,
  handlePhotoMainCardClick,
  handlePhotoMainCardPointerPreload,
  handlePhotoMainCardTouchPreload,
} from "./photo/interaction.js?v=e3afb3c5";
import { invalidatePhotoLayoutCaches } from "./photo/layout.js?v=c9fe971e";
import { updatePhotoScene } from "./photo/scene.js?v=f181b0cb";
import {
  cancelPhotoSceneFrame,
  isPhotoZoomOpen,
  requestPhotoSceneUpdate,
} from "./photo/state.js?v=b4cbf01b";
import {
  closePhotoZoom,
  handlePhotoZoomClosePointerDown,
  handlePhotoZoomOverlayPointerDown,
  stopPhotoZoomScroll,
} from "./photo/zoom.js?v=c883e1e6";
import {
  bindBrainReactions,
  brainSceneController,
  brainSceneOnScreen,
  scheduleBrainSceneLoad,
} from "./sections/brain.js?v=944d5227";
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
} from "./sections/career.js?v=f0ee8cbd";
import {
  bindHeroReactions,
  bindTiltReactions,
  initCinematicParallax,
  measureMagnetChars,
  requestHeroParallaxUpdate,
  resetTilt,
  tiltCard,
  updateHeroParallax,
} from "./sections/hero.js?v=443e4818";
import { runIntroAnimation } from "./sections/intro.js?v=c8870d8a";
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
} from "./sections/language-universe.js?v=dd3395d9";
import { initMarsClock } from "./sections/mars-clock.js?v=060a7c24";
import {
  bindWelcomeReactions,
  buildWelcomeCanvas,
  drawWelcome,
  requestWelcomeRender,
  requestWelcomeScatterUpdate,
} from "./sections/welcome.js?v=842ffdae";
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
} from "./theme.js?v=29c3a7f7";

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

function wireLanguageControls() {
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
}

/* Page-wide listeners. Several share an event (resize, scroll), and
   listeners on one target run in the order they were added -- which decides
   the order their rAF callbacks run within a frame -- so this order is kept. */
function wireGlobalListeners() {
  window.addEventListener("pointermove", handlePointerMove, { passive: true });
  window.addEventListener("click", (event) => {
    if (!languageSwitcher?.contains(event.target)) {
      closeLanguageMenu();
    }
  });
  window.addEventListener("keydown", handleGlobalKeydown);
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
}

function wireSectionGestures() {
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

  wireLanguageControls();
  wireThemeToggle();
  wireGlobalListeners();
  wireSectionGestures();
  await renderFirstFrame();

  /* Initialize visual effects */
  initCinematicParallax();
  initGrainCanvas();
  initPhotoCardHoverGlow();
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
