/* Clicks, keys and hovers on the cards: open a photo, or step to it. */

import { readPhotoCardContent } from "./cards.js?v=f9b5c68e";
import { navigatePhotoCarouselToSlot } from "./carousel.js?v=1d3e910b";
import { photoShowAllButton, photoStage } from "./dom.js?v=64ce044a";
import {
  carousel,
  clampPhotoCarouselIndex,
  expand,
  expandTarget,
  isCarouselEnabled,
  isPhotoZoomOpen,
  photoCardSlotMap,
  photoSlotContentMap,
  zoom,
} from "./state.js?v=b4cbf01b";
import { openPhotoZoom, preloadPhotoZoomContent } from "./zoom.js?v=c883e1e6";

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
