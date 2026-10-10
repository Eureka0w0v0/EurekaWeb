/* The once-per-session intro curtain. */

import { root } from "../core/dom.js?v=5057c320";
import { isCompactLayout, shouldReduceMotion } from "../core/viewport.js?v=c7860737";
import { getActiveCopy } from "../i18n/language.js?v=651a14fb";
import { runWelcomeEntrance, welcomeSection } from "./welcome.js?v=842ffdae";

const INTRO_SEEN_KEY = "eurekaweb:intro-seen";

function hasSeenIntroThisSession() {
  try {
    return window.sessionStorage.getItem(INTRO_SEEN_KEY) === "1";
  } catch (error) {
    return false;
  }
}

function markIntroSeen() {
  try {
    window.sessionStorage.setItem(INTRO_SEEN_KEY, "1");
  } catch (error) {
    /* Storage blocked: the intro simply plays again next load. */
  }
}

/* The opening. A dark curtain with the kicker rising through it, a hairline
   drawn across the seam, then the curtain parts along that line -- one clean
   cut -- while the welcome word condenses out of dust underneath. About two
   seconds, down from three and a half.

   This replaces a title card that had no relationship to the page: "FOR YOU"
   gathered from random offsets, scattered again, then forty bars slid away on
   a linear centre-out delay with random jitter, which read as an aliased
   diamond rather than a shape, and the page underneath opened on... another
   "FOR YOU". Two things now tie the intro to what follows. The kicker in the
   overlay is a clone of the real kicker placed on its rect, so when the
   overlay fades the same letters are already there. And the dust is the
   welcome word's own crumble system run backwards, so the first thing seen
   moving is the thing the first scroll takes apart.

   Plays once per session; ?intro in the URL forces it. */
export function runIntroAnimation() {
  const overlay = document.querySelector("#intro-overlay");
  if (!overlay) {
    return Promise.resolve();
  }

  const forced = new URLSearchParams(window.location.search).has("intro");
  if (shouldReduceMotion() || (hasSeenIntroThisSession() && !forced)) {
    overlay.remove();
    return Promise.resolve();
  }

  const textContainer = overlay.querySelector("#intro-text");
  const seam = overlay.querySelector(".intro-seam");
  const kicker = welcomeSection?.querySelector(".welcome-kicker") || null;

  return new Promise((resolve) => {
    const isCompact = isCompactLayout();
    const stagger = isCompact ? 32 : 38;
    const partDuration = isCompact ? 700 : 820;
    overlay.style.setProperty("--intro-part", `${partDuration}ms`);

    /* Anchor on the real kicker when it is on screen at load. A reload that
       restored a mid-page scroll position has nothing to anchor to, so the
       letters centre instead and the overlay simply fades. */
    const kickerRect = kicker?.getBoundingClientRect();
    const anchored = Boolean(
      kicker &&
        kickerRect &&
        kickerRect.width > 0 &&
        kickerRect.top >= 0 &&
        kickerRect.bottom <= window.innerHeight
    );

    let host;
    if (anchored) {
      host = kicker.cloneNode(false);
      host.removeAttribute("id");
      host.removeAttribute("data-i18n");
      host.style.left = `${kickerRect.left}px`;
      host.style.top = `${kickerRect.top}px`;
      host.style.width = `${kickerRect.width}px`;
      host.style.height = `${kickerRect.height}px`;
      textContainer.classList.add("is-anchored");
    } else {
      host = document.createElement("p");
      host.className = "welcome-kicker";
    }
    host.classList.add("intro-kicker");

    const text = (kicker?.textContent || getActiveCopy().welcomeKicker || "").trim();
    Array.from(text).forEach((char, index) => {
      const span = document.createElement("span");
      span.className = "intro-letter";
      span.textContent = char === " " ? "\u00a0" : char;
      span.style.setProperty("--delay", `${120 + index * stagger}ms`);
      host.appendChild(span);
    });
    textContainer.replaceChildren(host);

    root.classList.add("intro-active");

    const at = (ms, fn) => window.setTimeout(fn, ms);
    const seamAt = 860;
    const partAt = seamAt + 220;
    const doneAt = partAt + partDuration;

    window.requestAnimationFrame(() => {
      textContainer.classList.add("is-rising");
    });

    at(seamAt, () => {
      seam?.classList.add("is-drawn");
    });

    at(partAt, () => {
      overlay.classList.add("is-parting");
    });

    /* The panels barely move for their first quarter -- that is the tension
       before the cut -- so the dust would be condensing behind them unseen if
       it started with them. */
    at(partAt + 240, () => {
      runWelcomeEntrance(isCompact ? 880 : 1000);
    });

    at(doneAt, () => {
      overlay.classList.add("is-done");
      markIntroSeen();

      at(260, () => {
        overlay.remove();
        root.classList.remove("intro-active");
        resolve();
      });
    });
  });
}
