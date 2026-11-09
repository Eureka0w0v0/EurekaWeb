/* Show All: toggling between the carousel and the grid. */

import { pageEvents } from "../core/events.js?v=8c4a4d4a";
import { getPhotoCardLayoutSnapshot, syncPhotoShowAllButtonCopy } from "./cards.js?v=0372ff7b";
import { clearCarouselWheelState, resetPhotoCarouselTouchState } from "./carousel.js?v=9d3c42d5";
import { photoCarouselCards } from "./dom.js?v=64ce044a";
import {
  expand,
  isCarouselEnabled,
  isCarouselSettling,
  requestPhotoSceneUpdate,
} from "./state.js?v=9e5ef0e0";

export function bindPhotoReactions() {
  pageEvents.on("language:change", () => {
    syncPhotoShowAllButtonCopy();
  });
}

function capturePhotoAllExpandedLayouts() {
  expand.layouts.clear();
  photoCarouselCards.forEach((card) => {
    expand.layouts.set(card, getPhotoCardLayoutSnapshot(card));
  });
}

export function togglePhotoAllExpanded() {
  if (!isCarouselEnabled() && !isCarouselSettling() && expand.progress < 0.001) {
    return;
  }

  capturePhotoAllExpandedLayouts();
  expand.phase.send("toggle");
  const expanding = expand.phase.is("expanding");
  expand.progress = expanding ? 0 : 1;
  expand.animationStart = window.performance.now();
  expand.duration = expanding ? 920 : 780;
  syncPhotoShowAllButtonCopy();
  clearCarouselWheelState();
  resetPhotoCarouselTouchState();
  requestPhotoSceneUpdate();
}
