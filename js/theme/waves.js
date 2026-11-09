/* The five ways a theme change can look. They are not interchangeable: view
   transition, lite snapshot, clip wave, geometry-locked and fallback each exist
   for an environment the others fail in, which is why they share constants and
   helpers but not a flow. triggerThemeWave in theme/index.js picks one. */

import { root } from "../core/dom.js?v=5057c320";
import { waitForFrames, waitMilliseconds } from "../core/frames.js?v=0b68ae2a";
import { isTouchFirst } from "../core/viewport.js?v=c7860737";
import {
  activeTheme,
  applyTheme,
  beginThemeTransitionContext,
  commitThemeState,
  endThemeTransitionContext,
  finishThemeTransitionContext,
  isThemeTransitionLite,
  resumeThemeParticipants,
  scheduleThemeRenderWork,
  syncSystemChromeForTheme,
  themeNeedsGeometryLockedWave,
  themeTransition,
} from "./state.js?v=4f819fef";

const themeWave = document.querySelector(".theme-wave");
const themeWaveCore = document.querySelector(".theme-wave-core");

/* For code outside js/theme/ that has to wait a wave out. The classes are the
   theme's own, so this is the only place that reads them. */
export function isThemeSnapshotActive() {
  return root.classList.contains("theme-snapshot-active");
}

export function isThemeWaveVisible() {
  return Boolean(themeWave?.classList.contains("is-active")) || isThemeSnapshotActive();
}

const themeWaveConfig = {
  EXPAND_DURATION_MS: 560,
  FADE_DURATION_MS: 180,
  EXPAND_EASING: "cubic-bezier(0.22, 1, 0.36, 1)",
  FADE_EASING: "cubic-bezier(0.4, 0, 0.2, 1)",
  SNAPSHOT_DURATION_MS: 720,
  SNAPSHOT_EASING: "cubic-bezier(0.22, 1, 0.36, 1)",
};
const SNAPSHOT_REVEAL_SAFETY_PADDING = 36;

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

export function supportsSnapshotThemeWave() {
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
  resumeThemeParticipants();

  window.requestAnimationFrame(() => {
    scheduleThemeRenderWork(theme);
  });
}

export async function runMobileThemeWave(originX, originY, nextTheme) {
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
    console.warn("[EurekaWeb] The mobile theme wave failed; applying the theme without it.", error);
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

export async function runMobileThemeSafetyFade(nextTheme) {
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
    console.warn("[EurekaWeb] The theme safety fade failed; applying the theme without it.", error);
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

export async function runFallbackThemeWave(originX, originY, nextTheme) {
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
    console.warn("[EurekaWeb] The theme wave failed; applying the theme without it.", error);
    await commitThemeState(nextTheme);
  } finally {
    resetThemeWave();
  }
}

/* Undo what a snapshot wave set up: the lite mode on a touch device, or the
   view-transition DOM lock and the mask reveal elsewhere. */
function releaseSnapshotMode({ useLiteSnapshot, useMaskReveal }, theme) {
  if (useLiteSnapshot) {
    endSnapshotThemeLiteMode(theme);
    return;
  }
  if (useMaskReveal) {
    endSnapshotMaskReveal();
  }
  endViewTransitionDomLock();
}

/* Starts the view transition that applies the theme inside its snapshot.
   If the browser refuses, everything set up for it is released before the
   error goes on to triggerThemeWave's fallback. */
async function startThemeViewTransition(nextTheme, mode) {
  const snapshotThemeOptions = mode.useLiteSnapshot
    ? { deferHeavyWork: true, skipHeavyWork: true }
    : {
        deferSystemChrome: true,
        deferHeavyWork: true,
        skipHeavyWork: true,
        syncSnapshotVisuals: true,
      };
  try {
    const transition = document.startViewTransition(() => {
      applyTheme(nextTheme, snapshotThemeOptions);
    });
    await transition.ready;
    return transition;
  } catch (error) {
    endThemeTransitionContext();
    resetThemeWave();
    releaseSnapshotMode(mode, activeTheme);
    throw error;
  }
}

/* Starts the circle that reveals the new theme and, outside lite mode, the
   expanding outline that rides its edge. Returns their `finished` promises,
   outline first. */
function animateSnapshotReveal(originX, originY, endRadius, mode) {
  const { useLiteSnapshot, useMaskReveal } = mode;
  const snapshotDuration = useLiteSnapshot ? 540 : themeWaveConfig.SNAPSHOT_DURATION_MS;
  const animations = [];

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
    animations.push(outlineAnimation.finished);
  }

  const revealKeyframes = useMaskReveal
    ? { "--snapshot-wave-radius": ["0px", `${endRadius}px`] }
    : {
        clipPath: [
          `circle(0px at ${originX}px ${originY}px)`,
          `circle(${endRadius}px at ${originX}px ${originY}px)`,
        ],
      };
  const revealAnimation = root.animate(revealKeyframes, {
    duration: snapshotDuration,
    easing: themeWaveConfig.SNAPSHOT_EASING,
    fill: "both",
    pseudoElement: "::view-transition-new(root)",
  });
  animations.push(revealAnimation.finished);
  return animations;
}

export async function runSnapshotThemeWave(originX, originY, nextTheme) {
  if (!themeWave || !themeWaveCore) {
    await commitThemeState(nextTheme);
    return;
  }

  const useLiteSnapshot = beginSnapshotThemeLiteMode();
  const mode = { useLiteSnapshot, useMaskReveal: !useLiteSnapshot && supportsSnapshotMaskReveal() };
  resetThemeWave();
  const endRadius = useLiteSnapshot
    ? prepareSnapshotWaveOrigin(originX, originY)
    : prepareSnapshotWaveOrigin(originX, originY, SNAPSHOT_REVEAL_SAFETY_PADDING);
  if (!useLiteSnapshot) {
    beginViewTransitionDomLock();
    if (mode.useMaskReveal) {
      beginSnapshotMaskReveal();
    }
  }
  beginThemeTransitionContext();

  const transition = await startThemeViewTransition(nextTheme, mode);
  if (!useLiteSnapshot) {
    endThemeTransitionContext();
  }

  const transitionAnimations = [transition.finished];
  transitionAnimations.push(...animateSnapshotReveal(originX, originY, endRadius, mode));
  await Promise.allSettled(transitionAnimations);

  if (!useLiteSnapshot) {
    syncSystemChromeForTheme(nextTheme);
    scheduleThemeRenderWork(nextTheme);
    await waitForFrames(2);
  } else {
    endThemeTransitionContext();
  }

  resetThemeWave();
  releaseSnapshotMode(mode, nextTheme);
}

export async function runGeometryLockedSnapshotWave(originX, originY, nextTheme) {
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
