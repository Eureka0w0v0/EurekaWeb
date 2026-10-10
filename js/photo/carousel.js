/* Stepping the carousel: wheel, swipe, settling and the touch gesture. */

import { isCompactLayout, isTouchFirst } from "../core/viewport.js?v=71b5eb94";
import { photoCarouselCards, photoQueueAnchor } from "./dom.js?v=64ce044a";
import {
  carousel,
  clampPhotoCarouselIndex,
  expand,
  expandTarget,
  gesture,
  isCarouselEnabled,
  isCarouselSettling,
  photoCardSlotMap,
  requestPhotoSceneUpdate,
} from "./state.js?v=b4cbf01b";
import { preloadNearbyPhotoZoomImages } from "./zoom.js?v=5d4a4ded";

export function navigatePhotoCarouselToSlot(slot) {
  if (!isCarouselEnabled() || expandTarget() > 0 || expand.progress > 0.01) {
    return false;
  }

  const targetSlot = clampPhotoCarouselIndex(slot);
  const currentSlot = clampPhotoCarouselIndex(Math.round(carousel.visualIndex));
  if (targetSlot === currentSlot) {
    return false;
  }

  carousel.boundaryDelta = 0;
  carousel.boundaryDirection = 0;
  carousel.previousIndex = clampPhotoCarouselIndex(Math.round(carousel.visualIndex));
  carousel.targetIndex = targetSlot;
  setPhotoSelectedSlot(targetSlot);
  carousel.transitionDirection = Math.sign(targetSlot - currentSlot);
  carousel.hasInteracted = true;
  carousel.phase.send("step");
  requestPhotoSceneUpdate();
  return true;
}

export function clearCarouselWheelState() {
  carousel.wheelDelta = 0;
  carousel.wheelDirection = 0;
  carousel.boundaryDelta = 0;
  carousel.boundaryDirection = 0;
}

export function setPhotoSelectedSlot(slot) {
  const nextSlot = clampPhotoCarouselIndex(Math.round(slot));
  carousel.selectedSlot = nextSlot;
  carousel.selectedSourceCard = photoCardSlotMap.get(nextSlot) || carousel.selectedSourceCard;
  preloadNearbyPhotoZoomImages(nextSlot, isTouchFirst() ? 1 : 2);
}

function beginPhotoCarouselSettle(preferTarget = false) {
  if (photoCarouselCards.length === 0) {
    return;
  }

  const sourceIndex = preferTarget ? carousel.targetIndex : carousel.visualIndex;
  const nearestIndex = clampPhotoCarouselIndex(Math.round(sourceIndex));
  carousel.previousIndex = clampPhotoCarouselIndex(Math.round(carousel.visualIndex));
  carousel.transitionDirection = Math.sign(nearestIndex - carousel.visualIndex);
  carousel.targetIndex = nearestIndex;
  setPhotoSelectedSlot(nearestIndex);
  carousel.phase.send("settle");
  carousel.hasInteracted = true;
  requestPhotoSceneUpdate();
}

function canStepPhotoCarousel(direction) {
  if (!isCarouselEnabled() || !direction) {
    return false;
  }

  const target = clampPhotoCarouselIndex(carousel.targetIndex);
  return direction > 0 ? target < carousel.maxIndex : target > carousel.minIndex;
}

function stepPhotoCarousel(direction) {
  if (!canStepPhotoCarousel(direction)) {
    return false;
  }

  carousel.boundaryDelta = 0;
  carousel.boundaryDirection = 0;
  carousel.previousIndex = carousel.targetIndex;
  carousel.targetIndex = clampPhotoCarouselIndex(carousel.targetIndex + direction);
  setPhotoSelectedSlot(carousel.targetIndex);
  carousel.transitionDirection = direction;
  carousel.hasInteracted = true;
  carousel.phase.send("step");
  requestPhotoSceneUpdate();
  return true;
}

function clearGestureUnlockTimer() {
  if (gesture.unlockTimer) {
    window.clearTimeout(gesture.unlockTimer);
    gesture.unlockTimer = 0;
  }
}

export function resetPhotoCarouselTouchState() {
  gesture.phase.send("reset");
  clearGestureUnlockTimer();
}

/* Locked for 460ms after a step or a push against the end, so one swipe
   moves one card. The timer only unlocks the lock it was set for. */
function lockGestureBriefly() {
  gesture.phase.send("lock");
  clearGestureUnlockTimer();
  gesture.unlockTimer = window.setTimeout(() => {
    gesture.unlockTimer = 0;
    if (gesture.phase.is("locked")) {
      gesture.phase.send("unlock");
    }
  }, 460);
}

function getPhotoCarouselHitRect() {
  if (!isCarouselEnabled() || photoCarouselCards.length === 0) {
    return null;
  }

  if (carousel.hitRectCache) {
    return carousel.hitRectCache;
  }

  return photoQueueAnchor?.getBoundingClientRect() || null;
}

function isPointInPhotoCarousel(x, y) {
  const rect = getPhotoCarouselHitRect();

  if (!rect) {
    return false;
  }

  const isCompact = isCompactLayout();
  const hitSlopX = isCompact ? 28 : 48;
  const hitSlopY = isCompact ? 58 : 96;

  return (
    x >= rect.left - hitSlopX &&
    x <= rect.right + hitSlopX &&
    y >= rect.top - hitSlopY &&
    y <= rect.bottom + hitSlopY
  );
}

export function handlePhotoCarouselWheel(event) {
  if (!isCarouselEnabled() || expandTarget() > 0 || expand.progress > 0.01) {
    return;
  }

  if (!isPointInPhotoCarousel(event.clientX, event.clientY)) {
    clearCarouselWheelState();
    return;
  }

  const absWheelX = Math.abs(event.deltaX);
  const absWheelY = Math.abs(event.deltaY);
  const horizontalIntent = absWheelX > absWheelY * 1.15;

  if (!horizontalIntent) {
    clearCarouselWheelState();
    return;
  }

  const delta = event.deltaX;

  if (Math.abs(delta) < 3) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  const direction = delta > 0 ? 1 : -1;
  const now = window.performance.now();

  const canStep = canStepPhotoCarousel(direction);

  if (!canStep) {
    if (carousel.boundaryDirection !== direction) {
      carousel.boundaryDelta = 0;
      carousel.boundaryDirection = direction;
    }

    carousel.boundaryDelta += Math.abs(delta);
    carousel.wheelDelta = 0;
    carousel.wheelDirection = 0;

    if (carousel.boundaryDelta >= 240) {
      carousel.boundaryDelta = 0;
      carousel.boundaryDirection = 0;
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  carousel.boundaryDelta = 0;
  carousel.boundaryDirection = 0;

  if (now - carousel.lastStepTime < 680) {
    return;
  }

  if (carousel.wheelDirection !== direction) {
    carousel.wheelDelta = 0;
    carousel.wheelDirection = direction;
  }

  carousel.wheelDelta += Math.abs(delta);

  if (carousel.wheelDelta < 52) {
    return;
  }

  stepPhotoCarousel(direction);
  carousel.wheelDelta = 0;
  carousel.lastStepTime = now;
}

export function handlePhotoCarouselTouchStart(event) {
  if (!isCarouselEnabled() || expandTarget() > 0 || expand.progress > 0.01 || event.touches.length !== 1) {
    resetPhotoCarouselTouchState();
    return;
  }

  const touch = event.touches[0];

  if (!isPointInPhotoCarousel(touch.clientX, touch.clientY)) {
    resetPhotoCarouselTouchState();
    return;
  }

  gesture.startX = touch.clientX;
  gesture.startY = touch.clientY;
  clearGestureUnlockTimer();
  gesture.phase.send("start");
}

export function handlePhotoCarouselTouchMove(event) {
  if (
    !isCarouselEnabled() ||
    expandTarget() > 0 ||
    expand.progress > 0.01 ||
    !gesture.phase.is("tracking", "locked") ||
    event.touches.length !== 1
  ) {
    return;
  }

  const touch = event.touches[0];
  const deltaX = touch.clientX - gesture.startX;
  const deltaY = touch.clientY - gesture.startY;

  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);
  const carouselIsSwitching = (
    isCarouselSettling() ||
    Math.abs(carousel.targetIndex - carousel.visualIndex) > 0.001
  );

  const verticalPageIntent = absY > 28 && absY > absX * 1.35;

  if (!gesture.phase.is("locked") && verticalPageIntent) {
    gesture.phase.send("release");
    if (carouselIsSwitching) {
      beginPhotoCarouselSettle(true);
    }
    return;
  }

  if (!gesture.phase.is("locked") && absX < 10 && absY < 10) {
    return;
  }

  if (!gesture.phase.is("locked") && absX < absY * 1.08) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (gesture.phase.is("locked")) {
    return;
  }

  if (absX < 24 && absY < 24) {
    return;
  }

  const direction = absX >= absY
    ? (deltaX < 0 ? 1 : -1)
    : (deltaY > 0 ? -1 : 1);

  if (!canStepPhotoCarousel(direction)) {
    lockGestureBriefly();
    return;
  }

  lockGestureBriefly();
  stepPhotoCarousel(direction);
}

export function handlePhotoCarouselTouchEnd(event) {
  if (!isCarouselEnabled() || expandTarget() > 0 || expand.progress > 0.01 || gesture.phase.is("idle")) {
    resetPhotoCarouselTouchState();
    return;
  }

  const touch = event.changedTouches?.[0];

  if (!touch) {
    resetPhotoCarouselTouchState();
    return;
  }

  const deltaX = touch.clientX - gesture.startX;
  const deltaY = touch.clientY - gesture.startY;

  if (!gesture.phase.is("locked") && Math.abs(deltaX) >= 42 && Math.abs(deltaX) >= Math.abs(deltaY) * 1.18) {
    const direction = deltaX < 0 ? 1 : -1;
    stepPhotoCarousel(direction);
  }

  if (
    carousel.hasInteracted ||
    gesture.phase.is("locked") ||
    Math.abs(carousel.targetIndex - carousel.visualIndex) > 0.001
  ) {
    beginPhotoCarouselSettle(true);
  }

  resetPhotoCarouselTouchState();
}
