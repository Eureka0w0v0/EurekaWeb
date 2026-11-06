#!/usr/bin/env python3
"""Float-exact record of the brain scene, which snapshot.py cannot see.

snapshot.py leaves out the WebGL brain, the connector lines and the pills that
follow it, because they change on their own every frame. This covers them for
refactors that must not change the page:

    python3 tools/brainprobe.py record  /tmp/brain.json   # on the old code
    python3 tools/brainprobe.py compare /tmp/brain.json   # on the new code

three.js is swapped for a thin wrapper, served from memory, that keeps what the
page builds with it. Per configuration it records:

  - geometry    every Float32BufferAttribute, byte for byte (points, edges, dust)
  - scene       the graph, the camera, the renderer and the materials
  - trace       the first frames of the animation, one row per frame
  - poses       a fixed list of poses, with the loop stopped: the shell and
                brain silhouettes, the connector endpoints (both the per-frame
                update and the full sync), the pills and a hash of the pixels
  - resize      camera and renderer after the window narrows
  - theme       materials and pixels after the theme toggle

Every number is compared exactly; there is no tolerance. Running the same code
twice has to come out identical, so record and compare on the same machine:
the baseline depends on its rasteriser and is not committed.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))

from cdp import DEVICES, Browser, CDPError, Page  # noqa: E402
from devserver import ROOT, DevServer  # noqa: E402
from smoke import SKIP_INTRO, THEME_SETTLED, scroll_to, section_top  # noqa: E402

CONFIGURATIONS = (("desktop", False), ("desktop", True), ("mobile", False), ("tablet", True))
TRACE_FRAMES = 120
TRACE_TIMEOUT_S = 90.0
SETTLE_TIMEOUT_S = 15.0
RESIZE_SETTLE_S = 0.8
NARROWER_BY_PX = 40
THREE_PATH = "/vendor/three.module.min.js"
REAL_THREE_PATH = "/vendor/three-real.js"

THREE_WRAPPER = """
export * from "./three-real.js";
import * as THREE from "./three-real.js";

const moduleUrl = (suffix) => [...document.querySelectorAll('link[rel="modulepreload"]')]
  .map((link) => link.href).find((href) => href.includes(suffix));
const toBase64 = (array) => {
  const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(text);
};

const probe = (window.__brainProbe = { attributes: [], materials: [], trace: [], moduleUrl, toBase64 });

export class Float32BufferAttribute extends THREE.Float32BufferAttribute {
  constructor(array, itemSize, normalized) {
    super(array, itemSize, normalized);
    probe.attributes.push({ itemSize, count: this.count, data: toBase64(this.array) });
  }
}
export class PointsMaterial extends THREE.PointsMaterial {
  constructor(parameters) {
    super(parameters);
    probe.materials.push(this);
  }
}
export class LineBasicMaterial extends THREE.LineBasicMaterial {
  constructor(parameters) {
    super(parameters);
    probe.materials.push(this);
  }
}
export class Group extends THREE.Group {
  constructor() {
    super();
    probe.group = this;
  }
}
export class Scene extends THREE.Scene {
  constructor() {
    super();
    probe.scene = this;
  }
}
export class PerspectiveCamera extends THREE.PerspectiveCamera {
  constructor(...args) {
    super(...args);
    probe.camera = this;
  }
}
export class WebGLRenderer extends THREE.WebGLRenderer {
  constructor(parameters) {
    super(parameters);
    probe.renderer = this;
    probe.rendererParameters = { ...parameters };
  }
}

/* Subscribed before the scene exists, so the very first frame is row one. */
const { pageEvents } = await import(moduleUrl("/core/events.js"));
pageEvents.on("brain:frame", () => {
  if (probe.trace.length >= __TRACE_FRAMES__) {
    return;
  }
  const { group, materials } = probe;
  probe.trace.push([
    group.rotation.x, group.rotation.y, group.rotation.z,
    group.position.x, group.position.y, group.position.z, group.scale.x,
    ...materials.flatMap((material) => [material.opacity, material.size ?? null]),
  ]);
});
"""

# Helpers shared by the captures below, defined once on the probe object.
PAGE_HELPERS = r"""(() => {
  const probe = window.__brainProbe;
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  probe.nextFrame = nextFrame;
  probe.pinAnimations = () => {
    for (const animation of document.getAnimations()) {
      if (animation.effect?.getComputedTiming?.().iterations === Infinity) {
        animation.pause();
        animation.currentTime = 0;
      }
    }
  };
  probe.materialState = () => probe.materials.map((material) => ({
    type: material.type,
    color: material.color.getHex(),
    opacity: material.opacity,
    size: material.size ?? null,
    blending: material.blending,
    transparent: material.transparent,
    depthWrite: material.depthWrite,
    sizeAttenuation: material.sizeAttenuation ?? null,
  }));
  probe.cameraState = () => {
    const { camera, renderer } = probe;
    return {
      position: camera.position.toArray(),
      fov: camera.fov,
      aspect: camera.aspect,
      near: camera.near,
      far: camera.far,
      renderSize: [renderer.domElement.width, renderer.domElement.height],
      pixelRatio: renderer.getPixelRatio(),
    };
  };
  /* Rendered and read in one task: the drawing buffer is only guaranteed
     until the browser composites it. */
  probe.pixelHash = () => {
    const { camera, renderer, scene } = probe;
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let hash = 0x811c9dc5;
    for (let i = 0; i < pixels.length; i += 1) {
      hash = Math.imul(hash ^ pixels[i], 0x01000193);
    }
    return { width, height, hash: hash >>> 0 };
  };
  probe.readLines = () => [...document.querySelectorAll(".language-network line")].map((line) =>
    [line.getAttribute("class"), ...["x1", "y1", "x2", "y2"].map((name) => line.getAttribute(name))]);
  probe.readPills = () => [...document.querySelectorAll(".language-node")].map((pill) =>
    [pill.dataset.languageNode, pill.style.left, pill.style.top]);
  probe.silhouettes = (controller) => {
    const shell = controller.getShellSilhouette();
    return {
      shell: shell && { ...shell, bins: probe.toBase64(shell.bins) },
      brain: controller.getBrainSilhouette(),
    };
  };
})()"""

SCENE_STATE = r"""(() => {
  const { attributes, camera, group, materials, rendererParameters, scene, trace } = window.__brainProbe;
  const describe = (object) => ({
    type: object.type,
    vertices: object.geometry?.attributes.position.count ?? null,
    material: object.material ? materials.indexOf(object.material) : null,
  });
  return {
    geometry: attributes,
    scene: {
      children: scene.children.map(describe),
      group: group.children.map(describe),
      rendererParameters,
      materials: window.__brainProbe.materialState(),
      camera: window.__brainProbe.cameraState(),
    },
    trace,
  };
})()"""

# (rotation.y, position.y, position.x): the spin, the bob and the sway.
POSES = ((-0.22, -0.18, 0.0), (0.6, -0.28, 0.05), (1.4, -0.08, -0.05), (2.9, -0.18, 0.02), (4.4, -0.25, -0.03))

# The loop stops wherever it had got to, which differs from run to run, so
# everything it was animating is put in a known state before anything is read:
# the floating decorations, the two materials that breathe, and the layout the
# connector endpoints are replayed against.
FREEZE = """(async ([rotationY, positionY, positionX]) => {
  const probe = window.__brainProbe;
  const { brainSceneController: controller } = await import(probe.moduleUrl("/sections/brain.js"));
  const { requestLanguageNetworkSync } = await import(probe.moduleUrl("/sections/language-universe.js"));
  controller.stop();
  probe.pinAnimations();
  const [node, glow] = probe.materials;
  node.size = 0.045;
  glow.opacity = 0.05;
  probe.group.rotation.y = rotationY;
  probe.group.position.y = positionY;
  probe.group.position.x = positionX;
  requestLanguageNetworkSync();
  await probe.nextFrame();
  await probe.nextFrame();
})"""

POSE_SWEEP = """(async (poses) => {
  const probe = window.__brainProbe;
  const { brainSceneController: controller } = await import(probe.moduleUrl("/sections/brain.js"));
  const { requestLanguageNetworkSync } = await import(probe.moduleUrl("/sections/language-universe.js"));
  const { pageEvents } = await import(probe.moduleUrl("/core/events.js"));
  const results = [];
  for (const [rotationY, positionY, positionX] of poses) {
    probe.group.rotation.y = rotationY;
    probe.group.position.y = positionY;
    probe.group.position.x = positionX;
    pageEvents.emit("brain:frame");
    const endpoints = probe.readLines();
    requestLanguageNetworkSync();
    await probe.nextFrame();
    await probe.nextFrame();
    results.push({
      ...probe.silhouettes(controller),
      endpoints,
      lines: probe.readLines(),
      pills: probe.readPills(),
      pixels: probe.pixelHash(),
    });
  }
  return results;
})"""

AFTER_CHANGE = """(async () => {
  const probe = window.__brainProbe;
  const { brainSceneController: controller } = await import(probe.moduleUrl("/sections/brain.js"));
  await probe.nextFrame();
  await probe.nextFrame();
  return {
    camera: probe.cameraState(),
    materials: probe.materialState(),
    ...probe.silhouettes(controller),
    pixels: probe.pixelHash(),
  };
})()"""


def capture(page: Page) -> dict:
    scroll_to(page, section_top(page, "language-section"))
    page.wait_for(f"(window.__brainProbe?.trace.length ?? 0) >= {TRACE_FRAMES}", timeout=TRACE_TIMEOUT_S,
                  message="the brain never reached the end of the trace")
    page.evaluate(PAGE_HELPERS)
    settled = """document.getAnimations().every((animation) =>
      animation.playState !== "running" || animation.effect?.getComputedTiming?.().iterations === Infinity)"""
    page.wait_for(settled, timeout=SETTLE_TIMEOUT_S, message="the language section never settled")
    page.evaluate(f"{FREEZE}({json.dumps(POSES[0])})", timeout=60)

    record = page.evaluate(SCENE_STATE, timeout=60)
    record["poses"] = page.evaluate(f"{POSE_SWEEP}({json.dumps(POSES)})", timeout=60)

    device = page.device
    page.send("Emulation.setDeviceMetricsOverride", {
        "width": device.width - NARROWER_BY_PX,
        "height": device.height,
        "deviceScaleFactor": device.scale,
        "mobile": device.mobile,
    })
    time.sleep(RESIZE_SETTLE_S)
    record["resize"] = page.evaluate(AFTER_CHANGE, timeout=60)

    page.wait_for(THEME_SETTLED, timeout=10, message="theme transition never settled")
    page.click_selector("#theme-toggle")
    page.wait_for(THEME_SETTLED, timeout=10, message="theme transition never settled")
    time.sleep(RESIZE_SETTLE_S)
    record["theme"] = page.evaluate(AFTER_CHANGE, timeout=60)
    return record


def overrides(root: Path) -> dict[str, bytes]:
    wrapper = THREE_WRAPPER.replace("__TRACE_FRAMES__", str(TRACE_FRAMES))
    return {
        THREE_PATH: wrapper.encode(),
        REAL_THREE_PATH: (root / THREE_PATH.lstrip("/")).read_bytes(),
    }


def run(configurations, root: Path) -> dict:
    result = {}
    with Browser() as browser, DevServer(root=root, overrides=overrides(root)) as server:
        for device, dark in configurations:
            label = f"{device}-{'dark' if dark else 'light'}"
            print(f"  {label}", flush=True)
            page = browser.new_page(DEVICES[device], dark=dark, init_script=SKIP_INTRO)
            try:
                page.navigate(server.url)
                page.wait_for("!document.getElementById('intro-overlay')", timeout=15, message="initApp never ran")
                result[label] = {"record": capture(page), "errors": page.errors}
            finally:
                page.close()
    return result


def diff_exact(old, new, path: str = "") -> list[str]:
    """Every place two JSON values differ, with no tolerance."""
    if isinstance(old, dict) and isinstance(new, dict):
        lines = []
        for key in sorted(set(old) | set(new)):
            if key not in old or key not in new:
                lines.append(f"{path}.{key}: only on one side")
            else:
                lines.extend(diff_exact(old[key], new[key], f"{path}.{key}"))
        return lines
    if isinstance(old, list) and isinstance(new, list):
        if len(old) != len(new):
            return [f"{path}: length {len(old)} -> {len(new)}"]
        return [line for index, (a, b) in enumerate(zip(old, new)) for line in diff_exact(a, b, f"{path}[{index}]")]
    if old != new:
        left, right = str(old), str(new)
        return [f"{path}: {left[:80]} -> {right[:80]}"]
    return []


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("mode", choices=("record", "compare"))
    parser.add_argument("baseline", type=Path)
    parser.add_argument("--only", help="comma-separated labels, e.g. desktop-light,mobile-light")
    parser.add_argument("--root", type=Path, default=ROOT,
                        help="site directory to serve, e.g. a worktree of the code before the change")
    parser.add_argument("--limit", type=int, default=40, help="differences to print per configuration")
    args = parser.parse_args()

    configurations = [
        (device, dark) for device, dark in CONFIGURATIONS
        if not args.only or f"{device}-{'dark' if dark else 'light'}" in args.only.split(",")
    ]
    started = time.monotonic()
    try:
        current = run(configurations, args.root.resolve())
    except CDPError as error:
        print(f"probe failed: {error}")
        return 1

    if args.mode == "record":
        args.baseline.write_text(json.dumps(current))
        floats = sum(len(item["data"]) * 3 // 16 for c in current.values() for item in c["record"]["geometry"])
        print(f"recorded {len(current)} configurations, {floats} geometry floats, "
              f"in {time.monotonic() - started:.0f}s -> {args.baseline}")
        return 0

    baseline = json.loads(args.baseline.read_text())
    total = 0
    for label, run_result in current.items():
        if run_result["errors"]:
            print(f"[{label}] runtime errors: {run_result['errors'][:3]}")
            total += len(run_result["errors"])
        lines = diff_exact(baseline.get(label, {}).get("record"), run_result["record"])
        total += len(lines)
        if lines:
            print(f"[{label}] {len(lines)} differences")
            for line in lines[: args.limit]:
                print(f"    {line}")
    print(f"\n{'identical' if not total else f'{total} differences'} ({time.monotonic() - started:.0f}s)")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
