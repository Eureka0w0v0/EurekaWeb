/* Promises that resolve after animation frames or a delay. */
export function waitForNextAnimationFrame() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(resolve);
  });
}

export function waitForFrames(count = 1) {
  return new Promise((resolve) => {
    const step = () => {
      count -= 1;
      if (count <= 0) {
        resolve();
        return;
      }
      window.requestAnimationFrame(step);
    };

    window.requestAnimationFrame(step);
  });
}

export function waitMilliseconds(duration) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, duration);
  });
}
