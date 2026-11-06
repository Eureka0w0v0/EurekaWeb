/* The career card stack and its gestures. */

import { pageEvents } from "../core/events.js?v=8c4a4d4a";
import { clamp01, easeInOut, mapScrollSegment } from "../core/math.js?v=54e566c4";
import { isTouchFirst, shouldReduceMotion, stableMobileAppHeight } from "../core/viewport.js?v=c7860737";
import { bindCareerThemeLock, isCareerSceneThemeLocked } from "./career-theme-lock.js?v=7f432224";

const careerSection = document.querySelector("#career-section");
const careerCardStack = document.querySelector(".career-card-stack");
const careerCardLayers = document.querySelectorAll("[data-career-layer]");
let careerFrame = 0;

let activeCareerLayer = 1;
let careerLayerTimer = 0;
let careerWheelUnlockTimer = 0;
let careerTouchStartX = 0;
let careerTouchStartY = 0;
let careerTouchSwitchLocked = false;

function getCareerLayerSwitchDuration() {
  return isTouchFirst() ? 360 : 430;
}

function cancelCareerSceneFrame() {
  if (careerFrame) {
    window.cancelAnimationFrame(careerFrame);
    careerFrame = 0;
  }
}

function cancelCareerLayerSwitch() {
  if (careerLayerTimer) {
    window.clearTimeout(careerLayerTimer);
    careerLayerTimer = 0;
  }
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
function handleCareerLayerKeydown(event) {
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


function handleCareerLayerWheel(event) {
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

function handleCareerLayerTouchStart(event) {
  event.stopPropagation();
  careerTouchStartX = event.touches?.[0]?.clientX ?? 0;
  careerTouchStartY = event.touches?.[0]?.clientY ?? 0;
  careerTouchSwitchLocked = false;
}

function handleCareerLayerTouchMove(event) {
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

function handleCareerLayerTouchEnd(event) {
  event.stopPropagation();
  careerTouchSwitchLocked = false;
}

export function wireCareerGestures() {
  careerCardStack?.addEventListener("wheel", handleCareerLayerWheel, { passive: false, capture: true });
  careerCardStack?.addEventListener("touchstart", handleCareerLayerTouchStart, { passive: true, capture: true });
  careerCardStack?.addEventListener("touchmove", handleCareerLayerTouchMove, { passive: false, capture: true });
  careerCardStack?.addEventListener("touchend", handleCareerLayerTouchEnd, { passive: true, capture: true });
  careerCardStack?.addEventListener("keydown", handleCareerLayerKeydown);
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
  bindCareerThemeLock({ cancelSceneFrame: cancelCareerSceneFrame, cancelLayerSwitch: cancelCareerLayerSwitch });

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
