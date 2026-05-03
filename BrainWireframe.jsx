import { useEffect, useRef } from "react";
import * as THREE from "three";

function createSeededRandom(seed = 20260427) {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function addEdge(set, a, b) {
  if (a === b) return;
  set.add(`${Math.min(a, b)}_${Math.max(a, b)}`);
}

function makePoint(THREE, x, y, z, part, ring = -1, seg = -1) {
  return { p: new THREE.Vector3(x, y, z), part, ring, seg };
}

export default function BrainWireframe() {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 1000);
    camera.position.set(0, 0.15, window.innerWidth < 720 ? 15.8 : 16.6);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    mount.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    const random = createSeededRandom();
    const isCompact = window.innerWidth < 720;
    const pts = [];
    const edgeSet = new Set();
    const p = (...args) => makePoint(THREE, ...args);

    function connectRows(rows, extraMin = 24, extraEvery = 8) {
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

    const latCount = 30;
    const lonBase = 44;
    const brainRows = [];
    pts.push(p(0, 4.5, 0, "brain", 0, 0));
    brainRows.push([0]);

    for (let i = 1; i < latCount; i += 1) {
      const row = [];
      const phi = (Math.PI * i) / latCount;
      const s = Math.sin(phi);
      const c = Math.cos(phi);
      let localLon = lonBase;

      if (i === 1 || i === latCount - 1) localLon = 18;
      else if (i === 2 || i === latCount - 2) localLon = 28;
      else if (i === 3 || i === latCount - 3) localLon = 36;

      for (let j = 0; j < localLon; j += 1) {
        const theta = (Math.PI * 2 * j) / localLon + (i % 2) * 0.055;
        let x = s * Math.cos(theta) * 6.05;
        let y = c * 4.28 + 0.32;
        let z = s * Math.sin(theta) * 3.78;
        const upper = Math.max(0, y - 0.15);

        x *= 1 + upper * 0.007;
        z *= 1 + upper * 0.01;
        if (y < -2.15 && x < -2.35) y += 0.46;
        if (y < -2.55 && x > 2.05) y += 0.2;
        if (x > 4.15) y -= 0.1;

        const nearPole = i <= 3 || i >= latCount - 3;
        const jitter = nearPole ? 0.014 : 0.065;
        x += Math.sin(y * 1.25 + z * 0.3) * 0.1 + (random() - 0.5) * jitter;
        y += Math.sin(x * 0.55) * 0.075 + (random() - 0.5) * jitter * 0.7;
        z += Math.sin(x * 0.78 + y * 0.22) * 0.12 + (random() - 0.5) * jitter;

        const idx = pts.length;
        pts.push(p(x, y, z, "brain", i, j));
        row.push(idx);
      }

      brainRows.push(row);
    }

    const bottomPole = pts.length;
    pts.push(p(0, -3.76, 0, "brain", latCount, 0));
    brainRows.push([bottomPole]);
    connectRows(brainRows, 36, 4);

    const innerStart = pts.length;
    for (let i = 0; i < 260; i += 1) {
      let x = 0;
      let y = 0;
      let z = 0;
      let ok = false;
      for (let k = 0; k < 20 && !ok; k += 1) {
        x = (random() - 0.5) * 12.1;
        y = (random() - 0.5) * 6.8 + 0.35;
        z = (random() - 0.5) * 5.3;
        ok = (x / 5.7) ** 2 + ((y - 0.32) / 3.85) ** 2 + (z / 3.35) ** 2 < 0.78 && y > -2.75;
      }
      if (ok) pts.push(p(x, y, z, "inner"));
    }

    const cereStart = pts.length;
    const cLat = 12;
    const cLonBase = 24;
    const cereRows = [];
    const cereCenter = { x: 3.55, y: -2.72, z: 0.35 };

    for (let i = 0; i <= cLat; i += 1) {
      const row = [];
      const phi = (Math.PI * i) / cLat;
      const s = Math.sin(phi);
      const c = Math.cos(phi);
      let localLon = cLonBase;

      if (i === 0 || i === cLat) localLon = 8;
      else if (i === 1 || i === cLat - 1) localLon = 12;
      else if (i === 2 || i === cLat - 2) localLon = 18;

      for (let j = 0; j < localLon; j += 1) {
        const theta = (Math.PI * 2 * j) / localLon + (i % 2) * 0.06;
        let x = cereCenter.x + s * Math.cos(theta) * 1.92;
        let y = cereCenter.y + c * 1.1;
        let z = cereCenter.z + s * Math.sin(theta) * 1.45;

        if (i === 0 || i === cLat) {
          const radius = i === 0 ? 0.22 : 0.2;
          x = cereCenter.x + Math.cos(theta) * radius;
          y = cereCenter.y + (i === 0 ? 1.1 : -1.1) + Math.sin(theta * 2) * 0.01;
          z = cereCenter.z + Math.sin(theta) * radius * 0.78;
        }

        const nearPole = i <= 2 || i >= cLat - 2;
        const jitter = nearPole ? 0.016 : 0.06;
        x += (random() - 0.5) * jitter;
        y += (random() - 0.5) * jitter * 0.8;
        z += (random() - 0.5) * jitter;

        const idx = pts.length;
        pts.push(p(x, y, z, "cerebellum", i, j));
        row.push(idx);
      }

      cereRows.push(row);
    }

    connectRows(cereRows, 18, 4);
    const cereEnd = pts.length;

    const stemRows = [];
    const stemRingCount = 9;
    const stemSegCount = 10;

    for (let i = 0; i < stemRingCount; i += 1) {
      const row = [];
      const t = i / (stemRingCount - 1);
      const cx = 1.28 + t * 0.92;
      const cy = -2.72 - t * 2.45;
      const cz = 0.18 - t * 0.1;
      const rx = 0.68 * (1 - t * 0.38);
      const rz = 0.78 * (1 - t * 0.42);

      for (let j = 0; j < stemSegCount; j += 1) {
        const angle = (Math.PI * 2 * j) / stemSegCount + i * 0.18;
        const idx = pts.length;
        pts.push(p(cx + Math.cos(angle) * rx + (random() - 0.5) * 0.045, cy + (random() - 0.5) * 0.05, cz + Math.sin(angle) * rz + (random() - 0.5) * 0.045, "stem", i, j));
        row.push(idx);
      }

      stemRows.push(row);
    }

    connectRows(stemRows, 999, 8);

    function closeStemRingSmooth(row, dy, scale) {
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
        pts.push(p(cx + (base.x - cx) * scale, cy + (random() - 0.5) * 0.018, cz + (base.z - cz) * scale, "stem", -1, j));
        cap.push(capIdx);
      });

      for (let j = 0; j < row.length; j += 1) {
        addEdge(edgeSet, cap[j], cap[(j + 1) % cap.length]);
        addEdge(edgeSet, row[j], cap[j]);
        if (j % 2 === 0) addEdge(edgeSet, row[j], cap[(j + 1) % cap.length]);
      }
    }

    closeStemRingSmooth(stemRows[0], 0.04, 0.42);
    closeStemRingSmooth(stemRows[stemRows.length - 1], -0.08, 0.36);

    function nearestEdges(fromStart, fromEnd, toStart, toEnd, maxDistance, maxCount) {
      for (let i = fromStart; i < fromEnd; i += 1) {
        const neighbors = [];
        for (let j = toStart; j < toEnd; j += 1) {
          const distance = pts[i].p.distanceTo(pts[j].p);
          if (distance < maxDistance) neighbors.push({ j, distance });
        }
        neighbors.sort((a, b) => a.distance - b.distance).slice(0, maxCount).forEach((neighbor) => addEdge(edgeSet, i, neighbor.j));
      }
    }

    nearestEdges(cereStart, cereEnd, 0, innerStart, 1.02, 2);
    nearestEdges(stemRows[0][0], pts.length, 0, innerStart, 0.98, 1);

    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[i];
      const neighbors = [];
      let maxDistance = 1.08;
      let maxCount = 3;

      if (a.part === "brain") {
        maxDistance = 1.18;
        maxCount = 4;
      } else if (a.part === "inner") {
        maxDistance = 1.15;
        maxCount = 2;
      } else if (a.part === "cerebellum") {
        maxDistance = 1.12;
        maxCount = 4;
      } else if (a.part === "stem") {
        maxDistance = 1.08;
        maxCount = 3;
      }

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

    const pointPositions = pts.flatMap((point) => [point.p.x, point.p.y, point.p.z]);
    const linePositions = [];
    edgeSet.forEach((key) => {
      const [a, b] = key.split("_").map(Number);
      linePositions.push(pts[a].p.x, pts[a].p.y, pts[a].p.z, pts[b].p.x, pts[b].p.y, pts[b].p.z);
    });

    const pointGeometry = new THREE.BufferGeometry();
    pointGeometry.setAttribute("position", new THREE.Float32BufferAttribute(pointPositions, 3));
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3));

    const pointMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.045, transparent: true, opacity: 0.78, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    const glowMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.14, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });

    group.add(new THREE.LineSegments(lineGeometry, lineMat));
    group.add(new THREE.Points(pointGeometry, pointMat));
    group.add(new THREE.Points(pointGeometry, glowMat));
    group.rotation.set(0.02, -0.18, 0);
    group.scale.setScalar(isCompact ? 0.68 : 0.78);
    group.position.y = -0.18;

    let time = 0;
    let animationFrameId = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    function handleResize() {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    }

    function handlePointerDown(event) {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      renderer.domElement.setPointerCapture?.(event.pointerId);
    }

    function handlePointerUp(event) {
      dragging = false;
      renderer.domElement.releasePointerCapture?.(event.pointerId);
    }

    function handlePointerMove(event) {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      group.rotation.y += dx * 0.006;
      group.rotation.x += dy * 0.004;
    }

    function animate() {
      animationFrameId = requestAnimationFrame(animate);
      time += 0.01;
      if (!dragging) group.rotation.y += 0.00115;
      group.position.y = -0.18 + Math.sin(time) * 0.1;
      pointMat.size = 0.045 + Math.sin(time * 2.0) * 0.004;
      glowMat.opacity = 0.045 + Math.sin(time * 1.65) * 0.018;
      lineMat.opacity = 0.55;
      renderer.render(scene, camera);
    }

    handleResize();
    animate();
    window.addEventListener("resize", handleResize);
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointercancel", handlePointerUp);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointercancel", handlePointerUp);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      pointGeometry.dispose();
      lineGeometry.dispose();
      pointMat.dispose();
      glowMat.dispose();
      lineMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        width: "100%",
        height: "100vh",
        overflow: "hidden",
        touchAction: "none",
        background:
          "radial-gradient(circle at center, #111 0%, #050505 55%, #000 100%)",
      }}
    />
  );
}
