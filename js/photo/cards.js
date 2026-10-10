/* Writing the photo theatre to the DOM: cards, title, queue and Show All. */

import { coerceNumber } from "../core/math.js?v=54e566c4";
import {
  setAttributeIfChanged,
  setDataIfChanged,
  setStyleFieldIfChanged,
  setStylePropertyIfChanged,
} from "../core/style-writes.js?v=d4be61ed";
import { isTouchFirst } from "../core/viewport.js?v=71b5eb94";
import { getActiveCopy } from "../i18n/language.js?v=c4a9e128";
import { pageTranslations } from "../i18n/translations.js?v=2ea6af69";
import {
  PHOTO_AFTER_COMPLETE_SCROLL_PX,
  PHOTO_INTRO_PHASES,
  PHOTO_SECTION_EXTRA_HEIGHT_PX,
} from "./config.js?v=0c53704a";
import {
  photoFixedTitle,
  photoFloatingCards,
  photoQueueAnchor,
  photoQueueCards,
  photoSection,
  photoShowAllButton,
  photoStage,
} from "./dom.js?v=64ce044a";
import {
  carousel,
  expand,
  expandTarget,
  photoCardSlotMap,
  photoCardStyleCache,
  photoSlotContentMap,
} from "./state.js?v=b4cbf01b";

export function initPhotoQueueCards() {
  if (!photoStage) {
    return;
  }

  photoQueueCards.forEach((card) => {
    if (card.parentElement !== photoStage) {
      photoStage.append(card);
    }
  });
}

export function applyPhotoSectionScrollHeight(viewportHeight, isCompact) {
  const durationVh = isCompact
    ? PHOTO_INTRO_PHASES.mobileRawDurationVh
    : PHOTO_INTRO_PHASES.rawDurationVh;
  const extraHeight = isCompact
    ? PHOTO_SECTION_EXTRA_HEIGHT_PX.mobile
    : PHOTO_SECTION_EXTRA_HEIGHT_PX.desktop;
  const expandedExtraHeight = Math.max(0, expand.scrollExtraPx);
  const height = viewportHeight * (durationVh + 0.28) + PHOTO_AFTER_COMPLETE_SCROLL_PX;

  setStyleFieldIfChanged(photoSection, "minHeight", `${height.toFixed(2)}px`);
  setStyleFieldIfChanged(photoSection, "paddingBottom", `${(extraHeight + expandedExtraHeight).toFixed(2)}px`);
}

export function applyPhotoQueueIntroFrame({ queueY, queueOpacity }) {
  setStylePropertyIfChanged(photoSection, "--photo-queue-y", `${queueY.toFixed(2)}px`);
  setStylePropertyIfChanged(photoSection, "--photo-queue-opacity", queueOpacity.toFixed(3));
}

export function applyPhotoTitleFrame({ opacity, y }) {
  photoFixedTitle?.classList.toggle("is-visible", opacity > 0.02);
  setStylePropertyIfChanged(photoFixedTitle, "--photo-fixed-title-opacity", opacity.toFixed(3));
  setStylePropertyIfChanged(photoFixedTitle, "--photo-title-y", `${y.toFixed(2)}px`);
}

export function applyPhotoQueueAnchorFrame({ cardHeight, queueBleed, queueProgress }) {
  setStyleFieldIfChanged(photoQueueAnchor, "height", `${cardHeight.toFixed(2)}px`);
  setStyleFieldIfChanged(photoQueueAnchor, "zIndex", "0");
  setStylePropertyIfChanged(photoSection, "--photo-queue-bleed", `${queueBleed.toFixed(2)}px`);
  setStylePropertyIfChanged(photoSection, "--photo-insert-progress", queueProgress.toFixed(3));
}

function getPhotoShowAllLabel(expanded) {
  const copy = getActiveCopy();
  if (expanded) {
    return copy.photoCollapseLabel || pageTranslations.en.photoCollapseLabel || "Collapse";
  }

  return copy.photoShowAllLabel || pageTranslations.en.photoShowAllLabel || "Show All";
}

export function syncPhotoShowAllButtonCopy() {
  if (!photoShowAllButton) {
    return;
  }

  const showAllText = getPhotoShowAllLabel(expandTarget() > 0.5);
  if (photoShowAllButton.textContent !== showAllText) {
    photoShowAllButton.textContent = showAllText;
  }
}

export function applyPhotoShowAllFrame({
  visible,
  expanded,
  x,
  y,
}) {
  if (!photoShowAllButton) {
    return;
  }

  photoShowAllButton.classList.toggle("is-visible", visible);
  setAttributeIfChanged(photoShowAllButton, "aria-expanded", String(expanded));
  const showAllText = getPhotoShowAllLabel(expanded);
  if (photoShowAllButton.textContent !== showAllText) {
    photoShowAllButton.textContent = showAllText;
  }
  setStylePropertyIfChanged(photoShowAllButton, "--photo-show-all-opacity", visible ? "1" : "0");
  setStylePropertyIfChanged(photoShowAllButton, "--photo-show-all-x", `${x.toFixed(2)}px`);
  setStylePropertyIfChanged(photoShowAllButton, "--photo-show-all-y", `${y.toFixed(2)}px`);
}

export function readPhotoCardContent(card) {
  const sourceImage = card?.querySelector(".photo-card-image");
  if (!sourceImage) {
    return null;
  }

  const src = sourceImage.getAttribute("data-preview-src") ||
    sourceImage.getAttribute("src") ||
    "";
  const naturalWidth = sourceImage.naturalWidth || 0;
  const naturalHeight = sourceImage.naturalHeight || 0;
  const aspectRatio = naturalWidth > 0 && naturalHeight > 0
    ? naturalWidth / naturalHeight
    : 0;

  return {
    src,
    srcset: sourceImage.getAttribute("srcset") || "",
    sizes: sourceImage.getAttribute("sizes") || "",
    fullSrc: sourceImage.getAttribute("data-full-src") || src,
    fullSrcset: sourceImage.getAttribute("data-full-srcset") || "",
    fullSizes: sourceImage.getAttribute("data-full-sizes") || "",
    label: card.getAttribute("aria-label") || "",
    sourceId: card.dataset.photoBase || card.dataset.photoInsert || card.dataset.photoCloneSource || "",
    aspectRatio,
  };
}

export function syncPhotoCardImageContent(targetCard, sourceContent) {
  if (!targetCard || !sourceContent?.src) {
    return;
  }

  let targetImage = targetCard.querySelector(".photo-card-image");
  if (!targetImage) {
    targetImage = document.createElement("img");
    targetImage.className = "photo-card-image";
    targetImage.alt = "";
    targetImage.loading = "eager";
    targetImage.decoding = "async";
    targetImage.draggable = false;
    const shine = targetCard.querySelector(".photo-card-shine");
    targetCard.insertBefore(targetImage, shine || targetCard.firstChild);
  }

  setAttributeIfChanged(targetImage, "loading", "eager");
  setAttributeIfChanged(targetImage, "decoding", "async");

  ["src", "srcset", "sizes"].forEach((attribute) => {
    const value = sourceContent[attribute];
    if (value) {
      setAttributeIfChanged(targetImage, attribute, value);
    } else if (targetImage.hasAttribute(attribute)) {
      targetImage.removeAttribute(attribute);
    }
  });

  [
    ["data-preview-src", sourceContent.src],
    ["data-full-src", sourceContent.fullSrc],
    ["data-full-srcset", sourceContent.fullSrcset],
    ["data-full-sizes", sourceContent.fullSizes],
  ].forEach(([attribute, value]) => {
    if (value) {
      setAttributeIfChanged(targetImage, attribute, value);
    } else if (targetImage.hasAttribute(attribute)) {
      targetImage.removeAttribute(attribute);
    }
  });
}

export function ensurePhotoSlotContentMap({
  finalCount,
  initialCount,
  centerSlot,
}) {
  if (photoSlotContentMap.size > 0 || finalCount <= 0) {
    return;
  }

  const initialFloatingSlots = (() => {
    if (photoFloatingCards.length === 1) {
      return [centerSlot];
    }

    if (photoFloatingCards.length === 3) {
      return [
        Math.max(0, centerSlot - 5),
        centerSlot,
        Math.min(finalCount - 1, centerSlot + 4),
      ];
    }

    return photoFloatingCards.map((_, index) => Math.min(finalCount - 1, centerSlot + index));
  })();
  const initialFloatingSlotSet = new Set(initialFloatingSlots);
  const initialQueueSlots = Array.from({ length: finalCount }, (_, index) => index)
    .filter((slot) => !initialFloatingSlotSet.has(slot))
    .slice(0, initialCount);

  photoQueueCards.forEach((card, index) => {
    const slot = initialQueueSlots[index];
    const content = readPhotoCardContent(card);
    if (Number.isFinite(slot) && content) {
      photoSlotContentMap.set(slot, content);
    }
  });

  photoFloatingCards.forEach((card, index) => {
    const slot = initialFloatingSlots[index];
    const content = readPhotoCardContent(card);
    if (Number.isFinite(slot) && content) {
      photoSlotContentMap.set(slot, content);
    }
  });
}

export function applyPhotoCardFrames({
  cardFrames,
  hitRect,
  slotEntries,
  selectedSourceCard,
}) {
  cardFrames.forEach(({ card, layout, options, data = [], attributes = [] }) => {
    data.forEach(([name, value]) => {
      setDataIfChanged(card, name, value);
    });
    attributes.forEach(([name, value]) => {
      setAttributeIfChanged(card, name, value);
    });
    applyPhotoCardStyle(card, layout, options);
  });

  carousel.hitRectCache = hitRect;
  photoCardSlotMap.clear();
  slotEntries.forEach(([slot, card]) => {
    photoCardSlotMap.set(slot, card);
  });
  carousel.selectedSourceCard = selectedSourceCard || carousel.selectedSourceCard;
}

export function createPhotoHitRectCollector(stageRect, cardWidth, cardHeight) {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  let hasRect = false;

  return {
    include(layout, baseX = 0) {
      if (!layout || layout.opacity <= 0.02) {
        return;
      }

      const scale = Math.max(layout.scale || 1, 0.01);
      const radians = ((layout.rotate || 0) * Math.PI) / 180;
      const cos = Math.abs(Math.cos(radians));
      const sin = Math.abs(Math.sin(radians));
      const width = cardWidth * scale;
      const height = cardHeight * scale;
      const halfWidth = (width * cos + height * sin) / 2;
      const halfHeight = (width * sin + height * cos) / 2;
      const centerX = stageRect.left + baseX + layout.x + cardWidth / 2;
      const centerY = stageRect.top + layout.y + cardHeight / 2;

      hasRect = true;
      left = Math.min(left, centerX - halfWidth);
      top = Math.min(top, centerY - halfHeight);
      right = Math.max(right, centerX + halfWidth);
      bottom = Math.max(bottom, centerY + halfHeight);
    },
    getRect() {
      return hasRect ? { left, top, right, bottom } : null;
    },
  };
}

function applyPhotoCardStyle(card, layout, options = {}) {
  const useMobilePhotoPerformance = options.mobilePerformance ?? isTouchFirst();
  const transform = `translate3d(${layout.x.toFixed(2)}px, ${layout.y.toFixed(2)}px, 0) rotate(${layout.rotate.toFixed(2)}deg) scale(${layout.scale.toFixed(3)})`;
  const opacity = layout.opacity.toFixed(3);
  const zIndex = String(layout.zIndex);
  const filter = useMobilePhotoPerformance ? "" : (options.filter ?? "");
  const shadowStrength = useMobilePhotoPerformance
    ? "3.20%"
    : (
        options.shadowStrength == null
          ? null
          : `${options.shadowStrength.toFixed(2)}%`
      );
  const cardDepth = useMobilePhotoPerformance
    ? "10.00px"
    : (
        options.cardDepth == null
          ? null
          : `${options.cardDepth.toFixed(2)}px`
      );
  const shineX = useMobilePhotoPerformance
    ? "0.00%"
    : (
        options.shineX == null
          ? null
          : `${options.shineX.toFixed(2)}%`
      );
  let cache = photoCardStyleCache.get(card);

  if (!cache) {
    cache = {};
    photoCardStyleCache.set(card, cache);
  }

  if (cache.transform !== transform) {
    card.style.transform = transform;
    cache.transform = transform;
  }

  if (cache.opacity !== opacity) {
    card.style.opacity = opacity;
    cache.opacity = opacity;
  }

  if (cache.filter !== filter) {
    card.style.filter = filter;
    cache.filter = filter;
  }

  if (cache.zIndex !== zIndex) {
    card.style.zIndex = zIndex;
    cache.zIndex = zIndex;
  }

  if (shadowStrength !== null && cache.shadowStrength !== shadowStrength) {
    card.style.setProperty("--photo-card-shadow-strength", shadowStrength);
    cache.shadowStrength = shadowStrength;
  }

  if (cardDepth !== null && cache.cardDepth !== cardDepth) {
    card.style.setProperty("--photo-card-depth", cardDepth);
    cache.cardDepth = cardDepth;
  }

  if (shineX !== null && cache.shineX !== shineX) {
    card.style.setProperty("--photo-shine-x", shineX);
    cache.shineX = shineX;
  }
}

export function getPhotoCardLayoutSnapshot(card) {
  const style = window.getComputedStyle(card);
  const transform = style.transform;
  let x = 0;
  let y = 0;
  let scale = 1;
  let rotate = 0;

  if (transform && transform !== "none") {
    try {
      const matrix = new DOMMatrixReadOnly(transform);
      x = matrix.m41;
      y = matrix.m42;
      scale = Math.hypot(matrix.a, matrix.b) || 1;
      rotate = Math.atan2(matrix.b, matrix.a) * (180 / Math.PI);
    } catch (error) {
      x = 0;
      y = 0;
      scale = 1;
      rotate = 0;
    }
  }

  return {
    x,
    y,
    scale,
    rotate,
    /* || would turn a legitimate 0 into 1. Nothing sets opacity 0 on these
       cards today, so this is a trap rather than a live bug: the day a card
       is faded out, the expand animation would start it fully opaque and it
       would pop. */
    opacity: coerceNumber(Number.parseFloat(style.opacity), 1),
    zIndex: coerceNumber(Number.parseInt(style.zIndex, 10), 1),
  };
}
