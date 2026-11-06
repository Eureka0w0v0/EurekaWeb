/* Silhouettes: where the shell actually lands on screen, in viewport pixels,
   so the connector lines can end on its outline instead of at fractions of the
   wrapper guessed by hand.

   The horizontal radius uses the smaller of rx and rz on purpose. The group
   spins about Y forever, so the silhouette's width breathes between those
   two -- a 38% swing at the current 5.8/4.2. Taking the minimum means a
   line always terminates on or just inside the outline at every angle,
   instead of being correct at one rotation and floating or buried at the
   rest. */

import { BRAIN_SHELL } from "./geometry.js?v=216bd6f9";

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

/* The working memory getShellSilhouette reuses every frame. */
export function createShellOutline(THREE) {
  return {
    radii: new Float32Array(OUTLINE_BINS),
    vec: new THREE.Vector3(),
    center: new THREE.Vector3(),
  };
}

export function getShellSilhouette(brain) {
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
export function getBrainSilhouette(brain) {
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
