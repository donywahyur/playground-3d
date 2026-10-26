import { WORLD_HALF_SIZE } from "@hangout/shared";

/**
 * World map (meters, -z is north):
 *
 *   NW forest  |      Town (north)      | NE forest
 *   -----------+------------------------+-----------
 *   West wilds |  tree belt / FOREST    |  Beach + sea (east)
 *              |  CAMP in the middle    |
 *   -----------+------------------------+-----------
 *   SW forest  |   Graveyard (south)    | SE forest
 *
 * Dirt paths run from the camp plaza out to every zone through gaps in the
 * tree belt.
 */
export const HALF = WORLD_HALF_SIZE;
/** The ground and scenery run on past the invisible walls to here, so the edge of the world isn't visible. */
export const EDGE = HALF + 8;

/** Ground colors, picked from the kits' colormaps (also used by the minimap). */
export const GROUND = {
  grass: "#68b383",
  dirt: "#d98a62",
  sand: "#f5cfa2",
  water: "#5b8fd6",
};

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}
export const inRect = (r: Rect, x: number, z: number, pad = 0) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;

/** The camp's ring of trees; everything inside is the original forest camp. */
export const BELT = { inner: 36, outer: 45 };

export const TOWN: Rect = { x0: -38, x1: 38, z0: -78, z1: -47 };
export const GRAVEYARD: Rect = { x0: -26, x1: 26, z0: 47, z1: 78 };
/** Sand from here east; the sea starts at SHORE. */
export const BEACH_X = 47;
export const SHORE_X = 66;
/** Sloped beach from SHORE_X down to the sea floor. */
export const SEA_FLOOR = { x: 72, y: -1.4 };
export const WATER_Y = -0.45;
/** How deep (m) something at height y stands in the sea; 0 on land or above the surface. */
export const waterDepth = (x: number, y: number) => (x > SHORE_X - 2 ? Math.max(0, WATER_Y - y) : 0);
export const BEACH: Rect = { x0: BEACH_X, x1: HALF, z0: -38, z1: 38 };
export const WEST_CLEARING = { x: -62, z: 0, r: 9 };

/** Dirt paths: center x/z, width (x) and depth (z). Each one is a single
 * unbroken strip from the plaza edge to its zone (the north one continues
 * behind the stage; the plaza-to-ramp bit lives with the camp). */
export const PATHS: { x: number; z: number; w: number; d: number }[] = [
  // North: behind the stage up to the town road.
  { x: 0, z: -38.5, w: 2.6, d: 19 },
  // East: plaza, past the tents, to the beach.
  { x: 27.5, z: 0, w: 39, d: 2.6 },
  // South: plaza to the graveyard gate.
  { x: 0, z: 28.5, w: 2.6, d: 39 },
  // West: plaza, past the archery range, to the wilds clearing.
  { x: -31, z: 0, w: 46, d: 2.6 },
];

/** Gaps in the tree belt where the paths cross it. */
export function inBeltGap(x: number, z: number) {
  return (Math.abs(x) < 5 && Math.abs(z) > BELT.inner - 2) || Math.abs(z) < 5;
}

export function onPath(x: number, z: number, pad = 0) {
  return PATHS.some((p) => Math.abs(x - p.x) < p.w / 2 + pad && Math.abs(z - p.z) < p.d / 2 + pad);
}

/** True inside any themed zone (town, graveyard, beach). */
export function inZone(x: number, z: number, pad = 0) {
  return inRect(TOWN, x, z, pad) || inRect(GRAVEYARD, x, z, pad) || x > BEACH_X - pad;
}
