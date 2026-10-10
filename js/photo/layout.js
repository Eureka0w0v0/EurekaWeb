/* Where each card goes: pure layout math over the per-frame context. */

import {
  clamp01,
  cubicBezierValue,
  easeInOut,
  easeOutCubic,
  interpolate,
  interpolateStops,
  mapScrollSegment,
  smootherStep,
} from "../core/math.js?v=54e566c4";
import { shouldReduceMotion } from "../core/viewport.js?v=c7860737";
import {
  DESKTOP_CENTER_SCALE,
  PHOTO_INTRO_PHASES,
  PHOTO_QUEUE_REVEAL_DROP_PROGRESS,
  getPhotoDropStartProgress,
} from "./config.js?v=0c53704a";
import { photoFloatingCards, photoQueueAnchor, photoQueueCards } from "./dom.js?v=64ce044a";
import { carousel, expand, isExpandAnimating } from "./state.js?v=b4cbf01b";

let photoLayoutMetricsCache = null;

export function getPhotoLayoutMetrics(isCompact, viewportWidth) {
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

export function computePhotoRawProgress(rect, viewportHeight, isCompact = false) {
  const photoIntroStartY = viewportHeight * 0.72;
  const durationVh = isCompact
    ? PHOTO_INTRO_PHASES.mobileRawDurationVh
    : PHOTO_INTRO_PHASES.rawDurationVh;

  return {
    photoIntroStartY,
    rawProgress: (photoIntroStartY - rect.top) / (viewportHeight * durationVh),
  };
}

export function computePhotoPhaseFrame({
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
export function getPhotoPreviewMetrics(frame, relativeOffset) {
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
export function getPhotoInsertMetrics(frame, relativeOffset) {
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
export function getCarouselMetrics(
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

/* Cards further from the active one start their Show All move later. */
function getExpandedDelay(frame, slot) {
  const { activeSlot, expandedColumns, isCompact } = frame;
  const distanceDelay = Math.abs(slot - activeSlot) * (isCompact ? 26 : 32);
  const orderDelay = Math.abs((slot % expandedColumns) - (activeSlot % expandedColumns)) * 5;
  return Math.min(isCompact ? 210 : 260, distanceDelay + orderDelay);
}

/* A card between its carousel and grid layouts at the current Show All progress. */
export function resolveExpandedLayout(frame, card, slot, carouselLayout, expandedLayout) {
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
export function getPhotoDropPathFrame(frame, { index, gapSlot = frame.centerInsertSlot }) {
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

/* A floating card's Show All cell, in stage coordinates. */
export function getFloatingExpandedLayout(frame, slot) {
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
export function getQueueLineMetrics(frame, { index, insertSlot, isReinsert, reinsertVisualOffset }) {
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
export function blendMetrics(from, to, t) {
  return {
    x: interpolate(from.x, to.x, t),
    y: interpolate(from.y, to.y, t),
    scale: interpolate(from.scale, to.scale, t),
    rotate: interpolate(from.rotate, to.rotate, t),
    opacity: interpolate(from.opacity, to.opacity, t),
  };
}

/* A queue card's Show All cell, relative to the queue. */
export function getQueueExpandedLayout(frame, slot) {
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
