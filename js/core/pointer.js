/* Pointer moves, coalesced to one pointer:frame per animation frame. */

import { pageEvents } from "./events.js?v=8c4a4d4a";

let pointerMoveFrame = 0;
let lastPointerMoveEvent = null;

/* Pointer moves are coalesced to one pass per frame and handed, as
   pointer:frame, to every section that reacts to the pointer: the hero's tilt
   card first, then the language universe's parallax. */
export function handlePointerMove(event) {
  lastPointerMoveEvent = event;
  if (pointerMoveFrame) {
    return;
  }

  pointerMoveFrame = window.requestAnimationFrame(() => {
    pointerMoveFrame = 0;
    pageEvents.emit("pointer:frame", lastPointerMoveEvent);
  });
}
