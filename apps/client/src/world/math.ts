import { MathUtils } from "three";

/** Lerp between two angles (radians) along the shortest path. */
export function lerpAngle(a: number, b: number, t: number) {
  const d = MathUtils.euclideanModulo(b - a + Math.PI, Math.PI * 2) - Math.PI;
  return a + d * t;
}

/** Rotate a local (x, z) offset by rotY, the same way three's Y rotation does. */
export function rotateXZ(x: number, z: number, rotY: number): [number, number] {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  return [x * c + z * s, -x * s + z * c];
}

/**
 * For per-frame work that doesn't need every frame: feed it the frame delta (s), it returns true about `hz`
 * times a second.
 */
export function ticker(hz: number) {
  const step = 1 / hz;
  let acc = step; // fire on the first frame
  return (delta: number) => {
    acc += delta;
    if (acc < step) return false;
    acc = Math.min(acc - step, step);
    return true;
  };
}

/** Deterministic PRNG so every client builds the same world. */
export function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
