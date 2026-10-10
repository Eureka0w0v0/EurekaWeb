/* The active language, the language menu, and the kinetic text switch. */

import { pageEvents } from "../core/events.js?v=8c4a4d4a";
import { waitForNextAnimationFrame } from "../core/frames.js?v=0b68ae2a";
import { safeStorageGet, safeStorageSet } from "../core/storage.js?v=55891515";
import { isTouchFirst, isWideLayout, shouldReduceMotion } from "../core/viewport.js?v=c7860737";
import { pageTranslations } from "./translations.js?v=2ea6af69";

export const languageSwitcher = document.querySelector("#language-switcher");
export const languageToggle = document.querySelector("#language-toggle");
const languageMenu = document.querySelector("#language-menu");
export const languageOptions = document.querySelectorAll("[data-language]");
const i18nNodes = document.querySelectorAll("[data-i18n]");
/* Queried live rather than cached: the photo carousel clones cards at runtime,
   and a clone carrying data-i18n-aria has to be picked up by the next language
   switch the same as the markup that shipped with the page. */
const i18nAriaSelector = "[data-i18n-aria]";
let activeLanguage = "zh";
const languageStorageKey = "preferred-language";

function getStoredLanguage() {
  return safeStorageGet(languageStorageKey);
}

function getSystemLanguage() {
  const locale = (navigator.language || "zh").toLowerCase();
  if (locale.startsWith("ja")) {
    return "ja";
  }
  if (locale.startsWith("en")) {
    return "en";
  }
  return "zh";
}

export function resolveLanguage() {
  const storedLanguage = getStoredLanguage();
  if (storedLanguage && pageTranslations[storedLanguage]) {
    return storedLanguage;
  }

  return getSystemLanguage();
}

export function getActiveCopy() {
  return pageTranslations[activeLanguage] || pageTranslations.zh;
}

function getScramblePool(language) {
  if (language === "ja") {
    return "アイウエオカキクケコサシスセソタチツテトナニヌネノ";
  }

  if (language === "zh") {
    return "你好欢迎来到这里尤里卡网页语言星光灵感";
  }

  return "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
}

function isStableCharacter(character) {
  return !character || /\s|[.,:;!?()[\]{}'"“”‘’\-_/\\]/u.test(character);
}

function getReadableScrambleChar(target, index, pool) {
  if (isStableCharacter(target)) {
    return target;
  }

  const code = target?.charCodeAt(0) || 0;
  return pool[(index * 13 + code) % pool.length] || target;
}

function lockLanguageNodeSize(node, targetText) {
  const originalText = node.textContent;
  const originalMinWidth = node.style.minWidth;
  const originalMinHeight = node.style.minHeight;
  const originalMaxWidth = node.style.maxWidth;
  const originalMaxHeight = node.style.maxHeight;
  const rect = node.getBoundingClientRect();

  node.textContent = targetText;
  const targetRect = node.getBoundingClientRect();
  node.textContent = originalText;

  const lockWidth = Math.ceil(Math.max(rect.width, targetRect.width));
  const lockHeight = Math.ceil(Math.max(rect.height, targetRect.height));
  node.style.minWidth = `${lockWidth}px`;
  node.style.minHeight = `${lockHeight}px`;
  node.style.maxWidth = `${lockWidth}px`;
  node.style.maxHeight = `${lockHeight}px`;
  node.classList.add("is-kinetic-language-text");

  return () => {
    node.style.minWidth = originalMinWidth;
    node.style.minHeight = originalMinHeight;
    node.style.maxWidth = originalMaxWidth;
    node.style.maxHeight = originalMaxHeight;
    node.classList.remove("is-kinetic-language-text");
  };
}

function syncLanguageChrome(copy, language) {
  activeLanguage = language;
  document.documentElement.lang = copy.documentLang;
  document.title = copy.title;

  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription) {
    metaDescription.setAttribute("content", copy.description);
  }

  applyAriaLabels(copy);

  languageOptions.forEach((option) => {
    const isActive = option.dataset.language === language;
    option.classList.toggle("is-active", isActive);
    option.setAttribute("aria-pressed", `${isActive}`);
  });
}

/* aria-label is the one piece of copy that cannot live in textContent, so it
   was the one piece that never got translated -- eleven labels frozen in
   whichever language they were written in, half Chinese and half English, on a
   page with a three-way switcher.

   The photo cards take a count rather than twenty strings per language: the
   number is already on the element, as data-photo-base on the queue, as
   data-photo-insert on the incoming card, and as data-photo-clone-source on
   the copies the carousel makes. */
function applyAriaLabels(copy) {
  document.querySelectorAll(i18nAriaSelector).forEach((node) => {
    const key = node.dataset.i18nAria;
    if (!key || !(key in copy)) {
      return;
    }

    const value = copy[key];
    const index =
      node.dataset.photoBase || node.dataset.photoInsert || node.dataset.photoCloneSource;
    node.setAttribute("aria-label", index ? value.replace("{n}", index) : value);
  });

  /* Same idea for title, which is the hover explanation rather than the
     accessible name. Kept separate because an element wanting one does not
     usually want the other: a title duplicated into aria-label is read twice. */
  document.querySelectorAll("[data-i18n-title]").forEach((node) => {
    const key = node.dataset.i18nTitle;
    if (key && key in copy) {
      node.setAttribute("title", copy[key]);
    }
  });
}

export function bindLanguageMenuReactions() {
  pageEvents.on("theme:will-transition", () => {
    closeLanguageMenu();
  });
}

export function closeLanguageMenu() {
  languageSwitcher?.classList.remove("is-open");
  languageToggle?.setAttribute("aria-expanded", "false");
  languageMenu?.setAttribute("aria-hidden", "true");
}

export function toggleLanguageMenu() {
  if (!languageSwitcher || !languageToggle || !languageMenu) {
    return;
  }

  const isOpen = languageSwitcher.classList.toggle("is-open");
  languageToggle.setAttribute("aria-expanded", `${isOpen}`);
  languageMenu.setAttribute("aria-hidden", `${!isOpen}`);
}

export function applyLanguage(language) {
  const nextLanguage = pageTranslations[language] ? language : "zh";
  const copy = pageTranslations[nextLanguage];

  syncLanguageChrome(copy, nextLanguage);

  i18nNodes.forEach((node) => {
    const key = node.dataset.i18n;
    if (!key || !(key in copy)) {
      return;
    }

    node.textContent = copy[key];
  });

  pageEvents.emit("language:change", { language: nextLanguage, copy, animated: false });
}

let isLanguageTransitioning = false;

const languageKineticConfig = {
  DURATION_MS: 520,
  MAX_STAGGER_MS: 140,
  MAX_DESKTOP_CHARS: 180,
  MAX_MOBILE_CHARS: 168,
  MOBILE_BATCH_CHARS: 54,
  DESKTOP_BATCH_CHARS: 90,
  VIEWPORT_MARGIN: 96,
};

function isNodeInAnimationViewport(node) {
  const rect = node.getBoundingClientRect();
  const margin = languageKineticConfig.VIEWPORT_MARGIN;

  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom >= -margin &&
    rect.top <= window.innerHeight + margin &&
    rect.right >= -margin &&
    rect.left <= window.innerWidth + margin
  );
}

function getKineticTextPlan(language) {
  const nextLanguage = pageTranslations[language] ? language : "zh";
  const copy = pageTranslations[nextLanguage];
  const maxChars = isWideLayout()
    ? languageKineticConfig.MAX_DESKTOP_CHARS
    : languageKineticConfig.MAX_MOBILE_CHARS;
  let animatedCharCount = 0;
  const animated = [];
  const liteNodes = [];
  const staticNodes = [];

  Array.from(i18nNodes).forEach((node) => {
    const key = node.dataset.i18n;
    if (!key || !(key in copy)) {
      return;
    }

    const toText = copy[key];
    const fromText = node.textContent || "";
    const charCount = Math.max(Array.from(fromText).length, Array.from(toText).length);

    const isVisible = isNodeInAnimationViewport(node);

    if (key === "welcomeWord" || !isVisible) {
      staticNodes.push({ node, key, toText });
      return;
    }

    if (animatedCharCount + charCount > maxChars) {
      liteNodes.push({ node, key, fromText, toText, charCount });
      return;
    }

    animatedCharCount += charCount;
    animated.push({ node, key, fromText, toText, charCount });
  });

  return { copy, nextLanguage, animated, liteNodes, staticNodes };
}

function buildKineticCharacterSpans(fromText, toText, pool) {
  const fromChars = Array.from(fromText);
  const toChars = Array.from(toText);
  const length = Math.max(fromChars.length, toChars.length);
  const fragment = document.createDocumentFragment();
  const spans = [];

  for (let index = 0; index < length; index += 1) {
    const span = document.createElement("span");
    const source = fromChars[index] || "";
    const target = toChars[index] || "";

    span.className = "kinetic-char";
    span.textContent = source || getReadableScrambleChar(target, index, pool) || "\u00A0";
    span.dataset.targetChar = target || "";
    span.dataset.scrambleChar = getReadableScrambleChar(target, index, pool) || "\u00A0";
    fragment.append(span);
    spans.push(span);
  }

  return { fragment, spans };
}

function animateKineticNode({ node, key, fromText, toText }, pool, nodeIndex) {
  const unlockSize = lockLanguageNodeSize(node, toText);
  const { fragment, spans } = buildKineticCharacterSpans(fromText, toText, pool);
  const animations = [];
  const contentTimers = [];

  node.replaceChildren(fragment);

  spans.forEach((span, index) => {
    const angle = ((index * 47 + nodeIndex * 29) % 360) * (Math.PI / 180);
    const distance = 14 + ((index * 9 + nodeIndex * 5) % 24);
    const direction = index % 2 === 0 ? 1 : -1;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance * 0.82;
    const rotation = (((index * 23 + nodeIndex * 17) % 28) - 14) * direction;
    const delay = Math.min(index * 7 + nodeIndex * 18, languageKineticConfig.MAX_STAGGER_MS);
    const duration = languageKineticConfig.DURATION_MS - delay * 0.34;

    contentTimers.push(window.setTimeout(() => {
      span.textContent = span.dataset.scrambleChar || "\u00A0";
    }, delay + duration * 0.38));
    contentTimers.push(window.setTimeout(() => {
      span.textContent = span.dataset.targetChar || "\u00A0";
    }, delay + duration * 0.58));

    animations.push(span.animate(
      [
        {
          transform: "translate3d(0, 0, 0) rotate(0deg)",
          opacity: 1,
          offset: 0,
        },
        {
          transform: `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${rotation.toFixed(2)}deg)`,
          opacity: 0.32,
          offset: 0.46,
        },
        {
          transform: `translate3d(${(x * -0.16).toFixed(2)}px, ${(y * -0.16).toFixed(2)}px, 0) rotate(${(rotation * -0.18).toFixed(2)}deg)`,
          opacity: 0.78,
          offset: 0.68,
        },
        {
          transform: "translate3d(0, 0, 0) rotate(0deg)",
          opacity: 1,
          offset: 1,
        },
      ],
      {
        duration,
        delay,
        easing: "cubic-bezier(0.45, 0, 0.18, 1)",
        fill: "both",
      }
    ));
  });

  return Promise.allSettled(animations.map((animation) => animation.finished)).finally(() => {
    contentTimers.forEach((timer) => window.clearTimeout(timer));
    commitKineticText(node, key, toText);
    unlockSize();
  });
}

function buildScrambledText(fromText, toText, pool, seed = 0) {
  const fromChars = Array.from(fromText);
  const toChars = Array.from(toText);
  const length = Math.max(fromChars.length, toChars.length);
  const output = [];

  for (let index = 0; index < length; index += 1) {
    const target = toChars[index] || "";

    if (isStableCharacter(target)) {
      output.push(target || fromChars[index] || "");
      continue;
    }

    output.push(getReadableScrambleChar(target, index + seed, pool));
  }

  return output.join("");
}

/* Guard against stale write-backs: hovering a language node mid-animation
   swaps the insight text's data-i18n key, and the old animation must not
   overwrite the newer copy when it settles. */
function commitKineticText(node, key, text) {
  if (key && node.dataset.i18n !== key) {
    return;
  }

  node.textContent = text;
}

function animateKineticLiteNode({ node, key, fromText, toText }, pool, nodeIndex) {
  const unlockSize = lockLanguageNodeSize(node, toText);
  const timers = [];
  const duration = isTouchFirst() ? 360 : 420;
  const distance = isTouchFirst() ? 8 : 12;
  const direction = nodeIndex % 2 === 0 ? 1 : -1;

  node.textContent = fromText;
  timers.push(window.setTimeout(() => {
    commitKineticText(node, key, buildScrambledText(fromText, toText, pool, nodeIndex * 3));
  }, duration * 0.34));
  timers.push(window.setTimeout(() => {
    commitKineticText(node, key, buildScrambledText(fromText, toText, pool, nodeIndex * 7));
  }, duration * 0.5));
  timers.push(window.setTimeout(() => {
    commitKineticText(node, key, toText);
  }, duration * 0.68));

  const animation = node.animate(
    [
      {
        transform: "translate3d(0, 0, 0)",
        opacity: 1,
        offset: 0,
      },
      {
        transform: `translate3d(${(distance * direction).toFixed(2)}px, ${(-distance * 0.55).toFixed(2)}px, 0)`,
        opacity: 0.46,
        offset: 0.44,
      },
      {
        transform: `translate3d(${(-distance * 0.16 * direction).toFixed(2)}px, ${(distance * 0.12).toFixed(2)}px, 0)`,
        opacity: 0.82,
        offset: 0.72,
      },
      {
        transform: "translate3d(0, 0, 0)",
        opacity: 1,
        offset: 1,
      },
    ],
    {
      duration,
      delay: Math.min(nodeIndex * 14, languageKineticConfig.MAX_STAGGER_MS),
      easing: "cubic-bezier(0.45, 0, 0.18, 1)",
      fill: "both",
    }
  );

  return animation.finished.finally(() => {
    timers.forEach((timer) => window.clearTimeout(timer));
    commitKineticText(node, key, toText);
    unlockSize();
  });
}

async function runKineticLanguageBatches(animated, liteNodes, pool) {
  const batchLimit = isTouchFirst()
    ? languageKineticConfig.MOBILE_BATCH_CHARS
    : languageKineticConfig.DESKTOP_BATCH_CHARS;
  const tasks = [
    ...animated.map((item) => ({ ...item, type: "full" })),
    ...liteNodes.map((item) => ({ ...item, type: "lite" })),
  ];
  const running = [];
  let batchChars = 0;

  for (let index = 0; index < tasks.length; index += 1) {
    const item = tasks[index];
    const charCount = Math.max(1, item.charCount || 1);

    if (batchChars > 0 && batchChars + charCount > batchLimit) {
      await waitForNextAnimationFrame();
      batchChars = 0;
    }

    running.push(
      item.type === "full"
        ? animateKineticNode(item, pool, index)
        : animateKineticLiteNode(item, pool, index)
    );
    batchChars += charCount;
  }

  await Promise.all(running);
}

export async function switchLanguageWithAnimation(language) {
  const nextLanguage = pageTranslations[language] ? language : "zh";

  if (nextLanguage === activeLanguage) {
    closeLanguageMenu();
    return;
  }

  if (isLanguageTransitioning) {
    return;
  }

  isLanguageTransitioning = true;
  safeStorageSet(languageStorageKey, nextLanguage);
  closeLanguageMenu();

  if (shouldReduceMotion()) {
    applyLanguage(nextLanguage);
    isLanguageTransitioning = false;
    return;
  }

  pageEvents.emit("language:will-change", { language: nextLanguage });

  try {
    const { copy, animated, liteNodes, staticNodes } = getKineticTextPlan(nextLanguage);
    const pool = getScramblePool(nextLanguage);

    syncLanguageChrome(copy, nextLanguage);
    staticNodes.forEach(({ node, toText }) => {
      node.textContent = toText;
    });
    pageEvents.emit("language:change", { language: nextLanguage, copy, animated: true });

    await runKineticLanguageBatches(animated, liteNodes, pool);
  } catch (error) {
    applyLanguage(nextLanguage);
  } finally {
    isLanguageTransitioning = false;
    pageEvents.emit("language:did-change", { language: nextLanguage });
  }
}
