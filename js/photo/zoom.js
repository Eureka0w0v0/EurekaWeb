/* The lightbox. */

import { root } from "../core/dom.js?v=5057c320";
import { waitForNextAnimationFrame } from "../core/frames.js?v=0b68ae2a";
import { setAttributeIfChanged } from "../core/style-writes.js?v=d4be61ed";
import { isTouchFirst, stableMobileAppHeight } from "../core/viewport.js?v=c7860737";
import {
  photoZoomCloseButton,
  photoZoomImage,
  photoZoomLoading,
  photoZoomOverlay,
} from "./dom.js?v=64ce044a";
import {
  decodePhotoZoomElement,
  getDecodedPhotoZoomEntry,
  getPhotoZoomSourceDescriptor,
  preloadNearbyPhotoZoomImages,
} from "./preload.js?v=71d12224";
import {
  carousel,
  clampPhotoCarouselIndex,
  isPhotoZoomOpen,
  requestPhotoSceneUpdate,
  zoom,
} from "./state.js?v=9e5ef0e0";

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
  const cachedZoom = getDecodedPhotoZoomEntry(sourceContent);

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

  if (cachedZoom) {
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

/* True when the key was the lightbox's to handle.

   aria-modal="true" tells a screen reader that nothing outside the dialog
   exists, so Tab leaving it puts the two in disagreement: focus lands on
   something the user has just been told is not there. The dialog holds
   exactly one focusable element, so trapping is simply keeping it. */
export function handlePhotoZoomKeydown(event) {
  if (!isPhotoZoomOpen()) {
    return false;
  }

  if (event.key === "Escape") {
    closePhotoZoom();
    return true;
  }

  if (event.key === "Tab") {
    event.preventDefault();
    photoZoomCloseButton?.focus({ preventScroll: true });
    return true;
  }

  return false;
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
