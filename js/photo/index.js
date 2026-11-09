/* The photo theatre's public face. Everything outside js/photo/ goes through
   here, and tools/check-site.py enforces that. */

import { initPhotoQueueCards } from "./cards.js?v=0372ff7b";
import {
  handlePhotoCarouselTouchEnd,
  handlePhotoCarouselTouchMove,
  handlePhotoCarouselTouchStart,
  handlePhotoCarouselWheel,
} from "./carousel.js?v=9d3c42d5";
import {
  photoSection,
  photoShowAllButton,
  photoStage,
  photoZoomCloseButton,
  photoZoomOverlay,
} from "./dom.js?v=64ce044a";
import { togglePhotoAllExpanded } from "./expand.js?v=220ee585";
import { initPhotoCardHoverGlow } from "./hover-glow.js?v=a03d1150";
import {
  handlePhotoCardKeydown,
  handlePhotoMainCardClick,
  handlePhotoMainCardPointerPreload,
  handlePhotoMainCardTouchPreload,
} from "./interaction.js?v=e16ffc55";
import {
  handlePhotoZoomClosePointerDown,
  handlePhotoZoomOverlayPointerDown,
  stopPhotoZoomScroll,
} from "./zoom.js?v=40b9a5bf";

export { bindPhotoReactions } from "./expand.js?v=220ee585";
export { invalidatePhotoLayoutCaches } from "./layout.js?v=9b3638be";
export { updatePhotoScene } from "./scene.js?v=ca7e5c71";
export { cancelPhotoSceneFrame, requestPhotoSceneUpdate } from "./state.js?v=9e5ef0e0";
export { handlePhotoZoomKeydown } from "./zoom.js?v=40b9a5bf";

/* All on the theatre's own elements, so none of it shares a target with the
   page-wide listeners in main.js. Listeners on one element keep their order. */
function wirePhotoGestures() {
  photoStage?.addEventListener("pointerover", handlePhotoMainCardPointerPreload);
  photoStage?.addEventListener("touchstart", handlePhotoMainCardTouchPreload, { passive: true });
  photoStage?.addEventListener("click", handlePhotoMainCardClick);
  photoStage?.addEventListener("keydown", handlePhotoCardKeydown);
  photoZoomCloseButton?.addEventListener("pointerdown", handlePhotoZoomClosePointerDown);
  photoZoomCloseButton?.addEventListener("mousedown", handlePhotoZoomClosePointerDown);
  photoZoomCloseButton?.addEventListener("touchstart", handlePhotoZoomClosePointerDown, { passive: false });
  photoZoomCloseButton?.addEventListener("click", handlePhotoZoomClosePointerDown);
  photoZoomOverlay?.addEventListener("pointerdown", handlePhotoZoomOverlayPointerDown);
  photoZoomOverlay?.addEventListener("mousedown", handlePhotoZoomOverlayPointerDown);
  photoZoomOverlay?.addEventListener("touchstart", handlePhotoZoomOverlayPointerDown, { passive: false });
  photoZoomOverlay?.addEventListener("click", handlePhotoZoomOverlayPointerDown);
  photoZoomOverlay?.addEventListener("wheel", stopPhotoZoomScroll, { passive: false });
  photoZoomOverlay?.addEventListener("touchmove", stopPhotoZoomScroll, { passive: false });
  photoShowAllButton?.addEventListener("click", togglePhotoAllExpanded);
  photoSection?.addEventListener("wheel", handlePhotoCarouselWheel, { passive: false, capture: true });
  photoSection?.addEventListener("touchstart", handlePhotoCarouselTouchStart, { passive: true, capture: true });
  photoSection?.addEventListener("touchmove", handlePhotoCarouselTouchMove, { passive: false, capture: true });
  photoSection?.addEventListener("touchend", handlePhotoCarouselTouchEnd, { passive: true, capture: true });
  photoSection?.addEventListener("touchcancel", handlePhotoCarouselTouchEnd, { passive: true, capture: true });
}

export function initPhotoTheatre() {
  initPhotoQueueCards();
  wirePhotoGestures();
  initPhotoCardHoverGlow();
}
