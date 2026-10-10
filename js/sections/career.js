/* The career card stack, its gestures, and how it holds still during a theme change. */

import { root } from "../core/dom.js?v=5057c320";
import { pageEvents } from "../core/events.js?v=8c4a4d4a";
import { waitForFrames } from "../core/frames.js?v=0b68ae2a";
import { createMachine } from "../core/machine.js?v=73a7d34e";
import { clamp01, easeInOut, mapScrollSegment } from "../core/math.js?v=54e566c4";
import { isTouchFirst, shouldReduceMotion, stableMobileAppHeight } from "../core/viewport.js?v=c7860737";
import {
  addThemeTransitionParticipant,
  isThemeTransitionLite,
  isThemeTransitionRunning,
  themeWave,
} from "../theme.js?v=29c3a7f7";

const careerSection = document.querySelector("#career-section");
const careerScene = document.querySelector(".career-scene");
export const careerCardStack = document.querySelector(".career-card-stack");
const careerUfo = document.querySelector(".career-ufo");
const careerAlien = document.querySelector(".career-alien");
const careerCardLayers = document.querySelectorAll("[data-career-layer]");
let careerFrame = 0;

/* While the theme changes, a phone's career scene is held still so the
   transition's snapshot never catches it mid-animation, then let go. The
   phase of that hold:

     idle       nothing held
     frozen     a transition is running: the scroll animation is stopped, the
                scene's variables are cached and (with lockGeometry) the
                elements are pinned to where they were
     resuming   the transition is over: wait for the wave to leave the
                screen, then restore over a few frames
     restoring  restored at once (after the geometry-locked wave), with two
                frames to settle

   frozen and resuming are what used to be careerSceneFrozenForTheme;
   resuming and restoring what used to be careerThemeRestorePending.

   Back in idle the scene can still be held, by data beside the phase:
   holdUntilScroll keeps it still until the visitor scrolls more than 3px
   from where it froze (set by every freeze, cleared by finish and by that
   scroll), and cooldownUntil holds it for 320ms after a restore unless they
   scroll sooner. */
const themeLock = {
  phase: createMachine("career theme lock", {
    initial: "idle",
    states: {
      idle: { freeze: "frozen", clear: "idle", finish: "restoring" },
      frozen: { freeze: "frozen", clear: "idle", resume: "resuming", finish: "restoring" },
      resuming: { freeze: "frozen", resume: "resuming", resumed: "idle", finish: "restoring" },
      restoring: { freeze: "frozen", finish: "restoring", restored: "idle" },
    },
  }),
  resumeFrame: 0,
  frozenScrollY: 0,
  holdUntilScroll: false,
  cooldownUntil: 0,
};

function isCareerFrozenForTheme() {
  return themeLock.phase.is("frozen", "resuming");
}

function isCareerRestorePending() {
  return themeLock.phase.is("resuming", "restoring");
}

function cancelThemeLockFrame() {
  if (themeLock.resumeFrame) {
    window.cancelAnimationFrame(themeLock.resumeFrame);
    themeLock.resumeFrame = 0;
  }
}
let activeCareerLayer = 1;
let careerLayerTimer = 0;
let careerWheelUnlockTimer = 0;
let careerTouchStartX = 0;
let careerTouchStartY = 0;
let careerTouchSwitchLocked = false;
const careerSceneThemeVars = [
  "--career-card-y",
  "--career-card-opacity",
  "--career-card-scale",
  "--career-ufo-y",
  "--career-ufo-opacity",
  "--career-ufo-scale",
  "--career-alien-y",
  "--career-alien-opacity",
  "--career-alien-scale",
];
const careerSceneThemeCache = new Map();
const careerGeometryLockTargets = [];
const careerGeometryLockCache = new Map();

function getCareerLayerSwitchDuration() {
  return isTouchFirst() ? 360 : 430;
}

function restoreCareerSceneThemeCache() {
  if (!careerSection || !careerSceneThemeCache.size) {
    return;
  }

  careerSceneThemeVars.forEach((propertyName) => {
    const value = careerSceneThemeCache.get(propertyName);
    if (value) {
      careerSection.style.setProperty(propertyName, value);
    }
  });
}

function cacheInlineStyleSnapshot(element) {
  if (!element || careerGeometryLockCache.has(element)) {
    return;
  }

  careerGeometryLockCache.set(element, {
    position: element.style.position,
    left: element.style.left,
    top: element.style.top,
    width: element.style.width,
    height: element.style.height,
    minHeight: element.style.minHeight,
    margin: element.style.margin,
    transform: element.style.transform,
    transformOrigin: element.style.transformOrigin,
    perspective: element.style.perspective,
    transformStyle: element.style.transformStyle,
    opacity: element.style.opacity,
    zIndex: element.style.zIndex,
    pointerEvents: element.style.pointerEvents,
    contain: element.style.contain,
    willChange: element.style.willChange,
  });
}

function lockElementToViewportRect(element, { zIndex = null, contain = "" } = {}) {
  if (!element || !isTouchFirst()) {
    return;
  }

  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return;
  }

  cacheInlineStyleSnapshot(element);
  careerGeometryLockTargets.push(element);

  const computed = getComputedStyle(element);
  const resolvedZIndex = zIndex ?? (computed.zIndex === "auto" ? "" : computed.zIndex);

  element.style.position = "fixed";
  element.style.left = `${rect.left.toFixed(2)}px`;
  element.style.top = `${rect.top.toFixed(2)}px`;
  element.style.width = `${rect.width.toFixed(2)}px`;
  element.style.height = `${rect.height.toFixed(2)}px`;
  element.style.minHeight = `${rect.height.toFixed(2)}px`;
  element.style.margin = "0";
  element.style.transform = "none";
  element.style.zIndex = resolvedZIndex;
  element.style.pointerEvents = "none";
  element.style.contain = contain;
  element.style.willChange = "auto";
}

function lockCareerSceneToViewportForTheme() {
  if (!careerScene || !isTouchFirst()) {
    return false;
  }

  const rect = careerScene.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return false;
  }

  cacheInlineStyleSnapshot(careerScene);
  careerGeometryLockTargets.push(careerScene);

  const computed = getComputedStyle(careerScene);
  const resolvedZIndex = computed.zIndex === "auto" ? "3" : computed.zIndex;

  careerScene.style.position = "fixed";
  careerScene.style.left = `${rect.left.toFixed(2)}px`;
  careerScene.style.top = `${rect.top.toFixed(2)}px`;
  careerScene.style.width = `${rect.width.toFixed(2)}px`;
  careerScene.style.height = `${rect.height.toFixed(2)}px`;
  careerScene.style.minHeight = `${rect.height.toFixed(2)}px`;
  careerScene.style.margin = "0";
  careerScene.style.transformOrigin = "top left";
  careerScene.style.transform = "none";
  careerScene.style.opacity = computed.opacity;
  careerScene.style.zIndex = resolvedZIndex;
  careerScene.style.pointerEvents = "none";
  careerScene.style.willChange = "auto";

  return true;
}

function lockCareerCardStackForTheme() {
  if (!careerCardStack || !isTouchFirst()) {
    return;
  }

  const rect = careerCardStack.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return;
  }

  const computed = getComputedStyle(careerCardStack);
  const layoutWidth = parseFloat(computed.width) || rect.width;
  const layoutHeight = parseFloat(computed.height) || rect.height;
  const visualScale = layoutWidth > 0 ? rect.width / layoutWidth : 1;
  const resolvedZIndex = computed.zIndex === "auto" ? "4" : computed.zIndex;

  cacheInlineStyleSnapshot(careerCardStack);
  careerGeometryLockTargets.push(careerCardStack);

  careerCardStack.style.position = "fixed";
  careerCardStack.style.left = `${rect.left.toFixed(2)}px`;
  careerCardStack.style.top = `${rect.top.toFixed(2)}px`;
  careerCardStack.style.width = `${layoutWidth.toFixed(2)}px`;
  careerCardStack.style.height = `${layoutHeight.toFixed(2)}px`;
  careerCardStack.style.minHeight = `${layoutHeight.toFixed(2)}px`;
  careerCardStack.style.margin = "0";
  careerCardStack.style.transformOrigin = "top left";
  careerCardStack.style.transform = `scale(${visualScale.toFixed(5)})`;
  careerCardStack.style.perspective = computed.perspective;
  careerCardStack.style.transformStyle = "preserve-3d";
  careerCardStack.style.opacity = computed.opacity;
  careerCardStack.style.zIndex = resolvedZIndex;
  careerCardStack.style.pointerEvents = "none";
  careerCardStack.style.willChange = "auto";
}

function lockCareerGeometryForTheme() {
  if (!isTouchFirst()) {
    return;
  }

  if (careerGeometryLockCache.size) {
    return;
  }

  careerGeometryLockTargets.length = 0;
  if (lockCareerSceneToViewportForTheme()) {
    return;
  }

  lockElementToViewportRect(careerUfo);
  lockCareerCardStackForTheme();
  lockElementToViewportRect(careerAlien);
}

function restoreCareerGeometryForTheme() {
  if (!careerGeometryLockCache.size) {
    return;
  }

  careerGeometryLockTargets.forEach((element) => {
    const snapshot = careerGeometryLockCache.get(element);
    if (!snapshot) {
      return;
    }

    Object.entries(snapshot).forEach(([propertyName, value]) => {
      element.style[propertyName] = value;
    });
  });

  careerGeometryLockTargets.length = 0;
  careerGeometryLockCache.clear();
}

function freezeCareerLayerStylesForTheme() {
  if (!careerCardStack || !isTouchFirst()) {
    return;
  }

  careerCardStack.classList.add("is-theme-locking");
  careerCardStack.classList.remove("is-switching-forward", "is-switching-back");

  if (careerLayerTimer) {
    window.clearTimeout(careerLayerTimer);
    careerLayerTimer = 0;
  }
}

function restoreCareerLayerStylesForTheme() {
  if (!careerCardStack) {
    return;
  }

  restoreCareerGeometryForTheme();
}

function freezeCareerSceneForTheme({ lockGeometry = true } = {}) {
  if (!careerSection || !isTouchFirst()) {
    return;
  }

  freezeCareerLayerStylesForTheme();
  if (lockGeometry) {
    lockCareerGeometryForTheme();
  } else {
    careerGeometryLockTargets.length = 0;
    careerGeometryLockCache.clear();
  }

  if (careerFrame) {
    window.cancelAnimationFrame(careerFrame);
    careerFrame = 0;
  }

  cancelThemeLockFrame();

  const styles = getComputedStyle(careerSection);
  careerSceneThemeVars.forEach((propertyName) => {
    const value = (
      careerSection.style.getPropertyValue(propertyName) ||
      styles.getPropertyValue(propertyName)
    ).trim();
    careerSceneThemeCache.set(propertyName, value);
    if (value) {
      careerSection.style.setProperty(propertyName, value);
    }
  });

  themeLock.frozenScrollY = window.scrollY;
  themeLock.cooldownUntil = Number.POSITIVE_INFINITY;
  themeLock.holdUntilScroll = true;
  themeLock.phase.send("freeze");
}

function clearStaleCareerThemeLockBeforeTransition() {
  if (!isTouchFirst() || isCareerRestorePending() || isThemeTransitionRunning()) {
    return;
  }

  const hasStaleLock = Boolean(
    careerGeometryLockCache.size ||
    careerGeometryLockTargets.length ||
    careerCardStack?.classList.contains("is-theme-locking") ||
    isCareerFrozenForTheme()
  );

  if (!hasStaleLock) {
    return;
  }

  cancelThemeLockFrame();
  restoreCareerSceneThemeCache();
  restoreCareerLayerStylesForTheme();
  careerCardStack?.classList.remove("is-theme-locking");
  themeLock.holdUntilScroll = false;
  themeLock.cooldownUntil = 0;
  themeLock.phase.send("clear");
}

function scheduleCareerSceneResumeAfterTheme() {
  if (!careerSection || !isCareerFrozenForTheme()) {
    return;
  }

  themeLock.phase.send("resume");
  cancelThemeLockFrame();

  const resumeWhenThemeWaveSettles = () => {
    if (
      isTouchFirst() &&
      (
        isThemeTransitionRunning() ||
        themeWave?.classList.contains("is-active") ||
        root.classList.contains("theme-snapshot-active")
      )
    ) {
      themeLock.resumeFrame = window.requestAnimationFrame(resumeWhenThemeWaveSettles);
      return;
    }

    restoreCareerSceneThemeCache();
    themeLock.resumeFrame = window.requestAnimationFrame(() => {
      restoreCareerSceneThemeCache();
      restoreCareerLayerStylesForTheme();
      themeLock.resumeFrame = window.requestAnimationFrame(() => {
        themeLock.resumeFrame = window.requestAnimationFrame(() => {
          /* Still "resuming": every freeze, finish or clear cancels this
             chain before it can get here. */
          themeLock.resumeFrame = 0;
          careerCardStack?.classList.remove("is-theme-locking");
          themeLock.cooldownUntil = performance.now() + 320;
          themeLock.phase.send("resumed");
        });
      });
    });
  };

  themeLock.resumeFrame = window.requestAnimationFrame(resumeWhenThemeWaveSettles);
}

async function finishCareerSceneAfterTheme() {
  if (!isCareerFrozenForTheme() && !careerGeometryLockCache.size) {
    return;
  }

  themeLock.phase.send("finish");
  cancelThemeLockFrame();
  restoreCareerSceneThemeCache();
  restoreCareerLayerStylesForTheme();
  careerCardStack?.classList.remove("is-theme-locking");
  themeLock.holdUntilScroll = false;
  themeLock.cooldownUntil = performance.now() + 320;

  await waitForFrames(2);
  /* The two frames cannot be cancelled. A freeze that landed during them --
     a system theme change, say -- has already moved the phase on, and wins. */
  if (themeLock.phase.is("restoring")) {
    themeLock.phase.send("restored");
  }
}

function isCareerSceneThemeLocked() {
  const stillWhereItFroze = () => Math.abs(window.scrollY - themeLock.frozenScrollY) <= 3;

  if (themeLock.holdUntilScroll) {
    if (stillWhereItFroze()) {
      return true;
    }

    themeLock.holdUntilScroll = false;
    themeLock.cooldownUntil = 0;
  }

  const isCoolingDown = performance.now() < themeLock.cooldownUntil && stillWhereItFroze();

  return (
    !themeLock.phase.is("idle") ||
    isCoolingDown ||
    isThemeTransitionRunning() ||
    isThemeTransitionLite() ||
    root.classList.contains("theme-snapshot-active")
  );
}

function isCareerSectionInViewport() {
  if (!careerSection) {
    return false;
  }

  const rect = careerSection.getBoundingClientRect();
  const viewportHeight = isTouchFirst()
    ? Math.max(stableMobileAppHeight || window.innerHeight, 1)
    : Math.max(window.innerHeight, document.documentElement.clientHeight, 1);

  return rect.bottom > 0 && rect.top < viewportHeight;
}

export function updateCareerLayerClasses() {
  if (!careerCardStack || isCareerSceneThemeLocked()) {
    return;
  }

  careerCardStack.dataset.activeLayer = String(activeCareerLayer);
  /* The ends are where the page has to be able to take the gesture back; the
     stylesheet keys touch-action and overscroll-behavior off these. */
  careerCardStack.classList.toggle("is-at-first", activeCareerLayer <= 1);
  careerCardStack.classList.toggle("is-at-last", activeCareerLayer >= careerCardLayers.length);

  careerCardLayers.forEach((layer) => {
    const layerIndex = Number(layer.dataset.careerLayer);
    layer.classList.toggle("is-active", layerIndex === activeCareerLayer);
    layer.classList.toggle("is-before", layerIndex < activeCareerLayer);
    layer.classList.toggle("is-after", layerIndex > activeCareerLayer);

    if (layerIndex === activeCareerLayer) {
      layer.setAttribute("aria-current", "true");
    } else {
      layer.removeAttribute("aria-current");
    }
  });
}

function resetCareerLayerScroll(layerIndex = activeCareerLayer) {
  const scrollArea = document.querySelector(`.layer-card-scroll[data-career-layer="${layerIndex}"]`);

  if (scrollArea) {
    scrollArea.scrollTop = 0;
  }
}

function setCareerLayer(nextLayer, direction = "forward") {
  if (!careerCardStack || isCareerSceneThemeLocked()) {
    return;
  }

  const clampedLayer = Math.min(Math.max(nextLayer, 1), careerCardLayers.length || 1);

  if (clampedLayer === activeCareerLayer) {
    return;
  }

  activeCareerLayer = clampedLayer;
  resetCareerLayerScroll(clampedLayer);
  const animationDirection = clampedLayer === 3 ? "forward" : direction;
  const switchDuration = getCareerLayerSwitchDuration();
  careerCardStack.dataset.direction = animationDirection;
  careerCardStack.classList.remove("is-switching-forward", "is-switching-back");
  if (!shouldReduceMotion() && !isTouchFirst()) {
    careerCardStack.classList.add(animationDirection === "back" ? "is-switching-back" : "is-switching-forward");
  }
  updateCareerLayerClasses();

  window.clearTimeout(careerLayerTimer);
  careerLayerTimer = window.setTimeout(() => {
    careerCardStack.classList.remove("is-switching-forward", "is-switching-back");
    resetCareerLayerScroll(clampedLayer);
  }, switchDuration);
}

/* True when a step in this direction would run off the end of the stack. The
   stack used to wrap instead -- card 3 stepped to card 1 -- and because the
   wheel and touch handlers below cancel the event whenever they step, that
   was a trap on phones: the stack fills the screen there, every swipe lands on
   it, and a visitor cycled Career / Alien Hunter / Layer 03 forever without
   the page ever moving on to the photos. Now the ends fall through, the same
   way the keyboard handler always has. */
function isCareerStackAtEnd(direction) {
  const layerCount = careerCardLayers.length;
  return direction === "back" ? activeCareerLayer <= 1 : activeCareerLayer >= layerCount;
}

function stepCareerLayer(direction) {
  if (!careerCardLayers.length || isCareerStackAtEnd(direction)) {
    return;
  }

  setCareerLayer(activeCareerLayer + (direction === "back" ? -1 : 1), direction);
}

/* The stack is otherwise reachable only by wheel and touch drag, which left
   the second and third cards unreachable without a pointer. Arrows step one
   card, Home/End jump to the ends; at either end we fall through so the key
   still scrolls the page instead of trapping focus. */
export function handleCareerLayerKeydown(event) {
  if (!careerCardStack || isCareerSceneThemeLocked()) {
    return;
  }

  const layerCount = careerCardLayers.length;

  if (!layerCount || event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }

  let nextLayer;
  let direction = "forward";

  switch (event.key) {
    case "ArrowDown":
    case "ArrowRight":
    case "PageDown":
      nextLayer = activeCareerLayer + 1;
      break;
    case "ArrowUp":
    case "ArrowLeft":
    case "PageUp":
      nextLayer = activeCareerLayer - 1;
      direction = "back";
      break;
    case "Home":
      nextLayer = 1;
      direction = "back";
      break;
    case "End":
      nextLayer = layerCount;
      break;
    default:
      return;
  }

  if (nextLayer < 1 || nextLayer > layerCount) {
    return;
  }

  event.preventDefault();
  setCareerLayer(nextLayer, direction);
}

function getActiveCareerScrollArea() {
  return document.querySelector(`.layer-card-scroll[data-career-layer="${activeCareerLayer}"]`);
}

function canScrollCareerLayer(scrollArea, deltaY) {
  if (!scrollArea || scrollArea.scrollHeight <= scrollArea.clientHeight + 1) {
    return false;
  }

  const overflowY = window.getComputedStyle(scrollArea).overflowY;
  if (overflowY !== "auto" && overflowY !== "scroll") {
    return false;
  }

  if (!isTouchFirst() && activeCareerLayer === 3) {
    scrollArea.scrollTop = 0;
    return false;
  }

  if (deltaY < 0) {
    return scrollArea.scrollTop > 0;
  }

  return scrollArea.scrollTop + scrollArea.clientHeight < scrollArea.scrollHeight - 1;
}


export function handleCareerLayerWheel(event) {
  /* setCareerLayer refuses to act while the theme is transitioning, but this
     ran first and had already called preventDefault and armed
     careerWheelUnlockTimer by then. The step was dropped and the page was
     held anyway: roughly 720ms of theme transition plus a 510ms unlock timer
     where a wheel over the cards neither turned a card nor scrolled the page.
     Checking here lets the event fall through to the page instead. */
  if (!careerCardStack || Math.abs(event.deltaY) < 4 || isCareerSceneThemeLocked()) {
    return;
  }

  const direction = event.deltaY > 0 ? "forward" : "back";
  const scrollArea = getActiveCareerScrollArea();

  if (canScrollCareerLayer(scrollArea, event.deltaY) || isCareerStackAtEnd(direction)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (careerWheelUnlockTimer) {
    return;
  }

  stepCareerLayer(direction);
  const unlockDelay = getCareerLayerSwitchDuration() + 80;
  careerWheelUnlockTimer = window.setTimeout(() => {
    careerWheelUnlockTimer = 0;
  }, unlockDelay);
}

export function handleCareerLayerTouchStart(event) {
  event.stopPropagation();
  careerTouchStartX = event.touches?.[0]?.clientX ?? 0;
  careerTouchStartY = event.touches?.[0]?.clientY ?? 0;
  careerTouchSwitchLocked = false;
}

export function handleCareerLayerTouchMove(event) {
  /* Same reasoning as handleCareerLayerWheel: bail before preventDefault
     rather than hold the gesture for a step setCareerLayer will refuse. */
  if (!careerCardStack || isCareerSceneThemeLocked()) {
    return;
  }

  const touch = event.touches?.[0];
  const currentX = touch?.clientX ?? careerTouchStartX;
  const currentY = touch?.clientY ?? careerTouchStartY;
  const deltaX = currentX - careerTouchStartX;
  const deltaY = careerTouchStartY - currentY;
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  if (absX > 8 && absX > absY * 0.35) {
    event.preventDefault();
    event.stopPropagation();

    if (absY < 34) {
      return;
    }
  }

  if (absY < 34) {
    return;
  }

  const direction = deltaY > 0 ? "forward" : "back";
  const scrollArea = getActiveCareerScrollArea();

  if (canScrollCareerLayer(scrollArea, deltaY) || isCareerStackAtEnd(direction)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (careerTouchSwitchLocked) {
    return;
  }

  stepCareerLayer(direction);

  careerTouchStartY = currentY;
  careerTouchSwitchLocked = true;
  window.setTimeout(() => {
    careerTouchSwitchLocked = false;
  }, getCareerLayerSwitchDuration() + 30);
}

export function handleCareerLayerTouchEnd(event) {
  event.stopPropagation();
  careerTouchSwitchLocked = false;
}

export function updateCareerScene() {
  if (!careerSection || isCareerSceneThemeLocked()) {
    return;
  }

  const rect = careerSection.getBoundingClientRect();
  const viewportHeight = isTouchFirst()
    ? Math.max(stableMobileAppHeight || window.innerHeight, 1)
    : Math.max(window.innerHeight, window.visualViewport?.height || 0, 1);
  const progress = clamp01((viewportHeight * 0.85 - rect.top) / (viewportHeight * 1.05));

  if (shouldReduceMotion()) {
    careerSection.style.setProperty("--career-ufo-y", "0");
    careerSection.style.setProperty("--career-ufo-opacity", "1");
    careerSection.style.setProperty("--career-ufo-scale", "1");
    careerSection.style.setProperty("--career-card-y", "0");
    careerSection.style.setProperty("--career-card-opacity", "1");
    careerSection.style.setProperty("--career-card-scale", "1");
    careerSection.style.setProperty("--career-alien-y", "0");
    careerSection.style.setProperty("--career-alien-opacity", "1");
    careerSection.style.setProperty("--career-alien-scale", "1");
    return;
  }

  const ufoProgress = easeInOut(mapScrollSegment(progress, 0, 0.44));
  const cardProgress = easeInOut(mapScrollSegment(progress, 0.28, 0.66));
  const alienProgress = easeInOut(mapScrollSegment(progress, 0.58, 0.9));

  const ufoY = -116 + ufoProgress * 56;
  const cardY = 180 - cardProgress * 180;
  const alienY = 64 - alienProgress * 64;

  careerSection.style.setProperty("--career-ufo-y", ufoY.toFixed(2));
  careerSection.style.setProperty("--career-ufo-opacity", ufoProgress.toFixed(3));
  careerSection.style.setProperty("--career-ufo-scale", (0.86 + ufoProgress * 0.14).toFixed(3));
  careerSection.style.setProperty("--career-card-y", cardY.toFixed(2));
  careerSection.style.setProperty("--career-card-opacity", cardProgress.toFixed(3));
  careerSection.style.setProperty("--career-card-scale", (0.94 + cardProgress * 0.06).toFixed(3));
  careerSection.style.setProperty("--career-alien-y", alienY.toFixed(2));
  careerSection.style.setProperty("--career-alien-opacity", alienProgress.toFixed(3));
  careerSection.style.setProperty("--career-alien-scale", (0.78 + alienProgress * 0.22).toFixed(3));
}

export function bindCareerReactions() {
  addThemeTransitionParticipant({
    isBusy: isCareerRestorePending,
    prepare: clearStaleCareerThemeLockBeforeTransition,
    /* On a phone with the cards in view, the wave has to pin their geometry
       before the snapshot is taken, or the captured frame jumps. */
    wantsGeometryLockedWave: () => isTouchFirst() && isCareerSectionInViewport(),
    freeze: (options) => freezeCareerSceneForTheme(options),
    scheduleResume: scheduleCareerSceneResumeAfterTheme,
    finish: finishCareerSceneAfterTheme,
  });

  /* Card copy changes length between languages, so the scene is re-measured a
     frame later, once the new text has laid out. The animated path leaves
     this to the scroll and resize handlers, as it always has. */
  pageEvents.on("language:change", ({ animated }) => {
    if (animated) {
      return;
    }
    window.requestAnimationFrame(() => {
      updateCareerScene();
      requestCareerSceneUpdate();
    });
  });
}

export function requestCareerSceneUpdate() {
  if (isCareerSceneThemeLocked()) {
    return;
  }

  if (careerFrame) {
    return;
  }

  careerFrame = window.requestAnimationFrame(() => {
    updateCareerScene();
    careerFrame = 0;
  });
}
