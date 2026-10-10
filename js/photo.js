/* The photo theatre: drop-in, queue, carousel, Show All and the lightbox. */

import { root } from "./core/dom.js?v=5057c320";
import { pageEvents } from "./core/events.js?v=8c4a4d4a";
import { waitForNextAnimationFrame } from "./core/frames.js?v=0b68ae2a";
import { createMachine } from "./core/machine.js?v=73a7d34e";
import {
  clamp01,
  coerceNumber,
  cubicBezierValue,
  easeInOut,
  easeOutCubic,
  interpolate,
  interpolateStops,
  mapScrollSegment,
  smootherStep,
} from "./core/math.js?v=54e566c4";
import {
  setAttributeIfChanged,
  setDataIfChanged,
  setStyleFieldIfChanged,
  setStylePropertyIfChanged,
} from "./core/style-writes.js?v=d4be61ed";
import {
  isCompactLayout,
  isTouchFirst,
  shouldReduceMotion,
  stableMobileAppHeight,
} from "./core/viewport.js?v=71b5eb94";
import { getActiveCopy } from "./i18n/language.js?v=c4a9e128";
import { pageTranslations } from "./i18n/translations.js?v=2ea6af69";

export const photoSection = document.querySelector("#photo-section");
const photoFixedTitle = document.querySelector(".photo-fixed-title");
export const photoStage = document.querySelector(".photo-stage");
const photoQueueAnchor = document.querySelector(".photo-queue");
export const photoShowAllButton = document.querySelector("#photo-show-all");
const photoFloatingCards = document.querySelectorAll(".photo-floating-card");
const photoQueueCards = document.querySelectorAll(".photo-queue-card");
const photoCarouselCards = [...photoQueueCards, ...photoFloatingCards];
const photoSlotContentMap = new Map();
export const photoZoomOverlay = document.querySelector("#photo-zoom-overlay");
const photoZoomImage = document.querySelector("#photo-zoom-image");
export const photoZoomCloseButton = document.querySelector("#photo-zoom-close");
const photoZoomLoading = document.querySelector("#photo-zoom-loading");
/* The lightbox. openToken is bumped by every open and close, so an image that
   finishes decoding after the visitor has moved on can tell it is stale. */
const zoom = {
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

export function initPhotoQueueCards() {
  if (!photoStage) {
    return;
  }

  photoQueueCards.forEach((card) => {
    if (card.parentElement !== photoStage) {
      photoStage.append(card);
    }
  });
}
let photoFrame = 0;

/* Scroll progress through the drop-in, 0 to 1. target is where the scroll
   position says it should be; visual follows it with a speed and an
   acceleration limit, which is what makes the drop feel weighted. */
const progressState = {
  target: 0,
  visual: 0,
  velocity: 0,
  lastFrameTime: 0,
};
const PHOTO_INTRO_PHASES = {
  /* Desktop was 2.5 viewports of scroll for the drop; 2.2 tightens the run-up
     where only the title is on screen without changing the sequence, which is
     all in progress units. Touch scrolling is coarser, so mobile keeps 2.5. */
  rawDurationVh: 2.2,
  mobileRawDurationVh: 2.5,
  dropEnd: 0.995,
  insertHoldEnd: 0.995,
  carouselStart: 0.9,
  carouselEnd: 1,
};
const PHOTO_QUEUE_REVEAL_DROP_PROGRESS = {
  desktop: {
    visibleStart: 0.42,
    visibleEnd: 0.64,
    riseStart: 0.16,
    riseEnd: 0.7,
    spreadStart: 0.5,
  },
  mobile: {
    visibleStart: 0.46,
    visibleEnd: 0.7,
    riseStart: 0.18,
    riseEnd: 0.74,
    spreadStart: 0.56,
  },
};
const PHOTO_TITLE_DURATION_RATIO = 1.02;
const PHOTO_TITLE_FADE_OUT_PROGRESS = 0.94;
const PHOTO_AFTER_COMPLETE_SCROLL_PX = 50;
const PHOTO_DROP_EXTRA_DISTANCE_PX = {
  desktop: 220,
  mobile: 280,
};
const PHOTO_QUEUE_VISUAL_LIFT_PX = {
  desktop: 250,
  mobile: 290,
};
const PHOTO_SECTION_EXTRA_HEIGHT_PX = {
  desktop: 520,
  mobile: 620,
};
const getPhotoTitleStartRatio = (isCompact) => (isCompact ? 0.6 : 0.34);
const getPhotoDropStartProgress = (isCompact) => {
  const durationVh = isCompact
    ? PHOTO_INTRO_PHASES.mobileRawDurationVh
    : PHOTO_INTRO_PHASES.rawDurationVh;
  const titleStartRatio = getPhotoTitleStartRatio(isCompact);

  return clamp01(
    (0.72 - titleStartRatio + PHOTO_TITLE_FADE_OUT_PROGRESS * PHOTO_TITLE_DURATION_RATIO) /
      durationVh
  );
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
const carousel = {
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
const photoCardSlotMap = new Map();

const isCarouselEnabled = () => carousel.phase.is("active", "settling");
const isCarouselSettling = () => carousel.phase.is("settling", "reinserting");
const isCarouselReinserting = () => carousel.phase.is("reinserting", "reinserted");

/* Show All. progress runs 0 (carousel) to 1 (grid) while expanding and back
   while collapsing; layouts holds each card's position at the moment of the
   toggle, so a reversal mid-animation starts from where the card really is. */
const expand = {
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

const isExpandTargeted = () => expand.phase.is("expanding", "expanded");
const expandTarget = () => (isExpandTargeted() ? 1 : 0);
const isExpandAnimating = () => expand.phase.is("expanding", "collapsing");

/* A touch on the carousel: deciding whether it is a swipe, owned by the
   carousel (locked for 460ms after a step, so one swipe is one card), or
   handed back to the page as a vertical scroll. */
const gesture = {
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

const photoCardStyleCache = new WeakMap();
let photoLayoutMetricsCache = null;

function getPhotoLayoutMetrics(isCompact, viewportWidth) {
  const sampleCard = photoQueueCards[0] || photoFloatingCards[0];
  const metricsKey = [
    isCompact ? "compact" : "desktop",
    Math.round(viewportWidth),
    photoQueueCards.length,
    photoFloatingCards.length,
  ].join(":");

  if (photoLayoutMetricsCache?.key === metricsKey) {
    return photoLayoutMetricsCache;
  }

  const fallbackWidth = isCompact ? 88 : 160;
  const sampleStyle = sampleCard ? window.getComputedStyle(sampleCard) : null;
  const styleWidth = Number.parseFloat(sampleStyle?.width || "");
  const styleHeight = Number.parseFloat(sampleStyle?.height || "");
  const cardWidth = styleWidth || sampleCard?.offsetWidth || fallbackWidth;
  const cardHeight = styleHeight || sampleCard?.offsetHeight || cardWidth * 1.375;
  const queueStyle = photoQueueAnchor ? window.getComputedStyle(photoQueueAnchor) : null;
  const gap = Number.parseFloat(queueStyle?.columnGap || queueStyle?.gap || "") || (isCompact ? 4 : 18);

  photoLayoutMetricsCache = {
    key: metricsKey,
    cardWidth,
    cardHeight,
    gap,
  };

  return photoLayoutMetricsCache;
}

export function invalidatePhotoLayoutCaches() {
  photoLayoutMetricsCache = null;
  carousel.hitRectCache = null;
}

function computePhotoRawProgress(rect, viewportHeight, isCompact = false) {
  const photoIntroStartY = viewportHeight * 0.72;
  const durationVh = isCompact
    ? PHOTO_INTRO_PHASES.mobileRawDurationVh
    : PHOTO_INTRO_PHASES.rawDurationVh;

  return {
    photoIntroStartY,
    rawProgress: (photoIntroStartY - rect.top) / (viewportHeight * durationVh),
  };
}

function applyPhotoSectionScrollHeight(viewportHeight, isCompact) {
  const durationVh = isCompact
    ? PHOTO_INTRO_PHASES.mobileRawDurationVh
    : PHOTO_INTRO_PHASES.rawDurationVh;
  const extraHeight = isCompact
    ? PHOTO_SECTION_EXTRA_HEIGHT_PX.mobile
    : PHOTO_SECTION_EXTRA_HEIGHT_PX.desktop;
  const expandedExtraHeight = Math.max(0, expand.scrollExtraPx);
  const height = viewportHeight * (durationVh + 0.28) + PHOTO_AFTER_COMPLETE_SCROLL_PX;

  setStyleFieldIfChanged(photoSection, "minHeight", `${height.toFixed(2)}px`);
  setStyleFieldIfChanged(photoSection, "paddingBottom", `${(extraHeight + expandedExtraHeight).toFixed(2)}px`);
}

function computePhotoPhaseFrame({
  progress,
  titleProgress,
  cardHeight,
  isCompact,
  reduceMotion,
}) {
  const titleOpacity = reduceMotion
    ? 1
    : interpolateStops(titleProgress, [0, 0.12, 0.82, 0.94, 1], [0, 1, 1, 0, 0]);
  const titleY = reduceMotion
    ? 0
    : interpolateStops(titleProgress, [0, 0.12, 0.82, 0.94], [24, 0, 0, -20]);
  const queueRevealConfig = isCompact
    ? PHOTO_QUEUE_REVEAL_DROP_PROGRESS.mobile
    : PHOTO_QUEUE_REVEAL_DROP_PROGRESS.desktop;
  const dropTravelProgress = reduceMotion
    ? 1
    : mapScrollSegment(progress, getPhotoDropStartProgress(isCompact), PHOTO_INTRO_PHASES.dropEnd);
  const queueSpreadProgress = reduceMotion
    ? 1
    : mapScrollSegment(dropTravelProgress, queueRevealConfig.spreadStart, 1);
  const queueProgress = reduceMotion ? 1 : easeInOut(queueSpreadProgress);
  const queueVisibility = reduceMotion
    ? 1
    : smootherStep(mapScrollSegment(dropTravelProgress, queueRevealConfig.visibleStart, queueRevealConfig.visibleEnd));
  const queueEntryY = cardHeight * (isCompact ? 1.42 : 1.3) + (isCompact ? 44 : 62);
  const queueRiseProgress = reduceMotion
    ? 1
    : mapScrollSegment(dropTravelProgress, queueRevealConfig.riseStart, queueRevealConfig.riseEnd);
  const queueRiseEase = easeInOut(queueRiseProgress);
  const queueY = reduceMotion
    ? 0
    : queueEntryY * (1 - queueRiseEase);
  const queueIntroOffsetY = reduceMotion
    ? 0
    : queueEntryY * (1 - queueRiseEase);
  const insertHoldProgress = reduceMotion
    ? 1
    : mapScrollSegment(progress, PHOTO_INTRO_PHASES.dropEnd, PHOTO_INTRO_PHASES.insertHoldEnd);
  const previewProgress = reduceMotion
    ? 1
    : mapScrollSegment(progress, PHOTO_INTRO_PHASES.carouselStart, PHOTO_INTRO_PHASES.carouselEnd);

  return {
    titleOpacity,
    titleY,
    queueProgress,
    queueVisibility,
    queueY,
    queueOpacity: queueVisibility,
    queueIntroOffsetY,
    insertHoldProgress,
    previewProgress,
    previewEase: reduceMotion ? 1 : easeInOut(previewProgress),
    previewScaleEase: reduceMotion ? 1 : easeInOut(previewProgress),
  };
}

function applyPhotoQueueIntroFrame({ queueY, queueOpacity }) {
  setStylePropertyIfChanged(photoSection, "--photo-queue-y", `${queueY.toFixed(2)}px`);
  setStylePropertyIfChanged(photoSection, "--photo-queue-opacity", queueOpacity.toFixed(3));
}

function applyPhotoTitleFrame({ opacity, y }) {
  photoFixedTitle?.classList.toggle("is-visible", opacity > 0.02);
  setStylePropertyIfChanged(photoFixedTitle, "--photo-fixed-title-opacity", opacity.toFixed(3));
  setStylePropertyIfChanged(photoFixedTitle, "--photo-title-y", `${y.toFixed(2)}px`);
}

function applyPhotoQueueAnchorFrame({ cardHeight, queueBleed, queueProgress }) {
  setStyleFieldIfChanged(photoQueueAnchor, "height", `${cardHeight.toFixed(2)}px`);
  setStyleFieldIfChanged(photoQueueAnchor, "zIndex", "0");
  setStylePropertyIfChanged(photoSection, "--photo-queue-bleed", `${queueBleed.toFixed(2)}px`);
  setStylePropertyIfChanged(photoSection, "--photo-insert-progress", queueProgress.toFixed(3));
}

function getPhotoShowAllLabel(expanded) {
  const copy = getActiveCopy();
  if (expanded) {
    return copy.photoCollapseLabel || pageTranslations.en.photoCollapseLabel || "Collapse";
  }

  return copy.photoShowAllLabel || pageTranslations.en.photoShowAllLabel || "Show All";
}

function syncPhotoShowAllButtonCopy() {
  if (!photoShowAllButton) {
    return;
  }

  const showAllText = getPhotoShowAllLabel(expandTarget() > 0.5);
  if (photoShowAllButton.textContent !== showAllText) {
    photoShowAllButton.textContent = showAllText;
  }
}

export function bindPhotoReactions() {
  pageEvents.on("language:change", () => {
    syncPhotoShowAllButtonCopy();
  });
}

function applyPhotoShowAllFrame({
  visible,
  expanded,
  x,
  y,
}) {
  if (!photoShowAllButton) {
    return;
  }

  photoShowAllButton.classList.toggle("is-visible", visible);
  setAttributeIfChanged(photoShowAllButton, "aria-expanded", String(expanded));
  const showAllText = getPhotoShowAllLabel(expanded);
  if (photoShowAllButton.textContent !== showAllText) {
    photoShowAllButton.textContent = showAllText;
  }
  setStylePropertyIfChanged(photoShowAllButton, "--photo-show-all-opacity", visible ? "1" : "0");
  setStylePropertyIfChanged(photoShowAllButton, "--photo-show-all-x", `${x.toFixed(2)}px`);
  setStylePropertyIfChanged(photoShowAllButton, "--photo-show-all-y", `${y.toFixed(2)}px`);
}

function readPhotoCardContent(card) {
  const sourceImage = card?.querySelector(".photo-card-image");
  if (!sourceImage) {
    return null;
  }

  const src = sourceImage.getAttribute("data-preview-src") ||
    sourceImage.getAttribute("src") ||
    "";
  const naturalWidth = sourceImage.naturalWidth || 0;
  const naturalHeight = sourceImage.naturalHeight || 0;
  const aspectRatio = naturalWidth > 0 && naturalHeight > 0
    ? naturalWidth / naturalHeight
    : 0;

  return {
    src,
    srcset: sourceImage.getAttribute("srcset") || "",
    sizes: sourceImage.getAttribute("sizes") || "",
    fullSrc: sourceImage.getAttribute("data-full-src") || src,
    fullSrcset: sourceImage.getAttribute("data-full-srcset") || "",
    fullSizes: sourceImage.getAttribute("data-full-sizes") || "",
    label: card.getAttribute("aria-label") || "",
    sourceId: card.dataset.photoBase || card.dataset.photoInsert || card.dataset.photoCloneSource || "",
    aspectRatio,
  };
}

function syncPhotoCardImageContent(targetCard, sourceContent) {
  if (!targetCard || !sourceContent?.src) {
    return;
  }

  let targetImage = targetCard.querySelector(".photo-card-image");
  if (!targetImage) {
    targetImage = document.createElement("img");
    targetImage.className = "photo-card-image";
    targetImage.alt = "";
    targetImage.loading = "eager";
    targetImage.decoding = "async";
    targetImage.draggable = false;
    const shine = targetCard.querySelector(".photo-card-shine");
    targetCard.insertBefore(targetImage, shine || targetCard.firstChild);
  }

  setAttributeIfChanged(targetImage, "loading", "eager");
  setAttributeIfChanged(targetImage, "decoding", "async");

  ["src", "srcset", "sizes"].forEach((attribute) => {
    const value = sourceContent[attribute];
    if (value) {
      setAttributeIfChanged(targetImage, attribute, value);
    } else if (targetImage.hasAttribute(attribute)) {
      targetImage.removeAttribute(attribute);
    }
  });

  [
    ["data-preview-src", sourceContent.src],
    ["data-full-src", sourceContent.fullSrc],
    ["data-full-srcset", sourceContent.fullSrcset],
    ["data-full-sizes", sourceContent.fullSizes],
  ].forEach(([attribute, value]) => {
    if (value) {
      setAttributeIfChanged(targetImage, attribute, value);
    } else if (targetImage.hasAttribute(attribute)) {
      targetImage.removeAttribute(attribute);
    }
  });
}

function ensurePhotoZoomViewer() {
  return Boolean(photoZoomOverlay && photoZoomImage && photoZoomCloseButton && photoZoomLoading);
}

function setPhotoZoomLoading(isLoading) {
  if (!photoZoomOverlay || !photoZoomLoading) {
    return;
  }

  if (isLoading) {
    photoZoomOverlay.classList.remove("is-image-ready");
  }
  photoZoomOverlay.classList.toggle("is-loading", isLoading);
  photoZoomOverlay.setAttribute("aria-busy", isLoading ? "true" : "false");
  photoZoomLoading.setAttribute("aria-hidden", isLoading ? "false" : "true");
}

function setPhotoZoomLoadingFrame(sourceContent) {
  if (!photoZoomOverlay) {
    return;
  }

  const viewportWidth = Math.max(window.innerWidth || document.documentElement.clientWidth || 1, 1);
  const viewportHeight = Math.max(
    stableMobileAppHeight || window.innerHeight || document.documentElement.clientHeight || 1,
    1
  );
  const maxWidth = Math.max(240, viewportWidth - 44);
  const maxHeight = Math.max(240, viewportHeight - 104);
  const aspectRatio = Number.isFinite(sourceContent?.aspectRatio) && sourceContent.aspectRatio > 0
    ? sourceContent.aspectRatio
    : 0.72;
  let loadingWidth = maxHeight * aspectRatio;
  let loadingHeight = maxHeight;

  if (loadingWidth > maxWidth) {
    loadingWidth = maxWidth;
    loadingHeight = loadingWidth / aspectRatio;
  }

  photoZoomOverlay.style.setProperty("--photo-zoom-loading-width", `${loadingWidth.toFixed(2)}px`);
  photoZoomOverlay.style.setProperty("--photo-zoom-loading-height", `${loadingHeight.toFixed(2)}px`);
}

function applyPhotoZoomImageSource({ token, src, srcset = "", sizes = "" }) {
  if (!photoZoomImage || !src) {
    return Promise.resolve(false);
  }

  photoZoomOverlay?.classList.remove("is-image-ready");
  setPhotoZoomLoading(true);
  photoZoomImage.style.opacity = "0";
  photoZoomImage.style.visibility = "hidden";

  if (srcset) {
    setAttributeIfChanged(photoZoomImage, "srcset", srcset);
  } else if (photoZoomImage.hasAttribute("srcset")) {
    photoZoomImage.removeAttribute("srcset");
  }

  if (sizes) {
    setAttributeIfChanged(photoZoomImage, "sizes", sizes);
  } else if (photoZoomImage.hasAttribute("sizes")) {
    photoZoomImage.removeAttribute("sizes");
  }

  setAttributeIfChanged(photoZoomImage, "src", src);

  return decodePhotoZoomElement(photoZoomImage).then(async (decoded) => {
    if (token !== zoom.openToken || !isPhotoZoomOpen() || !decoded) {
      return false;
    }

    await waitForNextAnimationFrame();

    if (token !== zoom.openToken || !isPhotoZoomOpen()) {
      return false;
    }

    photoZoomImage.style.visibility = "visible";
    photoZoomImage.style.opacity = "1";
    photoZoomOverlay?.classList.add("is-image-ready");
    setPhotoZoomLoading(false);
    return true;
  });
}

async function recoverFromPhotoZoomFailure(token, sourceContent, failedSrc) {
  if (token !== zoom.openToken || !isPhotoZoomOpen()) {
    return;
  }

  /* The full-size image failed to load/decode. Fall back to the preview
     that already lives in the browser cache so the spinner never runs
     forever; if even that fails, close the viewer instead of hanging. */
  const previewSrc = sourceContent?.src || "";
  const shown = previewSrc && previewSrc !== failedSrc
    ? await applyPhotoZoomImageSource({ token, src: previewSrc })
    : false;

  if (!shown && token === zoom.openToken && isPhotoZoomOpen()) {
    closePhotoZoom();
  }
}

function decodePhotoZoomElement(image) {
  if (!image) {
    return Promise.resolve(false);
  }

  if (typeof image.decode === "function") {
    return image.decode().then(() => true).catch(() => false);
  }

  if (image.complete) {
    return Promise.resolve(image.naturalWidth > 0);
  }

  return new Promise((resolve) => {
    image.addEventListener("load", () => resolve(true), { once: true });
    image.addEventListener("error", () => resolve(false), { once: true });
  });
}

function getPhotoZoomSourceDescriptor(sourceContent) {
  if (!sourceContent?.src) {
    return null;
  }

  return {
    src: sourceContent.fullSrc || sourceContent.src,
    srcset: sourceContent.fullSrcset || "",
    sizes: sourceContent.fullSizes || "(max-width: 900px) 92vw, min(88vw, 1200px)",
  };
}

function getPhotoZoomPreloadKey(sourceContent) {
  const descriptor = getPhotoZoomSourceDescriptor(sourceContent);
  if (!descriptor?.src) {
    return "";
  }

  return [
    descriptor.src,
    descriptor.srcset,
    descriptor.sizes,
  ].join("|");
}

/* The ceiling has to cover the working set preloadNearbyPhotoZoomImages
   actually builds -- radius 1 on phones, 2 elsewhere, so 3 and 5 entries. It
   used to be 6 and 10, exactly double, and every extra entry holds a decoded
   1920w bitmap: roughly 9.8MB once the browser has expanded it. */
function getPhotoZoomPreloadLimit() {
  return isTouchFirst() ? 3 : 5;
}

function getPhotoZoomPreloadConcurrency() {
  return isTouchFirst() ? 1 : 2;
}

function prunePhotoZoomPreloadCache(activeSlot = zoom.preloadLastActiveSlot) {
  const decodedEntries = [...zoom.preloadCache.entries()]
    .filter(([, entry]) => entry.status === "decoded");
  const limit = getPhotoZoomPreloadLimit();

  if (decodedEntries.length <= limit) {
    return;
  }

  decodedEntries
    .sort(([, a], [, b]) => {
      const distanceA = Number.isFinite(a.slot) ? Math.abs(a.slot - activeSlot) : Number.POSITIVE_INFINITY;
      const distanceB = Number.isFinite(b.slot) ? Math.abs(b.slot - activeSlot) : Number.POSITIVE_INFINITY;
      return distanceB - distanceA;
    })
    .slice(0, decodedEntries.length - limit)
    .forEach(([key]) => {
      zoom.preloadCache.delete(key);
    });
}

function pumpPhotoZoomPreloadQueue() {
  const concurrency = getPhotoZoomPreloadConcurrency();

  while (zoom.preloadActiveCount < concurrency && zoom.preloadQueue.length > 0) {
    const preloadTask = zoom.preloadQueue.shift();
    const entry = zoom.preloadCache.get(preloadTask.key);

    if (!entry || entry.status !== "queued") {
      continue;
    }

    entry.status = "loading";
    zoom.preloadActiveCount += 1;

    const image = new Image();
    image.decoding = "async";
    try {
      image.fetchPriority = preloadTask.priority ? "high" : "low";
    } catch (error) {
      // Older browsers may expose fetchPriority as read-only or not at all.
    }
    if (preloadTask.srcset) {
      image.srcset = preloadTask.srcset;
    }
    if (preloadTask.sizes) {
      image.sizes = preloadTask.sizes;
    }
    image.src = preloadTask.src;

    entry.promise = decodePhotoZoomElement(image).then((decoded) => {
      if (decoded) {
        Object.assign(entry, {
          status: "decoded",
          image,
          src: preloadTask.src,
          srcset: preloadTask.srcset,
          sizes: preloadTask.sizes,
        });
        prunePhotoZoomPreloadCache(entry.slot);
        return entry;
      }

      entry.status = "error";
      return null;
    }).finally(() => {
      zoom.preloadActiveCount = Math.max(0, zoom.preloadActiveCount - 1);
      pumpPhotoZoomPreloadQueue();
    });
  }
}

function preloadPhotoZoomContent(sourceContent, priority = false, slot = null) {
  const descriptor = getPhotoZoomSourceDescriptor(sourceContent);
  const key = getPhotoZoomPreloadKey(sourceContent);

  if (!descriptor?.src || !key) {
    return;
  }

  const existingEntry = zoom.preloadCache.get(key);
  if (existingEntry) {
    if (Number.isFinite(slot)) {
      existingEntry.slot = slot;
    }
    if (existingEntry.status === "decoded" || existingEntry.status === "loading") {
      return;
    }
    if (existingEntry.status === "queued") {
      if (priority && !existingEntry.priority) {
        existingEntry.priority = true;
        const queueIndex = zoom.preloadQueue.findIndex((task) => task.key === key);
        if (queueIndex > 0) {
          const [task] = zoom.preloadQueue.splice(queueIndex, 1);
          task.priority = true;
          zoom.preloadQueue.unshift(task);
        }
      }
      return;
    }
  }

  const entry = {
    status: "queued",
    priority,
    slot,
    src: descriptor.src,
    srcset: descriptor.srcset,
    sizes: descriptor.sizes,
    image: null,
    promise: null,
  };
  zoom.preloadCache.set(key, entry);

  const preloadTask = {
    key,
    priority,
    slot,
    src: descriptor.src,
    srcset: descriptor.srcset,
    sizes: descriptor.sizes,
  };

  if (priority) {
    zoom.preloadQueue.unshift(preloadTask);
  } else {
    zoom.preloadQueue.push(preloadTask);
  }

  pumpPhotoZoomPreloadQueue();
}

function preloadNearbyPhotoZoomImages(activeSlot, radius = (isTouchFirst() ? 1 : 2)) {
  if (!Number.isFinite(activeSlot) || photoSlotContentMap.size === 0) {
    return;
  }

  const clampedActiveSlot = clampPhotoCarouselIndex(Math.round(activeSlot));
  zoom.preloadLastActiveSlot = clampedActiveSlot;
  const slots = [clampedActiveSlot];

  for (let offset = 1; offset <= radius; offset += 1) {
    slots.push(clampedActiveSlot - offset, clampedActiveSlot + offset);
  }

  slots.forEach((slot) => {
    if (slot < carousel.minIndex || slot > carousel.maxIndex) {
      return;
    }

    const sourceContent = photoSlotContentMap.get(slot);
    if (!sourceContent) {
      return;
    }

    preloadPhotoZoomContent(sourceContent, slot === clampedActiveSlot, slot);
  });
  prunePhotoZoomPreloadCache(clampedActiveSlot);
}

function openPhotoZoom(sourceContent) {
  if (!sourceContent?.src) {
    return;
  }

  if (!ensurePhotoZoomViewer()) {
    return;
  }

  const token = ++zoom.openToken;
  const zoomDescriptor = getPhotoZoomSourceDescriptor(sourceContent);
  if (!zoomDescriptor?.src) {
    return;
  }
  const zoomSrc = zoomDescriptor.src;
  const zoomSrcset = zoomDescriptor.srcset;
  const zoomSizes = zoomDescriptor.sizes;
  const zoomAlt = sourceContent.label || "Expanded photo";
  const zoomCacheKey = getPhotoZoomPreloadKey(sourceContent);
  const cachedZoom = zoom.preloadCache.get(zoomCacheKey);

  photoZoomImage.style.opacity = "0";
  photoZoomImage.style.visibility = "hidden";
  if (photoZoomImage.hasAttribute("srcset")) {
    photoZoomImage.removeAttribute("srcset");
  }
  if (photoZoomImage.hasAttribute("sizes")) {
    photoZoomImage.removeAttribute("sizes");
  }
  if (photoZoomImage.hasAttribute("src")) {
    photoZoomImage.removeAttribute("src");
  }
  setAttributeIfChanged(photoZoomImage, "alt", zoomAlt);
  setPhotoZoomLoadingFrame(sourceContent);
  photoZoomOverlay.classList.remove("is-image-ready");
  setPhotoZoomLoading(true);

  zoom.phase.send("open");
  root.classList.add("is-photo-zoom-open");
  photoZoomOverlay.style.opacity = "";
  photoZoomOverlay.style.visibility = "";
  photoZoomOverlay.style.transition = "";
  photoZoomOverlay.style.pointerEvents = "auto";
  photoZoomOverlay.classList.add("is-active");
  photoZoomOverlay.setAttribute("aria-hidden", "false");
  photoZoomCloseButton?.focus({ preventScroll: true });

  if (cachedZoom?.status === "decoded") {
    applyPhotoZoomImageSource({
      token,
      src: cachedZoom.src,
      srcset: cachedZoom.srcset,
      sizes: cachedZoom.sizes,
    }).then((shown) => {
      if (!shown) {
        recoverFromPhotoZoomFailure(token, sourceContent, cachedZoom.src);
      }
    });
    preloadNearbyPhotoZoomImages(clampPhotoCarouselIndex(Math.round(carousel.visualIndex)), isTouchFirst() ? 1 : 2);
    return;
  }

  const nextImage = new Image();
  nextImage.decoding = "async";
  nextImage.alt = zoomAlt;
  if (zoomSrcset) {
    nextImage.srcset = zoomSrcset;
  }
  if (zoomSizes) {
    nextImage.sizes = zoomSizes;
  }
  nextImage.src = zoomSrc;

  decodePhotoZoomElement(nextImage).then((decoded) => {
    if (token !== zoom.openToken || !isPhotoZoomOpen()) {
      return;
    }

    if (!decoded) {
      recoverFromPhotoZoomFailure(token, sourceContent, zoomSrc);
      return;
    }

    applyPhotoZoomImageSource({
      token,
      src: zoomSrc,
      srcset: zoomSrcset,
      sizes: zoomSizes,
    }).then((shown) => {
      if (!shown) {
        recoverFromPhotoZoomFailure(token, sourceContent, zoomSrc);
      }
    });
  });
}

export function closePhotoZoom() {
  if (!isPhotoZoomOpen() || !photoZoomOverlay) {
    return;
  }

  zoom.openToken += 1;
  zoom.phase.send("close");
  if (photoZoomImage) {
    photoZoomImage.style.opacity = "0";
    photoZoomImage.style.visibility = "hidden";
  }
  setPhotoZoomLoading(false);
  photoZoomOverlay.classList.remove("is-image-ready");
  root.classList.remove("is-photo-zoom-open");
  photoZoomOverlay.style.transition = "none";
  photoZoomOverlay.style.pointerEvents = "none";
  photoZoomOverlay.style.opacity = "0";
  photoZoomOverlay.style.visibility = "hidden";
  photoZoomOverlay.classList.remove("is-active");
  photoZoomOverlay.setAttribute("aria-hidden", "true");
  photoZoomOverlay.style.removeProperty("--photo-zoom-loading-width");
  photoZoomOverlay.style.removeProperty("--photo-zoom-loading-height");
  if (zoom.triggerCard?.isConnected) {
    zoom.triggerCard.focus({ preventScroll: true });
  } else {
    photoZoomCloseButton?.blur();
  }
  zoom.triggerCard = null;
  requestPhotoSceneUpdate();
  window.requestAnimationFrame(() => {
    if (isPhotoZoomOpen() || !photoZoomOverlay) {
      return;
    }

    photoZoomOverlay.style.transition = "";
    photoZoomOverlay.style.opacity = "";
    photoZoomOverlay.style.visibility = "";
  });
}

export function handlePhotoZoomClosePointerDown(event) {
  event.preventDefault();
  event.stopPropagation();
  closePhotoZoom();
}

export function handlePhotoZoomOverlayPointerDown(event) {
  if (event.target === photoZoomOverlay) {
    event.preventDefault();
    event.stopPropagation();
    closePhotoZoom();
  }
}

export function stopPhotoZoomScroll(event) {
  if (!isPhotoZoomOpen()) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
}

function getActivePhotoMainCard() {
  if (!isCarouselEnabled() || expandTarget() > 0 || expand.progress > 0.01) {
    return null;
  }

  const activeSlot = clampPhotoCarouselIndex(Math.round(carousel.visualIndex));
  return photoCardSlotMap.get(activeSlot) || null;
}

function getPhotoCardZoomContent(card, slot) {
  if (!card) {
    return null;
  }

  const safeSlot = Number.isFinite(slot)
    ? slot
    : Number.parseInt(card.dataset.photoSlot, 10);
  const mappedContent = Number.isFinite(safeSlot)
    ? photoSlotContentMap.get(safeSlot)
    : null;
  const liveContent = readPhotoCardContent(card);
  return mappedContent && liveContent
    ? {
        ...mappedContent,
        aspectRatio: liveContent.aspectRatio || mappedContent.aspectRatio || 0,
      }
    : (mappedContent || liveContent);
}

function isPointInsidePhotoCard(card, x, y) {
  if (!card) {
    return false;
  }

  const rect = card.getBoundingClientRect();
  return (
    x >= rect.left &&
    x <= rect.right &&
    y >= rect.top &&
    y <= rect.bottom
  );
}

function getExpandedPhotoCardContentAtPoint(x, y, target) {
  if (expandTarget() <= 0.5 && expand.progress <= 0.5) {
    return null;
  }

  const card = target?.closest?.(".photo-card");
  if (!card || !photoStage?.contains(card) || !isPointInsidePhotoCard(card, x, y)) {
    return null;
  }

  const slot = Number.parseInt(card.dataset.photoSlot, 10);
  const sourceContent = getPhotoCardZoomContent(card, slot);

  return {
    activeCard: card,
    activeSlot: slot,
    sourceContent,
  };
}

function getActivePhotoMainCardContentAtPoint(x, y) {
  const activeCard = getActivePhotoMainCard();
  if (!activeCard || !isPointInsidePhotoCard(activeCard, x, y)) {
    return null;
  }

  const activeSlot = Number.parseInt(activeCard.dataset.photoSlot, 10);
  return {
    activeCard,
    activeSlot,
    sourceContent: getPhotoCardZoomContent(activeCard, activeSlot),
  };
}

function getPhotoZoomHitContentAtPoint(x, y, target) {
  return getExpandedPhotoCardContentAtPoint(x, y, target) ||
    getActivePhotoMainCardContentAtPoint(x, y);
}

function handlePhotoMainCardPreloadAtPoint(x, y, target) {
  const hitContent = getPhotoZoomHitContentAtPoint(x, y, target);
  if (!hitContent?.sourceContent) {
    return;
  }

  preloadPhotoZoomContent(hitContent.sourceContent, true, hitContent.activeSlot);
}

export function handlePhotoMainCardPointerPreload(event) {
  if (isPhotoZoomOpen() || !photoStage || photoShowAllButton?.contains(event.target)) {
    return;
  }

  handlePhotoMainCardPreloadAtPoint(event.clientX, event.clientY, event.target);
}

export function handlePhotoMainCardTouchPreload(event) {
  if (isPhotoZoomOpen() || !photoStage || photoShowAllButton?.contains(event.target) || event.touches.length !== 1) {
    return;
  }

  const touch = event.touches[0];
  handlePhotoMainCardPreloadAtPoint(touch.clientX, touch.clientY, event.target);
}

function navigatePhotoCarouselToSlot(slot) {
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

function getClickedPhotoCardSlot(x, y, target) {
  if (!isCarouselEnabled() || expandTarget() > 0 || expand.progress > 0.01) {
    return null;
  }

  const card = target?.closest?.(".photo-card");
  if (!card || !photoStage?.contains(card)) {
    return null;
  }

  if (!isPointInsidePhotoCard(card, x, y)) {
    return null;
  }

  const slot = Number.parseInt(card.dataset.photoSlot, 10);
  return Number.isFinite(slot) ? slot : null;
}

export function handlePhotoMainCardClick(event) {
  if (isPhotoZoomOpen() || !photoStage || photoShowAllButton?.contains(event.target)) {
    return;
  }

  const clickedSlot = getClickedPhotoCardSlot(event.clientX, event.clientY, event.target);
  if (clickedSlot !== null) {
    const activeSlot = clampPhotoCarouselIndex(Math.round(carousel.visualIndex));
    if (clickedSlot !== activeSlot) {
      event.preventDefault();
      event.stopPropagation();
      navigatePhotoCarouselToSlot(clickedSlot);
      return;
    }
  }

  const hitContent = getPhotoZoomHitContentAtPoint(event.clientX, event.clientY, event.target);
  if (!hitContent?.sourceContent) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  zoom.triggerCard = hitContent.activeCard || null;
  openPhotoZoom(hitContent.sourceContent);
}

export function handlePhotoCardKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  if (isPhotoZoomOpen() || !photoStage || photoShowAllButton?.contains(event.target)) {
    return;
  }

  const card = event.target?.closest?.(".photo-card");
  if (!card || !photoStage.contains(card)) {
    return;
  }

  const slot = Number.parseInt(card.dataset.photoSlot, 10);
  if (!Number.isFinite(slot)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (isCarouselEnabled() && expandTarget() <= 0 && expand.progress <= 0.01) {
    const activeSlot = clampPhotoCarouselIndex(Math.round(carousel.visualIndex));
    if (slot !== activeSlot) {
      navigatePhotoCarouselToSlot(slot);
      return;
    }
  }

  const sourceContent = getPhotoCardZoomContent(card, slot);
  if (!sourceContent?.src) {
    return;
  }

  zoom.triggerCard = card;
  openPhotoZoom(sourceContent);
}

function ensurePhotoSlotContentMap({
  finalCount,
  initialCount,
  centerSlot,
}) {
  if (photoSlotContentMap.size > 0 || finalCount <= 0) {
    return;
  }

  const initialFloatingSlots = (() => {
    if (photoFloatingCards.length === 1) {
      return [centerSlot];
    }

    if (photoFloatingCards.length === 3) {
      return [
        Math.max(0, centerSlot - 5),
        centerSlot,
        Math.min(finalCount - 1, centerSlot + 4),
      ];
    }

    return photoFloatingCards.map((_, index) => Math.min(finalCount - 1, centerSlot + index));
  })();
  const initialFloatingSlotSet = new Set(initialFloatingSlots);
  const initialQueueSlots = Array.from({ length: finalCount }, (_, index) => index)
    .filter((slot) => !initialFloatingSlotSet.has(slot))
    .slice(0, initialCount);

  photoQueueCards.forEach((card, index) => {
    const slot = initialQueueSlots[index];
    const content = readPhotoCardContent(card);
    if (Number.isFinite(slot) && content) {
      photoSlotContentMap.set(slot, content);
    }
  });

  photoFloatingCards.forEach((card, index) => {
    const slot = initialFloatingSlots[index];
    const content = readPhotoCardContent(card);
    if (Number.isFinite(slot) && content) {
      photoSlotContentMap.set(slot, content);
    }
  });
}

function applyPhotoCardFrames({
  cardFrames,
  hitRect,
  slotEntries,
  selectedSourceCard,
}) {
  cardFrames.forEach(({ card, layout, options, data = [], attributes = [] }) => {
    data.forEach(([name, value]) => {
      setDataIfChanged(card, name, value);
    });
    attributes.forEach(([name, value]) => {
      setAttributeIfChanged(card, name, value);
    });
    applyPhotoCardStyle(card, layout, options);
  });

  carousel.hitRectCache = hitRect;
  photoCardSlotMap.clear();
  slotEntries.forEach(([slot, card]) => {
    photoCardSlotMap.set(slot, card);
  });
  carousel.selectedSourceCard = selectedSourceCard || carousel.selectedSourceCard;
}

function createPhotoHitRectCollector(stageRect, cardWidth, cardHeight) {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  let hasRect = false;

  return {
    include(layout, baseX = 0) {
      if (!layout || layout.opacity <= 0.02) {
        return;
      }

      const scale = Math.max(layout.scale || 1, 0.01);
      const radians = ((layout.rotate || 0) * Math.PI) / 180;
      const cos = Math.abs(Math.cos(radians));
      const sin = Math.abs(Math.sin(radians));
      const width = cardWidth * scale;
      const height = cardHeight * scale;
      const halfWidth = (width * cos + height * sin) / 2;
      const halfHeight = (width * sin + height * cos) / 2;
      const centerX = stageRect.left + baseX + layout.x + cardWidth / 2;
      const centerY = stageRect.top + layout.y + cardHeight / 2;

      hasRect = true;
      left = Math.min(left, centerX - halfWidth);
      top = Math.min(top, centerY - halfHeight);
      right = Math.max(right, centerX + halfWidth);
      bottom = Math.max(bottom, centerY + halfHeight);
    },
    getRect() {
      return hasRect ? { left, top, right, bottom } : null;
    },
  };
}

function applyPhotoCardStyle(card, layout, options = {}) {
  const useMobilePhotoPerformance = options.mobilePerformance ?? isTouchFirst();
  const transform = `translate3d(${layout.x.toFixed(2)}px, ${layout.y.toFixed(2)}px, 0) rotate(${layout.rotate.toFixed(2)}deg) scale(${layout.scale.toFixed(3)})`;
  const opacity = layout.opacity.toFixed(3);
  const zIndex = String(layout.zIndex);
  const filter = useMobilePhotoPerformance ? "" : (options.filter ?? "");
  const shadowStrength = useMobilePhotoPerformance
    ? "3.20%"
    : (
        options.shadowStrength == null
          ? null
          : `${options.shadowStrength.toFixed(2)}%`
      );
  const cardDepth = useMobilePhotoPerformance
    ? "10.00px"
    : (
        options.cardDepth == null
          ? null
          : `${options.cardDepth.toFixed(2)}px`
      );
  const shineX = useMobilePhotoPerformance
    ? "0.00%"
    : (
        options.shineX == null
          ? null
          : `${options.shineX.toFixed(2)}%`
      );
  let cache = photoCardStyleCache.get(card);

  if (!cache) {
    cache = {};
    photoCardStyleCache.set(card, cache);
  }

  if (cache.transform !== transform) {
    card.style.transform = transform;
    cache.transform = transform;
  }

  if (cache.opacity !== opacity) {
    card.style.opacity = opacity;
    cache.opacity = opacity;
  }

  if (cache.filter !== filter) {
    card.style.filter = filter;
    cache.filter = filter;
  }

  if (cache.zIndex !== zIndex) {
    card.style.zIndex = zIndex;
    cache.zIndex = zIndex;
  }

  if (shadowStrength !== null && cache.shadowStrength !== shadowStrength) {
    card.style.setProperty("--photo-card-shadow-strength", shadowStrength);
    cache.shadowStrength = shadowStrength;
  }

  if (cardDepth !== null && cache.cardDepth !== cardDepth) {
    card.style.setProperty("--photo-card-depth", cardDepth);
    cache.cardDepth = cardDepth;
  }

  if (shineX !== null && cache.shineX !== shineX) {
    card.style.setProperty("--photo-shine-x", shineX);
    cache.shineX = shineX;
  }
}

/* updatePhotoScene runs once per frame while the photo section is near the
   viewport or something in it is still moving. It is a pipeline: each step
   below reads what earlier steps measured from one per-frame context object
   (frame) and adds what it measures for the steps after it. The order is
   load-bearing -- several steps write styles that a later step then measures
   -- so the steps run exactly in the order updatePhotoScene lists them. */

/* Scroll position -> target progress, and the weighted follow of it. */
function advancePhotoProgress(frame) {
  const { isCompact, rect, timestamp, viewportHeight } = frame;
  const reduceMotion = shouldReduceMotion();
  const { photoIntroStartY, rawProgress } = computePhotoRawProgress(rect, viewportHeight, isCompact);
  let deltaSeconds = 1 / 60;
  const photoDropStartProgress = getPhotoDropStartProgress(isCompact);
  progressState.target = clamp01(rawProgress);

  if (progressState.target <= 0 && rect.top > photoIntroStartY) {
    progressState.visual = 0;
    progressState.velocity = 0;
  }

  if (reduceMotion) {
    progressState.visual = progressState.target;
    progressState.velocity = 0;
    progressState.lastFrameTime = timestamp;
  } else if (!progressState.lastFrameTime) {
    progressState.visual = progressState.target;
    progressState.velocity = 0;
    progressState.lastFrameTime = timestamp;
  } else {
    deltaSeconds = Math.min(Math.max((timestamp - progressState.lastFrameTime) / 1000, 0.008), 0.05);
    stepPhotoProgress(deltaSeconds, photoDropStartProgress, isCompact);
    progressState.lastFrameTime = timestamp;
  }
  Object.assign(frame, { deltaSeconds, photoDropStartProgress, reduceMotion });
}

/* One step of the weighted follow: accelerate towards the target and brake
   as it gets close. Scrolling back up through the drop pulls harder -- more
   so on a phone -- so the cards do not trail a visitor who reverses. */
function stepPhotoProgress(deltaSeconds, photoDropStartProgress, isCompact) {
  const delta = progressState.target - progressState.visual;
  const direction = Math.sign(delta);
  const distance = Math.abs(delta);
  const isReverseExtraction = (
    direction < 0 &&
    progressState.visual > photoDropStartProgress &&
    progressState.visual <= PHOTO_INTRO_PHASES.carouselEnd
  );
  const isMobileReverseExtraction = isReverseExtraction && isCompact;
  const velocityDirection = Math.sign(progressState.velocity);

  if (direction && velocityDirection && direction !== velocityDirection) {
    progressState.velocity *= isMobileReverseExtraction ? 0.035 : 0.08;
  }

  const maxSpeed = isMobileReverseExtraction ? 1.16 : (isReverseExtraction ? 1.0 : 0.78);
  const maxAcceleration = isMobileReverseExtraction ? 6.8 : (isReverseExtraction ? 5.2 : 2.85);
  const brakingDistance = isMobileReverseExtraction ? 0.075 : (isReverseExtraction ? 0.1 : 0.2);
  const speedLimitByDistance = maxSpeed * Math.min(1, distance / brakingDistance);
  const desiredVelocity = direction * speedLimitByDistance;
  const velocityDelta = desiredVelocity - progressState.velocity;
  const maxVelocityChange = maxAcceleration * deltaSeconds;

  progressState.velocity += Math.min(
    Math.max(velocityDelta, -maxVelocityChange),
    maxVelocityChange
  );
  progressState.visual += progressState.velocity * deltaSeconds;

  if (
    Math.abs(progressState.target - progressState.visual) < 0.00005 &&
    Math.abs(progressState.velocity) < 0.00005
  ) {
    progressState.visual = progressState.target;
    progressState.velocity = 0;
  }
}

/* Where in the drop-in this progress is; places the queue and the title. */
function layoutPhotoPhase(frame) {
  const { isCompact, rect, reduceMotion, viewportHeight, viewportWidth } = frame;
  const progress = progressState.visual;
  const titleStartRatio = getPhotoTitleStartRatio(isCompact);
  const titleDurationRatio = PHOTO_TITLE_DURATION_RATIO;
  const titleProgress = reduceMotion
    ? 1
    : clamp01((viewportHeight * titleStartRatio - rect.top) / (viewportHeight * titleDurationRatio));
  const { cardWidth, cardHeight, gap } = getPhotoLayoutMetrics(isCompact, viewportWidth);
  const photoPhaseFrame = computePhotoPhaseFrame({
    progress,
    titleProgress,
    cardHeight,
    isCompact,
    reduceMotion,
  });
  const {
    titleOpacity,
    titleY,
    queueProgress,
    queueVisibility,
    queueY,
    queueOpacity,
    queueIntroOffsetY,
    insertHoldProgress,
    previewProgress,
    previewEase,
    previewScaleEase,
  } = photoPhaseFrame;
  applyPhotoQueueIntroFrame({ queueY, queueOpacity });
  const gatedTitleOpacity = titleOpacity;
  applyPhotoTitleFrame({ opacity: gatedTitleOpacity, y: titleY });
  Object.assign(frame, { cardHeight, cardWidth, gap, insertHoldProgress, previewEase, previewProgress, previewScaleEase, progress, queueProgress, queueVisibility });
}

/* Measures the stage after the title has been placed, and the queue's anchors. */
function measurePhotoGeometry(frame) {
  const { cardHeight, cardWidth, gap, isCompact, viewportHeight } = frame;
  const stageRect = photoStage.getBoundingClientRect();
  const queueRect = photoQueueAnchor.getBoundingClientRect();
  const stageHeadroom = Math.max(0, -stageRect.top);
  const titleRect = photoFixedTitle?.getBoundingClientRect();
  const titleDropAnchorY = titleRect
    ? titleRect.top - stageRect.top + titleRect.height * 0.5 - cardHeight * 0.5
    : stageHeadroom + viewportHeight * (isCompact ? 0.12 : 0.1);
  const dropStartBaseY = titleDropAnchorY;
  const queueCenterX = queueRect.left - stageRect.left + queueRect.width / 2;
  const queueVisualTopY = queueRect.top - stageRect.top;
  const dropDistanceExtraY = isCompact
    ? PHOTO_DROP_EXTRA_DISTANCE_PX.mobile
    : PHOTO_DROP_EXTRA_DISTANCE_PX.desktop;
  const queueVisualLiftY = isCompact
    ? PHOTO_QUEUE_VISUAL_LIFT_PX.mobile
    : PHOTO_QUEUE_VISUAL_LIFT_PX.desktop;
  const insertionAnchorY = queueVisualTopY + dropDistanceExtraY - queueVisualLiftY;
  const queueLocalOffsetY = insertionAnchorY;
  const initialCount = photoQueueCards.length;
  const finalCount = initialCount + photoFloatingCards.length;
  const initialStep = cardWidth + gap;
  const finalStep = cardWidth + gap;
  const initialStartX = queueCenterX - ((initialCount - 1) * initialStep) / 2;
  const finalStartX = queueCenterX - ((finalCount - 1) * finalStep) / 2;
  const centerSlot = Math.floor(finalCount / 2);
  const centerInsertSlot = centerSlot;
  const hasSingleFloatingCard = photoFloatingCards.length === 1;
  Object.assign(frame, { centerInsertSlot, centerSlot, dropStartBaseY, finalCount, finalStartX, finalStep, hasSingleFloatingCard, initialCount, initialStartX, initialStep, insertionAnchorY, queueCenterX, queueLocalOffsetY, stageRect });
}

/* Where the floating cards open gaps in the queue: around the chosen card
   when there is one floating card, spread across the middle when three. */
function getInsertGapSlots(frame, contentSlot) {
  const { centerSlot, finalCount, hasSingleFloatingCard } = frame;
  if (hasSingleFloatingCard) {
    return [contentSlot];
  }

  if (photoFloatingCards.length === 3) {
    return [
      Math.max(0, centerSlot - 5),
      centerSlot,
      Math.min(finalCount - 1, centerSlot + 4),
    ];
  }

  return photoFloatingCards.map((_, index) => Math.min(finalCount - 1, centerSlot + index));
}

/* Each slot's distance from the chosen card, for the reinsert glide. */
function getReinsertOffsets(finalCount, contentSlot) {
  const orderedPhotoSlots = Array.from({ length: finalCount }, (_, slot) => slot);
  const selectedOrderIndex = orderedPhotoSlots.indexOf(contentSlot);
  const reinsertRelativeOffsetBySlot = new Map();
  orderedPhotoSlots.forEach((slot, orderIndex) => {
    if (slot === contentSlot) {
      return;
    }

    reinsertRelativeOffsetBySlot.set(slot, orderIndex - selectedOrderIndex);
  });
  return reinsertRelativeOffsetBySlot;
}

/* Which slot each card takes, around the card the visitor last chose. */
function planPhotoSlots(frame) {
  const { centerInsertSlot, centerSlot, finalCount, hasSingleFloatingCard, initialCount } = frame;
  ensurePhotoSlotContentMap({
    finalCount,
    initialCount,
    centerSlot: centerInsertSlot,
  });
  const hasValidSelectedSlot = (
    Number.isFinite(carousel.selectedSlot) &&
    carousel.selectedSlot >= 0 &&
    carousel.selectedSlot < finalCount
  );
  const selectedSlot = hasValidSelectedSlot ? carousel.selectedSlot : centerInsertSlot;
  const contentSlot = Math.min(Math.max(Math.round(selectedSlot), 0), Math.max(finalCount - 1, 0));
  const layoutAnchorSlot = hasSingleFloatingCard
    ? contentSlot
    : centerInsertSlot;
  const insertGapSlots = getInsertGapSlots(frame, contentSlot);
  // Single-card replay separates identity from layout:
  // - contentSlot is the selected card's identity and becomes the active carousel slot.
  // - insertGapSlots follows contentSlot, so the queue opens around the current active card.
  const insertFinalSlots = hasSingleFloatingCard ? [contentSlot] : insertGapSlots;
  const initialCarouselIndex = hasSingleFloatingCard
    ? contentSlot
    : centerSlot;
  const insertGapSlotSet = new Set(insertGapSlots);
  const floatingSlotSet = new Set(insertFinalSlots);
  const baseFinalSlots = Array.from({ length: finalCount }, (_, index) => index)
    .filter((slot) => !floatingSlotSet.has(slot))
    .slice(0, initialCount);
  const baseInsertSlots = hasSingleFloatingCard
    ? Array.from({ length: finalCount }, (_, index) => index)
      .filter((slot) => !insertGapSlotSet.has(slot))
      .slice(0, initialCount)
    : baseFinalSlots;
  const reinsertRelativeOffsetBySlot = getReinsertOffsets(finalCount, contentSlot);
  carousel.minIndex = 0;
  carousel.maxIndex = Math.max(photoCarouselCards.length - 1, finalCount - 1, 0);
  Object.assign(frame, { baseFinalSlots, baseInsertSlots, contentSlot, hasValidSelectedSlot, initialCarouselIndex, insertFinalSlots, insertGapSlots, layoutAnchorSlot, reinsertRelativeOffsetBySlot });
}

function clearCarouselWheelState() {
  carousel.wheelDelta = 0;
  carousel.wheelDirection = 0;
  carousel.boundaryDelta = 0;
  carousel.boundaryDirection = 0;
}

/* The drop-in has finished: the cards become a carousel. It starts on the
   middle card unless the visitor already moved it, in which case it keeps the
   card they were on. */
function enableCarousel(frame) {
  const { initialCarouselIndex, isCompact } = frame;
  const wasSettling = isCarouselSettling();
  carousel.phase.send("enable");
  if (!carousel.hasInteracted && !wasSettling) {
    carousel.targetIndex = initialCarouselIndex;
    carousel.visualIndex = initialCarouselIndex;
    carousel.previousIndex = initialCarouselIndex;
    carousel.transitionDirection = 0;
  } else {
    carousel.targetIndex = clampPhotoCarouselIndex(Math.round(carousel.visualIndex));
  }
  clearCarouselWheelState();
  preloadNearbyPhotoZoomImages(carousel.targetIndex, isCompact ? 1 : 2);
}

/* Not a carousel (yet, or any more). Scrolling back up after using it glides
   the chosen card back into the queue; otherwise everything resets, Show All
   included. */
function parkCarousel(frame, { photoSectionIsVisible, carouselIntroResetReady }) {
  const { contentSlot, hasSingleFloatingCard, hasValidSelectedSlot, initialCarouselIndex, isCompact } = frame;
  clearCarouselWheelState();
  resetPhotoCarouselTouchState();

  const canReplaySelectedCard = (
    hasSingleFloatingCard &&
    !isExpandTargeted() &&
    expand.progress < 0.01 &&
    (carousel.hasInteracted || (isCompact && hasValidSelectedSlot))
  );

  if (canReplaySelectedCard && photoSectionIsVisible && !carouselIntroResetReady) {
    carousel.phase.send("replay");
    carousel.targetIndex = isCompact && hasValidSelectedSlot
      ? clampPhotoCarouselIndex(contentSlot)
      : clampPhotoCarouselIndex(Math.round(carousel.visualIndex));
    if (isCompact && hasValidSelectedSlot) {
      carousel.visualIndex = carousel.targetIndex;
    }
    return;
  }

  carousel.phase.send("reset");
  carousel.hasInteracted = false;
  expand.phase.send("reset");
  expand.progress = 0;
  expand.animationStart = 0;
  expand.layouts.clear();
  carousel.targetIndex = initialCarouselIndex;
  carousel.visualIndex = initialCarouselIndex;
  carousel.previousIndex = initialCarouselIndex;
  carousel.transitionDirection = 0;
}

/* Enable, replay or reset the carousel from where the scroll has got to. */
function updateCarouselPhase(frame) {
  const { photoDropStartProgress, previewProgress, progress, rect, viewportHeight } = frame;
  const photoSectionIsVisible = rect.top < viewportHeight && rect.bottom > 0;
  const carouselReadyThreshold = 0.975;
  const introComplete = previewProgress >= carouselReadyThreshold;
  const carouselReady = (
    (shouldReduceMotion() || introComplete) &&
    photoSectionIsVisible
  );
  const carouselIntroResetReady = (
    photoSectionIsVisible &&
    progress < photoDropStartProgress &&
    previewProgress < 0.01
  );

  if (carouselReady) {
    if (!isCarouselEnabled()) {
      enableCarousel(frame);
    }
  } else {
    parkCarousel(frame, { photoSectionIsVisible, carouselIntroResetReady });
  }

  const photoCarouselLayoutActive = (
    isCarouselEnabled() ||
    isCarouselSettling() ||
    (carousel.hasInteracted && photoSectionIsVisible && !carouselIntroResetReady)
  );
  Object.assign(frame, { carouselReadyThreshold, photoCarouselLayoutActive });
}

/* The visual index glides towards the target; arriving ends a settle. */
function followCarouselTarget(frame) {
  const { deltaSeconds, isCompact } = frame;
  if (isCarouselEnabled() || isCarouselSettling()) {
    const carouselDelta = carousel.targetIndex - carousel.visualIndex;
    const carouselFollowTime = isCompact ? 0.16 : 0.34;
    const carouselFollow = shouldReduceMotion() ? 1 : 1 - Math.exp(-deltaSeconds / carouselFollowTime);
    carousel.visualIndex += carouselDelta * carouselFollow;

    if (Math.abs(carousel.targetIndex - carousel.visualIndex) < 0.001) {
      carousel.visualIndex = carousel.targetIndex;
      carousel.previousIndex = carousel.targetIndex;
      carousel.transitionDirection = 0;
      setPhotoSelectedSlot(carousel.targetIndex);
      if (isCarouselSettling()) {
        carousel.phase.send("converge");
      }
    }
  }
}

/* Show All's progress along its eased animation. */
function advanceExpandAnimation(frame) {
  const { timestamp } = frame;
  if (isExpandAnimating()) {
    const rawAnimationProgress = clamp01((timestamp - expand.animationStart) / expand.duration);
    const easedAnimationProgress = easeOutCubic(rawAnimationProgress);
    expand.progress = expand.phase.is("expanding")
      ? easedAnimationProgress
      : 1 - easedAnimationProgress;

    if (rawAnimationProgress >= 1) {
      expand.phase.send("finish");
      expand.progress = expandTarget();
      expand.layouts.clear();
    }
  } else {
    expand.progress = expandTarget();
  }
}

/* The card the carousel is centred on, fractional while it moves. */
function measureCarouselFocus(frame) {
  const { initialCarouselIndex, isCompact, photoCarouselLayoutActive } = frame;
  const activeIndex = photoCarouselLayoutActive ? carousel.visualIndex : initialCarouselIndex;
  const nearestCenterSlot = isCompact || !photoCarouselLayoutActive
    ? Math.round(activeIndex)
    : Math.round(carousel.targetIndex);
  Object.assign(frame, { activeIndex, nearestCenterSlot });
}

function getCompressedLineOffset(slot, centerSlot) {
  if (slot < centerSlot) {
    return slot - centerSlot + 0.5;
  }

  if (slot > centerSlot) {
    return slot - centerSlot - 0.5;
  }

  return 0;
}

/* Phone layout: the centre card large, neighbours stacked tight behind it. */
function getPhotoInsertStackMetrics(frame, relativeOffset, asLineLayout = false) {
  const { cardWidth, gap } = frame;
  const absOffset = Math.abs(relativeOffset);
  const direction = Math.sign(relativeOffset);
  const centerWeight = Math.max(0, 1 - absOffset);
  const sideScale = 0.94 - Math.min(Math.max(absOffset - 1, 0) * 0.015, 0.06);
  const centerScale = 1.14;
  const mobileLineStep = cardWidth + Math.max(2, gap);
  const mobileGuardX = cardWidth * ((centerScale + sideScale) / 2) + Math.max(4, gap);
  const mobileStackStepX = Math.max(cardWidth * 0.1, 8);
  const lineX = relativeOffset * mobileLineStep;
  const stackX = absOffset <= 1
    ? mobileGuardX * absOffset
    : mobileGuardX + (absOffset - 1) * mobileStackStepX;

  if (asLineLayout) {
    return {
      x: lineX,
      y: 0,
      scale: 1,
      rotate: 0,
      opacity: 1,
      shadowStrength: 3,
      zIndex: 100,
      isCenter: false,
    };
  }

  return {
    x: direction * stackX,
    y: 0,
    scale: interpolate(sideScale, centerScale, centerWeight),
    rotate: 0,
    opacity: 1,
    shadowStrength: getCardShadowStrength(absOffset, centerWeight),
    zIndex: Math.max(1, 1040 - absOffset * 18),
    isCenter: centerWeight > 0.999,
  };
}

const DESKTOP_CENTER_SCALE = 1.54;

/* Desktop carousel x: a guard gap either side of the centre card, then the
   rest stacked towards the edges, never past maxStackX. */
function getDesktopStackX(frame, absOffset) {
  const { cardWidth, viewportWidth } = frame;
  const guardOffset = Math.min(Math.max(cardWidth * 1.7, 240), viewportWidth * 0.24);
  const stackStep = Math.max(34, cardWidth * 0.24);
  const maxStackX = Math.max(guardOffset + stackStep, viewportWidth / 2 - cardWidth * 0.38);
  const desktopStackT = Math.max(absOffset - 1, 0);
  const desktopStackFirstX = Math.min(guardOffset + cardWidth * 1.52, maxStackX);
  if (absOffset <= 1) {
    return interpolate(0, guardOffset, absOffset);
  }
  return desktopStackT <= 1
    ? interpolate(guardOffset, desktopStackFirstX, desktopStackT)
    : Math.min(desktopStackFirstX + (desktopStackT - 1) * stackStep, maxStackX);
}

function getDesktopCardScale(absOffset, centerScale) {
  return absOffset <= 1
    ? interpolate(centerScale, 1, absOffset)
    : interpolate(1, 0.96, clamp01(absOffset - 1));
}

function getCardShadowStrength(absOffset, centerWeight) {
  return interpolate(Math.max(2.2, 4.4 - absOffset * 0.32), 7.2, centerWeight);
}

/* The resting carousel look, before the carousel itself takes over. */
function getPhotoPreviewMetrics(frame, relativeOffset) {
  if (frame.isCompact) {
    return getPhotoInsertStackMetrics(frame, relativeOffset);
  }

  const absOffset = Math.abs(relativeOffset);
  const centerWeight = Math.max(0, 1 - absOffset);

  return {
    x: Math.sign(relativeOffset) * getDesktopStackX(frame, absOffset),
    y: 0,
    scale: getDesktopCardScale(absOffset, DESKTOP_CENTER_SCALE),
    rotate: 0,
    opacity: 1,
    shadowStrength: getCardShadowStrength(absOffset, centerWeight),
    zIndex: Math.max(1, 1000 - absOffset * 10),
    isCenter: centerWeight > 0.999,
  };
}

/* A card's place in the queue as the dropped card is inserted. */
function getPhotoInsertMetrics(frame, relativeOffset) {
  if (frame.isCompact) {
    return getPhotoInsertStackMetrics(frame, relativeOffset);
  }

  const absOffset = Math.abs(relativeOffset);
  const centerWeight = Math.max(0, 1 - absOffset);

  return {
    x: relativeOffset * frame.finalStep,
    y: 0,
    scale: getDesktopCardScale(absOffset, DESKTOP_CENTER_SCALE),
    rotate: 0,
    opacity: 1,
    shadowStrength: getCardShadowStrength(absOffset, centerWeight),
    zIndex: Math.max(1, 1040 - absOffset * 18),
    isCenter: centerWeight > 0.999,
  };
}

/* A card's place in the running carousel. */
function getCarouselMetrics(
  frame,
  slot,
  metricsActiveIndex = frame.activeIndex,
  metricsLayerCenter = frame.nearestCenterSlot
) {
  const offset = slot - metricsActiveIndex;
  const absOffset = Math.abs(offset);
  const centerWeight = Math.max(0, 1 - absOffset);
  const zIndex = getCarouselZIndex(frame, slot, metricsActiveIndex, metricsLayerCenter);

  if (frame.isCompact) {
    const stack = getPhotoInsertStackMetrics(frame, offset);
    return {
      x: stack.x,
      y: 0,
      scale: stack.scale,
      rotate: 0,
      opacity: 1,
      shadowStrength: stack.shadowStrength,
      zIndex,
      isCenter: centerWeight > 0.999,
    };
  }

  return {
    x: Math.sign(offset) * getDesktopStackX(frame, absOffset),
    y: 0,
    scale: getDesktopCardScale(absOffset, DESKTOP_CENTER_SCALE),
    rotate: 0,
    opacity: 1,
    shadowStrength: getCardShadowStrength(absOffset, centerWeight),
    zIndex,
    isCenter: centerWeight > 0.999,
  };
}

/* On a phone mid-switch, the card being moved to sits on top, the card being
   left just under it, and the rest stack by distance, nudged towards the
   direction of travel. Otherwise layers simply stack by distance. */
function getCarouselZIndex(frame, slot, metricsActiveIndex, metricsLayerCenter) {
  const { activeIndex, isCompact, photoCarouselLayoutActive } = frame;
  if (!isCompact || !photoCarouselLayoutActive || metricsActiveIndex !== activeIndex) {
    return Math.max(1, 1000 - Math.abs(slot - metricsLayerCenter) * 10);
  }

  if (slot === carousel.targetIndex) {
    return 1100;
  }

  const isTransitioning = Math.abs(carousel.targetIndex - carousel.visualIndex) > 0.001;
  if (isTransitioning && slot === carousel.previousIndex) {
    return 1080;
  }

  const directionBias = (
    carousel.transitionDirection !== 0 &&
    Math.sign(slot - carousel.targetIndex) === carousel.transitionDirection
  ) ? 2 : 0;

  return Math.max(1, 1000 - Math.abs(slot - carousel.targetIndex) * 24 + directionBias);
}

/* The Show All grid, and how much extra scroll it needs. */
function measureExpandedGrid(frame) {
  const { activeIndex, cardHeight, cardWidth, finalCount, insertionAnchorY, isCompact, queueCenterX, viewportHeight, viewportWidth } = frame;
  const expandedMix = shouldReduceMotion() ? expandTarget() : easeInOut(expand.progress);
  const expandedScale = isCompact ? 0.88 : 1.1;
  const expandedCardWidth = cardWidth * expandedScale;
  const expandedCardHeight = cardHeight * expandedScale;
  const expandedGapX = isCompact ? cardWidth * 0.1 : cardWidth * 0.22;
  const expandedGapY = isCompact ? cardHeight * 0.12 : cardHeight * 0.16;
  const expandedAvailableWidth = Math.max(
    expandedCardWidth * 2,
    Math.min(viewportWidth - (isCompact ? 18 : 88), isCompact ? viewportWidth - 18 : 1120)
  );
  const minExpandedColumns = isCompact ? 2 : 5;
  const maxExpandedColumns = isCompact ? 3 : 7;
  const expandedColumns = Math.max(
    minExpandedColumns,
    Math.min(
      maxExpandedColumns,
      Math.floor((expandedAvailableWidth + expandedGapX) / (expandedCardWidth + expandedGapX)) || minExpandedColumns
    )
  );
  const expandedStepX = expandedCardWidth + expandedGapX;
  const expandedStepY = expandedCardHeight + expandedGapY;
  const expandedGridWidth = (expandedColumns - 1) * expandedStepX + expandedCardWidth;
  const expandedStartX = queueCenterX - expandedGridWidth / 2;
  const activeSlot = clampPhotoCarouselIndex(Math.round(activeIndex));
  const activeMetrics = getCarouselMetrics(frame, activeSlot);
  const queueBottomY = insertionAnchorY + cardHeight;
  const activeCardBottomY = insertionAnchorY + activeMetrics.y + cardHeight * (1 + activeMetrics.scale) / 2;
  const expandedStartY = Math.max(
    queueBottomY + (isCompact ? 28 : 40),
    activeCardBottomY + (isCompact ? 34 : 48)
  );
  const expandedRows = Math.max(1, Math.ceil(finalCount / expandedColumns));
  const expandedGridBottomY = expandedStartY + (expandedRows - 1) * expandedStepY + expandedCardHeight;
  const expandedScrollPadding = isCompact ? 96 : 120;
  const expandedScrollNeeded = Math.max(0, expandedGridBottomY - viewportHeight + expandedScrollPadding);
  const expandedScrollMix = expandTarget() > 0.5 ? 1 : expand.progress;
  expand.scrollExtraPx = expandedScrollNeeded * expandedScrollMix;
  applyPhotoSectionScrollHeight(viewportHeight, isCompact);
  Object.assign(frame, { activeMetrics, activeSlot, expandedCardHeight, expandedCardWidth, expandedColumns, expandedMix, expandedScale, expandedStartX, expandedStartY, expandedStepX, expandedStepY });
}

/* A card's cell in the Show All grid. */
function getExpandedMetrics(frame, slot) {
  const { expandedCardHeight, expandedCardWidth, expandedColumns, expandedScale, expandedStartX, expandedStartY, expandedStepX, expandedStepY } = frame;
  const column = slot % expandedColumns;
  const row = Math.floor(slot / expandedColumns);
  const centerX = expandedStartX + column * expandedStepX + expandedCardWidth / 2;
  const centerY = expandedStartY + row * expandedStepY + expandedCardHeight / 2;

  return {
    centerX,
    centerY,
    scale: expandedScale,
    rotate: 0,
    opacity: 1,
    zIndex: Math.max(1, 900 - slot),
  };
}

/* Show All rides above the active card, and moves to the grid's top when expanded. */
function placeShowAllButton(frame) {
  const { activeMetrics, cardHeight, expandedMix, expandedStartY, insertionAnchorY, isCompact, queueCenterX } = frame;
  const activeCardCenterX = queueCenterX + activeMetrics.x;
  const activeCardTopY = insertionAnchorY + activeMetrics.y + cardHeight * (1 - activeMetrics.scale) / 2;
  const expandedButtonX = queueCenterX;
  const expandedButtonY = expandedStartY - (isCompact ? 16 : 20);
  const showAllButtonX = interpolate(activeCardCenterX, expandedButtonX, expandedMix);
  const showAllButtonY = interpolate(activeCardTopY - (isCompact ? 18 : 24), expandedButtonY, expandedMix);
  const showAllVisible = isCarouselEnabled() || expand.progress > 0.001;
  applyPhotoShowAllFrame({
    visible: showAllVisible,
    expanded: expandTarget() > 0.5,
    x: showAllButtonX,
    y: showAllButtonY,
  });
}

/* Cards further from the active one start their Show All move later. */
function getExpandedDelay(frame, slot) {
  const { activeSlot, expandedColumns, isCompact } = frame;
  const distanceDelay = Math.abs(slot - activeSlot) * (isCompact ? 26 : 32);
  const orderDelay = Math.abs((slot % expandedColumns) - (activeSlot % expandedColumns)) * 5;
  return Math.min(isCompact ? 210 : 260, distanceDelay + orderDelay);
}

/* A card between its carousel and grid layouts at the current Show All progress. */
function resolveExpandedLayout(frame, card, slot, carouselLayout, expandedLayout) {
  const { timestamp } = frame;
  if (!isExpandAnimating()) {
    const mix = expand.progress;
    return {
      x: interpolate(carouselLayout.x, expandedLayout.x, mix),
      y: interpolate(carouselLayout.y, expandedLayout.y, mix),
      scale: interpolate(carouselLayout.scale, expandedLayout.scale, mix),
      rotate: interpolate(carouselLayout.rotate, expandedLayout.rotate, mix),
      opacity: interpolate(carouselLayout.opacity, expandedLayout.opacity, mix),
      zIndex: mix > 0.5 ? expandedLayout.zIndex : carouselLayout.zIndex,
    };
  }

  const fromLayout = expand.layouts.get(card) || carouselLayout;
  const toLayout = expand.phase.is("expanding") ? expandedLayout : carouselLayout;
  const delay = getExpandedDelay(frame, slot);
  const localDuration = Math.max(180, expand.duration - delay);
  const localProgress = clamp01((timestamp - expand.animationStart - delay) / localDuration);
  const mix = easeOutCubic(localProgress);

  return {
    x: interpolate(fromLayout.x, toLayout.x, mix),
    y: interpolate(fromLayout.y, toLayout.y, mix),
    scale: interpolate(fromLayout.scale, toLayout.scale, mix),
    rotate: interpolate(fromLayout.rotate, toLayout.rotate, mix),
    opacity: interpolate(fromLayout.opacity, toLayout.opacity, mix),
    zIndex: mix > 0.5 ? toLayout.zIndex : fromLayout.zIndex,
  };
}

/* The queue's anchor element, which bounds where the cards may be hit. */
function applyPhotoQueueAnchor(frame) {
  const { cardHeight, queueProgress, viewportHeight } = frame;
  const queueBleed = Math.min(Math.max(viewportHeight * 0.14, 96), 160);

  applyPhotoQueueAnchorFrame({ cardHeight, queueBleed, queueProgress });
}

/* How a floating card's fall is shaped: where it starts relative to its gap,
   how far the path bows, and its tilt at the start and the two midpoints.
   A single card drops down the middle; three fan in from the sides. */
function getDropPathShape(frame, index) {
  const { cardWidth, hasSingleFloatingCard, isCompact, viewportWidth } = frame;
  const compactStartOffset = Math.min(viewportWidth * 0.24, cardWidth * 1.35);
  const startOffset = hasSingleFloatingCard
    ? 0
    : (isCompact ? [-compactStartOffset, 0, compactStartOffset][index] : [-250, 0, 250][index]);
  const curveOffset = hasSingleFloatingCard
    ? (isCompact ? 7 : 16)
    : (isCompact ? [10, 6, -10][index] : [24, 14, -24][index]);
  const startRotate = isCompact
    ? (hasSingleFloatingCard ? 1.6 : [-2.8, 1.8, 2.8][index])
    : (hasSingleFloatingCard ? 2.2 : [-4, 2, 4][index]);
  const firstMidRotate = isCompact
    ? (hasSingleFloatingCard ? 0.8 : [-1.4, 0.9, 1.4][index])
    : (hasSingleFloatingCard ? 1.1 : [-2, 1, 2][index]);
  const secondMidRotate = isCompact
    ? (hasSingleFloatingCard ? 0.3 : [-0.7, 0, 0.7][index])
    : (hasSingleFloatingCard ? 0.5 : [-1, 0, 1][index]);
  return { startOffset, curveOffset, startRotate, firstMidRotate, secondMidRotate };
}

/* The path a floating card falls along, at the current progress. */
function getPhotoDropPathFrame(frame, { index, gapSlot = frame.centerInsertSlot }) {
  const {
    cardWidth, dropStartBaseY, finalStartX, finalStep, hasSingleFloatingCard, insertionAnchorY,
    isCompact, photoDropStartProgress, progress, queueCenterX,
  } = frame;
  const dropStart = photoDropStartProgress;
  const appearStart = dropStart + index * 0.012;
  const appearEnd = dropStart + 0.09 + index * 0.012;
  const dropEnd = PHOTO_INTRO_PHASES.dropEnd;
  const dropProgress = shouldReduceMotion()
    ? 1
    : mapScrollSegment(progress, dropStart, dropEnd);
  const appearProgress = shouldReduceMotion()
    ? 1
    : mapScrollSegment(progress, appearStart, appearEnd);
  const insertedX = hasSingleFloatingCard ? queueCenterX : finalStartX + gapSlot * finalStep;
  const insertedY = insertionAnchorY;
  const insertedLayout = {
    x: insertedX - cardWidth / 2,
    y: insertedY,
    scale: 1,
    rotate: 0,
    opacity: 1,
  };
  const insertedCenterX = insertedLayout.x + cardWidth / 2;
  const insertedCenterY = insertedLayout.y;
  const { startOffset, curveOffset, startRotate, firstMidRotate, secondMidRotate } = getDropPathShape(frame, index);
  const startX = insertedCenterX + startOffset;
  const startY = dropStartBaseY + index * (isCompact ? 12 : 16);
  const firstMidX = startX + (insertedCenterX - startX) * 0.3 + curveOffset;
  const secondMidX = startX + (insertedCenterX - startX) * 0.68 + curveOffset * 0.35;
  const firstMidY = startY + (insertedCenterY - startY) * 0.3;
  const secondMidY = startY + (insertedCenterY - startY) * 0.72;
  const droppedX = cubicBezierValue(startX, firstMidX, secondMidX, insertedCenterX, dropProgress);
  const droppedPathY = cubicBezierValue(startY, firstMidY, secondMidY, insertedCenterY, dropProgress);
  const droppedY = droppedPathY;
  const rotate = cubicBezierValue(startRotate, firstMidRotate, secondMidRotate, 0, dropProgress);
  const dropScale = interpolate(0.96, 1, easeInOut(dropProgress));

  return {
    dropProgress,
    appearProgress,
    insertedLayout,
    insertedCenterX,
    insertedCenterY,
    droppedX,
    droppedY,
    rotate,
    dropScale,
  };
}

/* A floating card: falling, held in the gap, then easing into the carousel. */
function computePhotoDropLayout(frame, { index, slot, gapSlot = slot }) {
  const { cardWidth, hasSingleFloatingCard, insertHoldProgress, insertionAnchorY, isCompact, previewEase, previewProgress, previewScaleEase, queueCenterX } = frame;
  const {
    dropProgress,
    appearProgress,
    insertedLayout,
    insertedCenterX,
    insertedCenterY,
    droppedX,
    droppedY,
    rotate,
    dropScale,
  } = getPhotoDropPathFrame(frame, { index, gapSlot });
  const carouselMetrics = isCarouselReinserting() && hasSingleFloatingCard
    ? getPhotoPreviewMetrics(frame, 0)
    : getCarouselMetrics(frame, slot);
  const previewX = queueCenterX + carouselMetrics.x;
  const previewY = insertionAnchorY + carouselMetrics.y;
  const previewScale = carouselMetrics.scale;
  const previewRotate = carouselMetrics.rotate;
  const previewOpacity = carouselMetrics.opacity;
  const heldX = interpolate(droppedX, insertedCenterX, insertHoldProgress);
  const heldY = interpolate(droppedY, insertedCenterY, insertHoldProgress);
  const heldScale = interpolate(dropScale, insertedLayout.scale, insertHoldProgress);
  const heldRotate = interpolate(rotate, insertedLayout.rotate, insertHoldProgress);
  const heldOpacity = interpolate(1, insertedLayout.opacity, insertHoldProgress);
  const settledX = interpolate(heldX, previewX, previewEase);
  const settledY = interpolate(heldY, previewY, previewEase);
  const scale = interpolate(heldScale, previewScale, previewScaleEase);
  const settledRotate = interpolate(heldRotate, previewRotate, previewEase);
  const opacity = appearProgress * interpolate(heldOpacity, previewOpacity, previewEase);
  const blur = (1 - appearProgress) * (isCompact ? 8 : 10);

  const dropZIndex = isCarouselReinserting() && hasSingleFloatingCard
    ? 1200
    : (previewProgress > 0.01 ? carouselMetrics.zIndex : 25);

  return {
    carouselMetrics,
    blur,
    cardDepth: 8 + dropProgress * 22,
    shineX: -18 + dropProgress * 36,
    carouselLayout: {
      x: settledX - cardWidth / 2,
      y: settledY,
      scale,
      rotate: settledRotate,
      opacity,
      zIndex: dropZIndex,
    },
    expandedLayout: getFloatingExpandedLayout(frame, slot),
  };
}

/* A floating card's Show All cell, in stage coordinates. */
function getFloatingExpandedLayout(frame, slot) {
  const { cardHeight, cardWidth } = frame;
  const expandedMetrics = getExpandedMetrics(frame, slot);
  return {
    x: expandedMetrics.centerX - cardWidth / 2,
    y: expandedMetrics.centerY - cardHeight / 2,
    scale: expandedMetrics.scale,
    rotate: expandedMetrics.rotate,
    opacity: expandedMetrics.opacity,
    zIndex: expandedMetrics.zIndex,
  };
}

/* Where a queue card stands before the insert: in a straight line, or on a
   phone gliding back into the queue after the carousel was used. null when
   it eases straight from the insert layout instead. */
function getQueueLineMetrics(frame, { index, insertSlot, isReinsert, reinsertVisualOffset }) {
  const { initialStartX, initialStep, isCompact, layoutAnchorSlot, queueCenterX } = frame;
  if (isReinsert) {
    if (!isCompact) {
      return null;
    }
    const reinsertLineRelativeOffset = reinsertVisualOffset < 0
      ? reinsertVisualOffset + 0.5
      : (
          reinsertVisualOffset > 0
            ? reinsertVisualOffset - 0.5
            : 0
        );
    return getPhotoInsertStackMetrics(frame, reinsertLineRelativeOffset, true);
  }

  const lineRelativeOffset = getCompressedLineOffset(insertSlot, layoutAnchorSlot);
  const initialLineMetrics = isCompact
    ? getPhotoInsertStackMetrics(frame, lineRelativeOffset, true)
    : null;
  return {
    x: initialLineMetrics ? initialLineMetrics.x : initialStartX + index * initialStep - queueCenterX,
    y: 0,
    scale: initialLineMetrics ? initialLineMetrics.scale : 1,
    rotate: initialLineMetrics ? initialLineMetrics.rotate : 0,
    opacity: initialLineMetrics ? initialLineMetrics.opacity : 1,
    shadowStrength: initialLineMetrics ? initialLineMetrics.shadowStrength : 3,
    zIndex: initialLineMetrics ? initialLineMetrics.zIndex : 1,
  };
}

/* from -> to at t, for the five properties a card layout animates. */
function blendMetrics(from, to, t) {
  return {
    x: interpolate(from.x, to.x, t),
    y: interpolate(from.y, to.y, t),
    scale: interpolate(from.scale, to.scale, t),
    rotate: interpolate(from.rotate, to.rotate, t),
    opacity: interpolate(from.opacity, to.opacity, t),
  };
}

/* A queue card's Show All cell, relative to the queue. */
function getQueueExpandedLayout(frame, slot) {
  const { cardHeight, cardWidth, insertionAnchorY, queueCenterX, queueLocalOffsetY } = frame;
  const expandedMetrics = getExpandedMetrics(frame, slot);
  const expandedX = expandedMetrics.centerX - queueCenterX;
  const expandedY = expandedMetrics.centerY - cardHeight / 2 - insertionAnchorY;
  return {
    x: expandedX - cardWidth / 2,
    y: queueLocalOffsetY + expandedY,
    scale: expandedMetrics.scale,
    rotate: expandedMetrics.rotate,
    opacity: expandedMetrics.opacity,
    zIndex: expandedMetrics.zIndex,
  };
}

/* A queue card: in line, making room for the insert, then easing into the carousel. */
function computePhotoQueueInsertLayout(frame, { index, slot }) {
  const {
    baseInsertSlots, cardWidth, carouselReadyThreshold, contentSlot, hasSingleFloatingCard, isCompact,
    layoutAnchorSlot, previewEase, previewProgress, previewScaleEase, queueLocalOffsetY, queueProgress,
    queueVisibility, reinsertRelativeOffsetBySlot,
  } = frame;
  const isReinsert = isCarouselReinserting() && hasSingleFloatingCard;
  const insertSlot = baseInsertSlots[index] ?? slot;
  const reinsertVisualOffset = reinsertRelativeOffsetBySlot.get(slot) ?? (slot - contentSlot);
  const relativeOffset = isReinsert ? reinsertVisualOffset : insertSlot - layoutAnchorSlot;
  const lineMetrics = getQueueLineMetrics(frame, { index, insertSlot, isReinsert, reinsertVisualOffset });
  const insertMetrics = getPhotoInsertMetrics(frame, relativeOffset);
  const previewMetrics = getPhotoPreviewMetrics(frame, relativeOffset);
  const carouselMetrics = isReinsert ? previewMetrics : getCarouselMetrics(frame, slot);

  const insertProgress = queueProgress;
  const queued = lineMetrics ? blendMetrics(lineMetrics, insertMetrics, insertProgress) : insertMetrics;
  const shouldUseCarouselMetrics = (
    isCarouselEnabled() &&
    !isCarouselReinserting() &&
    previewProgress >= carouselReadyThreshold
  );
  const finalMetrics = shouldUseCarouselMetrics ? carouselMetrics : previewMetrics;
  const layerSwitchProgress = isCompact ? 0.42 : 0.04;
  const baseZIndex = lineMetrics && insertProgress <= layerSwitchProgress
    ? lineMetrics.zIndex
    : insertMetrics.zIndex;

  return {
    carouselMetrics: previewEase > 0.5 ? finalMetrics : insertMetrics,
    carouselLayout: {
      x: interpolate(queued.x, finalMetrics.x, previewEase) - cardWidth / 2,
      y: queueLocalOffsetY + interpolate(queued.y, finalMetrics.y, previewEase),
      scale: interpolate(queued.scale, finalMetrics.scale, previewScaleEase),
      rotate: interpolate(queued.rotate, finalMetrics.rotate, previewEase),
      opacity: queueVisibility * interpolate(queued.opacity, finalMetrics.opacity, previewEase),
      zIndex: previewEase > 0.5 ? finalMetrics.zIndex : baseZIndex,
    },
    expandedLayout: getQueueExpandedLayout(frame, slot),
  };
}

/* Every card's frame, written in one pass, plus the carousel's hit area. */
function applyPhotoSceneCards(frame) {
  const { cardHeight, cardWidth, contentSlot, stageRect } = frame;
  const photoExpandedFocus = expandTarget() > 0.5 || expand.progress > 0.5;
  const keyboardFocusSlot = isCarouselEnabled() && !photoExpandedFocus
    ? clampPhotoCarouselIndex(Math.round(carousel.visualIndex))
    : -1;
  const pass = {
    cardFrames: [],
    slotMap: new Map(),
    hitCollector: createPhotoHitRectCollector(stageRect, cardWidth, cardHeight),
    selectedContent: photoSlotContentMap.get(contentSlot),
    selectedContentCard: photoCardSlotMap.get(contentSlot) || carousel.selectedSourceCard,
    /* Only the active card is in the Tab order, or every card once expanded. */
    tabIndex: (slot) => (photoExpandedFocus || slot === keyboardFocusSlot ? "0" : "-1"),
  };

  photoQueueCards.forEach((card, index) => addQueueCardFrame(frame, pass, card, index));
  photoFloatingCards.forEach((card, index) => addFloatingCardFrame(frame, pass, card, index));

  applyPhotoCardFrames({
    cardFrames: pass.cardFrames,
    hitRect: pass.hitCollector.getRect(),
    slotEntries: [...pass.slotMap.entries()],
    selectedSourceCard: pass.selectedContentCard || pass.slotMap.get(contentSlot) || carousel.selectedSourceCard,
  });
}

function addQueueCardFrame(frame, pass, card, index) {
  const { baseFinalSlots, isCompact, stageRect } = frame;
  const slot = baseFinalSlots[index];
  const slotContent = photoSlotContentMap.get(slot);
  if (slotContent) {
    syncPhotoCardImageContent(card, slotContent);
  }
  const queueLayout = computePhotoQueueInsertLayout(frame, { index, slot });
  const layout = resolveExpandedLayout(frame, card, slot, queueLayout.carouselLayout, queueLayout.expandedLayout);

  pass.slotMap.set(slot, card);
  pass.cardFrames.push({
    card,
    layout,
    data: [["photoSlot", String(slot)]],
    attributes: [
      ["role", "button"],
      ["tabindex", pass.tabIndex(slot)],
    ],
    options: {
      filter: "",
      shadowStrength: queueLayout.carouselMetrics.shadowStrength,
      mobilePerformance: isCompact,
    },
  });
  pass.hitCollector.include(layout, stageRect.width / 2);
}

function addFloatingCardFrame(frame, pass, card, index) {
  const { hasSingleFloatingCard, insertFinalSlots, insertGapSlots, isCompact } = frame;
  const slot = insertFinalSlots[index];
  const gapSlot = insertGapSlots[index] ?? slot;
  const dropLayout = computePhotoDropLayout(frame, { index, slot, gapSlot });
  const layout = resolveExpandedLayout(frame, card, slot, dropLayout.carouselLayout, dropLayout.expandedLayout);

  if (hasSingleFloatingCard && pass.selectedContent) {
    syncPhotoCardImageContent(card, pass.selectedContent);
  }

  pass.slotMap.set(slot, card);
  const identity = hasSingleFloatingCard ? getFloatingCardIdentity(frame, pass) : { data: [], attributes: [] };
  pass.cardFrames.push({
    card,
    layout,
    data: [["photoSlot", String(slot)], ["photoGapSlot", String(gapSlot)], ...identity.data],
    attributes: [["role", "button"], ["tabindex", pass.tabIndex(slot)], ...identity.attributes],
    options: {
      filter: `blur(${dropLayout.blur.toFixed(2)}px)`,
      shadowStrength: dropLayout.carouselMetrics.shadowStrength,
      cardDepth: dropLayout.cardDepth,
      shineX: dropLayout.shineX,
      mobilePerformance: isCompact,
    },
  });
  pass.hitCollector.include(layout, 0);
}

/* The single floating card shows whichever photo was chosen, so it carries
   that photo's identity and label rather than its own. */
function getFloatingCardIdentity(frame, pass) {
  const { selectedContent, selectedContentCard } = pass;
  const data = [["photoContentSlot", String(frame.contentSlot)]];
  const attributes = [];
  const sourceId = selectedContent?.sourceId ||
    selectedContentCard?.dataset.photoCloneSource ||
    selectedContentCard?.dataset.photoBase ||
    selectedContentCard?.dataset.photoInsert;
  if (sourceId) {
    data.push(["photoCloneSource", sourceId]);
    /* So a language switch while a clone is on screen relabels it too. */
    data.push(["i18nAria", "photoCardLabel"]);
  }
  const sourceLabel = selectedContent?.label || selectedContentCard?.getAttribute("aria-label");
  if (sourceLabel) {
    attributes.push(["aria-label", sourceLabel]);
  }
  return { data, attributes };
}

/* Whether anything is still moving and another frame is needed. */
function photoSceneNeedsAnotherFrame(frame) {
  const { photoSectionIsNearViewport, reduceMotion } = frame;
  return !reduceMotion && photoSectionIsNearViewport && (
    Math.abs(progressState.target - progressState.visual) > 0.00005 ||
    Math.abs(progressState.velocity) > 0.00005 ||
    ((isCarouselEnabled() || isCarouselSettling()) && Math.abs(carousel.targetIndex - carousel.visualIndex) > 0.001) ||
    Math.abs(expandTarget() - expand.progress) > 0.001
  );
}

export function updatePhotoScene(timestamp = window.performance.now()) {
  if (!photoSection || !photoStage || !photoQueueAnchor || photoFloatingCards.length === 0 || photoQueueCards.length === 0) {
    return false;
  }

  const isCompact = isCompactLayout();
  const viewportHeight = isCompact
    ? Math.max(stableMobileAppHeight || window.innerHeight, 1)
    : Math.max(window.innerHeight, window.visualViewport?.height || 0, 1);
  const viewportWidth = isCompact
    ? Math.max(window.innerWidth, 1)
    : Math.max(window.innerWidth, window.visualViewport?.width || 0, 1);

  applyPhotoSectionScrollHeight(viewportHeight, isCompact);

  const rect = photoSection.getBoundingClientRect();
  const photoSectionIsNearViewport = rect.top < viewportHeight * 1.35 && rect.bottom > -viewportHeight * 0.35;
  const photoHasActiveMotion = (
    isCarouselEnabled() ||
    isCarouselSettling() ||
    isExpandAnimating() ||
    isCarouselReinserting() ||
    Math.abs(expandTarget() - expand.progress) > 0.001
  );

  if (!photoSectionIsNearViewport && !photoHasActiveMotion) {
    progressState.lastFrameTime = timestamp;
    return false;
  }

  const frame = { timestamp, isCompact, viewportHeight, viewportWidth, rect, photoSectionIsNearViewport };
  advancePhotoProgress(frame);
  layoutPhotoPhase(frame);
  measurePhotoGeometry(frame);
  planPhotoSlots(frame);
  updateCarouselPhase(frame);
  followCarouselTarget(frame);
  advanceExpandAnimation(frame);
  measureCarouselFocus(frame);
  measureExpandedGrid(frame);
  placeShowAllButton(frame);
  applyPhotoQueueAnchor(frame);
  applyPhotoSceneCards(frame);
  return photoSceneNeedsAnotherFrame(frame);
}

export function cancelPhotoSceneFrame() {
  if (photoFrame) {
    window.cancelAnimationFrame(photoFrame);
    photoFrame = 0;
  }
}

export function requestPhotoSceneUpdate() {
  if (document.hidden) {
    return;
  }

  if (photoFrame) {
    return;
  }

  photoFrame = window.requestAnimationFrame((timestamp) => {
    const shouldContinue = updatePhotoScene(timestamp);
    photoFrame = 0;
    if (shouldContinue) {
      requestPhotoSceneUpdate();
    }
  });
}

function clampPhotoCarouselIndex(index) {
  return Math.min(Math.max(index, carousel.minIndex), carousel.maxIndex);
}

function setPhotoSelectedSlot(slot) {
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

function getPhotoCardLayoutSnapshot(card) {
  const style = window.getComputedStyle(card);
  const transform = style.transform;
  let x = 0;
  let y = 0;
  let scale = 1;
  let rotate = 0;

  if (transform && transform !== "none") {
    try {
      const matrix = new DOMMatrixReadOnly(transform);
      x = matrix.m41;
      y = matrix.m42;
      scale = Math.hypot(matrix.a, matrix.b) || 1;
      rotate = Math.atan2(matrix.b, matrix.a) * (180 / Math.PI);
    } catch (error) {
      x = 0;
      y = 0;
      scale = 1;
      rotate = 0;
    }
  }

  return {
    x,
    y,
    scale,
    rotate,
    /* || would turn a legitimate 0 into 1. Nothing sets opacity 0 on these
       cards today, so this is a trap rather than a live bug: the day a card
       is faded out, the expand animation would start it fully opaque and it
       would pop. */
    opacity: coerceNumber(Number.parseFloat(style.opacity), 1),
    zIndex: coerceNumber(Number.parseInt(style.zIndex, 10), 1),
  };
}

function capturePhotoAllExpandedLayouts() {
  expand.layouts.clear();
  photoCarouselCards.forEach((card) => {
    expand.layouts.set(card, getPhotoCardLayoutSnapshot(card));
  });
}

export function togglePhotoAllExpanded() {
  if (!isCarouselEnabled() && !isCarouselSettling() && expand.progress < 0.001) {
    return;
  }

  capturePhotoAllExpandedLayouts();
  expand.phase.send("toggle");
  const expanding = expand.phase.is("expanding");
  expand.progress = expanding ? 0 : 1;
  expand.animationStart = window.performance.now();
  expand.duration = expanding ? 920 : 780;
  syncPhotoShowAllButtonCopy();
  clearCarouselWheelState();
  resetPhotoCarouselTouchState();
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

function resetPhotoCarouselTouchState() {
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

/* ═══════════════════════════════════════════════════════════════
   Effect 3: Photo Card Hover Glow (JS portion)
   ═══════════════════════════════════════════════════════════════ */

export function initPhotoCardHoverGlow() {
  if (isTouchFirst()) return; /* No cursor tracking on touch devices */
  const stage = document.querySelector(".photo-stage");
  if (!stage) return;

  /* Inject glow overlay divs into every photo card that doesn't already have one */
  const cards = stage.querySelectorAll(".photo-card");
  cards.forEach((card) => {
    if (card.querySelector(".photo-card-hover-glow")) return;
    const glow = document.createElement("div");
    glow.className = "photo-card-hover-glow";
    glow.setAttribute("aria-hidden", "true");
    card.appendChild(glow);
  });

  /* Track mouse position to update CSS vars on the hovered card.

     Coalesced into a frame rather than run per event. A mouse can report well
     over a hundred moves a second, and each one read a rect off a card that
     updatePhotoScene had just written a transform to -- a forced layout every
     time, on the one element guaranteed to be dirty. Reading in the frame
     costs at most one, and the glow cannot be seen more often than that. */
  let glowEvent = null;
  let glowFrame = 0;

  const applyGlow = () => {
    glowFrame = 0;
    const e = glowEvent;
    glowEvent = null;
    if (!e) return;

    const card = e.target.closest(".photo-card");
    if (!card || !card.isConnected) return;

    const rect = card.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    card.style.setProperty("--hover-x", x + "%");
    card.style.setProperty("--hover-y", y + "%");
  };

  stage.addEventListener(
    "mousemove",
    (e) => {
      glowEvent = e;
      if (!glowFrame) {
        glowFrame = requestAnimationFrame(applyGlow);
      }
    },
    { passive: true }
  );
}
