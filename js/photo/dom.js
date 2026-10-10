/* The photo theatre's elements. */
export const photoSection = document.querySelector("#photo-section");
export const photoFixedTitle = document.querySelector(".photo-fixed-title");
export const photoStage = document.querySelector(".photo-stage");
export const photoQueueAnchor = document.querySelector(".photo-queue");
export const photoShowAllButton = document.querySelector("#photo-show-all");
export const photoFloatingCards = document.querySelectorAll(".photo-floating-card");
export const photoQueueCards = document.querySelectorAll(".photo-queue-card");
export const photoCarouselCards = [...photoQueueCards, ...photoFloatingCards];
export const photoZoomOverlay = document.querySelector("#photo-zoom-overlay");
export const photoZoomImage = document.querySelector("#photo-zoom-image");
export const photoZoomCloseButton = document.querySelector("#photo-zoom-close");
export const photoZoomLoading = document.querySelector("#photo-zoom-loading");
