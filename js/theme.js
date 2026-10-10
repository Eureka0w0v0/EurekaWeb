/* Light/dark theme: state, the transition waves, and the participant hooks. */

import { body, root } from "./core/dom.js?v=5057c320";
import { pageEvents } from "./core/events.js?v=8c4a4d4a";
import { createMachine } from "./core/machine.js?v=73a7d34e";
import { waitForFrames, waitMilliseconds } from "./core/frames.js?v=0b68ae2a";
import { safeStorageGet } from "./core/storage.js?v=55891515";
import { isTouchFirst } from "./core/viewport.js?v=71b5eb94";

export const themeToggle = document.querySelector("#theme-toggle");
export const themeWave = document.querySelector(".theme-wave");
const themeWaveCore = document.querySelector(".theme-wave-core");
const themeColorMeta = document.querySelector('meta[name="theme-color"]');

const themeWaveConfig = {
  EXPAND_DURATION_MS: 560,
  FADE_DURATION_MS: 180,
  EXPAND_EASING: "cubic-bezier(0.22, 1, 0.36, 1)",
  FADE_EASING: "cubic-bezier(0.4, 0, 0.2, 1)",
  SNAPSHOT_DURATION_MS: 720,
  SNAPSHOT_EASING: "cubic-bezier(0.22, 1, 0.36, 1)",
};
const SNAPSHOT_REVEAL_SAFETY_PADDING = 36;

export let activeTheme = "light";
let themeRenderFrame = 0;

/* Where a theme change stands. A transition is started by triggerThemeWave
   and always finished by it, whatever path the wave took. "lite" is a
   running transition that took the lighter snapshot path on a touch device;
   it only ever exists inside a running one, so it is a state rather than a
   second flag that could disagree with the first. */
const themeTransition = createMachine("theme transition", {
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

function themeNeedsGeometryLockedWave() {
  return themeTransitionParticipants.some((participant) => participant.wantsGeometryLockedWave());
}

function beginThemeTransitionContext(options = {}) {
  themeTransitionParticipants.forEach((participant) => participant.freeze(options));
  root.classList.add("theme-syncing");
}

function endThemeTransitionContext() {
  root.classList.remove("theme-syncing");
  if (!isThemeTransitionLite() && !root.classList.contains("theme-snapshot-active")) {
    themeTransitionParticipants.forEach((participant) => participant.scheduleResume());
  }
}

async function finishThemeTransitionContext() {
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

function scheduleThemeRenderWork(theme) {
  if (themeRenderFrame) {
    window.cancelAnimationFrame(themeRenderFrame);
  }

  themeRenderFrame = window.requestAnimationFrame(() => {
    themeRenderFrame = 0;
    pageEvents.emit("theme:render-frame", { theme });
  });
}

function syncSystemChromeForTheme(theme) {
  body.style.colorScheme = theme;
  root.style.colorScheme = theme;
  const rootStyles = getComputedStyle(root);
  const themeBg = rootStyles.getPropertyValue("--bg").trim();
  const chromeBg = rootStyles.getPropertyValue("--chrome-bg").trim() || themeBg;
  themeColorMeta?.setAttribute("content", chromeBg);
}

function applyTheme(theme, options = {}) {
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

function getWaveEndRadius(originX, originY, safetyPadding = 0) {
  const viewport = window.visualViewport;
  const viewportWidth = Math.max(
    window.innerWidth || 0,
    document.documentElement.clientWidth || 0,
    viewport?.width || 0,
    1
  );
  const viewportHeight = Math.max(
    window.innerHeight || 0,
    document.documentElement.clientHeight || 0,
    viewport?.height || 0,
    1
  );
  const horizontal = Math.max(originX, viewportWidth - originX);
  const vertical = Math.max(originY, viewportHeight - originY);
  return Math.hypot(horizontal, vertical) + safetyPadding;
}

function supportsSnapshotThemeWave() {
  return typeof document.startViewTransition === "function";
}

function cancelThemeWaveAnimations() {
  themeWave?.getAnimations?.().forEach((animation) => animation.cancel());
  themeWaveCore?.getAnimations?.().forEach((animation) => animation.cancel());
}

function resetThemeWave() {
  cancelThemeWaveAnimations();
  root.style.removeProperty("--wave-visual-x");
  root.style.removeProperty("--wave-visual-y");
  root.style.removeProperty("--wave-visual-diameter");
  themeWave?.classList.remove(
    "is-active",
    "is-outline",
    "is-mobile-wave",
    "is-mobile-clip-wave",
    "theme-light-wave",
    "theme-dark-wave"
  );

  if (themeWave) {
    themeWave.style.opacity = "";
    themeWave.style.clipPath = "";
  }

  if (themeWaveCore) {
    themeWaveCore.style.opacity = "";
    themeWaveCore.style.transform = "";
    themeWaveCore.style.left = "";
    themeWaveCore.style.top = "";
  }
}

function prepareThemeWave(originX, originY, nextTheme) {
  const endRadius = getWaveEndRadius(originX, originY);
  const waveSafetyPadding = isTouchFirst() ? 160 : 12;
  root.style.setProperty("--wave-x", `${originX}px`);
  root.style.setProperty("--wave-y", `${originY}px`);
  root.style.setProperty("--wave-diameter", `${Math.ceil(endRadius * 2 + waveSafetyPadding)}px`);

  themeWave.classList.remove("theme-light-wave", "theme-dark-wave");
  themeWave.classList.add(nextTheme === "dark" ? "theme-dark-wave" : "theme-light-wave");
  themeWave.classList.add("is-active");
  themeWave.style.opacity = "1";
  themeWaveCore.style.opacity = "1";
  themeWaveCore.style.transform = "translate3d(-50%, -50%, 0) scale(0.001)";
}

function prepareThemeWaveOutline(originX, originY, nextTheme = null, safetyPadding = 0) {
  const endRadius = getWaveEndRadius(originX, originY, safetyPadding);
  root.style.setProperty("--wave-x", `${originX}px`);
  root.style.setProperty("--wave-y", `${originY}px`);
  root.style.setProperty("--wave-diameter", `${Math.ceil(endRadius * 2 + 12)}px`);
  root.style.setProperty("--wave-visual-x", `${originX}px`);
  root.style.setProperty("--wave-visual-y", `${originY}px`);
  root.style.setProperty("--wave-visual-diameter", `${Math.ceil(endRadius * 2 + 12)}px`);

  themeWave.classList.remove("theme-light-wave", "theme-dark-wave");
  if (nextTheme) {
    themeWave.classList.add(nextTheme === "dark" ? "theme-dark-wave" : "theme-light-wave");
  }
  themeWave.classList.add("is-active", "is-outline");
  themeWave.style.opacity = "1";
  themeWaveCore.style.opacity = "0.82";
  themeWaveCore.style.transform = "translate3d(-50%, -50%, 0) scale(0.001)";

  return endRadius;
}

function prepareSnapshotWaveOrigin(originX, originY, safetyPadding = 0) {
  const endRadius = getWaveEndRadius(originX, originY, safetyPadding);
  root.style.setProperty("--wave-x", `${originX}px`);
  root.style.setProperty("--wave-y", `${originY}px`);

  return endRadius;
}

function supportsSnapshotMaskReveal() {
  return Boolean(
    window.CSS?.supports?.(
      "mask-image",
      "radial-gradient(circle at 10px 10px, black 0px, transparent 1px)"
    ) ||
    window.CSS?.supports?.(
      "-webkit-mask-image",
      "radial-gradient(circle at 10px 10px, black 0px, transparent 1px)"
    )
  );
}

function beginSnapshotMaskReveal() {
  root.classList.add("theme-mask-reveal");
  root.style.setProperty("--snapshot-wave-radius", "0px");
}

function endSnapshotMaskReveal() {
  root.classList.remove("theme-mask-reveal");
  root.style.removeProperty("--snapshot-wave-radius");
}

export async function commitThemeState(nextTheme, options = {}) {
  beginThemeTransitionContext();
  applyTheme(nextTheme, options);
  await waitForFrames(2);
  endThemeTransitionContext();
}

function beginViewTransitionDomLock() {
  root.classList.add("theme-vt-lock");
}

function endViewTransitionDomLock() {
  root.classList.remove("theme-vt-lock");
}

function beginSnapshotThemeLiteMode() {
  if (!isTouchFirst()) {
    return false;
  }

  themeTransition.send("enterLite");
  root.classList.add("theme-snapshot-active");
  return true;
}

function endSnapshotThemeLiteMode(theme) {
  if (!isThemeTransitionLite()) {
    return;
  }

  themeTransition.send("exitLite");
  root.classList.remove("theme-snapshot-active");
  themeTransitionParticipants.forEach((participant) => participant.scheduleResume());

  window.requestAnimationFrame(() => {
    scheduleThemeRenderWork(theme);
  });
}

async function runMobileThemeWave(originX, originY, nextTheme) {
  if (!themeWave || typeof themeWave.animate !== "function") {
    await runMobileThemeSafetyFade(nextTheme);
    return;
  }

  resetThemeWave();
  const endRadius = getWaveEndRadius(originX, originY);
  root.style.setProperty("--wave-x", `${originX}px`);
  root.style.setProperty("--wave-y", `${originY}px`);
  themeWave.classList.remove("theme-light-wave", "theme-dark-wave");
  themeWave.classList.add(
    "is-active",
    "is-mobile-clip-wave",
    nextTheme === "dark" ? "theme-dark-wave" : "theme-light-wave"
  );
  themeWave.style.opacity = "1";
  themeWave.style.clipPath = `circle(0px at ${originX}px ${originY}px)`;
  beginThemeTransitionContext({ lockGeometry: !themeNeedsGeometryLockedWave() });
  let didCommit = false;

  try {
    const expandDuration = themeWaveConfig.SNAPSHOT_DURATION_MS;
    const revealAnimation = themeWave.animate(
      {
        clipPath: [
          `circle(0px at ${originX}px ${originY}px)`,
          `circle(${endRadius}px at ${originX}px ${originY}px)`,
        ],
      },
      {
        duration: expandDuration,
        easing: themeWaveConfig.SNAPSHOT_EASING,
        fill: "both",
      }
    );

    const commitThemeAfterWaveLead = waitMilliseconds(Math.round(expandDuration * 0.78)).then(() => {
      if (didCommit) {
        return;
      }

      applyTheme(nextTheme, { deferHeavyWork: true, skipHeavyWork: true });
      didCommit = true;
    });

    await Promise.allSettled([revealAnimation.finished, commitThemeAfterWaveLead]);
    themeWave.style.opacity = "1";
    if (!didCommit) {
      applyTheme(nextTheme, { deferHeavyWork: true, skipHeavyWork: true });
      didCommit = true;
    }
    await waitForFrames(2);
    const fadeAnimation = themeWave.animate(
      { opacity: [1, 0] },
      {
        duration: themeWaveConfig.FADE_DURATION_MS,
        easing: themeWaveConfig.FADE_EASING,
        fill: "forwards",
      }
    );
    await fadeAnimation.finished;
  } catch (error) {
    if (!didCommit) {
      applyTheme(nextTheme, { deferHeavyWork: true, skipHeavyWork: true });
      didCommit = true;
      await waitForFrames(2);
    }
  } finally {
    resetThemeWave();
    endThemeTransitionContext();
    if (didCommit) {
      window.requestAnimationFrame(() => {
        scheduleThemeRenderWork(nextTheme);
      });
    }
  }
}

async function runMobileThemeSafetyFade(nextTheme) {
  if (!themeWave || typeof themeWave.animate !== "function") {
    beginThemeTransitionContext();
    applyTheme(nextTheme, { deferHeavyWork: true });
    await waitForFrames(2);
    endThemeTransitionContext();
    return;
  }

  resetThemeWave();
  if (themeWaveCore) {
    prepareThemeWaveOutline(window.innerWidth / 2, window.innerHeight / 2);
  }
  let didCommit = false;

  try {
    if (themeWaveCore && typeof themeWaveCore.animate === "function") {
      const ripple = themeWaveCore.animate(
        {
          transform: [
            "translate3d(-50%, -50%, 0) scale(0.001)",
            "translate3d(-50%, -50%, 0) scale(1.02)",
          ],
          opacity: [0.72, 0],
        },
        {
          duration: 360,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "both",
        }
      );
      window.setTimeout(() => {
        if (!didCommit) {
          beginThemeTransitionContext();
          applyTheme(nextTheme, { deferHeavyWork: true, skipHeavyWork: true });
          didCommit = true;
        }
      }, 80);
      await ripple.finished;
    }

    if (!didCommit) {
      beginThemeTransitionContext();
      applyTheme(nextTheme, { deferHeavyWork: true, skipHeavyWork: true });
      didCommit = true;
    }
    await waitForFrames(2);
  } catch (error) {
    if (!didCommit) {
      beginThemeTransitionContext();
      applyTheme(nextTheme, { deferHeavyWork: true, skipHeavyWork: true });
      didCommit = true;
      await waitForFrames(2);
    }
  } finally {
    endThemeTransitionContext();
    resetThemeWave();
    if (didCommit) {
      window.requestAnimationFrame(() => {
        scheduleThemeRenderWork(nextTheme);
      });
    }
  }
}

async function runFallbackThemeWave(originX, originY, nextTheme) {
  if (!themeWave || !themeWaveCore) {
    await commitThemeState(nextTheme);
    return;
  }

  if (
    typeof themeWave.animate !== "function" ||
    typeof themeWaveCore.animate !== "function"
  ) {
    await commitThemeState(nextTheme);
    return;
  }

  resetThemeWave();
  prepareThemeWave(originX, originY, nextTheme);

  try {
    const expandAnimation = themeWaveCore.animate(
      {
        transform: [
          "translate3d(-50%, -50%, 0) scale(0.001)",
          "translate3d(-50%, -50%, 0) scale(1)",
        ],
        opacity: [0.96, 1],
      },
      {
        duration: themeWaveConfig.EXPAND_DURATION_MS,
        easing: themeWaveConfig.EXPAND_EASING,
        fill: "both",
      }
    );

    await expandAnimation.finished;
    await commitThemeState(nextTheme);

    const fadeAnimation = themeWave.animate(
      {
        opacity: [1, 0],
      },
      {
        duration: themeWaveConfig.FADE_DURATION_MS,
        easing: themeWaveConfig.FADE_EASING,
        fill: "forwards",
      }
    );

    await fadeAnimation.finished;
  } catch (error) {
    await commitThemeState(nextTheme);
  } finally {
    resetThemeWave();
  }
}

async function runSnapshotThemeWave(originX, originY, nextTheme) {
  if (!themeWave || !themeWaveCore) {
    await commitThemeState(nextTheme);
    return;
  }

  const useLiteSnapshot = beginSnapshotThemeLiteMode();
  const useMaskReveal = !useLiteSnapshot && supportsSnapshotMaskReveal();
  resetThemeWave();
  const endRadius = useLiteSnapshot
    ? prepareSnapshotWaveOrigin(originX, originY)
    : prepareSnapshotWaveOrigin(originX, originY, SNAPSHOT_REVEAL_SAFETY_PADDING);
  if (!useLiteSnapshot) {
    beginViewTransitionDomLock();
    if (useMaskReveal) {
      beginSnapshotMaskReveal();
    }
  }
  beginThemeTransitionContext();

  let transition;
  try {
    const snapshotThemeOptions = useLiteSnapshot
      ? { deferHeavyWork: true, skipHeavyWork: true }
      : {
          deferSystemChrome: true,
          deferHeavyWork: true,
          skipHeavyWork: true,
          syncSnapshotVisuals: true,
        };
    transition = document.startViewTransition(() => {
      applyTheme(nextTheme, snapshotThemeOptions);
    });
    await transition.ready;
  } catch (error) {
    endThemeTransitionContext();
    resetThemeWave();
    if (useLiteSnapshot) {
      endSnapshotThemeLiteMode(activeTheme);
    } else {
      if (useMaskReveal) {
        endSnapshotMaskReveal();
      }
      endViewTransitionDomLock();
    }
    throw error;
  }

  if (!useLiteSnapshot) {
    endThemeTransitionContext();
  }

  const snapshotDuration = useLiteSnapshot ? 540 : themeWaveConfig.SNAPSHOT_DURATION_MS;

  const transitionAnimations = [transition.finished];

  if (!useLiteSnapshot) {
    prepareThemeWaveOutline(originX, originY, null, 220);
    const outlineAnimation = themeWaveCore.animate(
      {
        transform: [
          "translate3d(-50%, -50%, 0) scale(0.001)",
          "translate3d(-50%, -50%, 0) scale(1.02)",
        ],
        opacity: [0.82, 0],
      },
      {
        duration: snapshotDuration,
        easing: themeWaveConfig.SNAPSHOT_EASING,
        fill: "forwards",
      }
    );
    transitionAnimations.push(outlineAnimation.finished);
  }

  const revealAnimation = useMaskReveal
    ? root.animate(
        {
          "--snapshot-wave-radius": ["0px", `${endRadius}px`],
        },
        {
          duration: snapshotDuration,
          easing: themeWaveConfig.SNAPSHOT_EASING,
          fill: "both",
          pseudoElement: "::view-transition-new(root)",
        }
      )
    : root.animate(
        {
          clipPath: [
            `circle(0px at ${originX}px ${originY}px)`,
            `circle(${endRadius}px at ${originX}px ${originY}px)`,
          ],
        },
        {
          duration: snapshotDuration,
          easing: themeWaveConfig.SNAPSHOT_EASING,
          fill: "both",
          pseudoElement: "::view-transition-new(root)",
        }
      );

  transitionAnimations.push(revealAnimation.finished);

  await Promise.allSettled(transitionAnimations);
  if (!useLiteSnapshot) {
    syncSystemChromeForTheme(nextTheme);
    scheduleThemeRenderWork(nextTheme);
    await waitForFrames(2);
  }

  if (useLiteSnapshot) {
    endThemeTransitionContext();
  }

  resetThemeWave();
  if (useLiteSnapshot) {
    endSnapshotThemeLiteMode(nextTheme);
  } else {
    if (useMaskReveal) {
      endSnapshotMaskReveal();
    }
    endViewTransitionDomLock();
  }
}

async function runGeometryLockedSnapshotWave(originX, originY, nextTheme) {
  if (!supportsSnapshotThemeWave()) {
    await runMobileThemeWave(originX, originY, nextTheme);
    return;
  }

  resetThemeWave();
  const endRadius = prepareSnapshotWaveOrigin(originX, originY);
  beginThemeTransitionContext({ lockGeometry: true });
  await waitForFrames(1);

  let transition;
  try {
    transition = document.startViewTransition(() => {
      applyTheme(nextTheme, {
        deferHeavyWork: true,
        skipHeavyWork: true,
        syncSnapshotVisuals: true,
        deferSystemChrome: true,
      });
    });
    await transition.ready;
  } catch (error) {
    resetThemeWave();
    await finishThemeTransitionContext();
    throw error;
  }

  const revealAnimation = root.animate(
    {
      clipPath: [
        `circle(0px at ${originX}px ${originY}px)`,
        `circle(${endRadius}px at ${originX}px ${originY}px)`,
      ],
    },
    {
      duration: themeWaveConfig.SNAPSHOT_DURATION_MS,
      easing: themeWaveConfig.SNAPSHOT_EASING,
      fill: "both",
      pseudoElement: "::view-transition-new(root)",
    }
  );
  await Promise.allSettled([
    transition.finished,
    revealAnimation.finished,
  ]);
  syncSystemChromeForTheme(nextTheme);
  await waitForFrames(2);
  resetThemeWave();
  await finishThemeTransitionContext();
  window.requestAnimationFrame(() => {
    scheduleThemeRenderWork(nextTheme);
  });
}

export async function triggerThemeWave(originX, originY, nextTheme) {
  if (isThemeBusy()) {
    return;
  }

  themeTransitionParticipants.forEach((participant) => participant.prepare());
  themeTransition.send("start");
  pageEvents.emit("theme:will-transition", { theme: nextTheme });

  try {
    if (themeNeedsGeometryLockedWave() && supportsSnapshotThemeWave()) {
      await runGeometryLockedSnapshotWave(originX, originY, nextTheme);
    } else if (supportsSnapshotThemeWave()) {
      await runSnapshotThemeWave(originX, originY, nextTheme);
    } else if (isTouchFirst()) {
      await runMobileThemeWave(originX, originY, nextTheme);
    } else {
      await runFallbackThemeWave(originX, originY, nextTheme);
    }
  } catch (error) {
    if (isTouchFirst()) {
      await runMobileThemeSafetyFade(nextTheme);
    } else {
      await runFallbackThemeWave(originX, originY, nextTheme);
    }
  } finally {
    themeTransition.send("finish");
  }
}
