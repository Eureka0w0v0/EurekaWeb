/* The three.js wireframe brain, loaded when its section comes near.

   createBrainWireframeScene builds one scene in stages -- geometry from a
   seeded random stream, then meshes, dust, theme and the render loop -- and
   returns a small controller. The stages share a `brain` object; the
   geometry stages share a `mesh` builder. The order of the geometry stages is
   load-bearing: they draw from one seeded stream, so reordering them would
   produce a different (if equally plausible) brain. */

import { pageEvents } from "../core/events.js?v=8c4a4d4a";
import { createSeededRandom } from "../core/math.js?v=54e566c4";
import {
  isDesktopInputDevice,
  isElementInViewport,
  isTouchFirst,
  shouldReduceMotion,
} from "../core/viewport.js?v=71b5eb94";
import { activeTheme } from "../theme.js?v=ad29e4e7";

export const brainWrap = document.querySelector(".brain-wrap");
export const brainMount = document.querySelector("#brain-three-mount");
/* The envelope the shell is sculpted from, in local units before the group's
   scale: the surface starts as this ellipsoid and is pushed into a brain from
   there (see shellPoint), so these set its overall length, height and width.
   The connector lines from the language pills no longer read these numbers --
   they are measured off the built vertices as projected each frame, so any
   reshaping moves the endpoints with it by construction. (They used to be
   independent: the shell was reshaped on 2026-08-02 and the anchors had been
   frozen since 2026-05-03, which left the Python line starting deep inside
   the sphere and three of the others as stubs.) */
const BRAIN_SHELL = { rx: 5.8, ry: 4.5, rz: 4.2, cy: 0.32 };

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
export let brainSceneOnScreen = true;

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const gauss = (x) => Math.exp(-x * x);

/* ── Geometry ─────────────────────────────────────────────────────────
   mesh = { THREE, random, pts, edgeSet }. pts are { p: Vector3, part, ring,
   seg }; edges are "a_b" keys with a < b, so each is stored once. */

function addEdge(set, a, b) {
  if (a === b) return;
  set.add(`${Math.min(a, b)}_${Math.max(a, b)}`);
}

function point(mesh, x, y, z, part, ring = -1, seg = -1) {
  return { p: new mesh.THREE.Vector3(x, y, z), part, ring, seg };
}

function connectRows(mesh, rows, extraMin = 24, extraEvery = 8) {
  const { edgeSet } = mesh;
  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r];
    const n = row.length;

    if (n > 1) {
      for (let j = 0; j < n; j += 1) {
        addEdge(edgeSet, row[j], row[(j + 1) % n]);
        if (n >= extraMin && j % extraEvery === 0) {
          addEdge(edgeSet, row[j], row[(j + 2) % n]);
        }
      }
    }

    if (r >= rows.length - 1) continue;

    const next = rows[r + 1];
    const m = next.length;

    if (n === 1) {
      for (let j = 0; j < m; j += 1) addEdge(edgeSet, row[0], next[j]);
    } else if (m === 1) {
      for (let j = 0; j < n; j += 1) addEdge(edgeSet, row[j], next[0]);
    } else {
      for (let j = 0; j < n; j += 1) {
        const k = Math.round((j * m) / n) % m;
        addEdge(edgeSet, row[j], next[k]);
        addEdge(edgeSet, row[j], next[(k + (j % 2 === 0 ? 1 : -1) + m) % m]);
      }
    }
  }
}

/* ── The shell ────────────────────────────────────────────────────
   Parametrised on the unit sphere and deformed there, then scaled by
   BRAIN_SHELL, so every push below is a fraction of the brain's own size.
   u runs front (-1) to back (+1) -- the cerebellum and brainstem hang at
   +x -- v is up, w is side to side.

   It used to be the bare ellipsoid with three bottom nudges and a sine
   wobble, which read as an egg. What makes a brain read as a brain at
   wireframe resolution is silhouette, not texture, so the work is in the
   big shapes: a flat underside, a narrower and lower occipital end, the
   temporal lobes hanging below a lateral fissure, and the longitudinal
   fissure splitting the top into two crests. The gyral folding on top of
   that is deliberately faint -- at 34 rings it can only be a ripple in the
   lines, and pushed harder it reads as noise. */

/* The large shapes: flat underside, narrower occipital end, temporal lobes
   and the lateral fissure they hang under. Works in place on {u, v, w}. */
function shapeShellLobes(c) {
  /* Underside: the bottom 38% of the sphere squashed to 42% of its depth.
     The orbital surface under the frontal lobe is close to flat. */
  if (c.v < -0.62) {
    c.v = -0.62 + (c.v + 0.62) * 0.42;
  }

  /* Occipital end: narrower and lower than the frontal. */
  const back = smoothstep(0.25, 1, c.u);
  c.w *= 1 - 0.16 * back * back;
  if (c.v > 0) {
    c.v *= 1 - 0.1 * back * back;
  }

  /* Temporal lobes: out, down and a little forward on each flank, low and
     toward the front. */
  const flank = smoothstep(0.25, 0.7, Math.abs(c.w));
  const temporal = gauss((c.v + 0.45) / 0.3) * gauss((c.u + 0.2) / 0.55) * flank;
  c.w += Math.sign(c.w) * 0.16 * temporal;
  c.v -= 0.14 * temporal;
  c.u -= 0.05 * temporal * smoothstep(-0.2, -0.8, c.u);

  /* Lateral fissure: the groove the temporal lobe hangs under, climbing
     toward the back. */
  const sylvian =
    gauss((c.v - (-0.1 + 0.22 * c.u)) / 0.1) *
    smoothstep(0.55, 0.85, Math.abs(c.w)) *
    smoothstep(-0.95, -0.7, c.u) *
    (1 - smoothstep(0.3, 0.55, c.u));
  c.w -= Math.sign(c.w) * 0.08 * sylvian;
}

/* How far to push the surface along its sphere normal: the longitudinal
   fissure and the crests either side of it, plus the faint gyral folds. */
function shellNormalPush(c, phi, theta, nv) {
  /* Longitudinal fissure: a groove along the midline over the top and
     down the front and back faces, with the two hemispheres crowned either
     side of it. Pushed along the sphere normal so it stays a groove
     however the surface curves. */
  const topness = smoothstep(-0.15, 0.55, c.v);
  const faceness = 0.6 * smoothstep(0.55, 0.95, Math.abs(c.u)) * smoothstep(-0.55, 0, c.v);
  const fissure = gauss(c.w / 0.2) * Math.max(topness, faceness);
  const crest = gauss((Math.abs(c.w) - 0.42) / 0.24) * topness;
  let push = -0.13 * fissure + 0.035 * crest;

  /* Gyri: two wandering band systems, crowns broad and sulci narrow.
     Fades out on the underside, in the fissure and at the poles. */
  const g1 = Math.sin(phi * 7 + Math.sin(theta * 3 + phi * 1.7) * 1.3);
  const g2 = Math.sin(theta * 5 + Math.sin(phi * 2.6 - theta * 1.1) * 1.1 + 0.7);
  const g = 0.55 * g1 + 0.45 * g2;
  const folds = 2 * Math.sqrt(Math.abs(g)) - 1;
  const gyral =
    smoothstep(-0.55, -0.2, c.v) * (1 - fissure) * (1 - smoothstep(0.85, 1, Math.abs(nv)));
  push += 0.032 * folds * gyral;
  return push;
}

function shellPoint(random, phi, theta, jitterScale) {
  const s = Math.sin(phi);
  const c = { u: s * Math.cos(theta), v: Math.cos(phi), w: s * Math.sin(theta) };
  const nu = c.u;
  const nv = c.v;
  const nw = c.w;

  shapeShellLobes(c);
  const push = shellNormalPush(c, phi, theta, nv);
  c.u += nu * push;
  c.v += nv * push;
  c.w += nw * push;

  const jitter = 0.016 * jitterScale;
  c.u += (random() - 0.5) * jitter;
  c.v += (random() - 0.5) * jitter * 0.7;
  c.w += (random() - 0.5) * jitter;

  return {
    x: c.u * BRAIN_SHELL.rx,
    y: c.v * BRAIN_SHELL.ry + BRAIN_SHELL.cy,
    z: c.w * BRAIN_SHELL.rz,
  };
}

/* 34 rings from pole to pole, sparser near the poles, alternate rings
   offset by half a step so the mesh triangulates instead of gridding. */
function buildShell(mesh) {
  const { pts, random } = mesh;
  const latCount = 34;
  const lonBase = 50;
  const brainRows = [];

  const topPole = shellPoint(random, 0, 0, 0);
  pts.push(point(mesh, topPole.x, topPole.y, topPole.z, "brain", 0, 0));
  brainRows.push([0]);

  for (let i = 1; i < latCount; i += 1) {
    const row = [];
    const phi = (Math.PI * i) / latCount;
    let localLon = lonBase;

    if (i === 1 || i === latCount - 1) localLon = 18;
    else if (i === 2 || i === latCount - 2) localLon = 28;
    else if (i === 3 || i === latCount - 3) localLon = 38;

    const nearPole = i <= 3 || i >= latCount - 3;
    for (let j = 0; j < localLon; j += 1) {
      const theta = (Math.PI * 2 * j) / localLon + (i % 2) * 0.055;
      const shell = shellPoint(random, phi, theta, nearPole ? 0.25 : 1);
      const idx = pts.length;
      pts.push(point(mesh, shell.x, shell.y, shell.z, "brain", i, j));
      row.push(idx);
    }

    brainRows.push(row);
  }

  const bottomPole = pts.length;
  const bottomPoint = shellPoint(random, Math.PI, 0, 0);
  pts.push(point(mesh, bottomPoint.x, bottomPoint.y, bottomPoint.z, "brain", latCount, 0));
  brainRows.push([bottomPole]);
  connectRows(mesh, brainRows, 36, 4);

  /* Local positions of the shell alone, for projecting its outline each
     frame (getShellSilhouette). Taken now, before any other part is added. */
  const shellLocal = new Float32Array(pts.length * 3);
  for (let i = 0; i < pts.length; i += 1) {
    shellLocal[i * 3] = pts[i].p.x;
    shellLocal[i * 3 + 1] = pts[i].p.y;
    shellLocal[i * 3 + 2] = pts[i].p.z;
  }
  return shellLocal;
}

/* A sparse cloud of points inside the shell, for depth. */
function scatterInnerPoints(mesh) {
  const { pts, random } = mesh;
  for (let i = 0; i < 260; i += 1) {
    let x = 0;
    let y = 0;
    let z = 0;
    let ok = false;
    for (let k = 0; k < 20 && !ok; k += 1) {
      x = (random() - 0.5) * 11.4;
      y = (random() - 0.5) * 7.2 + 0.35;
      z = (random() - 0.5) * 6.1;
      ok = (x / 5.45) ** 2 + ((y - 0.32) / 4.05) ** 2 + (z / 3.72) ** 2 < 0.7 && y > -2.3;
    }
    if (ok) pts.push(point(mesh, x, y, z, "inner"));
  }
}

/* ── The cerebellum ──────────────────────────────────────────────
   Wider than it is deep or tall, two hemispheres either side of a narrow
   vermis, a flat top where it sits under the tentorium, a hollowed front
   where it wraps the brainstem, and horizontal folia. The folia are done
   structurally rather than drawn: rows only, no in-row diagonals, and
   alternate rows pushed in and out so the meridian zigzags read as a stack
   of folds. It used to be a plain ellipsoid with its long axis running
   front to back -- an egg, hanging off the back of the brain.

   About 62% of the cerebrum's width and half as tall as it is wide, which is
   roughly the real proportion; the top sits 0.3 inside the shell's
   underside, the tentorial overlap. */
const CEREBELLUM_RADII = { rx: 1.55, ry: 1.3, rz: 2.8 };
const CEREBELLUM_CENTER = { x: 3.2, y: -3.4, z: 0 };
const CEREBELLUM_RINGS = 14;
const CEREBELLUM_LON_BASE = 22;

function cerebellumPoint(random, phi, theta, row) {
  const sp = Math.sin(phi);
  let u = sp * Math.cos(theta);
  let v = Math.cos(phi);
  let w = sp * Math.sin(theta);
  const nu = u;
  const nv = v;
  const nw = w;

  /* Flat top, hollowed front. */
  if (v > 0.35) {
    v = 0.35 + (v - 0.35) * 0.45;
  }
  if (u < -0.4) {
    u = -0.4 + (u + 0.4) * 0.5;
  }

  /* Two hemispheres: a groove either side of the vermis, over the top and
     down the back, not underneath. */
  const upperBack = Math.max(smoothstep(-0.2, 0.5, v), smoothstep(0.2, 0.8, u));
  const grooves = gauss((Math.abs(w) - 0.2) / 0.12) * upperBack;
  let push = -0.15 * grooves;

  /* Folia: alternate rows in and out, poles left smooth. */
  if (row > 1 && row < CEREBELLUM_RINGS - 1) {
    push += row % 2 === 0 ? 0.045 : -0.045;
  }

  u += nu * push;
  v += nv * push;
  w += nw * push;

  const jitter = row <= 1 || row >= CEREBELLUM_RINGS - 1 ? 0.008 : 0.02;
  u += (random() - 0.5) * jitter;
  v += (random() - 0.5) * jitter * 0.6;
  w += (random() - 0.5) * jitter;

  return {
    x: CEREBELLUM_CENTER.x + u * CEREBELLUM_RADII.rx,
    y: CEREBELLUM_CENTER.y + v * CEREBELLUM_RADII.ry,
    z: CEREBELLUM_CENTER.z + w * CEREBELLUM_RADII.rz,
  };
}

/* Returns the [start, end) range of the cerebellum's points. */
function buildCerebellum(mesh) {
  const { pts, random } = mesh;
  const cLat = CEREBELLUM_RINGS;
  const cereStart = pts.length;
  const cereRows = [];

  for (let i = 0; i <= cLat; i += 1) {
    const row = [];
    /* The pole rows are small rings a third of a step in from the poles, so
       the top and bottom close with a ring rather than a single point. */
    const phiIndex = i === 0 ? 0.35 : i === cLat ? cLat - 0.35 : i;
    const phi = (Math.PI * phiIndex) / cLat;
    let localLon = CEREBELLUM_LON_BASE;

    if (i === 0 || i === cLat) localLon = 8;
    else if (i === 1 || i === cLat - 1) localLon = 12;
    else if (i === 2 || i === cLat - 2) localLon = 16;

    for (let j = 0; j < localLon; j += 1) {
      const theta = (Math.PI * 2 * j) / localLon + (i % 2) * 0.06;
      const cere = cerebellumPoint(random, phi, theta, i);
      const idx = pts.length;
      pts.push(point(mesh, cere.x, cere.y, cere.z, "cerebellum", i, j));
      row.push(idx);
    }

    cereRows.push(row);
  }

  connectRows(mesh, cereRows, 999, 4);
  return { cereStart, cereEnd: pts.length };
}

/* ── The brainstem ───────────────────────────────────────────────
   Midbrain at the top, the pons bellying forward a third of the way
   down, the medulla tapering on below the cerebellum. Leans back as it
   descends, and hangs from the underside just ahead of the cerebellum's
   hollowed front, which is where the peduncles stitch the two together.
   16 segments, matching the cerebellum; at 10 the silhouette had visible
   straight runs and read as a faceted post. */
const STEM_RINGS = 12;
const STEM_SEGMENTS = 16;

function buildBrainstem(mesh) {
  const { pts, random } = mesh;
  const stemRows = [];

  for (let i = 0; i < STEM_RINGS; i += 1) {
    const row = [];
    const t = i / (STEM_RINGS - 1);
    const pons = gauss((t - 0.42) / 0.16);
    const cx = 1.0 + t * 1.0 - 0.16 * pons;
    const cy = -3.4 - t * 1.75;
    const cz = 0.16 - t * 0.1;
    const taper = 1 - t * 0.42;
    const rx = 0.6 * taper * (1 + 0.5 * pons);
    const rz = 0.72 * taper * (1 + 0.32 * pons);

    for (let j = 0; j < STEM_SEGMENTS; j += 1) {
      const angle = (Math.PI * 2 * j) / STEM_SEGMENTS + i * 0.18;
      const idx = pts.length;
      pts.push(
        point(
          mesh,
          cx + Math.cos(angle) * rx + (random() - 0.5) * 0.045,
          cy + (random() - 0.5) * 0.05,
          cz + Math.sin(angle) * rz + (random() - 0.5) * 0.045,
          "stem",
          i,
          j
        )
      );
      row.push(idx);
    }

    stemRows.push(row);
  }

  connectRows(mesh, stemRows, 999, 8);
  return stemRows;
}

function closeStemRingSmooth(mesh, row, dy, scale) {
  const { pts, random, edgeSet } = mesh;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  row.forEach((idx) => {
    cx += pts[idx].p.x;
    cy += pts[idx].p.y;
    cz += pts[idx].p.z;
  });
  cx /= row.length;
  cy = cy / row.length + dy;
  cz /= row.length;

  const cap = [];
  row.forEach((idx, j) => {
    const base = pts[idx].p;
    const capIdx = pts.length;
    pts.push(point(mesh, cx + (base.x - cx) * scale, cy + (random() - 0.5) * 0.018, cz + (base.z - cz) * scale, "stem", -1, j));
    cap.push(capIdx);
  });

  for (let j = 0; j < row.length; j += 1) {
    addEdge(edgeSet, cap[j], cap[(j + 1) % cap.length]);
    addEdge(edgeSet, row[j], cap[j]);
    if (j % 2 === 0) addEdge(edgeSet, row[j], cap[(j + 1) % cap.length]);
  }
}

function nearestEdges(mesh, fromStart, fromEnd, toStart, toEnd, maxDistance, maxCount) {
  const { pts, edgeSet } = mesh;
  for (let i = fromStart; i < fromEnd; i += 1) {
    const neighbors = [];
    for (let j = toStart; j < toEnd; j += 1) {
      const distance = pts[i].p.distanceTo(pts[j].p);
      if (distance < maxDistance) neighbors.push({ j, distance });
    }
    neighbors
      .sort((a, b) => a.distance - b.distance)
      .slice(0, maxCount)
      .forEach((neighbor) => addEdge(edgeSet, i, neighbor.j));
  }
}

/* How far, and to how many, each kind of point reaches for neighbours. */
const NEIGHBOUR_REACH = {
  brain: { maxDistance: 1.18, maxCount: 4 },
  inner: { maxDistance: 1.15, maxCount: 2 },
  cerebellum: { maxDistance: 0.7, maxCount: 2 },
  stem: { maxDistance: 1.08, maxCount: 3 },
};

/* Every point to its nearest few, within reach. Inner points only reach
   the shell, never each other or the other parts. */
function linkNeighbours(mesh) {
  const { pts, edgeSet } = mesh;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const neighbors = [];
    const { maxDistance, maxCount } = NEIGHBOUR_REACH[a.part] || { maxDistance: 1.08, maxCount: 3 };

    for (let j = 0; j < pts.length; j += 1) {
      if (i === j) continue;
      const b = pts[j];
      if (a.part === "inner" && b.part === "inner") continue;
      if (a.part === "inner" && b.part !== "brain") continue;

      const distance = a.p.distanceTo(b.p);
      if (distance < maxDistance) neighbors.push({ j, distance });
    }

    neighbors
      .sort((aNode, bNode) => aNode.distance - bNode.distance)
      .slice(0, maxCount)
      .forEach((neighbor) => addEdge(edgeSet, i, neighbor.j));
  }
}

/* The whole wireframe: points and edges, in a fixed draw order from the
   seeded stream. */
function buildBrainGeometry(THREE, random) {
  const mesh = { THREE, random, pts: [], edgeSet: new Set() };
  const shellLocal = buildShell(mesh);
  const innerStart = mesh.pts.length;
  scatterInnerPoints(mesh);
  const { cereStart, cereEnd } = buildCerebellum(mesh);
  const stemRows = buildBrainstem(mesh);

  /* Only the bottom. The top ring is buried inside the cerebellum and the
     shell, so its cap was never visible as a cap -- it just piled another 16
     points and their edges into the one place where three grids already
     overlap, which read as a bright knot once the surrounding smear was
     cleaned up. */
  closeStemRingSmooth(mesh, stemRows[stemRows.length - 1], -0.08, 0.36);

  nearestEdges(mesh, cereStart, cereEnd, 0, innerStart, 0.8, 1);
  /* Only the stem's top ring is stitched to the shell. Stitching every stem
     point used to be harmless when the underside curved away from it; with
     the underside flat and close, it hung a tangle of near-vertical edges off
     the whole upper half of the stem. */
  nearestEdges(mesh, stemRows[0][0], stemRows[0][0] + STEM_SEGMENTS, 0, innerStart, 0.98, 1);
  linkNeighbours(mesh);
  return { pts: mesh.pts, edgeSet: mesh.edgeSet, shellLocal };
}

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

function disposeBrain(brain) {
  const { mount, renderer } = brain;
  stopBrain(brain);
  brain.pointGeometry.dispose();
  brain.lineGeometry.dispose();
  brain.dustGeometry.dispose();
  brain.nodeMaterial.dispose();
  brain.glowMaterial.dispose();
  brain.lineMaterial.dispose();
  brain.dustMaterial.dispose();
  renderer.dispose();
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
    const brain = {
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
      dispose: () => disposeBrain(brain),
    };
  } catch (error) {
    console.warn("Failed to initialize the Three.js brain model.", error);
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
