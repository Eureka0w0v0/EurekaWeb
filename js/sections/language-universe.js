/* The programming-language section: pills, connector lines, insight panel. */

import { pageEvents } from "../core/events.js?v=8c4a4d4a";
import { isCompactLayout, isWideLayout, shouldReduceMotion } from "../core/viewport.js?v=71b5eb94";
import { getActiveCopy } from "../i18n/language.js?v=c4a9e128";
import { brainMount, brainSceneController, brainWrap } from "./brain.js?v=85aeb3c7";

export const languageUniverse = document.querySelector("#language-universe");
const languageStage = document.querySelector(".language-stage");
const languageNetwork = document.querySelector(".language-network");
export const languageNodeButtons = document.querySelectorAll(".language-node[data-language-node]");
export const languageIndexButtons = document.querySelectorAll(".language-index-item");
const languageInsightTitle = document.querySelector("[data-language-insight-title]");
const languageInsightText = document.querySelector("[data-language-insight-text]");
const languageInsightTags = document.querySelector("[data-language-insight-tags]");
let languageNetworkFrame = 0;
/* Measured geometry for the connector lines, filled in by
   syncLanguageNetworkLines() and replayed every frame by
   updateLanguageNetworkEndpoints(). Pill offsets are stored relative to the
   SVG's own rect rather than the viewport, so scrolling leaves them valid --
   the pills and the SVG move together -- and only the shell's outline has to be
   re-projected per frame. Null on mobile, where the lines use the static
   wrapper-fraction anchors instead. */
let languageNetworkLayout = null;

const languageNodeInfo = {
  cpp: {
    label: "C++",
    textKey: "languageNodeCppText",
    tagsKey: "languageNodeCppTags",
    fallbackTags: ["Compiled", "Performance", "Systems"],
  },
  html: {
    label: "HTML",
    textKey: "languageNodeHtmlText",
    tagsKey: "languageNodeHtmlTags",
    fallbackTags: ["Markup", "Semantics", "Web Base"],
  },
  css: {
    label: "CSS",
    textKey: "languageNodeCssText",
    tagsKey: "languageNodeCssTags",
    fallbackTags: ["Styling", "Layout", "Responsive"],
  },
  js: {
    label: "JavaScript",
    textKey: "languageNodeJsText",
    tagsKey: "languageNodeJsTags",
    fallbackTags: ["Scripting", "Interaction", "Dynamic Web"],
  },
  py: {
    label: "Python",
    textKey: "languageNodePyText",
    tagsKey: "languageNodePyTags",
    fallbackTags: ["Interpreted", "Data", "Automation"],
  },
};

export let activeLanguageNode = "js";

function getLanguageNodeTags(nodeInfo, copy) {
  const translatedTags = copy[nodeInfo.tagsKey];
  return Array.isArray(translatedTags) && translatedTags.length > 0
    ? translatedTags
    : nodeInfo.fallbackTags;
}

export function setActiveLanguageNode(nodeKey) {
  const nodeInfo = languageNodeInfo[nodeKey] || languageNodeInfo.js;
  const copy = getActiveCopy();

  activeLanguageNode = nodeKey in languageNodeInfo ? nodeKey : "js";
  languageUniverse?.classList.remove("active-cpp", "active-html", "active-css", "active-js", "active-py");
  languageUniverse?.classList.add(`active-${activeLanguageNode}`);

  languageNodeButtons.forEach((button) => {
    const isActive = button.dataset.languageNode === activeLanguageNode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", `${isActive}`);
  });

  languageIndexButtons.forEach((button) => {
    const isActive = button.dataset.languageNode === activeLanguageNode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-current", isActive ? "true" : "false");
  });

  if (languageInsightTitle) {
    languageInsightTitle.textContent = nodeInfo.label;
  }

  if (languageInsightText) {
    languageInsightText.dataset.i18n = nodeInfo.textKey;
    languageInsightText.textContent = copy[nodeInfo.textKey] || "";
  }

  if (languageInsightTags) {
    const fragment = document.createDocumentFragment();
    getLanguageNodeTags(nodeInfo, copy).forEach((tag) => {
      const tagNode = document.createElement("span");
      tagNode.textContent = tag;
      fragment.append(tagNode);
    });
    languageInsightTags.replaceChildren(fragment);
  }

  requestLanguageNetworkSync();
}

function toNetworkPoint(networkRect, x, y) {
  return {
    x: ((x - networkRect.left) / Math.max(networkRect.width, 1)) * 100,
    y: ((y - networkRect.top) / Math.max(networkRect.height, 1)) * 100,
  };
}

function getRectEdgePoint(rect, targetPoint) {
  const center = {
    x: rect.left + rect.width * 0.5,
    y: rect.top + rect.height * 0.5,
  };
  const dx = targetPoint.x - center.x;
  const dy = targetPoint.y - center.y;

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return center;
  }

  const halfWidth = Math.max(rect.width * 0.5, 1);
  const halfHeight = Math.max(rect.height * 0.5, 1);
  const scale = Math.min(
    Math.abs(dx) > 0.001 ? halfWidth / Math.abs(dx) : Number.POSITIVE_INFINITY,
    Math.abs(dy) > 0.001 ? halfHeight / Math.abs(dy) : Number.POSITIVE_INFINITY
  );

  return {
    x: center.x + dx * scale,
    y: center.y + dy * scale,
  };
}

/* Point where the ray from an ellipse's centre toward a rect's centre crosses
   the ellipse. Normalising by the radii turns the ellipse into a unit circle,
   where the crossing is just the direction vector over its own length. */
function getEllipseEdgePoint(ellipse, nodeRect) {
  const dx = nodeRect.left + nodeRect.width * 0.5 - ellipse.cx;
  const dy = nodeRect.top + nodeRect.height * 0.5 - ellipse.cy;
  const length = Math.hypot(dx, dy);

  if (length <= 0.001) {
    return { x: ellipse.cx, y: ellipse.cy };
  }

  /* A measured outline, when there is one: the outer radius in the pill's
     angular bin and its two neighbours, so a line aimed between two vertices
     still lands on the nearer crest instead of falling into the gap. The
     ellipse below is the mobile path's, and the fallback when the scene is
     not up yet. */
  if (ellipse.bins) {
    const count = ellipse.binCount;
    const centre = Math.round((Math.atan2(dy, dx) / (Math.PI * 2)) * count);
    let radius = 0;
    for (let k = -1; k <= 1; k += 1) {
      const r = ellipse.bins[(((centre + k) % count) + count) % count];
      if (r > radius) radius = r;
    }
    if (radius > 0) {
      return { x: ellipse.cx + (dx / length) * radius, y: ellipse.cy + (dy / length) * radius };
    }
  }

  const normalized = Math.sqrt((dx / ellipse.rx) ** 2 + (dy / ellipse.ry) ** 2);

  return {
    x: ellipse.cx + dx / normalized,
    y: ellipse.cy + dy / normalized,
  };
}

function getBrainEdgePoint(anchorRect, nodeRect) {
  const isMobileLayout = isCompactLayout();
  const center = {
    x: anchorRect.left + anchorRect.width * 0.5,
    y: anchorRect.top + anchorRect.height * (isMobileLayout ? 0.54 : 0.58),
  };
  const nodeCenter = {
    x: nodeRect.left + nodeRect.width * 0.5,
    y: nodeRect.top + nodeRect.height * 0.5,
  };
  const dx = nodeCenter.x - center.x;
  const dy = nodeCenter.y - center.y;
  const radiusX = anchorRect.width * (isMobileLayout ? 0.2 : 0.23);
  const radiusY = anchorRect.height * (isMobileLayout ? 0.34 : 0.33);
  const normalizedDistance = Math.sqrt(
    (dx / Math.max(radiusX, 1)) ** 2 + (dy / Math.max(radiusY, 1)) ** 2
  );

  if (normalizedDistance <= 0.001) {
    return center;
  }

  return {
    x: center.x + dx / normalizedDistance,
    y: center.y + dy / normalizedDistance,
  };
}

/* Where each pill sits, as a bearing from the shell's centre: 0 is due right,
   -90 straight up, positive turns downward.

   An even 72-degree ring with the two side pills pressed down by
   LANGUAGE_NODE_SIDE_DROP.

   These two goals are genuinely exclusive and the tilt is the dial between
   them. With Python pinned to the top, an even ring puts C++ and HTML at 18
   degrees above centre, which at this radius is 79px up -- total travel along
   the bearing is outline 129 + gap 58 + half a pill 70, and 257 * sin(18) is
   79. Pressing them level costs the even spacing: 90/54/72/54/90, with two
   obvious voids in the upper corners.

   Ringing the whole brain instead of the shell was an attempt to get both and
   does not: the centre only drops 16px while the radius grows by the same, so
   the two cancel. It is kept because centring on the visible mass is right on
   its own, not because it solved this.

   To move a pill, change only its bearing; the gap and everything downstream
   follow. */
const LANGUAGE_NODE_SIDE_DROP = 9;

const LANGUAGE_NODE_ANGLES = {
  py: -90,
  html: -18 + LANGUAGE_NODE_SIDE_DROP,
  js: 54,
  css: 126,
  cpp: 198 - LANGUAGE_NODE_SIDE_DROP,
};

/* Clearance from the shell's outline to a pill's nearest edge, as a share of
   the shell's mean radius rather than a flat pixel count.

   Not because the brain resizes with the viewport -- measured, it does not:
   the desktop render size is pinned to DESKTOP_BRAIN_RENDER_WIDTH, and the
   shell comes out at a 129px radius at both 1440 and 1920. The ratio is here
   so the clearance stays proportionate if that pinned size is ever changed,
   the same reason the bearings read the silhouette instead of hardcoding
   fractions. At today's radius it works out to 54px.

   The floor only matters if the shell is ever made much smaller, where a
   percentage of it would come to nothing. */
const LANGUAGE_NODE_GAP_RATIO = 0.42;
const LANGUAGE_NODE_GAP_MIN = 44;

/* The pills used to be placed with hand-set percentages of the stage box while
   the brain is an ellipse inside it, so equal percentages meant unequal
   clearance: measured, the gaps ran from -5.6px (CSS sitting on top of the
   mesh) to +58.5px, a 64px spread. Positioning off the same silhouette the
   connectors use makes the clearance identical by construction, and keeps it
   that way if the shell is ever reshaped again.

   Desktop only. Below 680px the layout is a different composition with its own
   percentages, so any inline positioning is handed back to CSS. */
/* Measured in one pass, written in another.

   This used to read a rect and then write left/top inside the same iteration,
   so the next pill's getBoundingClientRect landed on a layout the previous
   one had just dirtied -- five pills, five forced synchronous layouts, on
   every scroll frame, every pill transitionend, and every pointer move that
   drives the parallax. Reading everything first costs one.

   offsetParent is the same element for all five in the current markup, so its
   rect and offset sizes are cached by element rather than re-read per pill. */
function placeLanguageNodes(silhouette) {
  const gap = silhouette
    ? Math.max(LANGUAGE_NODE_GAP_MIN, ((silhouette.rx + silhouette.ry) / 2) * LANGUAGE_NODE_GAP_RATIO)
    : 0;

  const parentMetrics = new Map();
  const measured = [];

  languageNodeButtons.forEach((button) => {
    const key = button.dataset.languageNode;
    const angle = LANGUAGE_NODE_ANGLES[key];
    const parent = button.offsetParent;

    if (!silhouette || angle === undefined || !parent) {
      measured.push({ button, clear: true });
      return;
    }

    let metrics = parentMetrics.get(parent);
    if (!metrics) {
      metrics = {
        rect: parent.getBoundingClientRect(),
        offsetWidth: parent.offsetWidth,
        offsetHeight: parent.offsetHeight,
      };
      parentMetrics.set(parent, metrics);
    }

    measured.push({ button, angle, rect: button.getBoundingClientRect(), metrics });
  });

  measured.forEach(({ button, angle, rect, metrics, clear }) => {
    if (clear) {
      button.style.left = "";
      button.style.top = "";
      return;
    }

    const radians = (angle * Math.PI) / 180;
    const ux = Math.cos(radians);
    const uy = Math.sin(radians);

    // Centre to outline along this bearing.
    const toOutline = 1 / Math.sqrt((ux / silhouette.rx) ** 2 + (uy / silhouette.ry) ** 2);

    /* Centre to the pill's own near edge. Treating the rounded rect as a plain
       one puts the corners a few px further out than measured, which only ever
       errs toward more clearance. */
    const toPillEdge = Math.min(
      Math.abs(ux) > 0.001 ? rect.width / 2 / Math.abs(ux) : Number.POSITIVE_INFINITY,
      Math.abs(uy) > 0.001 ? rect.height / 2 / Math.abs(uy) : Number.POSITIVE_INFINITY
    );

    const distance = toOutline + gap + toPillEdge;
    const parentRect = metrics.rect;

    /* An ancestor of the stage is scaled, so a getBoundingClientRect distance
       is not the number to write into left/top -- those are resolved in the
       containing block's own unscaled space and then scaled on the way to the
       screen. Writing viewport pixels straight in put every pill 2% too far
       out, which is 4-11px at this radius and was the whole residual error
       when this was first measured. Dividing by the rect-to-layout ratio
       recovers local units without needing to know where the scale comes from. */
    const scaleX = metrics.offsetWidth ? parentRect.width / metrics.offsetWidth : 1;
    const scaleY = metrics.offsetHeight ? parentRect.height / metrics.offsetHeight : 1;

    /* .language-node is translate(-50%, -50%), so left/top address its centre.
       The pointer parallax on top of this (--node-depth-*) is left alone; it is
       a deliberate few px of drift, not part of the resting layout. */
    const localX = (silhouette.cx + ux * distance - parentRect.left) / (scaleX || 1);
    const localY = (silhouette.cy + uy * distance - parentRect.top) / (scaleY || 1);

    button.style.left = `${localX.toFixed(2)}px`;
    button.style.top = `${localY.toFixed(2)}px`;
  });
}

function syncLanguageNetworkLines() {
  if (!languageNetwork || !brainMount || languageNodeButtons.length === 0) {
    return;
  }

  const networkRect = languageNetwork.getBoundingClientRect();
  const anchorRect = brainWrap?.getBoundingClientRect() || brainMount.getBoundingClientRect();
  const usesMobileAnchors = isCompactLayout();
  /* Two different outlines on purpose. Lines end on the shell, because that is
     the surface they read as plugging into; pills ring the whole brain, so the
     cerebellum's mass is accounted for and the ring is not pulled off centre by
     ignoring it. */
  /* The measured outline is used wherever the scene is up, phones included;
     only the pill ring stays desktop-only, because on narrow layouts the pills
     are placed by CSS. The wrapper-fraction anchors are now purely the
     fallback for before the scene exists. */
  const silhouette = brainSceneController?.getShellSilhouette?.() || null;
  const pillRing = usesMobileAnchors ? null : brainSceneController?.getBrainSilhouette?.() || null;
  const anchorWidth = Math.max(anchorRect.width, 1);
  const anchorHeight = Math.max(anchorRect.height, 1);
  const entries = [];
  const brainAnchors = {
    cpp: { x: 0.26, y: 0.53 },
    html: { x: 0.74, y: 0.53 },
    css: { x: 0.35, y: 0.69 },
    js: { x: 0.65, y: 0.69 },
    py: { x: 0.5, y: 0.42 },
  };

  /* Before the lines, not after: their endpoints are measured off the pills'
     rects, so those have to be final first. */
  placeLanguageNodes(pillRing);

  languageNodeButtons.forEach((button) => {
    const key = button.dataset.languageNode;
    const line = key ? languageNetwork.querySelector(`.line-${key}`) : null;
    if (!line) {
      return;
    }

    const anchor = brainAnchors[key] || { x: 0.5, y: 0.62 };
    const nodeRect = button.getBoundingClientRect();

    let brainEdge;
    if (silhouette) {
      /* Walk from the shell's centre toward the pill and stop on the outline
         measured off the projected mesh this frame. */
      brainEdge = getEllipseEdgePoint(silhouette, nodeRect);
    } else if (usesMobileAnchors) {
      brainEdge = getBrainEdgePoint(anchorRect, nodeRect);
    } else {
      /* Only before the scene exists -- three.js is imported lazily when this
         section scrolls into view, and the lines are drawn on the way in. */
      brainEdge = {
        x: anchorRect.left + anchorWidth * anchor.x,
        y: anchorRect.top + anchorHeight * anchor.y,
      };
    }
    const nodeEdge = getRectEdgePoint(nodeRect, brainEdge);
    const from = toNetworkPoint(networkRect, brainEdge.x, brainEdge.y);
    const to = toNetworkPoint(networkRect, nodeEdge.x, nodeEdge.y);

    line.setAttribute("x1", from.x.toFixed(2));
    line.setAttribute("y1", from.y.toFixed(2));
    line.setAttribute("x2", to.x.toFixed(2));
    line.setAttribute("y2", to.y.toFixed(2));

    entries.push({
      line,
      dx: nodeRect.left - networkRect.left,
      dy: nodeRect.top - networkRect.top,
      width: nodeRect.width,
      height: nodeRect.height,
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
    });
  });

  languageNetworkLayout = silhouette ? entries : null;
}

/* The per-frame half of the connector sync. The brain spins and bobs forever,
   but this used to run only on scroll and resize, so the endpoints were pinned
   to whatever pose the brain held when the page last moved -- which is why
   getShellSilhouette had to hand back the narrowest outline the spin could
   produce rather than the real one.

   Everything expensive stays in syncLanguageNetworkLines: the pills do not move
   while the brain turns, so their rects are reused from there. This re-projects
   one ellipse and writes at most four numbers per line. */
function updateLanguageNetworkEndpoints() {
  const entries = languageNetworkLayout;
  if (!entries || entries.length === 0 || !languageNetwork) {
    return;
  }

  /* Bail before getShellSilhouette, not after. The silhouette is genuinely
     cheap to *test* -- it is already in viewport coordinates -- but producing
     it projects every vertex of the shell through the camera, and that is the
     work this early return exists to avoid. The network element wraps the
     brain, so its rect answers the same question for the price of one layout
     read, and the rect is needed below regardless. */
  const networkRect = languageNetwork.getBoundingClientRect();
  if (!networkRect.width || !networkRect.height) {
    return;
  }

  if (networkRect.bottom < 0 || networkRect.top > window.innerHeight) {
    return;
  }

  const silhouette = brainSceneController?.getShellSilhouette?.();
  if (!silhouette) {
    return;
  }

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const nodeRect = {
      left: networkRect.left + entry.dx,
      top: networkRect.top + entry.dy,
      width: entry.width,
      height: entry.height,
    };

    const brainEdge = getEllipseEdgePoint(silhouette, nodeRect);
    const nodeEdge = getRectEdgePoint(nodeRect, brainEdge);
    const from = toNetworkPoint(networkRect, brainEdge.x, brainEdge.y);
    const to = toNetworkPoint(networkRect, nodeEdge.x, nodeEdge.y);

    /* The viewBox is 0-100, so 0.01 is a tenth of a pixel on a 1000px SVG.
       Below that, writing the attribute only dirties the tree for nothing. */
    if (
      Math.abs(from.x - entry.x1) < 0.01 &&
      Math.abs(from.y - entry.y1) < 0.01 &&
      Math.abs(to.x - entry.x2) < 0.01 &&
      Math.abs(to.y - entry.y2) < 0.01
    ) {
      continue;
    }

    entry.x1 = from.x;
    entry.y1 = from.y;
    entry.x2 = to.x;
    entry.y2 = to.y;
    entry.line.setAttribute("x1", from.x.toFixed(2));
    entry.line.setAttribute("y1", from.y.toFixed(2));
    entry.line.setAttribute("x2", to.x.toFixed(2));
    entry.line.setAttribute("y2", to.y.toFixed(2));
  }
}

export function requestLanguageNetworkSync() {
  if (languageNetworkFrame) {
    return;
  }

  languageNetworkFrame = window.requestAnimationFrame(() => {
    languageNetworkFrame = 0;
    syncLanguageNetworkLines();
  });
}

function updateLanguageUniverseParallax(event) {
  if (!languageUniverse || !isWideLayout()) {
    return;
  }

  const rect = languageUniverse.getBoundingClientRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  ) {
    return;
  }

  const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
  const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
  languageUniverse.style.setProperty("--universe-x", x.toFixed(3));
  languageUniverse.style.setProperty("--universe-y", y.toFixed(3));
  requestLanguageNetworkSync();
}

export function resetLanguageUniverseParallax() {
  languageUniverse?.style.setProperty("--universe-x", "0");
  languageUniverse?.style.setProperty("--universe-y", "0");
  requestLanguageNetworkSync();
}

export function bindLanguageUniverseMotion() {
  pageEvents.on("pointer:frame", updateLanguageUniverseParallax);
  pageEvents.on("brain:frame", updateLanguageNetworkEndpoints);
}

export function bindLanguageUniverseReactions() {
  /* Re-applied rather than left alone: the insight panel's title, text and
     tags are copy for the active node in the active language. */
  pageEvents.on("language:change", () => {
    setActiveLanguageNode(activeLanguageNode);
  });
}

export function revealLanguageUniverse() {
  if (!languageUniverse || shouldReduceMotion()) {
    languageUniverse?.classList.add("is-visible");
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        languageUniverse.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.28 }
  );

  observer.observe(languageUniverse);
}
