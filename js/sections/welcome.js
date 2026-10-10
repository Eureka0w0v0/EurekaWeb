/* The Welcome word, drawn to canvas and scattered into dust on scroll. */

import { body } from "../core/dom.js?v=5057c320";
import { pageEvents } from "../core/events.js?v=8c4a4d4a";
import { isElementInViewport, shouldReduceMotion } from "../core/viewport.js?v=71b5eb94";
import { getActiveCopy } from "../i18n/language.js?v=c4a9e128";

export const welcomeSection = document.querySelector("#welcome-section");
const welcomeWord = document.querySelector("#welcome-word");
const welcomeCanvas = document.querySelector("#welcome-canvas");
const welcomeCtx = welcomeCanvas?.getContext("2d");
let welcomeRenderFrame = 0;
let welcomeLayers = [];
/* How far the welcome word has condensed out of its own dust: 0 is all dust,
   1 is the word as built. Only the intro moves it; see runWelcomeEntrance. */
let welcomeEntrance = 1;
let welcomeEntranceFrame = 0;

function buildWelcomeLayer(wordElement, canvasElement, context, text) {
  if (!wordElement || !canvasElement || !context) {
    return null;
  }

  const rect = wordElement.getBoundingClientRect();
  const dpr = 1;
  const contentWidth = Math.max(320, Math.round(rect.width));
  const contentHeight = Math.max(160, Math.round(rect.height));
  /* Extra room so crumble particles can fly out without hitting a hard box edge. */
  const padX = Math.round(Math.max(160, contentWidth * 0.55));
  const padY = Math.round(Math.max(140, contentHeight * 0.85));
  const width = contentWidth + padX * 2;
  const height = contentHeight + padY * 2;
  const originX = padX;
  const originY = padY;
  const sampleCanvas = document.createElement("canvas");
  const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
  const style = getComputedStyle(wordElement);
  const fontSize = parseFloat(style.fontSize);
  const fontFamily = style.fontFamily;
  const fontWeight = style.fontWeight;
  const letterSpacing = parseFloat(style.letterSpacing);
  const font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const textColor = getComputedStyle(body).getPropertyValue("--welcome-text").trim();

  canvasElement.width = Math.round(width * dpr);
  canvasElement.height = Math.round(height * dpr);
  canvasElement.style.width = `${width}px`;
  canvasElement.style.height = `${height}px`;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  sampleCanvas.width = contentWidth;
  sampleCanvas.height = contentHeight;
  sampleCtx.clearRect(0, 0, contentWidth, contentHeight);
  sampleCtx.font = font;
  sampleCtx.textAlign = "center";
  sampleCtx.textBaseline = "middle";
  sampleCtx.fillStyle = "#000";
  sampleCtx.letterSpacing = `${letterSpacing}px`;
  sampleCtx.fillText(text, contentWidth / 2, contentHeight / 2 + fontSize * 0.05);

  const imageData = sampleCtx.getImageData(0, 0, contentWidth, contentHeight);
  const area = contentWidth * contentHeight;
  const densityScale = area > 220000 ? 1.3 : 1;
  const gap = Math.max(2, Math.round((fontSize / 48) * densityScale));
  const points = [];
  const maxDistance = Math.hypot(contentWidth / 2, contentHeight / 2);

  for (let y = 0; y < contentHeight; y += gap) {
    for (let x = 0; x < contentWidth; x += gap) {
      const alpha = imageData.data[(y * contentWidth + x) * 4 + 3];
      if (alpha > 96) {
        let neighbors = 0;
        const offsets = [
          [-gap, 0],
          [gap, 0],
          [0, -gap],
          [0, gap],
          [-gap, -gap],
          [gap, -gap],
          [-gap, gap],
          [gap, gap],
        ];

        offsets.forEach(([offsetX, offsetY]) => {
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (nextX < 0 || nextX >= contentWidth || nextY < 0 || nextY >= contentHeight) {
            return;
          }

          const neighborAlpha = imageData.data[(nextY * contentWidth + nextX) * 4 + 3];
          if (neighborAlpha > 96) {
            neighbors += 1;
          }
        });

        const edgeFactor = 1 - neighbors / 8;
        const radialFactor =
          Math.hypot(x - contentWidth / 2, y - contentHeight / 2) / Math.max(maxDistance, 1);
        const baseAngle = Math.atan2(y - contentHeight / 2, x - contentWidth / 2);
        const baseDelay = Math.max(0, (1 - edgeFactor) * 0.48 + radialFactor * 0.22);
        const spawnCount = 2 + Math.floor(Math.random() * 2);
        for (let s = 0; s < spawnCount; s += 1) {
          const angle = baseAngle + (Math.random() - 0.5) * 1.6;
          const force = 60 + Math.random() * 220;
          points.push({
            x: originX + x + (Math.random() - 0.5) * gap,
            y: originY + y + (Math.random() - 0.5) * gap,
            size: 0.6 + Math.random() * 1.4,
            driftX: Math.cos(angle) * force + (Math.random() - 0.5) * 50,
            driftY: Math.sin(angle) * force + (Math.random() - 0.5) * 50 + Math.random() * 20,
            wave: (Math.random() - 0.5) * 5,
            delay: baseDelay + Math.random() * 0.1,
            edgeFactor,
            shimmer: Math.random() * Math.PI * 2,
            orbit: Math.random() * Math.PI * 2,
            spread: 3 + Math.random() * 10,
            gravity: 0.1 + Math.random() * 0.3,
            windResistance: 0.4 + Math.random() * 0.6,
          });
        }
      }
    }
  }

  const textureCanvas = document.createElement("canvas");
  const textureCtx = textureCanvas.getContext("2d");
  textureCanvas.width = width;
  textureCanvas.height = height;
  textureCtx.clearRect(0, 0, width, height);
  textureCtx.font = font;
  textureCtx.textAlign = "center";
  textureCtx.textBaseline = "middle";
  textureCtx.letterSpacing = `${letterSpacing}px`;

  textureCtx.fillStyle = textColor;
  textureCtx.fillText(
    text,
    originX + contentWidth / 2,
    originY + contentHeight / 2 + fontSize * 0.05
  );

  const dustCanvas = document.createElement("canvas");
  dustCanvas.width = width;
  dustCanvas.height = height;
  const dustCtx = dustCanvas.getContext("2d");

  return {
    canvas: canvasElement,
    context,
    width,
    height,
    font,
    fontSize,
    letterSpacing,
    text,
    textColor,
    points,
    texture: textureCanvas,
    dustCanvas,
    dustCtx,
  };
}

export function buildWelcomeCanvas(text = getActiveCopy().welcomeWord) {
  welcomeLayers = [];

  const primaryLayer = buildWelcomeLayer(
    welcomeWord,
    welcomeCanvas,
    welcomeCtx,
    text
  );

  if (primaryLayer) {
    welcomeLayers.push({ ...primaryLayer, type: "primary" });
  }
}

function getWelcomeProgress() {
  if (!welcomeSection) {
    return 0;
  }

  const sectionTop = welcomeSection.offsetTop;
  const sectionHeight = welcomeSection.offsetHeight;
  const rawProgress = (window.scrollY - sectionTop) / Math.max(sectionHeight * 0.72, 1);
  return Math.min(Math.max(rawProgress, 0), 1);
}

export function drawWelcome() {
  if (welcomeLayers.length === 0) {
    return;
  }

  const progress = getWelcomeProgress();
  const scrollEased = 1 - (1 - progress) * (1 - progress);
  body.style.setProperty("--welcome-progress", `${scrollEased}`);

  /* The intro's entrance is this same crumble run backwards, so the two just
     take the larger claim on the word. The CSS variable stays scroll-only: the
     kicker above the word must not fade while the word is still condensing. */
  const unformed = 1 - welcomeEntrance;
  const eased = Math.max(scrollEased, unformed);
  const crumble = Math.max(Math.min(1, Math.max(0, (progress - 0.06) / 0.9)), unformed);

  /* Everything above is cheap and has to run on every scroll frame: the CSS
     variable drives the kicker fade, which is readable while the canvas is
     not. Everything below is not cheap -- a few thousand particles and a
     full-canvas blur -- and is invisible once the section leaves the
     viewport, so from here on there is nothing worth painting.

     The entrance is the one case where the section can be off screen and
     still need to paint: runWelcomeEntrance starts while the intro panels
     still cover the page. welcomeEntrance is 1 once that has finished. */
  if (welcomeEntrance >= 1 && !isElementInViewport(welcomeSection)) {
    return;
  }

  welcomeLayers.forEach((layer) => {
    const { context, width, height, texture, points, textColor, type } = layer;
    context.clearRect(0, 0, width, height);

    const textOpacity = Math.max(0, 1 - eased * (type === "primary" ? 1.08 : 1.18));
    const textShiftX = eased * (type === "primary" ? 18 : 10);
    const textShiftY = -eased * (type === "primary" ? 10 : 6);
    context.save();
    context.globalAlpha = textOpacity;
    context.translate(textShiftX, textShiftY);
    context.drawImage(texture, 0, 0);

    context.globalCompositeOperation = "destination-out";
    points.forEach((point) => {
      const threshold = point.delay * 0.78 + (1 - point.edgeFactor) * 0.18;
      const localProgress = Math.max(
        0,
        Math.min(1, (crumble - threshold) / Math.max(1 - threshold, 0.001))
      );
      if (localProgress <= 0) {
        return;
      }

      const cutSize = point.size * (1.1 + localProgress * 2.4);
      const smearX = point.driftX * localProgress * 0.16;
      const smearY = point.driftY * localProgress * 0.12;
      const cutW = cutSize * (0.6 + Math.sin(point.shimmer * 3) * 0.4);
      const cutH = cutSize * (0.6 + Math.cos(point.shimmer * 2) * 0.4);
      context.save();
      context.translate(point.x + smearX, point.y + smearY);
      context.rotate(point.shimmer);
      context.fillRect(-cutW / 2, -cutH / 2, cutW, cutH);
      context.restore();
    });
    context.globalCompositeOperation = "source-over";
    context.restore();

    if (eased < 0.08) {
      return;
    }

    const { dustCanvas, dustCtx } = layer;
    dustCtx.clearRect(0, 0, width, height);
    dustCtx.fillStyle = textColor;

    points.forEach((point) => {
      const localProgress = Math.max(
        0,
        Math.min(1, (crumble - point.delay) / Math.max(1 - point.delay, 0.001))
      );
      if (localProgress <= 0) {
        return;
      }

      const t = 1 - (1 - localProgress) * (1 - localProgress);
      const gravityPull = point.gravity * t * t * 40;
      const sway = Math.sin(t * Math.PI * 1.6 + point.shimmer) * point.wave * (1 - t * 0.5);
      const x = point.x + point.driftX * t * point.windResistance + sway;
      const y = point.y + point.driftY * t * point.windResistance + gravityPull;
      const radius = point.size * (0.8 + t * 1.2);
      const alpha = Math.max(0, (1 - t * 0.7) * 1.0 - eased * 0.04);

      dustCtx.globalAlpha = alpha;
      dustCtx.fillRect(x - radius * 0.5, y - radius * 0.5, radius, radius);
    });

    const blurRadius = Math.min(4, 0.8 + eased * 3.2);
    context.save();
    context.filter = `blur(${blurRadius.toFixed(1)}px)`;
    context.globalAlpha = 1.0;
    context.drawImage(dustCanvas, 0, 0);
    context.filter = "none";
    context.globalAlpha = 0.75;
    context.drawImage(dustCanvas, 0, 0);
    context.restore();
  });
}

/* Condenses the welcome word out of dust by running the scroll crumble in
   reverse. Nothing here is new drawing code: welcomeEntrance is fed into
   drawWelcome as a floor on the crumble, so the particles fly back along the
   exact paths the first scroll will send them out on. Interior points carry
   the larger delays, so they land first and the outline sharpens last. */
export function runWelcomeEntrance(duration = 1000) {
  if (shouldReduceMotion() || !welcomeCanvas) {
    return;
  }

  if (welcomeLayers.length === 0) {
    buildWelcomeCanvas();
  }
  if (welcomeLayers.length === 0) {
    return;
  }

  if (welcomeEntranceFrame) {
    window.cancelAnimationFrame(welcomeEntranceFrame);
  }

  const start = performance.now();
  welcomeEntrance = 0;
  drawWelcome();

  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    /* Ease in-out so the dust does not lurch on the first frame the panels
       uncover it, and settles rather than snapping at the end. */
    welcomeEntrance = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    drawWelcome();

    if (t < 1) {
      welcomeEntranceFrame = window.requestAnimationFrame(step);
      return;
    }

    welcomeEntranceFrame = 0;
    welcomeEntrance = 1;
    drawWelcome();
  };

  welcomeEntranceFrame = window.requestAnimationFrame(step);
}

export function requestWelcomeRender() {
  if (welcomeRenderFrame) {
    return;
  }

  welcomeRenderFrame = window.requestAnimationFrame(() => {
    drawWelcome();
    welcomeRenderFrame = 0;
  });
}

export function bindWelcomeReactions() {
  pageEvents.on("language:change", ({ copy }) => {
    buildWelcomeCanvas(copy.welcomeWord);
    requestWelcomeRender();
  });
  pageEvents.on("theme:snapshot", () => {
    if (isElementInViewport(welcomeSection)) {
      buildWelcomeCanvas();
      drawWelcome();
    }
  });
  pageEvents.on("theme:render-now", () => {
    buildWelcomeCanvas();
    drawWelcome();
    requestWelcomeRender();
  });
  pageEvents.on("theme:render-frame", () => {
    const welcomeVisible = isElementInViewport(welcomeSection);
    buildWelcomeCanvas();
    if (welcomeVisible) {
      drawWelcome();
    } else {
      requestWelcomeRender();
    }
  });
}

export function requestWelcomeScatterUpdate() {
  requestWelcomeRender();
}
