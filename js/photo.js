/* The photo theatre: drop-in, queue, carousel, Show All and the lightbox. */

import { root } from "./core/dom.js?v=5057c320";
import { pageEvents } from "./core/events.js?v=8c4a4d4a";
import { waitForNextAnimationFrame } from "./core/frames.js?v=0b68ae2a";
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
export let photoZoomActive = false;
let photoZoomOpenToken = 0;
let photoZoomTriggerCard = null;
const photoZoomPreloadCache = new Map();
const photoZoomPreloadQueue = [];
let photoZoomPreloadActiveCount = 0;
let photoZoomPreloadLastActiveSlot = 0;

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
let photoTargetProgress = 0;
let photoVisualProgress = 0;
let photoProgressVelocity = 0;
let photoLastFrameTime = 0;
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
let photoCarouselEnabled = false;
let photoCarouselTargetIndex = 0;
let photoCarouselVisualIndex = 0;
let photoCarouselPreviousIndex = 0;
let photoCarouselTransitionDirection = 0;
let photoCarouselMinIndex = 0;
let photoCarouselMaxIndex = 0;
let photoCarouselSettling = false;
let photoCarouselHasInteracted = false;
let photoSelectedSlot = null;
const photoCardSlotMap = new Map();
let photoSelectedSourceCard = null;
let photoReinsertActive = false;
let photoAllExpanded = false;
let photoAllExpandedTarget = 0;
let photoAllExpandedProgress = 0;
let photoAllExpandedAnimating = false;
let photoAllExpandedAnimationStart = 0;
let photoAllExpandedAnimationDirection = 0;
let photoAllExpandedDuration = 880;
const photoAllExpandedLayouts = new Map();
let photoExpandedScrollExtraPx = 0;
const photoCardStyleCache = new WeakMap();
let photoLayoutMetricsCache = null;
let photoCarouselHitRectCache = null;
let photoCarouselWheelDelta = 0;
let photoCarouselWheelDirection = 0;
let photoCarouselLastStepTime = 0;
let photoCarouselBoundaryDelta = 0;
let photoCarouselBoundaryDirection = 0;
let photoCarouselTouchStartX = 0;
let photoCarouselTouchStartY = 0;
let photoCarouselTouchActive = false;
let photoCarouselTouchStartedInside = false;
let photoCarouselTouchLocked = false;
let photoCarouselTouchReleasedToPage = false;
let photoCarouselTouchUnlockTimer = 0;

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
  photoCarouselHitRectCache = null;
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
  const expandedExtraHeight = Math.max(0, photoExpandedScrollExtraPx);
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

  const showAllText = getPhotoShowAllLabel(photoAllExpandedTarget > 0.5);
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
    if (token !== photoZoomOpenToken || !photoZoomActive || !decoded) {
      return false;
    }

    await waitForNextAnimationFrame();

    if (token !== photoZoomOpenToken || !photoZoomActive) {
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
  if (token !== photoZoomOpenToken || !photoZoomActive) {
    return;
  }

  /* The full-size image failed to load/decode. Fall back to the preview
     that already lives in the browser cache so the spinner never runs
     forever; if even that fails, close the viewer instead of hanging. */
  const previewSrc = sourceContent?.src || "";
  const shown = previewSrc && previewSrc !== failedSrc
    ? await applyPhotoZoomImageSource({ token, src: previewSrc })
    : false;

  if (!shown && token === photoZoomOpenToken && photoZoomActive) {
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

function prunePhotoZoomPreloadCache(activeSlot = photoZoomPreloadLastActiveSlot) {
  const decodedEntries = [...photoZoomPreloadCache.entries()]
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
      photoZoomPreloadCache.delete(key);
    });
}

function pumpPhotoZoomPreloadQueue() {
  const concurrency = getPhotoZoomPreloadConcurrency();

  while (photoZoomPreloadActiveCount < concurrency && photoZoomPreloadQueue.length > 0) {
    const preloadTask = photoZoomPreloadQueue.shift();
    const entry = photoZoomPreloadCache.get(preloadTask.key);

    if (!entry || entry.status !== "queued") {
      continue;
    }

    entry.status = "loading";
    photoZoomPreloadActiveCount += 1;

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
      photoZoomPreloadActiveCount = Math.max(0, photoZoomPreloadActiveCount - 1);
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

  const existingEntry = photoZoomPreloadCache.get(key);
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
        const queueIndex = photoZoomPreloadQueue.findIndex((task) => task.key === key);
        if (queueIndex > 0) {
          const [task] = photoZoomPreloadQueue.splice(queueIndex, 1);
          task.priority = true;
          photoZoomPreloadQueue.unshift(task);
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
  photoZoomPreloadCache.set(key, entry);

  const preloadTask = {
    key,
    priority,
    slot,
    src: descriptor.src,
    srcset: descriptor.srcset,
    sizes: descriptor.sizes,
  };

  if (priority) {
    photoZoomPreloadQueue.unshift(preloadTask);
  } else {
    photoZoomPreloadQueue.push(preloadTask);
  }

  pumpPhotoZoomPreloadQueue();
}

function preloadNearbyPhotoZoomImages(activeSlot, radius = (isTouchFirst() ? 1 : 2)) {
  if (!Number.isFinite(activeSlot) || photoSlotContentMap.size === 0) {
    return;
  }

  const clampedActiveSlot = clampPhotoCarouselIndex(Math.round(activeSlot));
  photoZoomPreloadLastActiveSlot = clampedActiveSlot;
  const slots = [clampedActiveSlot];

  for (let offset = 1; offset <= radius; offset += 1) {
    slots.push(clampedActiveSlot - offset, clampedActiveSlot + offset);
  }

  slots.forEach((slot) => {
    if (slot < photoCarouselMinIndex || slot > photoCarouselMaxIndex) {
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

  const token = ++photoZoomOpenToken;
  const zoomDescriptor = getPhotoZoomSourceDescriptor(sourceContent);
  if (!zoomDescriptor?.src) {
    return;
  }
  const zoomSrc = zoomDescriptor.src;
  const zoomSrcset = zoomDescriptor.srcset;
  const zoomSizes = zoomDescriptor.sizes;
  const zoomAlt = sourceContent.label || "Expanded photo";
  const zoomCacheKey = getPhotoZoomPreloadKey(sourceContent);
  const cachedZoom = photoZoomPreloadCache.get(zoomCacheKey);

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

  photoZoomActive = true;
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
    preloadNearbyPhotoZoomImages(clampPhotoCarouselIndex(Math.round(photoCarouselVisualIndex)), isTouchFirst() ? 1 : 2);
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
    if (token !== photoZoomOpenToken || !photoZoomActive) {
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
  if (!photoZoomActive || !photoZoomOverlay) {
    return;
  }

  photoZoomOpenToken += 1;
  photoZoomActive = false;
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
  if (photoZoomTriggerCard?.isConnected) {
    photoZoomTriggerCard.focus({ preventScroll: true });
  } else {
    photoZoomCloseButton?.blur();
  }
  photoZoomTriggerCard = null;
  requestPhotoSceneUpdate();
  window.requestAnimationFrame(() => {
    if (photoZoomActive || !photoZoomOverlay) {
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
  if (!photoZoomActive) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
}

function getActivePhotoMainCard() {
  if (!photoCarouselEnabled || photoAllExpandedTarget > 0 || photoAllExpandedProgress > 0.01) {
    return null;
  }

  const activeSlot = clampPhotoCarouselIndex(Math.round(photoCarouselVisualIndex));
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
  if (photoAllExpandedTarget <= 0.5 && photoAllExpandedProgress <= 0.5) {
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
  if (photoZoomActive || !photoStage || photoShowAllButton?.contains(event.target)) {
    return;
  }

  handlePhotoMainCardPreloadAtPoint(event.clientX, event.clientY, event.target);
}

export function handlePhotoMainCardTouchPreload(event) {
  if (photoZoomActive || !photoStage || photoShowAllButton?.contains(event.target) || event.touches.length !== 1) {
    return;
  }

  const touch = event.touches[0];
  handlePhotoMainCardPreloadAtPoint(touch.clientX, touch.clientY, event.target);
}

function navigatePhotoCarouselToSlot(slot) {
  if (!photoCarouselEnabled || photoAllExpandedTarget > 0 || photoAllExpandedProgress > 0.01) {
    return false;
  }

  const targetSlot = clampPhotoCarouselIndex(slot);
  const currentSlot = clampPhotoCarouselIndex(Math.round(photoCarouselVisualIndex));
  if (targetSlot === currentSlot) {
    return false;
  }

  photoCarouselBoundaryDelta = 0;
  photoCarouselBoundaryDirection = 0;
  photoCarouselPreviousIndex = clampPhotoCarouselIndex(Math.round(photoCarouselVisualIndex));
  photoCarouselTargetIndex = targetSlot;
  setPhotoSelectedSlot(targetSlot);
  photoCarouselTransitionDirection = Math.sign(targetSlot - currentSlot);
  photoCarouselHasInteracted = true;
  photoCarouselSettling = false;
  requestPhotoSceneUpdate();
  return true;
}

function getClickedPhotoCardSlot(x, y, target) {
  if (!photoCarouselEnabled || photoAllExpandedTarget > 0 || photoAllExpandedProgress > 0.01) {
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
  if (photoZoomActive || !photoStage || photoShowAllButton?.contains(event.target)) {
    return;
  }

  const clickedSlot = getClickedPhotoCardSlot(event.clientX, event.clientY, event.target);
  if (clickedSlot !== null) {
    const activeSlot = clampPhotoCarouselIndex(Math.round(photoCarouselVisualIndex));
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
  photoZoomTriggerCard = hitContent.activeCard || null;
  openPhotoZoom(hitContent.sourceContent);
}

export function handlePhotoCardKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  if (photoZoomActive || !photoStage || photoShowAllButton?.contains(event.target)) {
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

  if (photoCarouselEnabled && photoAllExpandedTarget <= 0 && photoAllExpandedProgress <= 0.01) {
    const activeSlot = clampPhotoCarouselIndex(Math.round(photoCarouselVisualIndex));
    if (slot !== activeSlot) {
      navigatePhotoCarouselToSlot(slot);
      return;
    }
  }

  const sourceContent = getPhotoCardZoomContent(card, slot);
  if (!sourceContent?.src) {
    return;
  }

  photoZoomTriggerCard = card;
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

  photoCarouselHitRectCache = hitRect;
  photoCardSlotMap.clear();
  slotEntries.forEach(([slot, card]) => {
    photoCardSlotMap.set(slot, card);
  });
  photoSelectedSourceCard = selectedSourceCard || photoSelectedSourceCard;
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
    photoCarouselEnabled ||
    photoCarouselSettling ||
    photoAllExpandedAnimating ||
    photoReinsertActive ||
    Math.abs(photoAllExpandedTarget - photoAllExpandedProgress) > 0.001
  );

  if (!photoSectionIsNearViewport && !photoHasActiveMotion) {
    photoLastFrameTime = timestamp;
    return false;
  }

  const reduceMotion = shouldReduceMotion();
  const { photoIntroStartY, rawProgress } = computePhotoRawProgress(rect, viewportHeight, isCompact);
  let deltaSeconds = 1 / 60;
  const photoDropStartProgress = getPhotoDropStartProgress(isCompact);
  photoTargetProgress = clamp01(rawProgress);

  if (photoTargetProgress <= 0 && rect.top > photoIntroStartY) {
    photoVisualProgress = 0;
    photoProgressVelocity = 0;
  }

  if (reduceMotion) {
    photoVisualProgress = photoTargetProgress;
    photoProgressVelocity = 0;
    photoLastFrameTime = timestamp;
  } else if (!photoLastFrameTime) {
    photoVisualProgress = photoTargetProgress;
    photoProgressVelocity = 0;
    photoLastFrameTime = timestamp;
  } else {
    deltaSeconds = Math.min(Math.max((timestamp - photoLastFrameTime) / 1000, 0.008), 0.05);
    const delta = photoTargetProgress - photoVisualProgress;
    const direction = Math.sign(delta);
    const distance = Math.abs(delta);
    const isReverseExtraction = (
      direction < 0 &&
      photoVisualProgress > photoDropStartProgress &&
      photoVisualProgress <= PHOTO_INTRO_PHASES.carouselEnd
    );
    const isMobileReverseExtraction = isReverseExtraction && isCompact;
    const velocityDirection = Math.sign(photoProgressVelocity);

    if (direction && velocityDirection && direction !== velocityDirection) {
      photoProgressVelocity *= isMobileReverseExtraction ? 0.035 : 0.08;
    }

    const maxSpeed = isMobileReverseExtraction ? 1.16 : (isReverseExtraction ? 1.0 : 0.78);
    const maxAcceleration = isMobileReverseExtraction ? 6.8 : (isReverseExtraction ? 5.2 : 2.85);
    const brakingDistance = isMobileReverseExtraction ? 0.075 : (isReverseExtraction ? 0.1 : 0.2);
    const speedLimitByDistance = maxSpeed * Math.min(1, distance / brakingDistance);
    const desiredVelocity = direction * speedLimitByDistance;
    const velocityDelta = desiredVelocity - photoProgressVelocity;
    const maxVelocityChange = maxAcceleration * deltaSeconds;

    photoProgressVelocity += Math.min(
      Math.max(velocityDelta, -maxVelocityChange),
      maxVelocityChange
    );
    photoVisualProgress += photoProgressVelocity * deltaSeconds;

    if (
      Math.abs(photoTargetProgress - photoVisualProgress) < 0.00005 &&
      Math.abs(photoProgressVelocity) < 0.00005
    ) {
      photoVisualProgress = photoTargetProgress;
      photoProgressVelocity = 0;
    }
    photoLastFrameTime = timestamp;
  }

  const progress = photoVisualProgress;
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
  ensurePhotoSlotContentMap({
    finalCount,
    initialCount,
    centerSlot: centerInsertSlot,
  });
  const hasValidSelectedSlot = (
    Number.isFinite(photoSelectedSlot) &&
    photoSelectedSlot >= 0 &&
    photoSelectedSlot < finalCount
  );
  const selectedSlot = hasValidSelectedSlot ? photoSelectedSlot : centerInsertSlot;
  const contentSlot = Math.min(Math.max(Math.round(selectedSlot), 0), Math.max(finalCount - 1, 0));
  const layoutAnchorSlot = hasSingleFloatingCard
    ? contentSlot
    : centerInsertSlot;
  const insertGapSlots = (() => {
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
  })();
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
  const orderedPhotoSlots = Array.from({ length: finalCount }, (_, slot) => slot);
  const selectedOrderIndex = orderedPhotoSlots.indexOf(contentSlot);
  const reinsertRelativeOffsetBySlot = new Map();
  orderedPhotoSlots.forEach((slot, orderIndex) => {
    if (slot === contentSlot) {
      return;
    }

    reinsertRelativeOffsetBySlot.set(slot, orderIndex - selectedOrderIndex);
  });
  photoCarouselMinIndex = 0;
  photoCarouselMaxIndex = Math.max(photoCarouselCards.length - 1, finalCount - 1, 0);

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
    if (!photoCarouselEnabled) {
      photoCarouselEnabled = true;
      photoReinsertActive = false;
      if (!photoCarouselHasInteracted && !photoCarouselSettling) {
        photoCarouselTargetIndex = initialCarouselIndex;
        photoCarouselVisualIndex = initialCarouselIndex;
        photoCarouselPreviousIndex = initialCarouselIndex;
        photoCarouselTransitionDirection = 0;
      } else {
        photoCarouselTargetIndex = clampPhotoCarouselIndex(Math.round(photoCarouselVisualIndex));
      }
      photoCarouselSettling = false;
      photoCarouselWheelDelta = 0;
      photoCarouselWheelDirection = 0;
      photoCarouselBoundaryDelta = 0;
      photoCarouselBoundaryDirection = 0;
      preloadNearbyPhotoZoomImages(photoCarouselTargetIndex, isCompact ? 1 : 2);
    }
  } else {
    photoCarouselEnabled = false;
    photoCarouselWheelDelta = 0;
    photoCarouselWheelDirection = 0;
    photoCarouselBoundaryDelta = 0;
    photoCarouselBoundaryDirection = 0;
    resetPhotoCarouselTouchState();

    const canReplaySelectedCard = (
      hasSingleFloatingCard &&
      !photoAllExpanded &&
      photoAllExpandedProgress < 0.01 &&
      (photoCarouselHasInteracted || (isCompact && hasValidSelectedSlot))
    );

    if (canReplaySelectedCard && photoSectionIsVisible && !carouselIntroResetReady) {
      photoCarouselSettling = true;
      photoCarouselTargetIndex = isCompact && hasValidSelectedSlot
        ? clampPhotoCarouselIndex(contentSlot)
        : clampPhotoCarouselIndex(Math.round(photoCarouselVisualIndex));
      if (isCompact && hasValidSelectedSlot) {
        photoCarouselVisualIndex = photoCarouselTargetIndex;
      }
      photoReinsertActive = true;
    } else {
      photoCarouselSettling = false;
      photoCarouselHasInteracted = false;
      photoAllExpanded = false;
      photoAllExpandedTarget = 0;
      photoAllExpandedProgress = 0;
      photoAllExpandedAnimating = false;
      photoAllExpandedAnimationStart = 0;
      photoAllExpandedAnimationDirection = 0;
      photoAllExpandedLayouts.clear();
      photoReinsertActive = false;
      photoCarouselTargetIndex = initialCarouselIndex;
      photoCarouselVisualIndex = initialCarouselIndex;
      photoCarouselPreviousIndex = initialCarouselIndex;
      photoCarouselTransitionDirection = 0;
    }
  }

  const photoCarouselLayoutActive = (
    photoCarouselEnabled ||
    photoCarouselSettling ||
    (photoCarouselHasInteracted && photoSectionIsVisible && !carouselIntroResetReady)
  );

  if (photoCarouselEnabled || photoCarouselSettling) {
    const carouselDelta = photoCarouselTargetIndex - photoCarouselVisualIndex;
    const carouselFollowTime = isCompact ? 0.16 : 0.34;
    const carouselFollow = shouldReduceMotion() ? 1 : 1 - Math.exp(-deltaSeconds / carouselFollowTime);
    photoCarouselVisualIndex += carouselDelta * carouselFollow;

    if (Math.abs(photoCarouselTargetIndex - photoCarouselVisualIndex) < 0.001) {
      photoCarouselVisualIndex = photoCarouselTargetIndex;
      photoCarouselPreviousIndex = photoCarouselTargetIndex;
      photoCarouselTransitionDirection = 0;
      setPhotoSelectedSlot(photoCarouselTargetIndex);
      if (photoCarouselSettling) {
        photoCarouselSettling = false;
      }
    }
  }

  if (photoAllExpandedAnimating) {
    const rawAnimationProgress = clamp01((timestamp - photoAllExpandedAnimationStart) / photoAllExpandedDuration);
    const easedAnimationProgress = easeOutCubic(rawAnimationProgress);
    photoAllExpandedProgress = photoAllExpandedAnimationDirection > 0
      ? easedAnimationProgress
      : 1 - easedAnimationProgress;

    if (rawAnimationProgress >= 1) {
      photoAllExpandedAnimating = false;
      photoAllExpandedProgress = photoAllExpandedTarget;
      photoAllExpandedLayouts.clear();
    }
  } else {
    photoAllExpandedProgress = photoAllExpandedTarget;
  }

  const activeIndex = photoCarouselLayoutActive ? photoCarouselVisualIndex : initialCarouselIndex;
  const nearestCenterSlot = isCompact || !photoCarouselLayoutActive
    ? Math.round(activeIndex)
    : Math.round(photoCarouselTargetIndex);
  const getCompressedLineOffset = (slot, centerSlot) => {
    if (slot < centerSlot) {
      return slot - centerSlot + 0.5;
    }

    if (slot > centerSlot) {
      return slot - centerSlot - 0.5;
    }

    return 0;
  };
  const getPhotoInsertStackMetrics = (relativeOffset, asLineLayout = false) => {
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
      shadowStrength: interpolate(Math.max(2.2, 4.4 - absOffset * 0.32), 7.2, centerWeight),
      zIndex: Math.max(1, 1040 - absOffset * 18),
      isCenter: centerWeight > 0.999,
    };
  };
  const getPhotoPreviewMetrics = (relativeOffset) => {
    if (isCompact) {
      return getPhotoInsertStackMetrics(relativeOffset);
    }

    const absOffset = Math.abs(relativeOffset);
    const direction = Math.sign(relativeOffset);
    const guardOffset = Math.min(Math.max(cardWidth * 1.7, 240), viewportWidth * 0.24);
    const stackStep = Math.max(34, cardWidth * 0.24);
    const maxStackX = Math.max(guardOffset + stackStep, viewportWidth / 2 - cardWidth * 0.38);
    const desktopStackT = Math.max(absOffset - 1, 0);
    const desktopStackFirstX = Math.min(guardOffset + cardWidth * 1.52, maxStackX);
    const desktopX = absOffset <= 1
      ? interpolate(0, guardOffset, absOffset)
      : (
          desktopStackT <= 1
            ? interpolate(guardOffset, desktopStackFirstX, desktopStackT)
            : Math.min(desktopStackFirstX + (desktopStackT - 1) * stackStep, maxStackX)
        );
    const centerWeight = Math.max(0, 1 - absOffset);
    const centerScale = 1.54;
    const scale = absOffset <= 1
      ? interpolate(centerScale, 1, absOffset)
      : interpolate(1, 0.96, clamp01(absOffset - 1));

    return {
      x: direction * desktopX,
      y: 0,
      scale,
      rotate: 0,
      opacity: 1,
      shadowStrength: interpolate(Math.max(2.2, 4.4 - absOffset * 0.32), 7.2, centerWeight),
      zIndex: Math.max(1, 1000 - absOffset * 10),
      isCenter: centerWeight > 0.999,
    };
  };
  const getPhotoInsertMetrics = (relativeOffset) => {
    if (isCompact) {
      return getPhotoInsertStackMetrics(relativeOffset);
    }

    const absOffset = Math.abs(relativeOffset);
    const centerWeight = Math.max(0, 1 - absOffset);
    const centerScale = 1.54;
    const scale = absOffset <= 1
      ? interpolate(centerScale, 1, absOffset)
      : interpolate(1, 0.96, clamp01(absOffset - 1));

    return {
      x: relativeOffset * finalStep,
      y: 0,
      scale,
      rotate: 0,
      opacity: 1,
      shadowStrength: interpolate(Math.max(2.2, 4.4 - absOffset * 0.32), 7.2, centerWeight),
      zIndex: Math.max(1, 1040 - absOffset * 18),
      isCenter: centerWeight > 0.999,
    };
  };
  const getCarouselMetrics = (
    slot,
    metricsActiveIndex = activeIndex,
    metricsLayerCenter = nearestCenterSlot
  ) => {
    const offset = slot - metricsActiveIndex;
    const absOffset = Math.abs(offset);
    const layerDistance = Math.abs(slot - metricsLayerCenter);
    const sign = Math.sign(offset);
    const guardOffset = Math.min(Math.max(cardWidth * 1.7, 240), viewportWidth * 0.24);
    const stackStep = Math.max(34, cardWidth * 0.24);
    const maxStackX = Math.max(guardOffset + stackStep, viewportWidth / 2 - cardWidth * 0.38);
    const desktopStackT = Math.max(absOffset - 1, 0);
    const desktopStackFirstX = Math.min(guardOffset + cardWidth * 1.52, maxStackX);
    const desktopX = absOffset <= 1
      ? interpolate(0, guardOffset, absOffset)
      : (
          desktopStackT <= 1
            ? interpolate(guardOffset, desktopStackFirstX, desktopStackT)
            : Math.min(desktopStackFirstX + (desktopStackT - 1) * stackStep, maxStackX)
        );
    const centerWeight = Math.max(0, 1 - absOffset);
    const centerScale = isCompact ? 1.14 : 1.54;
    const desktopScale = absOffset <= 1
      ? interpolate(centerScale, 1, absOffset)
      : interpolate(1, 0.96, clamp01(absOffset - 1));
    const insertStackMetrics = isCompact
      ? getPhotoInsertStackMetrics(offset)
      : null;
    const scale = isCompact ? insertStackMetrics.scale : desktopScale;
    const x = isCompact ? insertStackMetrics.x : sign * desktopX;

    return {
      x,
      y: 0,
      scale,
      rotate: 0,
      opacity: 1,
      shadowStrength: isCompact
        ? insertStackMetrics.shadowStrength
        : interpolate(Math.max(2.2, 4.4 - absOffset * 0.32), 7.2, centerWeight),
      zIndex: (() => {
        if (!isCompact || !photoCarouselLayoutActive || metricsActiveIndex !== activeIndex) {
          return Math.max(1, 1000 - layerDistance * 10);
        }

        const targetDistance = Math.abs(slot - photoCarouselTargetIndex);
        const isTransitioning = Math.abs(photoCarouselTargetIndex - photoCarouselVisualIndex) > 0.001;

        if (slot === photoCarouselTargetIndex) {
          return 1100;
        }

        if (isTransitioning && slot === photoCarouselPreviousIndex) {
          return 1080;
        }

        const directionBias = (
          photoCarouselTransitionDirection !== 0 &&
          Math.sign(slot - photoCarouselTargetIndex) === photoCarouselTransitionDirection
        ) ? 2 : 0;

        return Math.max(1, 1000 - targetDistance * 24 + directionBias);
      })(),
      isCenter: centerWeight > 0.999,
    };
  };
  const expandedMix = shouldReduceMotion() ? photoAllExpandedTarget : easeInOut(photoAllExpandedProgress);
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
  const activeMetrics = getCarouselMetrics(activeSlot);
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
  const expandedScrollMix = photoAllExpandedTarget > 0.5 ? 1 : photoAllExpandedProgress;
  photoExpandedScrollExtraPx = expandedScrollNeeded * expandedScrollMix;
  applyPhotoSectionScrollHeight(viewportHeight, isCompact);
  const getExpandedMetrics = (slot) => {
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
  };
  const activeCardCenterX = queueCenterX + activeMetrics.x;
  const activeCardTopY = insertionAnchorY + activeMetrics.y + cardHeight * (1 - activeMetrics.scale) / 2;
  const expandedButtonX = queueCenterX;
  const expandedButtonY = expandedStartY - (isCompact ? 16 : 20);
  const showAllButtonX = interpolate(activeCardCenterX, expandedButtonX, expandedMix);
  const showAllButtonY = interpolate(activeCardTopY - (isCompact ? 18 : 24), expandedButtonY, expandedMix);
  const showAllVisible = photoCarouselEnabled || photoAllExpandedProgress > 0.001;
  applyPhotoShowAllFrame({
    visible: showAllVisible,
    expanded: photoAllExpandedTarget > 0.5,
    x: showAllButtonX,
    y: showAllButtonY,
  });

  const getExpandedDelay = (slot) => {
    const distanceDelay = Math.abs(slot - activeSlot) * (isCompact ? 26 : 32);
    const orderDelay = Math.abs((slot % expandedColumns) - (activeSlot % expandedColumns)) * 5;
    return Math.min(isCompact ? 210 : 260, distanceDelay + orderDelay);
  };
  const resolveExpandedLayout = (card, slot, carouselLayout, expandedLayout) => {
    if (!photoAllExpandedAnimating) {
      const mix = photoAllExpandedProgress;
      return {
        x: interpolate(carouselLayout.x, expandedLayout.x, mix),
        y: interpolate(carouselLayout.y, expandedLayout.y, mix),
        scale: interpolate(carouselLayout.scale, expandedLayout.scale, mix),
        rotate: interpolate(carouselLayout.rotate, expandedLayout.rotate, mix),
        opacity: interpolate(carouselLayout.opacity, expandedLayout.opacity, mix),
        zIndex: mix > 0.5 ? expandedLayout.zIndex : carouselLayout.zIndex,
      };
    }

    const fromLayout = photoAllExpandedLayouts.get(card) || carouselLayout;
    const toLayout = photoAllExpandedAnimationDirection > 0 ? expandedLayout : carouselLayout;
    const delay = getExpandedDelay(slot);
    const localDuration = Math.max(180, photoAllExpandedDuration - delay);
    const localProgress = clamp01((timestamp - photoAllExpandedAnimationStart - delay) / localDuration);
    const mix = easeOutCubic(localProgress);

    return {
      x: interpolate(fromLayout.x, toLayout.x, mix),
      y: interpolate(fromLayout.y, toLayout.y, mix),
      scale: interpolate(fromLayout.scale, toLayout.scale, mix),
      rotate: interpolate(fromLayout.rotate, toLayout.rotate, mix),
      opacity: interpolate(fromLayout.opacity, toLayout.opacity, mix),
      zIndex: mix > 0.5 ? toLayout.zIndex : fromLayout.zIndex,
    };
  };

  const queueBleed = Math.min(Math.max(viewportHeight * 0.14, 96), 160);

  applyPhotoQueueAnchorFrame({ cardHeight, queueBleed, queueProgress });

  const getPhotoDropPathFrame = ({ index, gapSlot = centerInsertSlot }) => {
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
    const compactStartOffset = Math.min(viewportWidth * 0.24, cardWidth * 1.35);
    const startOffset = hasSingleFloatingCard
      ? 0
      : (isCompact ? [-compactStartOffset, 0, compactStartOffset][index] : [-250, 0, 250][index]);
    const startX = insertedCenterX + startOffset;
    const startY = dropStartBaseY + index * (isCompact ? 12 : 16);
    const curveOffset = hasSingleFloatingCard
      ? (isCompact ? 7 : 16)
      : (isCompact ? [10, 6, -10][index] : [24, 14, -24][index]);
    const firstMidX = startX + (insertedCenterX - startX) * 0.3 + curveOffset;
    const secondMidX = startX + (insertedCenterX - startX) * 0.68 + curveOffset * 0.35;
    const firstMidY = startY + (insertedCenterY - startY) * 0.3;
    const secondMidY = startY + (insertedCenterY - startY) * 0.72;
    const droppedX = cubicBezierValue(startX, firstMidX, secondMidX, insertedCenterX, dropProgress);
    const droppedPathY = cubicBezierValue(startY, firstMidY, secondMidY, insertedCenterY, dropProgress);
    const droppedY = droppedPathY;
    const startRotate = isCompact
      ? (hasSingleFloatingCard ? 1.6 : [-2.8, 1.8, 2.8][index])
      : (hasSingleFloatingCard ? 2.2 : [-4, 2, 4][index]);
    const firstMidRotate = isCompact
      ? (hasSingleFloatingCard ? 0.8 : [-1.4, 0.9, 1.4][index])
      : (hasSingleFloatingCard ? 1.1 : [-2, 1, 2][index]);
    const secondMidRotate = isCompact
      ? (hasSingleFloatingCard ? 0.3 : [-0.7, 0, 0.7][index])
      : (hasSingleFloatingCard ? 0.5 : [-1, 0, 1][index]);
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
  };

  const computePhotoDropLayout = ({ index, slot, gapSlot = slot }) => {
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
    } = getPhotoDropPathFrame({ index, gapSlot });
    const carouselMetrics = photoReinsertActive && hasSingleFloatingCard
      ? getPhotoPreviewMetrics(0)
      : getCarouselMetrics(slot);
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
    const expandedMetrics = getExpandedMetrics(slot);

    const dropZIndex = photoReinsertActive && hasSingleFloatingCard
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
      expandedLayout: {
        x: expandedMetrics.centerX - cardWidth / 2,
        y: expandedMetrics.centerY - cardHeight / 2,
        scale: expandedMetrics.scale,
        rotate: expandedMetrics.rotate,
        opacity: expandedMetrics.opacity,
        zIndex: expandedMetrics.zIndex,
      },
    };
  };

  const computePhotoQueueInsertLayout = ({ index, slot }) => {
    const isReinsert = photoReinsertActive && hasSingleFloatingCard;
    const insertSlot = baseInsertSlots[index] ?? slot;
    const reinsertVisualOffset = reinsertRelativeOffsetBySlot.get(slot) ?? (slot - contentSlot);
    const lineRelativeOffset = getCompressedLineOffset(insertSlot, layoutAnchorSlot);
    const initialLineMetrics = isCompact
      ? getPhotoInsertStackMetrics(lineRelativeOffset, true)
      : null;
    const insertRelativeOffset = insertSlot - layoutAnchorSlot;
    const relativeOffset = isReinsert ? reinsertVisualOffset : insertRelativeOffset;
    const isMobileReinsert = isCompact && isReinsert;
    const reinsertLineRelativeOffset = reinsertVisualOffset < 0
      ? reinsertVisualOffset + 0.5
      : (
          reinsertVisualOffset > 0
            ? reinsertVisualOffset - 0.5
            : 0
        );
    const reinsertLineMetrics = isMobileReinsert
      ? getPhotoInsertStackMetrics(reinsertLineRelativeOffset, true)
      : null;
    const lineMetrics = isReinsert
      ? null
      : {
          x: initialLineMetrics ? initialLineMetrics.x : initialStartX + index * initialStep - queueCenterX,
          y: 0,
          scale: initialLineMetrics ? initialLineMetrics.scale : 1,
          rotate: initialLineMetrics ? initialLineMetrics.rotate : 0,
          opacity: initialLineMetrics ? initialLineMetrics.opacity : 1,
          shadowStrength: initialLineMetrics ? initialLineMetrics.shadowStrength : 3,
          zIndex: initialLineMetrics ? initialLineMetrics.zIndex : 1,
        };
    const insertMetrics = getPhotoInsertMetrics(relativeOffset);
    const previewMetrics = getPhotoPreviewMetrics(relativeOffset);
    const carouselMetrics = isReinsert
      ? previewMetrics
      : getCarouselMetrics(slot);
    const expandedMetrics = getExpandedMetrics(slot);
    const expandedX = expandedMetrics.centerX - queueCenterX;
    const expandedY = expandedMetrics.centerY - cardHeight / 2 - insertionAnchorY;
    const expandedLayout = {
      x: expandedX - cardWidth / 2,
      y: queueLocalOffsetY + expandedY,
      scale: expandedMetrics.scale,
      rotate: expandedMetrics.rotate,
      opacity: expandedMetrics.opacity,
      zIndex: expandedMetrics.zIndex,
    };

    const insertProgress = queueProgress;
    const effectiveLineMetrics = isMobileReinsert ? reinsertLineMetrics : lineMetrics;
    const shouldInterpolateFromLine = !isReinsert || isMobileReinsert;
    const queuedX = shouldInterpolateFromLine
      ? interpolate(effectiveLineMetrics.x, insertMetrics.x, insertProgress)
      : insertMetrics.x;
    const queuedY = shouldInterpolateFromLine
      ? interpolate(effectiveLineMetrics.y, insertMetrics.y, insertProgress)
      : insertMetrics.y;
    const queuedScale = shouldInterpolateFromLine
      ? interpolate(effectiveLineMetrics.scale, insertMetrics.scale, insertProgress)
      : insertMetrics.scale;
    const queuedRotate = shouldInterpolateFromLine
      ? interpolate(effectiveLineMetrics.rotate, insertMetrics.rotate, insertProgress)
      : insertMetrics.rotate;
    const queuedOpacity = shouldInterpolateFromLine
      ? interpolate(effectiveLineMetrics.opacity, insertMetrics.opacity, insertProgress)
      : insertMetrics.opacity;
    const previewMix = previewEase;
    const previewScaleMix = previewScaleEase;
    const shouldUseCarouselMetrics = (
      photoCarouselEnabled &&
      !photoReinsertActive &&
      previewProgress >= carouselReadyThreshold
    );
    const finalMetrics = shouldUseCarouselMetrics ? carouselMetrics : previewMetrics;
    const x = interpolate(queuedX, finalMetrics.x, previewMix);
    const y = interpolate(queuedY, finalMetrics.y, previewMix);
    const scale = interpolate(queuedScale, finalMetrics.scale, previewScaleMix);
    const rotate = interpolate(queuedRotate, finalMetrics.rotate, previewMix);
    const opacity = interpolate(queuedOpacity, finalMetrics.opacity, previewMix);
    const layerSwitchProgress = isCompact ? 0.42 : 0.04;
    const baseZIndex = shouldInterpolateFromLine && insertProgress <= layerSwitchProgress
      ? effectiveLineMetrics.zIndex
      : insertMetrics.zIndex;
    const queueZIndex = previewMix > 0.5 ? finalMetrics.zIndex : baseZIndex;
    const carouselLayout = {
      x: x - cardWidth / 2,
      y: queueLocalOffsetY + y,
      scale,
      rotate,
      opacity: queueVisibility * opacity,
      zIndex: queueZIndex,
    };
    return {
      carouselMetrics: previewMix > 0.5 ? finalMetrics : insertMetrics,
      carouselLayout,
      expandedLayout,
    };
  };

  const nextPhotoCardSlotMap = new Map();
  const selectedContent = photoSlotContentMap.get(contentSlot);
  const selectedContentCard = photoCardSlotMap.get(contentSlot) || photoSelectedSourceCard;
  const photoHitCollector = createPhotoHitRectCollector(stageRect, cardWidth, cardHeight);
  const queueCardBaseX = stageRect.width / 2;
  const cardFrames = [];
  const photoExpandedFocus = photoAllExpandedTarget > 0.5 || photoAllExpandedProgress > 0.5;
  const keyboardFocusSlot = photoCarouselEnabled && !photoExpandedFocus
    ? clampPhotoCarouselIndex(Math.round(photoCarouselVisualIndex))
    : -1;

  photoQueueCards.forEach((card, index) => {
    const slot = baseFinalSlots[index];
    const slotContent = photoSlotContentMap.get(slot);
    if (slotContent) {
      syncPhotoCardImageContent(card, slotContent);
    }
    const queueLayout = computePhotoQueueInsertLayout({ index, slot });
    const layout = resolveExpandedLayout(
      card,
      slot,
      queueLayout.carouselLayout,
      queueLayout.expandedLayout
    );

    nextPhotoCardSlotMap.set(slot, card);
    cardFrames.push({
      card,
      layout,
      data: [["photoSlot", String(slot)]],
      attributes: [
        ["role", "button"],
        ["tabindex", photoExpandedFocus || slot === keyboardFocusSlot ? "0" : "-1"],
      ],
      options: {
        filter: "",
        shadowStrength: queueLayout.carouselMetrics.shadowStrength,
        mobilePerformance: isCompact,
      },
    });
    photoHitCollector.include(
      layout,
      queueCardBaseX
    );
  });

  photoFloatingCards.forEach((card, index) => {
    const slot = insertFinalSlots[index];
    const gapSlot = insertGapSlots[index] ?? slot;
    const dropLayout = computePhotoDropLayout({ index, slot, gapSlot });
    const layout = resolveExpandedLayout(card, slot, dropLayout.carouselLayout, dropLayout.expandedLayout);

    if (hasSingleFloatingCard && selectedContent) {
      syncPhotoCardImageContent(card, selectedContent);
    }

    nextPhotoCardSlotMap.set(slot, card);
    const cardData = [
      ["photoSlot", String(slot)],
      ["photoGapSlot", String(gapSlot)],
    ];
    const cardAttributes = [
      ["role", "button"],
      ["tabindex", photoExpandedFocus || slot === keyboardFocusSlot ? "0" : "-1"],
    ];
    if (hasSingleFloatingCard) {
      cardData.push(["photoContentSlot", String(contentSlot)]);
      const sourceId = selectedContent?.sourceId ||
        selectedContentCard?.dataset.photoCloneSource ||
        selectedContentCard?.dataset.photoBase ||
        selectedContentCard?.dataset.photoInsert;
      if (sourceId) {
        cardData.push(["photoCloneSource", sourceId]);
        /* So a language switch while a clone is on screen relabels it too. */
        cardData.push(["i18nAria", "photoCardLabel"]);
      }
      const sourceLabel = selectedContent?.label || selectedContentCard?.getAttribute("aria-label");
      if (sourceLabel) {
        cardAttributes.push(["aria-label", sourceLabel]);
      }
    }
    cardFrames.push({
      card,
      layout,
      data: cardData,
      attributes: cardAttributes,
      options: {
        filter: `blur(${dropLayout.blur.toFixed(2)}px)`,
        shadowStrength: dropLayout.carouselMetrics.shadowStrength,
        cardDepth: dropLayout.cardDepth,
        shineX: dropLayout.shineX,
        mobilePerformance: isCompact,
      },
    });
    photoHitCollector.include(layout, 0);
  });

  applyPhotoCardFrames({
    cardFrames,
    hitRect: photoHitCollector.getRect(),
    slotEntries: [...nextPhotoCardSlotMap.entries()],
    selectedSourceCard: selectedContentCard || nextPhotoCardSlotMap.get(contentSlot) || photoSelectedSourceCard,
  });

  return !reduceMotion && photoSectionIsNearViewport && (
    Math.abs(photoTargetProgress - photoVisualProgress) > 0.00005 ||
    Math.abs(photoProgressVelocity) > 0.00005 ||
    ((photoCarouselEnabled || photoCarouselSettling) && Math.abs(photoCarouselTargetIndex - photoCarouselVisualIndex) > 0.001) ||
    Math.abs(photoAllExpandedTarget - photoAllExpandedProgress) > 0.001
  );
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
  return Math.min(Math.max(index, photoCarouselMinIndex), photoCarouselMaxIndex);
}

function setPhotoSelectedSlot(slot) {
  const nextSlot = clampPhotoCarouselIndex(Math.round(slot));
  photoSelectedSlot = nextSlot;
  photoSelectedSourceCard = photoCardSlotMap.get(nextSlot) || photoSelectedSourceCard;
  preloadNearbyPhotoZoomImages(nextSlot, isTouchFirst() ? 1 : 2);
}

function beginPhotoCarouselSettle(preferTarget = false) {
  if (photoCarouselCards.length === 0) {
    return;
  }

  const sourceIndex = preferTarget ? photoCarouselTargetIndex : photoCarouselVisualIndex;
  const nearestIndex = clampPhotoCarouselIndex(Math.round(sourceIndex));
  photoCarouselPreviousIndex = clampPhotoCarouselIndex(Math.round(photoCarouselVisualIndex));
  photoCarouselTransitionDirection = Math.sign(nearestIndex - photoCarouselVisualIndex);
  photoCarouselTargetIndex = nearestIndex;
  setPhotoSelectedSlot(nearestIndex);
  photoCarouselSettling = true;
  photoCarouselHasInteracted = true;
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
  photoAllExpandedLayouts.clear();
  photoCarouselCards.forEach((card) => {
    photoAllExpandedLayouts.set(card, getPhotoCardLayoutSnapshot(card));
  });
}

export function togglePhotoAllExpanded() {
  if (!photoCarouselEnabled && !photoCarouselSettling && photoAllExpandedProgress < 0.001) {
    return;
  }

  capturePhotoAllExpandedLayouts();
  photoAllExpanded = !photoAllExpanded;
  photoAllExpandedTarget = photoAllExpanded ? 1 : 0;
  photoAllExpandedProgress = photoAllExpanded ? 0 : 1;
  photoAllExpandedAnimating = true;
  photoAllExpandedAnimationStart = window.performance.now();
  photoAllExpandedAnimationDirection = photoAllExpanded ? 1 : -1;
  photoAllExpandedDuration = photoAllExpanded ? 920 : 780;
  syncPhotoShowAllButtonCopy();
  photoCarouselWheelDelta = 0;
  photoCarouselWheelDirection = 0;
  photoCarouselBoundaryDelta = 0;
  photoCarouselBoundaryDirection = 0;
  resetPhotoCarouselTouchState();
  requestPhotoSceneUpdate();
}

function canStepPhotoCarousel(direction) {
  if (!photoCarouselEnabled || !direction) {
    return false;
  }

  const target = clampPhotoCarouselIndex(photoCarouselTargetIndex);
  return direction > 0 ? target < photoCarouselMaxIndex : target > photoCarouselMinIndex;
}

function stepPhotoCarousel(direction) {
  if (!canStepPhotoCarousel(direction)) {
    return false;
  }

  photoCarouselBoundaryDelta = 0;
  photoCarouselBoundaryDirection = 0;
  photoCarouselPreviousIndex = photoCarouselTargetIndex;
  photoCarouselTargetIndex = clampPhotoCarouselIndex(photoCarouselTargetIndex + direction);
  setPhotoSelectedSlot(photoCarouselTargetIndex);
  photoCarouselTransitionDirection = direction;
  photoCarouselHasInteracted = true;
  photoCarouselSettling = false;
  requestPhotoSceneUpdate();
  return true;
}

function resetPhotoCarouselTouchState() {
  photoCarouselTouchActive = false;
  photoCarouselTouchStartedInside = false;
  photoCarouselTouchLocked = false;
  photoCarouselTouchReleasedToPage = false;
  if (photoCarouselTouchUnlockTimer) {
    window.clearTimeout(photoCarouselTouchUnlockTimer);
    photoCarouselTouchUnlockTimer = 0;
  }
}

function getPhotoCarouselHitRect() {
  if (!photoCarouselEnabled || photoCarouselCards.length === 0) {
    return null;
  }

  if (photoCarouselHitRectCache) {
    return photoCarouselHitRectCache;
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
  if (!photoCarouselEnabled || photoAllExpandedTarget > 0 || photoAllExpandedProgress > 0.01) {
    return;
  }

  if (!isPointInPhotoCarousel(event.clientX, event.clientY)) {
    photoCarouselWheelDelta = 0;
    photoCarouselWheelDirection = 0;
    photoCarouselBoundaryDelta = 0;
    photoCarouselBoundaryDirection = 0;
    return;
  }

  const absWheelX = Math.abs(event.deltaX);
  const absWheelY = Math.abs(event.deltaY);
  const horizontalIntent = absWheelX > absWheelY * 1.15;

  if (!horizontalIntent) {
    photoCarouselWheelDelta = 0;
    photoCarouselWheelDirection = 0;
    photoCarouselBoundaryDelta = 0;
    photoCarouselBoundaryDirection = 0;
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
    if (photoCarouselBoundaryDirection !== direction) {
      photoCarouselBoundaryDelta = 0;
      photoCarouselBoundaryDirection = direction;
    }

    photoCarouselBoundaryDelta += Math.abs(delta);
    photoCarouselWheelDelta = 0;
    photoCarouselWheelDirection = 0;

    if (photoCarouselBoundaryDelta >= 240) {
      photoCarouselBoundaryDelta = 0;
      photoCarouselBoundaryDirection = 0;
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  photoCarouselBoundaryDelta = 0;
  photoCarouselBoundaryDirection = 0;

  if (now - photoCarouselLastStepTime < 680) {
    return;
  }

  if (photoCarouselWheelDirection !== direction) {
    photoCarouselWheelDelta = 0;
    photoCarouselWheelDirection = direction;
  }

  photoCarouselWheelDelta += Math.abs(delta);

  if (photoCarouselWheelDelta < 52) {
    return;
  }

  stepPhotoCarousel(direction);
  photoCarouselWheelDelta = 0;
  photoCarouselLastStepTime = now;
}

export function handlePhotoCarouselTouchStart(event) {
  if (!photoCarouselEnabled || photoAllExpandedTarget > 0 || photoAllExpandedProgress > 0.01 || event.touches.length !== 1) {
    resetPhotoCarouselTouchState();
    return;
  }

  const touch = event.touches[0];

  if (!isPointInPhotoCarousel(touch.clientX, touch.clientY)) {
    resetPhotoCarouselTouchState();
    return;
  }

  photoCarouselTouchStartX = touch.clientX;
  photoCarouselTouchStartY = touch.clientY;
  photoCarouselTouchActive = true;
  photoCarouselTouchStartedInside = true;
  photoCarouselTouchLocked = false;
  photoCarouselTouchReleasedToPage = false;
}

export function handlePhotoCarouselTouchMove(event) {
  if (
    !photoCarouselEnabled ||
    photoAllExpandedTarget > 0 ||
    photoAllExpandedProgress > 0.01 ||
    !photoCarouselTouchActive ||
    !photoCarouselTouchStartedInside ||
    photoCarouselTouchReleasedToPage ||
    event.touches.length !== 1
  ) {
    return;
  }

  const touch = event.touches[0];
  const deltaX = touch.clientX - photoCarouselTouchStartX;
  const deltaY = touch.clientY - photoCarouselTouchStartY;

  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);
  const carouselIsSwitching = (
    photoCarouselSettling ||
    Math.abs(photoCarouselTargetIndex - photoCarouselVisualIndex) > 0.001
  );

  const verticalPageIntent = absY > 28 && absY > absX * 1.35;

  if (!photoCarouselTouchLocked && verticalPageIntent) {
    photoCarouselTouchReleasedToPage = true;
    if (carouselIsSwitching) {
      beginPhotoCarouselSettle(true);
    }
    return;
  }

  if (!photoCarouselTouchLocked && absX < 10 && absY < 10) {
    return;
  }

  if (!photoCarouselTouchLocked && absX < absY * 1.08) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (photoCarouselTouchLocked) {
    return;
  }

  if (absX < 24 && absY < 24) {
    return;
  }

  const direction = absX >= absY
    ? (deltaX < 0 ? 1 : -1)
    : (deltaY > 0 ? -1 : 1);

  if (!canStepPhotoCarousel(direction)) {
    photoCarouselTouchLocked = true;
    photoCarouselTouchUnlockTimer = window.setTimeout(() => {
      photoCarouselTouchLocked = false;
      photoCarouselTouchUnlockTimer = 0;
    }, 460);
    return;
  }

  photoCarouselTouchLocked = true;
  stepPhotoCarousel(direction);
  photoCarouselTouchUnlockTimer = window.setTimeout(() => {
    photoCarouselTouchLocked = false;
    photoCarouselTouchUnlockTimer = 0;
  }, 460);
}

export function handlePhotoCarouselTouchEnd(event) {
  if (!photoCarouselEnabled || photoAllExpandedTarget > 0 || photoAllExpandedProgress > 0.01 || !photoCarouselTouchActive || !photoCarouselTouchStartedInside) {
    resetPhotoCarouselTouchState();
    return;
  }

  const touch = event.changedTouches?.[0];

  if (!touch) {
    resetPhotoCarouselTouchState();
    return;
  }

  const deltaX = touch.clientX - photoCarouselTouchStartX;
  const deltaY = touch.clientY - photoCarouselTouchStartY;

  if (!photoCarouselTouchLocked && Math.abs(deltaX) >= 42 && Math.abs(deltaX) >= Math.abs(deltaY) * 1.18) {
    const direction = deltaX < 0 ? 1 : -1;
    stepPhotoCarousel(direction);
  }

  if (
    photoCarouselHasInteracted ||
    photoCarouselTouchLocked ||
    Math.abs(photoCarouselTargetIndex - photoCarouselVisualIndex) > 0.001
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
