/* Viewport questions -- compact, touch-first, wide -- and the stable app height. */

import { root } from "./dom.js?v=5057c320";

export const isDesktopInputDevice = () => (navigator.maxTouchPoints || 0) === 0;

export function syncInputDeviceClass() {
  root.classList.toggle("is-desktop-input", isDesktopInputDevice());
}
export const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

/* Three questions about the viewport, each answered in exactly one place and
   each mirroring a media query in the CSS (see "Breakpoints" at the top of
   css/responsive.css):

     isCompactLayout()  width <= 680px            (max-width: 680px)
                        the phone layout: geometry, sizes, positions
     isTouchFirst()     compact, or a touch-only  (max-width: 680px),
                        device of any width       (hover: none) and (pointer: coarse)
                        interaction: gestures, hover effects, lighter animation
     isWideLayout()     width >= 1024px           (min-width: 1024px)
                        desktop-only affordances

   They are not interchangeable. A landscape tablet is touch-first but not
   compact, and the CSS gives it the touch treatment with the wide layout, so
   layout code has to ask the first question and interaction code the second. */
const COMPACT_MAX_WIDTH = 680;
const WIDE_MIN_WIDTH = 1024;
const touchFirstMedia = window.matchMedia?.(
  `(max-width: ${COMPACT_MAX_WIDTH}px), (hover: none) and (pointer: coarse)`
);

export function isCompactLayout() {
  return window.innerWidth <= COMPACT_MAX_WIDTH;
}

export function isTouchFirst() {
  return Boolean(touchFirstMedia?.matches || isCompactLayout());
}

export function isWideLayout() {
  return window.innerWidth >= WIDE_MIN_WIDTH;
}

export let stableMobileAppHeight = 0;
let stableMobileAppWidth = 0;
let stableMobileOrientation = "";
let lastVisualViewportWidth = 0;

function getViewportOrientationKey() {
  return window.innerWidth > window.innerHeight ? "landscape" : "portrait";
}

export function syncViewportHeightVar() {
  if (isTouchFirst()) {
    const width = Math.round(window.innerWidth);
    const orientation = getViewportOrientationKey();
    const shouldRefreshStableHeight = (
      stableMobileAppHeight === 0 ||
      stableMobileAppWidth === 0 ||
      Math.abs(width - stableMobileAppWidth) > 2 ||
      orientation !== stableMobileOrientation
    );

    if (shouldRefreshStableHeight) {
      stableMobileAppHeight = Math.round(window.innerHeight);
      stableMobileAppWidth = width;
      stableMobileOrientation = orientation;
      root.style.setProperty("--app-height", `${stableMobileAppHeight}px`);
    }

    return;
  }

  const viewportHeight = Math.max(
    window.innerHeight,
    window.visualViewport?.height || 0
  );
  root.style.setProperty("--app-height", `${Math.round(viewportHeight)}px`);
}

/* True when the visual viewport's width has moved by more than 2px since
   the last call -- a real resize rather than a rounding wobble. */
export function visualViewportWidthChanged() {
  const currentWidth = Math.round(window.visualViewport?.width || window.innerWidth);
  if (lastVisualViewportWidth === 0 || Math.abs(currentWidth - lastVisualViewportWidth) > 2) {
    lastVisualViewportWidth = currentWidth;
    return true;
  }
  return false;
}

export function isElementInViewport(element) {
  if (!element) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  const viewportHeight = Math.max(window.innerHeight, document.documentElement.clientHeight, 1);
  return rect.bottom > 0 && rect.top < viewportHeight;
}

export function shouldReduceMotion() {
  return reducedMotionQuery.matches;
}
