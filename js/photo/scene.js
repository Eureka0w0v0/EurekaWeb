/* updatePhotoScene: the per-frame pipeline that lays out and draws the theatre. */

import { clamp01, easeInOut, easeOutCubic, interpolate } from "../core/math.js?v=54e566c4";
import {
  isCompactLayout,
  shouldReduceMotion,
  stableMobileAppHeight,
} from "../core/viewport.js?v=c7860737";
import {
  applyPhotoCardFrames,
  applyPhotoQueueAnchorFrame,
  applyPhotoQueueIntroFrame,
  applyPhotoSectionScrollHeight,
  applyPhotoShowAllFrame,
  applyPhotoTitleFrame,
  createPhotoHitRectCollector,
  ensurePhotoSlotContentMap,
  syncPhotoCardImageContent,
} from "./cards.js?v=f9b5c68e";
import {
  clearCarouselWheelState,
  resetPhotoCarouselTouchState,
  setPhotoSelectedSlot,
} from "./carousel.js?v=1d3e910b";
import {
  PHOTO_DROP_EXTRA_DISTANCE_PX,
  PHOTO_INTRO_PHASES,
  PHOTO_QUEUE_VISUAL_LIFT_PX,
  PHOTO_TITLE_DURATION_RATIO,
  getPhotoDropStartProgress,
  getPhotoTitleStartRatio,
} from "./config.js?v=0c53704a";
import {
  photoCarouselCards,
  photoFixedTitle,
  photoFloatingCards,
  photoQueueAnchor,
  photoQueueCards,
  photoSection,
  photoStage,
} from "./dom.js?v=64ce044a";
import {
  blendMetrics,
  computePhotoPhaseFrame,
  computePhotoRawProgress,
  getCarouselMetrics,
  getFloatingExpandedLayout,
  getPhotoDropPathFrame,
  getPhotoInsertMetrics,
  getPhotoLayoutMetrics,
  getPhotoPreviewMetrics,
  getQueueExpandedLayout,
  getQueueLineMetrics,
  resolveExpandedLayout,
} from "./layout.js?v=c9fe971e";
import {
  carousel,
  clampPhotoCarouselIndex,
  expand,
  expandTarget,
  isCarouselEnabled,
  isCarouselReinserting,
  isCarouselSettling,
  isExpandAnimating,
  isExpandTargeted,
  photoCardSlotMap,
  photoSlotContentMap,
  progressState,
  setPhotoSceneUpdater,
} from "./state.js?v=b4cbf01b";
import { preloadNearbyPhotoZoomImages } from "./zoom.js?v=c883e1e6";

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

/* Show All's progress along its eased animation. With reduced motion there
   is no animation: the toggle lands in the frame that draws it. (It used to
   run the 920ms clock anyway, and no further frames are requested under
   reduced motion, so the cards stayed where they were until a scroll.) */
function advanceExpandAnimation(frame) {
  const { reduceMotion, timestamp } = frame;
  if (isExpandAnimating()) {
    const rawAnimationProgress = reduceMotion
      ? 1
      : clamp01((timestamp - expand.animationStart) / expand.duration);
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

/* The queue's anchor element, which bounds where the cards may be hit. */
function applyPhotoQueueAnchor(frame) {
  const { cardHeight, queueProgress, viewportHeight } = frame;
  const queueBleed = Math.min(Math.max(viewportHeight * 0.14, 96), 160);

  applyPhotoQueueAnchorFrame({ cardHeight, queueBleed, queueProgress });
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

/* Whether anything is still moving and another frame is needed.

   A Show All animation counts until its own last frame has run. Its eased
   progress is within 0.001 of the end from 90% of the duration on, so going
   by progress alone stopped the frames there: the machine stayed in
   "expanding", the cards kept their animation snapshots, and the staggered
   cards stopped short of the grid. */
function photoSceneNeedsAnotherFrame(frame) {
  const { photoSectionIsNearViewport, reduceMotion } = frame;
  return !reduceMotion && photoSectionIsNearViewport && (
    Math.abs(progressState.target - progressState.visual) > 0.00005 ||
    Math.abs(progressState.velocity) > 0.00005 ||
    ((isCarouselEnabled() || isCarouselSettling()) && Math.abs(carousel.targetIndex - carousel.visualIndex) > 0.001) ||
    isExpandAnimating() ||
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

setPhotoSceneUpdater(updatePhotoScene);
