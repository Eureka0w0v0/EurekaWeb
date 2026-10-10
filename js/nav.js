/* The section rail and in-page jump links. */

import { shouldReduceMotion } from "./core/viewport.js?v=c7860737";

/* The dot rail on the right: one dot per section, the one whose middle is
   in the middle of the viewport lit. Observed rather than measured on scroll
   so it costs nothing per frame. */
export function initSectionRail() {
  const rail = document.querySelector(".section-rail");
  if (!rail || !("IntersectionObserver" in window)) {
    return;
  }

  const links = Array.from(rail.querySelectorAll("a[data-rail]"));
  const targets = links.map((link) => document.getElementById(link.dataset.rail)).filter(Boolean);
  if (targets.length === 0) {
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }
        links.forEach((link) => {
          link.classList.toggle("is-active", link.dataset.rail === entry.target.id);
        });
      });
    },
    { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
  );
  targets.forEach((target) => observer.observe(target));
}

/* Every in-page link -- rail, hero actions, wordmark -- scrolls rather than
   jumps. The welcome screen's own scroll handling is left alone: these all
   land below it, and anything targeting the welcome screen itself lands on
   it, which is the one place a jump is fine. */
export function initJumpLinks() {
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[data-jump]");
    if (!link) {
      return;
    }
    const target = document.getElementById(link.dataset.jump);
    if (!target) {
      return;
    }
    event.preventDefault();
    target.scrollIntoView({ behavior: shouldReduceMotion() ? "auto" : "smooth", block: "start" });

    /* preventDefault above cancels the browser's own hash navigation, and with
       it the focus move that normally comes free. Without this the viewport
       goes to the section while the keyboard stays on the link, so the next
       Tab continues through the nav instead of into what was just jumped to.

       The skip link is not affected and must stay as it is: it has no
       data-jump, so it never reaches here and its native jump to #main (which
       carries tabindex="-1") already lands focus correctly.

       tabindex="-1" makes a non-interactive section focusable without putting
       it in the Tab order, and css/base.css already suppresses the ring on
       :where([tabindex="-1"]):focus-visible so nothing visible changes. */
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  });
}
