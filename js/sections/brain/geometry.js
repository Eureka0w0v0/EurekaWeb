/* The wireframe brain's points and edges, built from a seeded random stream.
   Nothing here touches the page or draws: it takes THREE, for Vector3, and a
   random function, and hands back plain data.

   The order of the stages in buildBrainGeometry is load-bearing: they draw
   from one seeded stream, so reordering them would produce a different (if
   equally plausible) brain. */

/* The envelope the shell is sculpted from, in local units before the group's
   scale: the surface starts as this ellipsoid and is pushed into a brain from
   there (see shellPoint), so these set its overall length, height and width.
   The connector lines from the language pills no longer read these numbers --
   they are measured off the built vertices as projected each frame, so any
   reshaping moves the endpoints with it by construction. (They used to be
   independent: the shell was reshaped on 2026-08-02 and the anchors had been
   frozen since 2026-05-03, which left the Python line starting deep inside
   the sphere and three of the others as stubs.) */
export const BRAIN_SHELL = { rx: 5.8, ry: 4.5, rz: 4.2, cy: 0.32 };

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
export function buildBrainGeometry(THREE, random) {
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
