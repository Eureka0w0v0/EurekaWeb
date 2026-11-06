/* The three.js wireframe brain, loaded when its section comes near.

   createBrainWireframeScene builds one scene in stages -- geometry from a
   seeded random stream, then meshes, dust, theme and the render loop -- and
   returns a small controller. The stages share a `brain` object. */

import { pageEvents } from "../core/events.js?v=8c4a4d4a";
import { createSeededRandom } from "../core/math.js?v=54e566c4";
import {
  isDesktopInputDevice,
  isElementInViewport,
  isTouchFirst,
  reducedMotionQuery,
  shouldReduceMotion,
} from "../core/viewport.js?v=c7860737";
import { activeTheme } from "../theme.js?v=875a3d80";
import { BRAIN_SHELL, buildBrainGeometry } from "./brain/geometry.js?v=216bd6f9";

export const brainWrap = document.querySelector(".brain-wrap");
export const brainMount = document.querySelector("#brain-three-mount");

const DESKTOP_BRAIN_WRAP_WIDTH = 660;
/* Below this width the brain scene pulls its camera back to fit a canvas
   wider than the screen, and builds lighter geometry. It is the scene's own
   threshold rather than COMPACT_MAX_WIDTH; the value dates from the first
   commit with no recorded reason, and is kept because changing it would move
   the camera for every window between 680 and 719px wide. */
const BRAIN_CAMERA_FIT_BELOW = 720;
const DESKTOP_BRAIN_RENDER_WIDTH = Math.round(DESKTOP_BRAIN_WRAP_WIDTH * 1.16);
const DESKTOP_BRAIN_RENDER_HEIGHT = Math.round((DESKTOP_BRAIN_WRAP_WIDTH / 2) * 1.22);
export let brainSceneController = null;
/* Whether the brain is close enough to the viewport to be worth rendering.
   Defaults to true so that a browser without IntersectionObserver keeps the
   old always-on behaviour instead of a scene that never starts. */
let brainSceneOnScreen = true;

/* ── Meshes ───────────────────────────────────────────────────────── */

function createBrainPoints(brain, pts) {
  const { THREE, group } = brain;
  const pointPositions = [];
  pts.forEach((vertex) => {
    pointPositions.push(vertex.p.x, vertex.p.y, vertex.p.z);
  });

  brain.pointGeometry = new THREE.BufferGeometry();
  brain.pointGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(pointPositions, 3)
  );
  brain.nodeMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.045,
    transparent: true,
    opacity: 0.78,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  brain.glowMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.14,
    transparent: true,
    opacity: 0.05,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  group.add(new THREE.Points(brain.pointGeometry, brain.nodeMaterial));
  group.add(new THREE.Points(brain.pointGeometry, brain.glowMaterial));
}

function createBrainLines(brain, pts, edgeSet) {
  const { THREE, group } = brain;
  const linePositions = [];
  edgeSet.forEach((key) => {
    const [a, b] = key.split("_").map(Number);
    linePositions.push(pts[a].p.x, pts[a].p.y, pts[a].p.z, pts[b].p.x, pts[b].p.y, pts[b].p.z);
  });

  brain.lineGeometry = new THREE.BufferGeometry();
  brain.lineGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(linePositions, 3)
  );

  brain.lineMaterial = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  group.add(new THREE.LineSegments(brain.lineGeometry, brain.lineMaterial));
}

/* Thirty specks drifting around the brain, on the scene rather than the
   group so they neither spin with it nor count towards its silhouette. */
function createBrainDust(brain, random) {
  const { THREE, scene } = brain;
  const dustPositions = [];
  for (let i = 0; i < 30; i += 1) {
    dustPositions.push((random() - 0.5) * 22, (random() - 0.5) * 10, (random() - 0.5) * 8 - 1.5);
  }
  brain.dustGeometry = new THREE.BufferGeometry();
  brain.dustGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(dustPositions, 3)
  );
  brain.dustMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.025,
    transparent: true,
    opacity: 0.14,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  scene.add(new THREE.Points(brain.dustGeometry, brain.dustMaterial));
}

/* ── Camera, theme, loop ──────────────────────────────────────────── */

/* On narrow viewports the canvas is wider than the screen -- the wrapper
   keeps its desktop width and overflows -- so the brain used to be cropped
   on both sides. Pull the camera back by that overflow ratio, plus a
   little air, so the whole silhouette fits the viewport instead. */
function fitCameraDistance(brain) {
  const { camera, mount } = brain;
  const compactViewport = window.innerWidth < BRAIN_CAMERA_FIT_BELOW;
  const overflow = compactViewport
    ? Math.max(1, ((mount.clientWidth || window.innerWidth) / window.innerWidth) * 1.12)
    : 1;
  camera.position.set(0, 0.15, (compactViewport ? 15.8 : 16.6) * overflow);
}

function setBrainTheme(brain, theme) {
  const { THREE, nodeMaterial, glowMaterial, lineMaterial, dustMaterial } = brain;
  const isDark = theme === "dark";
  const color = isDark ? 0xffffff : 0x050505;
  const blending = isDark ? THREE.AdditiveBlending : THREE.NormalBlending;

  nodeMaterial.color.setHex(color);
  glowMaterial.color.setHex(color);
  lineMaterial.color.setHex(color);
  dustMaterial.color.setHex(color);

  nodeMaterial.blending = blending;
  glowMaterial.blending = blending;
  lineMaterial.blending = blending;
  dustMaterial.blending = blending;

  nodeMaterial.opacity = isDark ? 0.78 : 0.86;
  glowMaterial.opacity = isDark ? 0.05 : 0.025;
  lineMaterial.opacity = isDark ? 0.55 : 0.64;
  dustMaterial.opacity = isDark ? 0.14 : 0.08;

  nodeMaterial.needsUpdate = true;
  glowMaterial.needsUpdate = true;
  lineMaterial.needsUpdate = true;
  dustMaterial.needsUpdate = true;
  renderBrain(brain);
}

function resizeBrain(brain) {
  const { camera, mount, renderer } = brain;
  const lockDesktopRenderSize = isDesktopInputDevice();
  const width = lockDesktopRenderSize
    ? DESKTOP_BRAIN_RENDER_WIDTH
    : Math.max(mount.clientWidth, 1);
  const height = lockDesktopRenderSize
    ? DESKTOP_BRAIN_RENDER_HEIGHT
    : Math.max(mount.clientHeight, 1);
  const widthChanged = Math.abs(width - brain.lastRenderWidth) > 1;
  const heightChanged = Math.abs(height - brain.lastRenderHeight) > 1;

  if (brain.lastRenderWidth && !widthChanged && (!heightChanged || isTouchFirst())) {
    return;
  }

  brain.lastRenderWidth = width;
  brain.lastRenderHeight = height;
  fitCameraDistance(brain);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function renderBrain(brain) {
  brain.renderer.render(brain.scene, brain.camera);
}

/* One frame: turn, bob and breathe, draw, then let the connector lines
   follow. */
function animateBrain(brain) {
  if (!brain.isRunning) {
    return;
  }

  brain.frameId = window.requestAnimationFrame(brain.animate);
  brain.time += 0.01;

  if (!shouldReduceMotion()) {
    const { group, nodeMaterial, glowMaterial, lineMaterial, time } = brain;
    const isDark = activeTheme === "dark";
    group.rotation.y += 0.00115;
    group.position.y = -0.18 + Math.sin(time) * 0.1;
    group.position.x = Math.sin(time * 0.62) * 0.05;
    nodeMaterial.size = 0.045 + Math.sin(time * 2.0) * 0.004;
    glowMaterial.opacity = (isDark ? 0.045 : 0.018) + Math.sin(time * 1.65) * (isDark ? 0.018 : 0.008);
    lineMaterial.opacity = isDark ? 0.55 : 0.64;
  }

  renderBrain(brain);
  /* After render, not before: the connector lines (which listen for this)
     trail the mesh by a frame either way, and doing their DOM writes last
     keeps them out of the path between the matrix update and the draw
     call. */
  pageEvents.emit("brain:frame");
}

function startBrain(brain) {
  if (brain.isRunning) {
    return;
  }

  brain.isRunning = true;
  animateBrain(brain);
}

function stopBrain(brain) {
  brain.isRunning = false;
  if (brain.frameId) {
    window.cancelAnimationFrame(brain.frameId);
    brain.frameId = 0;
  }
}

/* Undoes a scene that failed part-way, so anything may still be missing. The
   renderer's dispose() frees what it allocated but keeps the WebGL context,
   and browsers cap how many a page may hold. */
function disposeBrain(brain) {
  const { mount, renderer } = brain;
  stopBrain(brain);
  brain.pointGeometry?.dispose();
  brain.lineGeometry?.dispose();
  brain.dustGeometry?.dispose();
  brain.nodeMaterial?.dispose();
  brain.glowMaterial?.dispose();
  brain.lineMaterial?.dispose();
  brain.dustMaterial?.dispose();
  if (!renderer) {
    return;
  }
  renderer.dispose();
  renderer.forceContextLoss();
  if (renderer.domElement.parentNode === mount) {
    mount.removeChild(renderer.domElement);
  }
}

/* ── Silhouettes ──────────────────────────────────────────────────

   Where the shell actually lands on screen, in viewport pixels, so the
   connector lines can end on its outline instead of at fractions of the
   wrapper guessed by hand.

   The horizontal radius uses the smaller of rx and rz on purpose. The group
   spins about Y forever, so the silhouette's width breathes between those
   two -- a 38% swing at the current 5.8/4.2. Taking the minimum means a
   line always terminates on or just inside the outline at every angle,
   instead of being correct at one rotation and floating or buried at the
   rest. */

/* Projects an ellipse given in the group's local space. Offsets are taken
   along world X and Y, which are the camera's own axes here (it has no
   roll), so they stay screen-aligned and share the centre's depth -- which
   makes the projection exact rather than an approximation. */
function projectLocalEllipse(brain, centerLocal, halfWidth, halfHeight) {
  const { THREE, camera, group, renderer } = brain;
  const rect = renderer.domElement.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }

  group.updateMatrixWorld();

  const scale = group.scale.x;
  const center = group.localToWorld(centerLocal.clone());
  const toViewport = (vector) => {
    const ndc = vector.clone().project(camera);
    return {
      x: rect.left + (ndc.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-ndc.y * 0.5 + 0.5) * rect.height,
    };
  };

  const middle = toViewport(center);
  const side = toViewport(center.clone().add(new THREE.Vector3(halfWidth * scale, 0, 0)));
  const top = toViewport(center.clone().add(new THREE.Vector3(0, halfHeight * scale, 0)));

  const rx = Math.abs(side.x - middle.x);
  const ry = Math.abs(top.y - middle.y);
  if (!(rx > 1) || !(ry > 1)) {
    return null;
  }

  return { cx: middle.x, cy: middle.y, rx, ry };
}

/* The shell's outline as it lands on screen this frame: its vertices,
   projected, reduced to the outer radius in each of 60 angular bins around
   the projected centre. A connector then ends at the bin its pill sits in.

   This replaced an analytic ellipse when the shell stopped being one. The
   ellipse had already been through two generations -- hand-guessed
   wrapper fractions, then the ellipsoid's true support radius under the
   current rotation -- and the second was exact for an ellipsoid; but the
   temporal lobes, the flattened underside and the fissure between the
   hemispheres are not one, and a line ending on a fitted ellipse floats
   off the wireframe wherever the shape departs from it. Reading the
   vertices themselves costs about a thousand projections a frame and is
   right for whatever the shell becomes. */
const OUTLINE_BINS = 60;

function getShellSilhouette(brain) {
  const { camera, group, renderer, shellLocal, outline } = brain;
  const rect = renderer.domElement.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }

  group.updateMatrixWorld();
  const toX = (ndcX) => rect.left + (ndcX * 0.5 + 0.5) * rect.width;
  const toY = (ndcY) => rect.top + (-ndcY * 0.5 + 0.5) * rect.height;

  outline.center.set(0, BRAIN_SHELL.cy, 0).applyMatrix4(group.matrixWorld).project(camera);
  const cx = toX(outline.center.x);
  const cy = toY(outline.center.y);

  outline.radii.fill(0);
  let rx = 0;
  let ry = 0;
  for (let i = 0; i < shellLocal.length; i += 3) {
    outline.vec
      .set(shellLocal[i], shellLocal[i + 1], shellLocal[i + 2])
      .applyMatrix4(group.matrixWorld)
      .project(camera);
    const dx = toX(outline.vec.x) - cx;
    const dy = toY(outline.vec.y) - cy;
    const radius = Math.hypot(dx, dy);
    const bin =
      ((Math.round((Math.atan2(dy, dx) / (Math.PI * 2)) * OUTLINE_BINS) % OUTLINE_BINS) +
        OUTLINE_BINS) %
      OUTLINE_BINS;
    if (radius > outline.radii[bin]) outline.radii[bin] = radius;
    if (Math.abs(dx) > rx) rx = Math.abs(dx);
    if (Math.abs(dy) > ry) ry = Math.abs(dy);
  }

  if (!(rx > 1) || !(ry > 1)) {
    return null;
  }

  return { cx, cy, rx, ry, bins: outline.radii, binCount: OUTLINE_BINS };
}

/* Everything the group draws, so the shell plus the cerebellum and stem
   hanging below it. This is what the pills should ring: the shell's centre
   sits above the visible mass, and a ring drawn around it reads as riding
   high on the sides no matter how evenly it is spaced.

   Measured off the geometry rather than the mesh's world box so it does not
   breathe with the spin -- same reason, and same min(x, z) trick, as the
   shell. Dust is on the scene rather than the group, so it stays out of
   this. */
function getBrainSilhouette(brain) {
  const { THREE, group } = brain;
  if (!brain.localBox) {
    const box = new THREE.Box3();
    group.traverse((child) => {
      const geometry = child.geometry;
      if (!geometry) {
        return;
      }
      if (!geometry.boundingBox) {
        geometry.computeBoundingBox();
      }
      if (geometry.boundingBox) {
        box.union(geometry.boundingBox);
      }
    });
    if (box.isEmpty()) {
      return null;
    }
    brain.localBox = box;
  }

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  brain.localBox.getSize(size);
  brain.localBox.getCenter(center);

  return projectLocalEllipse(brain, center, Math.min(size.x, size.z) / 2, size.y / 2);
}

/* ── The scene ────────────────────────────────────────────────────── */

async function createBrainWireframeScene(mount) {
  if (!mount) {
    return null;
  }

  let brain = null;
  try {
    /* Vendored rather than pulled from unpkg. r185 ships as two files -- this
       one and the ./three.core.min.js it imports -- so the CDN version cost
       two cross-origin requests on a host that is unreliable from China, and
       a failure meant the brain silently never appeared. Same-origin now, and
       covered by the one-year immutable cache deploy/nginx gives *.js.
       Still lazy: this runs when the language section scrolls into view. */
    /* Relative to this module, not the page: an import() specifier resolves
       against the importing module's URL. */
    const THREE = await import("../../vendor/three.module.min.js?v=86bcee24");
    brain = {
      THREE,
      mount,
      scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(36, 1, 0.1, 1000),
      time: 0,
      frameId: 0,
      isRunning: false,
      lastRenderWidth: 0,
      lastRenderHeight: 0,
      localBox: null,
    };
    brain.animate = () => animateBrain(brain);
    fitCameraDistance(brain);

    brain.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    brain.renderer.setClearColor(0x000000, 0);
    brain.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    mount.appendChild(brain.renderer.domElement);

    brain.group = new THREE.Group();
    brain.scene.add(brain.group);

    const random = createSeededRandom(20260427);
    const isCompact = window.innerWidth < BRAIN_CAMERA_FIT_BELOW;
    const { pts, edgeSet, shellLocal } = buildBrainGeometry(THREE, random);
    brain.shellLocal = shellLocal;
    brain.outline = {
      radii: new Float32Array(OUTLINE_BINS),
      vec: new THREE.Vector3(),
      center: new THREE.Vector3(),
    };

    createBrainPoints(brain, pts);
    createBrainLines(brain, pts, edgeSet);
    brain.group.rotation.set(0.08, -0.22, 0);
    brain.group.scale.setScalar(isCompact ? 0.68 : 0.78);
    brain.group.position.y = -0.18;
    createBrainDust(brain, random);

    setBrainTheme(brain, activeTheme);
    resizeBrain(brain);
    renderBrain(brain);
    startBrain(brain);

    return {
      resize: () => resizeBrain(brain),
      start: () => startBrain(brain),
      stop: () => stopBrain(brain),
      setTheme: (theme) => setBrainTheme(brain, theme),
      getShellSilhouette: () => getShellSilhouette(brain),
      getBrainSilhouette: () => getBrainSilhouette(brain),
    };
  } catch (error) {
    console.warn("Failed to initialize the Three.js brain model.", error);
    if (brain) {
      disposeBrain(brain);
    }
    return null;
  }
}

export function bindBrainReactions() {
  const setTheme = ({ theme }) => {
    brainSceneController?.setTheme(theme);
  };
  pageEvents.on("theme:snapshot", ({ theme }) => {
    const universe = brainMount?.closest("#language-universe") || null;
    if (isElementInViewport(universe) || isElementInViewport(brainMount)) {
      brainSceneController?.setTheme(theme);
    }
  });
  pageEvents.on("theme:applied", setTheme);
  pageEvents.on("theme:render-now", setTheme);
  pageEvents.on("theme:render-frame", setTheme);

  /* Re-read on change like the theme query does. Everything that consults
     shouldReduceMotion() asks per call rather than caching, so turning the
     preference on mid-session takes effect from the next frame; this listener
     exists so the layers that latch -- the brain scene, the grain canvas --
     settle instead of running on with a stale answer. */
  reducedMotionQuery.addEventListener?.("change", () => {
    if (reducedMotionQuery.matches) {
      brainSceneController?.stop();
    }
  });
}

export function resizeBrainScene() {
  brainSceneController?.resize();
}

export function pauseBrainScene() {
  brainSceneController?.stop();
}

/* Only resume what is actually on screen -- otherwise switching back to the
   tab restarts the brain no matter where the page is scrolled. */
export function resumeBrainScene() {
  if (brainSceneOnScreen) {
    brainSceneController?.start();
  }
}

/* observeTarget is what has to come near the viewport before three.js is
   fetched: the whole language section, passed in by initApp, so the load
   starts while the visitor is still approaching it. */
export function scheduleBrainSceneLoad(observeTarget = brainMount) {
  if (!brainMount || brainSceneController || shouldReduceMotion()) {
    return;
  }

  let loading = false;

  const loadBrain = async () => {
    if (loading || brainSceneController || shouldReduceMotion()) {
      return;
    }

    loading = true;
    try {
      brainSceneController = await createBrainWireframeScene(brainMount);
      if (brainSceneController && activeTheme) {
        brainSceneController.setTheme?.(activeTheme);
      }
    } finally {
      loading = false;
    }
  };

  const target = observeTarget || brainMount;

  if (typeof IntersectionObserver === "function" && target) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }

        observer.disconnect();
        loadBrain().then(() => watchBrainSceneVisibility(target));
      },
      {
        root: null,
        rootMargin: "220px 0px",
        threshold: 0.01,
      }
    );

    observer.observe(target);
    return;
  }

  const idle = window.requestIdleCallback || ((cb) => window.setTimeout(cb, 900));
  idle(() => {
    loadBrain().then(() => watchBrainSceneVisibility(target));
  });
}

/* The loader's observer disconnects the moment the scene exists, which left
   nothing watching afterwards: a WebGL scene three screens above the fold kept
   rendering at 60fps because only visibilitychange ever stopped it. This
   second observer outlives the load and owns the running state from then on.

   The margin is smaller than the loader's 220px -- that one buys time to
   download three.js, this one only needs the scene warm before it is seen. */
function watchBrainSceneVisibility(target) {
  if (!brainSceneController || !target || typeof IntersectionObserver !== "function") {
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      brainSceneOnScreen = entries.some((entry) => entry.isIntersecting);
      if (brainSceneOnScreen) {
        if (!document.hidden) {
          brainSceneController?.start();
        }
      } else {
        brainSceneController?.stop();
      }
    },
    { root: null, rootMargin: "120px 0px", threshold: 0 }
  );

  observer.observe(target);
}
