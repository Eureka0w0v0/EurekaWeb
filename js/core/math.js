/* Clamping, easing and interpolation helpers. */
export function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

export function easeInOut(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export function easeOutCubic(value) {
  const t = 1 - clamp01(value);
  return 1 - t * t * t;
}

export function smootherStep(value) {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function mapScrollSegment(progress, start, end) {
  return clamp01((progress - start) / Math.max(end - start, 0.001));
}

export function interpolate(start, end, progress) {
  return start + (end - start) * progress;
}


export function cubicBezierValue(start, controlA, controlB, end, progress) {
  const t = clamp01(progress);
  const inverse = 1 - t;

  return (
    inverse * inverse * inverse * start
    + 3 * inverse * inverse * t * controlA
    + 3 * inverse * t * t * controlB
    + t * t * t * end
  );
}

export function interpolateStops(progress, stops, values) {
  const t = clamp01(progress);

  for (let index = 0; index < stops.length - 1; index += 1) {
    const start = stops[index];
    const end = stops[index + 1];

    if (t <= end) {
      return interpolate(values[index], values[index + 1], mapScrollSegment(t, start, end));
    }
  }

  return values[values.length - 1];
}

export function coerceNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export function createSeededRandom(seed = 42) {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
