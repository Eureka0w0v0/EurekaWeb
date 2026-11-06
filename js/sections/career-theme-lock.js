/* How the career scene holds still during a theme change. */

import { root } from "../core/dom.js?v=5057c320";
import { waitForFrames } from "../core/frames.js?v=0b68ae2a";
import { createMachine } from "../core/machine.js?v=73a7d34e";
import { isTouchFirst, stableMobileAppHeight } from "../core/viewport.js?v=c7860737";
import {
  addThemeTransitionParticipant,
  isThemeTransitionLite,
  isThemeTransitionRunning,
  themeWave,
} from "../theme/index.js?v=1035ba95";

const careerSection = document.querySelector("#career-section");
const careerScene = document.querySelector(".career-scene");
const careerCardStack = document.querySelector(".career-card-stack");
const careerUfo = document.querySelector(".career-ufo");
const careerAlien = document.querySelector(".career-alien");

/* A freeze has to stop what career.js has in flight: its pending scene frame
   and the timer ending a card switch. */
const hooks = { cancelSceneFrame() {}, cancelLayerSwitch() {} };

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

  hooks.cancelLayerSwitch();
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

  hooks.cancelSceneFrame();

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

export function isCareerSceneThemeLocked() {
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

export function bindCareerThemeLock({ cancelSceneFrame, cancelLayerSwitch }) {
  hooks.cancelSceneFrame = cancelSceneFrame;
  hooks.cancelLayerSwitch = cancelLayerSwitch;
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
}
