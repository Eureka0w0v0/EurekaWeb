/* The photo theatre's public face. Everything outside js/photo/ goes through
   here, and tools/check-site.py enforces that. */

import { initPhotoQueueCards } from "./cards.js?v=d3ea5c57";
import {
  handlePhotoCarouselTouchEnd,
  handlePhotoCarouselTouchMove,
  handlePhotoCarouselTouchStart,
  handlePhotoCarouselWheel,
} from "./carousel.js?v=df4fe182";
import {
  photoSection,
  photoShowAllButton,
  photoStage,
  photoZoomCloseButton,
  photoZoomOverlay,
} from "./dom.js?v=64ce044a";
import { togglePhotoAllExpanded } from "./expand.js?v=0c2baa79";
import { initPhotoCardHoverGlow } from "./hover-glow.js?v=a03d1150";
import {
  handlePhotoCardKeydown,
  handlePhotoMainCardClick,
  handlePhotoMainCardPointerPreload,
  handlePhotoMainCardTouchPreload,
} from "./interaction.js?v=bdca3b3b";
import {
  handlePhotoZoomClosePointerDown,
  handlePhotoZoomOverlayPointerDown,
  stopPhotoZoomScroll,
} from "./zoom.js?v=1e10b972";

export { bindPhotoReactions } from "./expand.js?v=0c2baa79";
export { invalidatePhotoLayoutCaches } from "./layout.js?v=87da4d8f";
export { updatePhotoScene } from "./scene.js?v=223cd557";
export { cancelPhotoSceneFrame, requestPhotoSceneUpdate } from "./state.js?v=00213f2e";
export { handlePhotoZoomKeydown } from "./zoom.js?v=1e10b972";

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
