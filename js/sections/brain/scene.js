/* The three.js scene: meshes, materials, camera and the render loop.

   createBrainWireframeScene builds one scene in stages -- geometry from a
   seeded random stream, then meshes, dust, theme and the render loop -- and
   returns a small controller. The stages share a `brain` object. */

import { pageEvents } from "../../core/events.js?v=8c4a4d4a";
import { createSeededRandom } from "../../core/math.js?v=54e566c4";
import { isDesktopInputDevice, isTouchFirst, shouldReduceMotion } from "../../core/viewport.js?v=c7860737";
import { activeTheme } from "../../theme/index.js?v=79c0f7b6";
import { buildBrainGeometry } from "./geometry.js?v=216bd6f9";
import { createShellOutline, getBrainSilhouette, getShellSilhouette } from "./silhouette.js?v=6dc518a5";

const DESKTOP_BRAIN_WRAP_WIDTH = 660;
/* Below this width the brain scene pulls its camera back to fit a canvas
   wider than the screen, and builds lighter geometry. It is the scene's own
   threshold rather than COMPACT_MAX_WIDTH; the value dates from the first
   commit with no recorded reason, and is kept because changing it would move
   the camera for every window between 680 and 719px wide. */
const BRAIN_CAMERA_FIT_BELOW = 720;
const DESKTOP_BRAIN_RENDER_WIDTH = Math.round(DESKTOP_BRAIN_WRAP_WIDTH * 1.16);
const DESKTOP_BRAIN_RENDER_HEIGHT = Math.round((DESKTOP_BRAIN_WRAP_WIDTH / 2) * 1.22);

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

/* ── The scene ────────────────────────────────────────────────────── */

export async function createBrainWireframeScene(mount) {
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
    const THREE = await import("../../../vendor/three.module.min.js?v=86bcee24");
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
    brain.outline = createShellOutline(THREE);

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
