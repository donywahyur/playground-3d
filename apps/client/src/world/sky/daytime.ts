import { Color, MathUtils, Vector3 } from "three";
import { dayPhase } from "@hangout/shared";

/** Server clock minus local clock (ms), from the best clock sample so far. */
let clockOffset = 0;
let bestRtt = Infinity;

/** Feed one clock round trip; the sample with the lowest RTT wins. */
export function syncClock(sentAt: number, server: number) {
  const now = Date.now();
  const rtt = now - sentAt;
  if (rtt < 0 || rtt >= bestRtt) return;
  bestRtt = rtt;
  clockOffset = server + rtt / 2 - now;
}

export function resetClock() {
  clockOffset = 0;
  bestRtt = Infinity;
}

/** `?time=0.5` freezes the time of day (0 sunrise, ~0.33 noon, 0.65 sunset, ~0.83 midnight) for testing. */
const fixedPhase = (() => {
  const v = new URLSearchParams(location.search).get("time");
  return v !== null && Number.isFinite(Number(v)) ? MathUtils.euclideanModulo(Number(v), 1) : null;
})();

/** Fog start and end distance (m); past the end everything is the horizon color. */
export const FOG = { near: 50, far: 130 };

/** Share of the cycle the sun is up; nights are shorter than days. */
const DAYLIGHT = 0.65;
/** Tilts the sun's path south so it never passes straight overhead (peak ~60°). */
const PATH_TILT = 0.5;

const day = {
  top: new Color("#5ea8e8"),
  horizon: new Color("#bfe3ff"),
  sun: new Color("#fff4e0"),
  ambient: new Color("#ffffff"),
};
const dusk = {
  top: new Color("#4a5f9c"),
  horizon: new Color("#f2a77a"),
  sun: new Color("#ffaa66"),
  ambient: new Color("#ffd2b8"),
};
const night = {
  top: new Color("#0a1430"),
  horizon: new Color("#25375e"),
  moon: new Color("#b4c8ff"),
  ambient: new Color("#8ea8e0"),
};

/** Current lighting, recomputed once per frame by updateSky(). */
export const sky = {
  /** Unit vector toward the sun; the moon is opposite. */
  sunDir: new Vector3(),
  /** Unit vector the main light shines from (sun by day, moon by night), kept off the horizon. */
  lightDir: new Vector3(),
  lightColor: new Color(),
  lightIntensity: 0,
  ambientColor: new Color(),
  ambientIntensity: 0,
  /** Sky dome zenith color; horizon is also the fog color. */
  top: new Color(),
  horizon: new Color(),
  /** 0 by day, 1 at night: lamps, stars. */
  night: 0,
};

const tmp = new Color();

const currentPhase = () => fixedPhase ?? dayPhase(Date.now() + clockOffset);

/**
 * In-game wall clock: sunrise reads 06:00 and sunset 18:00, so the hours tick
 * a little slower by day than at night (days are longer than nights).
 */
export function clockTime() {
  const phase = currentPhase();
  const day = phase < DAYLIGHT;
  const hours = day ? 6 + (phase / DAYLIGHT) * 12 : 18 + ((phase - DAYLIGHT) / (1 - DAYLIGHT)) * 12;
  const minutes = Math.floor(hours * 60) % (24 * 60);
  return { h: Math.floor(minutes / 60), m: minutes % 60, day };
}

export function updateSky() {
  const phase = currentPhase();
  // Sun angle along its path: 0..π while up, π..2π while down.
  const a = phase < DAYLIGHT ? (phase / DAYLIGHT) * Math.PI : Math.PI + ((phase - DAYLIGHT) / (1 - DAYLIGHT)) * Math.PI;
  // Rises in the east (+x, over the sea), sets in the west.
  sky.sunDir.set(Math.cos(a), Math.sin(a) * Math.cos(PATH_TILT), Math.sin(a) * Math.sin(PATH_TILT));
  const elev = sky.sunDir.y;

  // How far we are from day toward dusk, and from dusk toward night.
  const toDusk = 1 - MathUtils.smoothstep(elev, 0.02, 0.35);
  const toNight = 1 - MathUtils.smoothstep(elev, -0.3, 0.02);
  sky.night = 1 - MathUtils.smoothstep(elev, -0.12, 0.1);

  sky.top.copy(day.top).lerp(dusk.top, toDusk).lerp(night.top, toNight);
  sky.horizon.copy(day.horizon).lerp(dusk.horizon, toDusk).lerp(night.horizon, toNight);
  sky.ambientColor.copy(day.ambient).lerp(dusk.ambient, toDusk).lerp(night.ambient, toNight);
  // Night stays fairly bright so it remains playable (especially on dim phone screens).
  sky.ambientIntensity = MathUtils.lerp(0.6, 0.55, toNight);

  // One directional light: the sun while it's up, then the moon. They hand
  // over just below the horizon where both are at zero intensity.
  const sunUp = elev > -0.06;
  sky.lightDir.copy(sky.sunDir);
  if (!sunUp) sky.lightDir.negate();
  // Low light makes endless shadows; keep it at least ~20° up.
  sky.lightDir.y = Math.max(sky.lightDir.y, 0.35);
  sky.lightDir.normalize();
  if (sunUp) {
    sky.lightColor.copy(tmp.copy(day.sun).lerp(dusk.sun, toDusk));
    sky.lightIntensity = 1.6 * MathUtils.smoothstep(elev, -0.06, 0.2);
  } else {
    sky.lightColor.copy(night.moon);
    sky.lightIntensity = 0.7 * MathUtils.smoothstep(-elev, 0.06, 0.25);
  }
}
