/* The lightbox, and preloading the photos it is likely to open next. */

import { root } from "../core/dom.js?v=5057c320";
import { waitForNextAnimationFrame } from "../core/frames.js?v=0b68ae2a";
import { setAttributeIfChanged } from "../core/style-writes.js?v=d4be61ed";
import { isTouchFirst, stableMobileAppHeight } from "../core/viewport.js?v=71b5eb94";
import {
  photoZoomCloseButton,
  photoZoomImage,
  photoZoomLoading,
  photoZoomOverlay,
} from "./dom.js?v=64ce044a";
import {
  carousel,
  clampPhotoCarouselIndex,
  isPhotoZoomOpen,
  photoSlotContentMap,
  requestPhotoSceneUpdate,
  zoom,
} from "./state.js?v=b4cbf01b";

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

export function preloadPhotoZoomContent(sourceContent, priority = false, slot = null) {
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

export function preloadNearbyPhotoZoomImages(activeSlot, radius = (isTouchFirst() ? 1 : 2)) {
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

export function openPhotoZoom(sourceContent) {
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
