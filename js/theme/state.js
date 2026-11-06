/* Light/dark theme state: the active theme, the transition machine, the
   participants, and applying a theme to the page. */

import { body, root } from "../core/dom.js?v=5057c320";
import { pageEvents } from "../core/events.js?v=8c4a4d4a";
import { createMachine } from "../core/machine.js?v=73a7d34e";
import { waitForFrames } from "../core/frames.js?v=0b68ae2a";
import { safeStorageGet } from "../core/storage.js?v=55891515";
import { isTouchFirst } from "../core/viewport.js?v=c7860737";

export const themeToggle = document.querySelector("#theme-toggle");
const themeColorMeta = document.querySelector('meta[name="theme-color"]');

export let activeTheme = "light";
let themeRenderFrame = 0;

/* Where a theme change stands. A transition is started by triggerThemeWave
   and always finished by it, whatever path the wave took. "lite" is a
   running transition that took the lighter snapshot path on a touch device;
   it only ever exists inside a running one, so it is a state rather than a
   second flag that could disagree with the first. */
export const themeTransition = createMachine("theme transition", {
  initial: "idle",
  states: {
    idle: { start: "running" },
    running: { enterLite: "lite", finish: "idle" },
    lite: { exitLite: "running", finish: "idle" },
  },
});

export function isThemeTransitionRunning() {
  return !themeTransition.is("idle");
}

export function isThemeTransitionLite() {
  return themeTransition.is("lite");
}

export const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
export const storageKey = "preferred-theme";

/* Sections that must hold still while the theme changes -- today only the
   career scene, whose cards are mid-scroll animation on a phone -- register a
   participant instead of the theme code calling into them:

     isBusy()                    a transition must not start yet
     prepare()                   clear leftovers before one starts
     wantsGeometryLockedWave()   needs the wave that locks geometry first
     freeze({ lockGeometry })    the transition is starting
     scheduleResume()            it is over; settle back once the wave clears
     finish()                    it is over; restore now (returns a promise)

   They are called at the moments the theme code used to call the career
   scene directly, in the same order. */
const themeTransitionParticipants = [];

export function addThemeTransitionParticipant(participant) {
  themeTransitionParticipants.push(participant);
}

export function isThemeBusy() {
  return isThemeTransitionRunning() || themeTransitionParticipants.some((participant) => participant.isBusy());
}

/* Every participant, at the moment a transition starts. */
export function prepareThemeParticipants() {
  themeTransitionParticipants.forEach((participant) => participant.prepare());
}

export function resumeThemeParticipants() {
  themeTransitionParticipants.forEach((participant) => participant.scheduleResume());
}

export function themeNeedsGeometryLockedWave() {
  return themeTransitionParticipants.some((participant) => participant.wantsGeometryLockedWave());
}

export function beginThemeTransitionContext(options = {}) {
  themeTransitionParticipants.forEach((participant) => participant.freeze(options));
  root.classList.add("theme-syncing");
}

export function endThemeTransitionContext() {
  root.classList.remove("theme-syncing");
  if (!isThemeTransitionLite() && !root.classList.contains("theme-snapshot-active")) {
    resumeThemeParticipants();
  }
}

export async function finishThemeTransitionContext() {
  root.classList.remove("theme-syncing");
  await Promise.all(themeTransitionParticipants.map((participant) => participant.finish()));
}

/* Theme-dependent rendering -- the brain's materials, the welcome canvas --
   belongs to those sections; the theme only says when. Four moments:

     theme:snapshot      inside a view transition's update callback: redraw
                         only what is on screen, because only that is captured
     theme:applied       the theme has just been applied
     theme:render-now    redraw everything now
     theme:render-frame  redraw on the next frame, cheaply where off screen

   The brain subscribes before the welcome canvas (see initApp), which is the
   order this work used to run in. */
function syncThemeSnapshotVisuals(theme) {
  pageEvents.emit("theme:snapshot", { theme });
}

function runThemeRenderWork(theme) {
  pageEvents.emit("theme:render-now", { theme });
}

export function scheduleThemeRenderWork(theme) {
  if (themeRenderFrame) {
    window.cancelAnimationFrame(themeRenderFrame);
  }

  themeRenderFrame = window.requestAnimationFrame(() => {
    themeRenderFrame = 0;
    pageEvents.emit("theme:render-frame", { theme });
  });
}

export function syncSystemChromeForTheme(theme) {
  body.style.colorScheme = theme;
  root.style.colorScheme = theme;
  const rootStyles = getComputedStyle(root);
  const themeBg = rootStyles.getPropertyValue("--bg").trim();
  const chromeBg = rootStyles.getPropertyValue("--chrome-bg").trim() || themeBg;
  themeColorMeta?.setAttribute("content", chromeBg);
}

export function applyTheme(theme, options = {}) {
  const {
    deferHeavyWork = isTouchFirst(),
    skipHeavyWork = false,
    syncSnapshotVisuals = false,
    deferSystemChrome = false,
  } = options;
  activeTheme = theme;
  /* The label says what the button does; this says which way it is set, which
     is the half a screen reader could not otherwise get. */
  themeToggle?.setAttribute("aria-pressed", `${theme === "dark"}`);
  root.classList.toggle("theme-dark", theme === "dark");
  const rootStyles = getComputedStyle(root);
  const themeBg = rootStyles.getPropertyValue("--bg").trim();
  const chromeBg = rootStyles.getPropertyValue("--chrome-bg").trim() || themeBg;
  root.style.backgroundColor = chromeBg;
  body.style.backgroundColor = chromeBg;

  if (!deferSystemChrome) {
    syncSystemChromeForTheme(theme);
  }

  if (syncSnapshotVisuals) {
    syncThemeSnapshotVisuals(theme);
  }

  if (skipHeavyWork) {
    return;
  }

  pageEvents.emit("theme:applied", { theme });

  if (deferHeavyWork) {
    scheduleThemeRenderWork(theme);
  } else {
    runThemeRenderWork(theme);
  }
}

export function getStoredTheme() {
  return safeStorageGet(storageKey);
}

function getSystemTheme() {
  return mediaQuery.matches ? "dark" : "light";
}

export function resolveTheme() {
  return getStoredTheme() || getSystemTheme();
}

export async function commitThemeState(nextTheme, options = {}) {
  beginThemeTransitionContext();
  applyTheme(nextTheme, options);
  await waitForFrames(2);
  endThemeTransitionContext();
}
