/* Preloading the photos the lightbox is likely to open next. */

import { isTouchFirst } from "../core/viewport.js?v=c7860737";
import {
  carousel,
  clampPhotoCarouselIndex,
  photoSlotContentMap,
} from "./state.js?v=9e5ef0e0";

const preloadCache = new Map();
const preloadQueue = [];
let preloadActiveCount = 0;
let preloadLastActiveSlot = 0;

export function decodePhotoZoomElement(image) {
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

export function getPhotoZoomSourceDescriptor(sourceContent) {
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

function prunePhotoZoomPreloadCache(activeSlot = preloadLastActiveSlot) {
  const decodedEntries = [...preloadCache.entries()]
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
      preloadCache.delete(key);
    });
}

function pumpPhotoZoomPreloadQueue() {
  const concurrency = getPhotoZoomPreloadConcurrency();

  while (preloadActiveCount < concurrency && preloadQueue.length > 0) {
    const preloadTask = preloadQueue.shift();
    const entry = preloadCache.get(preloadTask.key);

    if (!entry || entry.status !== "queued") {
      continue;
    }

    entry.status = "loading";
    preloadActiveCount += 1;

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
      preloadActiveCount = Math.max(0, preloadActiveCount - 1);
      pumpPhotoZoomPreloadQueue();
    });
  }
}

export function preloadPhotoZoomContent(sourceContent, priority = false, slot = null) {
  const descriptor = getPhotoZoomSourceDescriptor(sourceContent);
  const key = getPhotoZoomPreloadKey(sourceContent);

  if (!descriptor?.src || !key) {
    return;
  }

  const existingEntry = preloadCache.get(key);
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
        const queueIndex = preloadQueue.findIndex((task) => task.key === key);
        if (queueIndex > 0) {
          const [task] = preloadQueue.splice(queueIndex, 1);
          task.priority = true;
          preloadQueue.unshift(task);
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
  preloadCache.set(key, entry);

  const preloadTask = {
    key,
    priority,
    slot,
    src: descriptor.src,
    srcset: descriptor.srcset,
    sizes: descriptor.sizes,
  };

  if (priority) {
    preloadQueue.unshift(preloadTask);
  } else {
    preloadQueue.push(preloadTask);
  }

  pumpPhotoZoomPreloadQueue();
}

export function preloadNearbyPhotoZoomImages(activeSlot, radius = (isTouchFirst() ? 1 : 2)) {
  if (!Number.isFinite(activeSlot) || photoSlotContentMap.size === 0) {
    return;
  }

  const clampedActiveSlot = clampPhotoCarouselIndex(Math.round(activeSlot));
  preloadLastActiveSlot = clampedActiveSlot;
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

/* The cached image for this photo, if it has finished decoding. */
export function getDecodedPhotoZoomEntry(sourceContent) {
  const entry = preloadCache.get(getPhotoZoomPreloadKey(sourceContent));
  return entry?.status === "decoded" ? entry : null;
}
