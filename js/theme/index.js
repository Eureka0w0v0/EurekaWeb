/* The theme's public face: picking a wave, the toggle, and following the
   system. Everything outside js/theme/ goes through here, and
   tools/check-site.py enforces that. */

import { pageEvents } from "../core/events.js?v=8c4a4d4a";
import { safeStorageSet } from "../core/storage.js?v=55891515";
import { isTouchFirst } from "../core/viewport.js?v=c7860737";
import {
  activeTheme,
  commitThemeState,
  getStoredTheme,
  isThemeBusy,
  mediaQuery,
  prepareThemeParticipants,
  storageKey,
  themeNeedsGeometryLockedWave,
  themeToggle,
  themeTransition,
} from "./state.js?v=4f819fef";
import {
  runFallbackThemeWave,
  runGeometryLockedSnapshotWave,
  runMobileThemeSafetyFade,
  runMobileThemeWave,
  runSnapshotThemeWave,
  supportsSnapshotThemeWave,
} from "./waves.js?v=22f31ad6";

export {
  activeTheme,
  addThemeTransitionParticipant,
  commitThemeState,
  isThemeTransitionLite,
  isThemeTransitionRunning,
  resolveTheme,
} from "./state.js?v=4f819fef";
export { themeWave } from "./waves.js?v=22f31ad6";

async function triggerThemeWave(originX, originY, nextTheme) {
  prepareThemeParticipants();
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
    console.warn("[EurekaWeb] The theme transition failed; falling back to a plainer one.", error);
    if (isTouchFirst()) {
      await runMobileThemeSafetyFade(nextTheme);
    } else {
      await runFallbackThemeWave(originX, originY, nextTheme);
    }
  } finally {
    themeTransition.send("finish");
  }
}

/* A visitor's choice, rippling out from origin. The preference is stored only
   past this check, so it never flips while the wave refuses to run. */
async function toggleTheme(origin) {
  if (isThemeBusy()) {
    return;
  }

  const nextTheme = activeTheme === "dark" ? "light" : "dark";
  const rect = origin.getBoundingClientRect();
  const originX = rect.left + rect.width / 2;
  const originY = rect.top + rect.height / 2;

  safeStorageSet(storageKey, nextTheme);
  await triggerThemeWave(originX, originY, nextTheme);
}

export function wireThemeToggle() {
  themeToggle?.addEventListener("click", (event) => toggleTheme(event.currentTarget));
}

/* With no stored preference the page follows the system. onApplied runs once
   the change has settled. */
export function followSystemTheme(onApplied) {
  mediaQuery.addEventListener("change", (event) => {
    if (getStoredTheme()) {
      return;
    }

    commitThemeState(event.matches ? "dark" : "light").then(onApplied);
  });
}
