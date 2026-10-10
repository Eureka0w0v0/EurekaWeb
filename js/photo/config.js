/* The drop-in's timing and spacing, in progress units and pixels. */

import { clamp01 } from "../core/math.js?v=54e566c4";

export const PHOTO_INTRO_PHASES = {
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
export const PHOTO_QUEUE_REVEAL_DROP_PROGRESS = {
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
export const PHOTO_TITLE_DURATION_RATIO = 1.02;
const PHOTO_TITLE_FADE_OUT_PROGRESS = 0.94;
export const PHOTO_AFTER_COMPLETE_SCROLL_PX = 50;
export const PHOTO_DROP_EXTRA_DISTANCE_PX = {
  desktop: 220,
  mobile: 280,
};
export const PHOTO_QUEUE_VISUAL_LIFT_PX = {
  desktop: 250,
  mobile: 290,
};
export const PHOTO_SECTION_EXTRA_HEIGHT_PX = {
  desktop: 520,
  mobile: 620,
};
export const getPhotoTitleStartRatio = (isCompact) => (isCompact ? 0.6 : 0.34);
export const getPhotoDropStartProgress = (isCompact) => {
  const durationVh = isCompact
    ? PHOTO_INTRO_PHASES.mobileRawDurationVh
    : PHOTO_INTRO_PHASES.rawDurationVh;
  const titleStartRatio = getPhotoTitleStartRatio(isCompact);

  return clamp01(
    (0.72 - titleStartRatio + PHOTO_TITLE_FADE_OUT_PROGRESS * PHOTO_TITLE_DURATION_RATIO) /
      durationVh
  );
};

export const DESKTOP_CENTER_SCALE = 1.54;
