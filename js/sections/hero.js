/* The hero: parallax, the tilt card and the magnetic heading. */

import { pageEvents } from "../core/events.js?v=8c4a4d4a";
import { clamp01 } from "../core/math.js?v=54e566c4";
import { isWideLayout, shouldReduceMotion } from "../core/viewport.js?v=c7860737";

const tiltCard = document.querySelector("#feature-card");
const heroSection = document.querySelector("[data-hero-section]");
const heroCopy = document.querySelector("[data-hero-copy]");
const heroVisual = document.querySelector("[data-hero-visual]");
let heroParallaxFrame = 0;

export function updateHeroParallax() {
  const desktopBoost = isWideLayout() ? 1.55 : 1;
  if (heroSection && heroCopy && heroVisual) {
    const heroRect = heroSection.getBoundingClientRect();
    const heroProgress = clamp01((window.innerHeight - heroRect.top) / (window.innerHeight * 1.2));
    const heroDepth = heroProgress - 0.4;
    const heroCopyShift = heroDepth * -48 * desktopBoost;
    const heroVisualShift = heroDepth * 42 * desktopBoost;
    const heroCopyScale = 1 - heroProgress * (isWideLayout() ? 0.05 : 0.03);
    const heroVisualScale = 1 + heroProgress * (isWideLayout() ? 0.04 : 0.025);

    heroCopy.style.transform =
      `translate3d(0, ${heroCopyShift}px, 0) scale(${heroCopyScale})`;
    heroCopy.style.opacity = `${0.75 + (1 - heroProgress) * 0.25}`;
    heroVisual.style.transform =
      `translate3d(0, ${heroVisualShift}px, 0) scale(${heroVisualScale})`;
  }
}

export function requestHeroParallaxUpdate() {
  if (heroParallaxFrame) {
    return;
  }

  heroParallaxFrame = window.requestAnimationFrame(() => {
    updateHeroParallax();
    heroParallaxFrame = 0;
  });
}

function applyTilt(event) {
  if (!tiltCard || !isWideLayout() || event.pointerType !== "mouse") {
    return;
  }

  const bounds = tiltCard.getBoundingClientRect();
  const tiltHitSlop = 24;
  const isInsideTiltArea = (
    event.clientX >= bounds.left - tiltHitSlop &&
    event.clientX <= bounds.right + tiltHitSlop &&
    event.clientY >= bounds.top - tiltHitSlop &&
    event.clientY <= bounds.bottom + tiltHitSlop
  );

  if (!isInsideTiltArea) {
    resetTilt();
    return;
  }

  const rotateY = ((event.clientX - bounds.left) / bounds.width - 0.5) * 14;
  const rotateX = ((event.clientY - bounds.top) / bounds.height - 0.5) * -14;

  tiltCard.style.transform = `perspective(1100px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
}

export function bindTiltReactions() {
  pageEvents.on("pointer:frame", applyTilt);
  tiltCard?.addEventListener("mouseleave", resetTilt);
}

function resetTilt() {
  if (tiltCard) {
    tiltCard.style.transform = "perspective(1100px) rotateX(0deg) rotateY(0deg)";
  }
}

/* ═══════════════════════════════════════════════════════════════
   Magnetic hero heading
   ═══════════════════════════════════════════════════════════════ */

const MAGNET_RADIUS = 280;
const magnetChars = [];
let magnetFrame = 0;
let magnetPointerX = -99999;
let magnetPointerY = -99999;
let magnetActive = false;

function supportsMagneticHeading() {
  return (
    window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
    !shouldReduceMotion()
  );
}

/* Positions are captured once, with every glyph at rest, and kept in page
   coordinates, so that a frame never has to read layout back. Subtracting
   scroll each frame keeps them correct.

   Since the effect became stroke-only these positions are also stable by
   construction -- stroke does not change advance width, so a glyph under the
   pointer no longer moves itself or anything after it. Clearing the stroke
   before measuring is belt-and-braces for the case where a rebuild lands
   mid-effect. */
export function measureMagnetChars() {
  for (let i = 0; i < magnetChars.length; i += 1) {
    magnetChars[i].el.style.webkitTextStrokeWidth = "";
  }

  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  for (let i = 0; i < magnetChars.length; i += 1) {
    const rect = magnetChars[i].el.getBoundingClientRect();
    magnetChars[i].pageX = rect.left + rect.width / 2 + scrollX;
    magnetChars[i].pageY = rect.top + rect.height / 2 + scrollY;
  }
}

function renderMagnetFrame() {
  magnetFrame = 0;

  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  for (let i = 0; i < magnetChars.length; i += 1) {
    const char = magnetChars[i];
    const dx = char.pageX - scrollX - magnetPointerX;
    const dy = char.pageY - scrollY - magnetPointerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const linear = Math.max(0, 1 - distance / MAGNET_RADIUS);
    const influence = linear * linear * (3 - 2 * linear);

    /* Stroke only, deliberately. This used to also sweep font-weight 300..900,
       which was the whole bug: weight changes a glyph's advance width, every
       char is inline-block, so each one that thickened widened and shoved its
       neighbours along. With the pointer moving, the entire heading reflowed
       continuously -- measured at 76px -> 83px for a single char going 300 ->
       700. The old comment called that sideways nudge "the magnetic push";
       on screen it reads as the line coming apart.

       Stroke is the right lever anyway. It thickens outward from the glyph
       outline and leaves the advance width untouched, so nothing reflows, and
       unlike weight it works on every script here -- weight needs a variable
       face, so CJK falling back to static PingFang ignored it entirely and
       only ever got the stroke. Losing weight costs Latin a little contrast,
       which is what the raised ceiling below pays back.

       Neither property disturbs the line box, which still matters: the heading
       runs 96px on a ~0.92 line-height and the two lines already touch at
       rest, so any vertical growth would drive line one into line two. */
    char.el.style.webkitTextStrokeWidth = `${(influence * 2.4).toFixed(2)}px`;
  }
}

function requestMagnetFrame() {
  if (magnetFrame || !magnetChars.length) {
    return;
  }

  magnetFrame = window.requestAnimationFrame(renderMagnetFrame);
}

function handleMagnetPointerMove(event) {
  magnetPointerX = event.clientX;
  magnetPointerY = event.clientY;
  requestMagnetFrame();
}

function releaseMagnet() {
  magnetPointerX = -99999;
  magnetPointerY = -99999;
  requestMagnetFrame();
}

/* Called after every language switch: applyLanguage writes textContent, which
   destroys the per-character spans. */
export function bindHeroReactions() {
  /* The kinetic pass rewrites each node's children, detaching the
     per-character spans. Drop the references before it starts so the pointer
     loop is not writing styles into orphaned nodes for the length of the
     animation, and rebuild once it is over. The instant path has no kinetic
     pass, so it rebuilds straight away. */
  pageEvents.on("language:will-change", () => {
    magnetChars.length = 0;
  });
  pageEvents.on("language:change", ({ animated }) => {
    if (!animated) {
      buildMagneticHeading();
    }
  });
  pageEvents.on("language:did-change", () => {
    buildMagneticHeading();
  });
}

function buildMagneticHeading() {
  const heading = document.querySelector(".hero-copy h1");

  magnetChars.length = 0;

  if (!heading) {
    return;
  }

  if (!supportsMagneticHeading()) {
    heading.classList.remove("has-magnet");
    return;
  }

  /* From the stored source, not the live textContent. A previous build turned
     the "\n" into <br> elements, whose textContent is empty, so reading the
     DOM back would silently collapse the hero's two lines into one. Both call
     sites happen to rewrite textContent first, which makes this a trap rather
     than a live bug -- but it is a trap that fires the first time someone
     calls this twice. */
  const text = heading.dataset.magnetSource ?? heading.textContent;
  heading.dataset.magnetSource = text;
  const fragment = document.createDocumentFragment();

  /* Characters are grouped into word wrappers before being made inline-block.
     Without the wrapper every glyph becomes its own break opportunity and the
     browser happily wraps mid-word — "Hello I'm" split after the apostrophe. */
  let word = null;

  const closeWord = () => {
    word = null;
  };

  for (const character of text) {
    if (character === "\n") {
      closeWord();
      fragment.appendChild(document.createElement("br"));
      continue;
    }

    if (character === " ") {
      closeWord();
      fragment.appendChild(document.createTextNode(" "));
      continue;
    }

    if (!word) {
      word = document.createElement("span");
      word.className = "magnet-word";
      fragment.appendChild(word);
    }

    const span = document.createElement("span");
    span.className = "magnet-char";
    span.textContent = character;
    word.appendChild(span);
    magnetChars.push({ el: span, pageX: 0, pageY: 0 });
  }

  heading.textContent = "";
  heading.appendChild(fragment);
  heading.classList.add("has-magnet");
  measureMagnetChars();

  if (!magnetActive) {
    magnetActive = true;
    window.addEventListener("pointermove", handleMagnetPointerMove, { passive: true });
    document.addEventListener("pointerleave", releaseMagnet, { passive: true });
  }
}
