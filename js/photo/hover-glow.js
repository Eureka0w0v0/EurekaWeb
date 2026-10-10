/* The glow that follows the pointer across a photo card. */

import { isTouchFirst } from "../core/viewport.js?v=71b5eb94";

/* ═══════════════════════════════════════════════════════════════
   Effect 3: Photo Card Hover Glow (JS portion)
   ═══════════════════════════════════════════════════════════════ */

export function initPhotoCardHoverGlow() {
  if (isTouchFirst()) return; /* No cursor tracking on touch devices */
  const stage = document.querySelector(".photo-stage");
  if (!stage) return;

  /* Inject glow overlay divs into every photo card that doesn't already have one */
  const cards = stage.querySelectorAll(".photo-card");
  cards.forEach((card) => {
    if (card.querySelector(".photo-card-hover-glow")) return;
    const glow = document.createElement("div");
    glow.className = "photo-card-hover-glow";
    glow.setAttribute("aria-hidden", "true");
    card.appendChild(glow);
  });

  /* Track mouse position to update CSS vars on the hovered card.

     Coalesced into a frame rather than run per event. A mouse can report well
     over a hundred moves a second, and each one read a rect off a card that
     updatePhotoScene had just written a transform to -- a forced layout every
     time, on the one element guaranteed to be dirty. Reading in the frame
     costs at most one, and the glow cannot be seen more often than that. */
  let glowEvent = null;
  let glowFrame = 0;

  const applyGlow = () => {
    glowFrame = 0;
    const e = glowEvent;
    glowEvent = null;
    if (!e) return;

    const card = e.target.closest(".photo-card");
    if (!card || !card.isConnected) return;

    const rect = card.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    card.style.setProperty("--hover-x", x + "%");
    card.style.setProperty("--hover-y", y + "%");
  };

  stage.addEventListener(
    "mousemove",
    (e) => {
      glowEvent = e;
      if (!glowFrame) {
        glowFrame = requestAnimationFrame(applyGlow);
      }
    },
    { passive: true }
  );
}
