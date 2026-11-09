/* The active language, the language menu, and switching between languages. */

import { pageEvents } from "../core/events.js?v=8c4a4d4a";
import { safeStorageGet, safeStorageSet } from "../core/storage.js?v=55891515";
import { shouldReduceMotion } from "../core/viewport.js?v=c7860737";
import { getKineticTextPlan, getScramblePool, runKineticLanguageBatches } from "./kinetic.js?v=4cddeed9";
import { pageTranslations } from "./translations.js?v=2ea6af69";

const languageSwitcher = document.querySelector("#language-switcher");
const languageToggle = document.querySelector("#language-toggle");
const languageMenu = document.querySelector("#language-menu");
const languageOptions = document.querySelectorAll("[data-language]");
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

function resolveLanguage() {
  const storedLanguage = getStoredLanguage();
  if (storedLanguage && pageTranslations[storedLanguage]) {
    return storedLanguage;
  }

  return getSystemLanguage();
}

export function getActiveCopy() {
  return pageTranslations[activeLanguage] || pageTranslations.zh;
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

   The photo cards take a count rather than twenty strings per language: a
   label with {n} in it gets the number from the element's data-i18n-n, so this
   module does not need to know how the photo theatre numbers its cards. */
function applyAriaLabels(copy) {
  document.querySelectorAll(i18nAriaSelector).forEach((node) => {
    const key = node.dataset.i18nAria;
    if (!key || !(key in copy)) {
      return;
    }

    const value = copy[key];
    const index = node.dataset.i18nN;
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

function toggleLanguageMenu() {
  if (!languageSwitcher || !languageToggle || !languageMenu) {
    return;
  }

  const isOpen = languageSwitcher.classList.toggle("is-open");
  languageToggle.setAttribute("aria-expanded", `${isOpen}`);
  languageMenu.setAttribute("aria-hidden", `${!isOpen}`);
}

function applyLanguage(language) {
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

/* The language the page opens in: the stored choice, or else the system's. */
export function applyPreferredLanguage() {
  applyLanguage(resolveLanguage());
}

let isLanguageTransitioning = false;

async function switchLanguageWithAnimation(language) {
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
    const { copy, animated, liteNodes, staticNodes } = getKineticTextPlan(nextLanguage, i18nNodes);
    const pool = getScramblePool(nextLanguage);

    syncLanguageChrome(copy, nextLanguage);
    staticNodes.forEach(({ node, toText }) => {
      node.textContent = toText;
    });
    pageEvents.emit("language:change", { language: nextLanguage, copy, animated: true });

    await runKineticLanguageBatches(animated, liteNodes, pool);
  } catch (error) {
    console.warn("[EurekaWeb] The animated language switch failed; switching instantly.", error);
    applyLanguage(nextLanguage);
  } finally {
    isLanguageTransitioning = false;
    pageEvents.emit("language:did-change", { language: nextLanguage });
  }
}

export function wireLanguageMenu() {
  languageToggle?.addEventListener("click", () => {
    toggleLanguageMenu();
  });

  languageOptions.forEach((option) => {
    option.addEventListener("click", async () => {
      const nextLanguage = option.dataset.language || "zh";
      await switchLanguageWithAnimation(nextLanguage);
    });
  });

  window.addEventListener("click", (event) => {
    if (!languageSwitcher?.contains(event.target)) {
      closeLanguageMenu();
    }
  });
}
