import type { BufferGeometry, Object3D, SkinnedMesh } from "three";
import { COLOR_PARTS, hasDress, type Appearance } from "@hangout/shared";

/**
 * Recolors Kenney characters by moving UVs between cells of their shared
 * colormap, so no textures are generated per player.
 *
 * colormap.png is a grid of 16x4 cells (32px each). The bottom two rows hold
 * the palette: 8 colors per row, each color a PAIR of adjacent cells (flat +
 * gradient). A palette color id is 0..15: ids 0-7 are row 2, 8-15 row 3.
 * Recoloring keeps the source cell's parity and the UV offset inside the
 * cell, so shading gradients survive.
 */

const COLS = 16;
const ROWS = 4;

/** Pixel to sample for a palette color's swatch in colormap.png (512x512). */
export function paletteSamplePoint(id: number) {
  return { x: (id % 8) * 64 + 16, y: (id < 8 ? 2 : 3) * 128 + 64 };
}

/** Parts labeled per vertex; "dress" is a separate overlay (see MeshParts.dress). */
type BasePart = "skin" | "hair" | "top" | "bottom" | "shoes";
const PART_CODE: Record<BasePart, number> = { skin: 1, hair: 2, top: 3, bottom: 4, shoes: 5 };

interface MeshParts {
  /** Per vertex: 0 = keep, else PART_CODE. */
  part: Uint8Array;
  /** Per vertex: 1 = on the skirt/dress, recolored by "dress" when set, else by `part`. */
  dress: Uint8Array;
}

const cellOf = (u: number, v: number) => ({ col: Math.min(COLS - 1, Math.floor(u * COLS)), row: Math.min(ROWS - 1, Math.floor(v * ROWS)) });
/** Colormap cell index (row * 16 + col) under a UV. */
export const cellKey = (u: number, v: number) => {
  const c = cellOf(u, v);
  return c.row * COLS + c.col;
};

function dominantBone(mesh: SkinnedMesh, i: number) {
  const { skinIndex, skinWeight } = mesh.geometry.attributes;
  let best = 0;
  for (let k = 1; k < 4; k++) if (skinWeight.getComponent(i, k) > skinWeight.getComponent(i, best)) best = k;
  return mesh.skeleton.bones[skinIndex.getComponent(i, best)]?.name ?? "";
}

/**
 * Body zones (model units, character ~0.78 tall). The same colormap cell is
 * often reused on different parts (e.g. gloves and leggings), so parts are
 * decided per zone, not per cell.
 */
type Zone = "head" | "arm" | "torsoHi" | "torsoLo" | "legs" | "feet";
const WAIST_Y = 0.21;
const ANKLE_Y = 0.09;

function zoneOf(mesh: SkinnedMesh, i: number): Zone {
  if (mesh.name.startsWith("head")) return "head";
  const bone = dominantBone(mesh, i);
  const y = mesh.geometry.attributes.position.getY(i);
  if (bone.startsWith("arm")) return "arm";
  if (bone.startsWith("leg")) return y < ANKLE_Y ? "feet" : "legs";
  return y >= WAIST_Y ? "torsoHi" : "torsoLo";
}

/** Eyes/mouth sit on the flat face front (z=0.16), inside the eye/mouth area. */
function isFaceDecal(geo: BufferGeometry, i: number) {
  const p = geo.attributes.position;
  return Math.abs(p.getZ(i) - 0.16) < 0.006 && p.getY(i) < 0.53 && Math.abs(p.getX(i)) < 0.13;
}

/** Detected cells: the user-facing parts plus "waist" (skirt/belt), which takes the bottom color. */
type Slot = BasePart | "waist";
const SLOT_PART: Record<Slot, BasePart> = { skin: "skin", hair: "hair", top: "top", bottom: "bottom", shoes: "shoes", waist: "bottom" };

/** Slots each zone may recolor, in priority order. Feet are always shoes, even if they share the skin cell. */
const ZONE_SLOTS: Record<Zone, Slot[]> = {
  head: ["skin", "hair"],
  arm: ["skin", "top"],
  torsoHi: ["skin", "top", "waist"],
  torsoLo: ["skin", "top", "bottom", "waist"],
  legs: ["skin", "bottom"],
  feet: ["shoes", "bottom"],
};

interface Analysis {
  meshes: Map<string, MeshParts>;
  cells: Partial<Record<Slot | "dress", number>>;
}
const analysisCache = new WeakMap<Object3D, Analysis>();

/** Dev helper (scripts/detected-parts.mts): the "col:row" colormap cell detected for each slot. */
export function detectedCells(scene: Object3D) {
  const { cells } = analyze(scene);
  return Object.fromEntries(Object.entries(cells).map(([k, c]) => [k, c === undefined ? null : `${c % COLS}:${Math.floor(c / COLS)}`]));
}

/**
 * Label every vertex of a Kenney character with the part it belongs to, by
 * picking one colormap cell per part from per-zone vertex counts:
 * skin = the 220-vertex face block, hair = biggest other head cell,
 * top = upper-torso cell with the most torso+sleeve vertices,
 * bottom = main leg cell (plus the skirt/belt "waist" cell),
 * shoes = main foot cell that isn't the bottom,
 * dress = main lower-torso cell that isn't skin (skirt, or a one-piece dress
 * sharing the top's cell); only used on DRESS_CHARACTERS.
 */
function analyze(scene: Object3D) {
  const cached = analysisCache.get(scene);
  if (cached) return cached;

  const meshes: SkinnedMesh[] = [];
  scene.traverse((o) => (o as SkinnedMesh).isSkinnedMesh && meshes.push(o as SkinnedMesh));

  const hist = Object.fromEntries(Object.keys(ZONE_SLOTS).map((z) => [z, new Map<number, number>()])) as Record<Zone, Map<number, number>>;
  for (const m of meshes) {
    const uv = m.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const z = zoneOf(m, i);
      const key = cellKey(uv.getX(i), uv.getY(i));
      hist[z].set(key, (hist[z].get(key) ?? 0) + 1);
    }
  }
  const count = (z: Zone, c: number) => hist[z].get(c) ?? 0;
  const best = (cands: Iterable<number>, score: (c: number) => number, exclude: (number | undefined)[]) => {
    let pick: number | undefined;
    for (const c of cands) if (!exclude.includes(c) && (pick === undefined || score(c) > score(pick))) pick = c;
    return pick;
  };

  // Every Kenney head has the same 220-vertex face block; fall back to the
  // biggest head cell that's also on the arms (hands) if a model ever differs.
  const FACE_VERTS = 220;
  const headCells = [...hist.head.keys()];
  const skin =
    headCells.find((c) => count("head", c) === FACE_VERTS) ??
    best(headCells.filter((c) => hist.arm.has(c)), (c) => count("head", c), []) ??
    best(headCells, (c) => count("head", c), []);
  const cells: Analysis["cells"] = { skin };
  cells.hair = best(headCells, (c) => count("head", c), [skin]);
  cells.top = best(hist.torsoHi.keys(), (c) => count("torsoHi", c) + count("arm", c), [skin]);
  cells.bottom =
    best(hist.legs.keys(), (c) => count("legs", c), [skin]) ?? best(hist.torsoLo.keys(), (c) => count("torsoLo", c), [skin, cells.top]);
  cells.shoes = best(hist.feet.keys(), (c) => count("feet", c), [cells.bottom]) ?? cells.bottom;
  // Skirt or belt: the main lower-torso cell that isn't skin or the top.
  cells.waist = best(hist.torsoLo.keys(), (c) => count("torsoLo", c), [skin, cells.top]);
  cells.dress = best(hist.torsoLo.keys(), (c) => count("torsoLo", c), [skin]);

  const result: Analysis = { meshes: new Map(), cells };
  for (const m of meshes) {
    const uv = m.geometry.attributes.uv;
    const part = new Uint8Array(uv.count);
    const dress = new Uint8Array(uv.count);
    for (let i = 0; i < uv.count; i++) {
      const cell = cellKey(uv.getX(i), uv.getY(i));
      const zone = zoneOf(m, i);
      // The whole garment on the torso, so a one-piece dress recolors top to hem.
      if ((zone === "torsoHi" || zone === "torsoLo") && cell === cells.dress) dress[i] = 1;
      const slot = ZONE_SLOTS[zone].find((p) => cells[p] === cell);
      // Eyes/mouth can share the hair cell; keep them dark.
      if (slot === "hair" && isFaceDecal(m.geometry, i)) continue;
      if (slot) part[i] = PART_CODE[SLOT_PART[slot]];
    }
    result.meshes.set(m.name, { part, dress });
  }
  analysisCache.set(scene, result);
  return result;
}

export function hasCustomColors(a: Appearance) {
  return COLOR_PARTS.some((p) => a[p] >= 0);
}

/** Palette color id of a colormap cell, or -1 if the cell isn't in the palette rows. */
function paletteIdOf(cell: number | undefined) {
  if (cell === undefined) return -1;
  const row = Math.floor(cell / COLS);
  return row < 2 ? -1 : (row - 2) * 8 + Math.floor((cell % COLS) / 2);
}

/**
 * Give a cloned character its own UVs pointing at the chosen palette colors.
 * `sources` are the original glTF scenes the clone's body and head meshes came
 * from (used for the cached analysis); they differ when the hairstyle is
 * another character's.
 */
export function applyColors(clone: Object3D, a: Appearance, sources: { body: Object3D; head: Object3D }) {
  const body = analyze(sources.body);
  const head = analyze(sources.head);
  // A borrowed head keeps one skin tone with the body: the outfit's, unless the player picked one.
  const headSkin = a.skin >= 0 || head === body || head.cells.skin === body.cells.skin ? a.skin : paletteIdOf(body.cells.skin);
  if (!hasCustomColors(a) && headSkin < 0) return;
  const dress = hasDress(a.character) ? a.dress : -1;

  clone.traverse((o) => {
    const mesh = o as SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const isHead = mesh.name.startsWith("head");
    const parts = (isHead ? head : body).meshes.get(mesh.name);
    if (!parts) return;
    const target: number[] = [-1, isHead ? headSkin : a.skin, a.hair, a.top, a.bottom, a.shoes];
    // SkeletonUtils.clone shares geometry between instances; give this one its own.
    mesh.geometry = mesh.geometry.clone();
    const uv = mesh.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const id = dress >= 0 && parts.dress[i] ? dress : target[parts.part[i]];
      if (id === undefined || id < 0) continue;
      const u = uv.getX(i);
      const v = uv.getY(i);
      const from = cellOf(u, v);
      const toCol = (id % 8) * 2 + (from.col % 2);
      const toRow = id < 8 ? 2 : 3;
      uv.setXY(i, u + (toCol - from.col) / COLS, v + (toRow - from.row) / ROWS);
    }
    uv.needsUpdate = true;
  });
}
