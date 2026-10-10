/* Everything the photo theatre remembers between frames, and the frame scheduler. */

import { createMachine } from "../core/machine.js?v=73a7d34e";

export const photoSlotContentMap = new Map();
/* The lightbox. openToken is bumped by every open and close, so an image that
   finishes decoding after the visitor has moved on can tell it is stale. */
export const zoom = {
  phase: createMachine("photo lightbox", {
    initial: "closed",
    states: {
      closed: { open: "open" },
      open: { open: "open", close: "closed" },
    },
  }),
  openToken: 0,
  triggerCard: null,
  preloadCache: new Map(),
  preloadQueue: [],
  preloadActiveCount: 0,
  preloadLastActiveSlot: 0,
};

export function isPhotoZoomOpen() {
  return zoom.phase.is("open");
}
let photoFrame = 0;

/* Scroll progress through the drop-in, 0 to 1. target is where the scroll
   position says it should be; visual follows it with a speed and an
   acceleration limit, which is what makes the drop feel weighted. */
export const progressState = {
  target: 0,
  visual: 0,
  velocity: 0,
  lastFrameTime: 0,
};
/* The carousel at the end of the drop-in.

     inactive     the drop-in is still running, or the section is off screen
     active       the cards are a carousel: wheel, swipe, click to step
     settling     active, and gliding to the nearest card after a gesture
     reinserting  scrolled back up after using the carousel: the chosen card
                  glides back into the queue (one floating card only)
     reinserted   ...and has arrived, while the drop-in runs backwards

   Every frame updatePhotoScene decides between enable, replay and reset from
   the scroll position; gestures settle and step; the visual index arriving
   at its target converges. hasInteracted outlives the phases: it is what
   makes scrolling back up replay the chosen card instead of resetting. */
export const carousel = {
  phase: createMachine("photo carousel", {
    initial: "inactive",
    states: {
      inactive: { enable: "active", replay: "reinserting", reset: "inactive" },
      active: { replay: "reinserting", reset: "inactive", settle: "settling", step: "active" },
      settling: { replay: "reinserting", reset: "inactive", settle: "settling", step: "active", converge: "active" },
      reinserting: { enable: "active", replay: "reinserting", reset: "inactive", converge: "reinserted" },
      reinserted: { enable: "active", replay: "reinserting", reset: "inactive" },
    },
  }),
  hasInteracted: false,
  targetIndex: 0,
  visualIndex: 0,
  previousIndex: 0,
  transitionDirection: 0,
  minIndex: 0,
  maxIndex: 0,
  selectedSlot: null,
  selectedSourceCard: null,
  hitRectCache: null,
  wheelDelta: 0,
  wheelDirection: 0,
  lastStepTime: 0,
  boundaryDelta: 0,
  boundaryDirection: 0,
};
export const photoCardSlotMap = new Map();

export const isCarouselEnabled = () => carousel.phase.is("active", "settling");
export const isCarouselSettling = () => carousel.phase.is("settling", "reinserting");
export const isCarouselReinserting = () => carousel.phase.is("reinserting", "reinserted");

/* Show All. progress runs 0 (carousel) to 1 (grid) while expanding and back
   while collapsing; layouts holds each card's position at the moment of the
   toggle, so a reversal mid-animation starts from where the card really is. */
export const expand = {
  phase: createMachine("photo show all", {
    initial: "collapsed",
    states: {
      collapsed: { toggle: "expanding", reset: "collapsed" },
      expanding: { toggle: "collapsing", finish: "expanded", reset: "collapsed" },
      expanded: { toggle: "collapsing", reset: "collapsed" },
      collapsing: { toggle: "expanding", finish: "collapsed", reset: "collapsed" },
    },
  }),
  progress: 0,
  animationStart: 0,
  duration: 880,
  layouts: new Map(),
  scrollExtraPx: 0,
};

export const isExpandTargeted = () => expand.phase.is("expanding", "expanded");
export const expandTarget = () => (isExpandTargeted() ? 1 : 0);
export const isExpandAnimating = () => expand.phase.is("expanding", "collapsing");

/* A touch on the carousel: deciding whether it is a swipe, owned by the
   carousel (locked for 460ms after a step, so one swipe is one card), or
   handed back to the page as a vertical scroll. */
export const gesture = {
  phase: createMachine("photo touch gesture", {
    initial: "idle",
    states: {
      idle: { start: "tracking", reset: "idle" },
      tracking: { start: "tracking", release: "released", lock: "locked", reset: "idle" },
      locked: { start: "tracking", unlock: "tracking", reset: "idle" },
      released: { start: "tracking", reset: "idle" },
    },
  }),
  startX: 0,
  startY: 0,
  unlockTimer: 0,
};

export const photoCardStyleCache = new WeakMap();

export function cancelPhotoSceneFrame() {
  if (photoFrame) {
    window.cancelAnimationFrame(photoFrame);
    photoFrame = 0;
  }
}

/* updatePhotoScene registers itself here, so any part of the photo theatre
   can ask for a frame without importing the scene that draws it. */
let photoSceneUpdater = () => false;

export function setPhotoSceneUpdater(updater) {
  photoSceneUpdater = updater;
}

export function requestPhotoSceneUpdate() {
  if (document.hidden) {
    return;
  }

  if (photoFrame) {
    return;
  }

  photoFrame = window.requestAnimationFrame((timestamp) => {
    const shouldContinue = photoSceneUpdater(timestamp);
    photoFrame = 0;
    if (shouldContinue) {
      requestPhotoSceneUpdate();
    }
  });
}

export function clampPhotoCarouselIndex(index) {
  return Math.min(Math.max(index, carousel.minIndex), carousel.maxIndex);
}
