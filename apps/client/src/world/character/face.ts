import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  PlaneGeometry,
  SRGBColorSpace,
  type Material,
  type MeshStandardMaterial,
  type Object3D,
  type SkinnedMesh,
} from "three";
import { FACE_STYLES, type Appearance, type FacePart } from "@hangout/shared";
import { paletteFrom } from "./palette";
import { cellKey } from "./recolor";

/**
 * Drawn faces. Kenney heads paint the eyes and mouth as flat dark shapes just
 * in front of the face. Those are removed, and three small quads (eyes, mouth,
 * cheeks) ride on the head bone instead, textured from one atlas drawn here at
 * runtime. Glasses and beards are separate head geometry and stay.
 *
 * Coordinates are head-model units (character ~0.78 tall): the face front is
 * at z 0.1576, the eyes are centered on x ±0.072, y 0.487, the mouth on y 0.418.
 */

/** Kenney's eye and mouth shapes lie on this plane. */
const INK_Z = 0.1596;
/** Our layers sit just behind that plane, so beards (from z 0.1596 up) still cover the mouth. */
const LAYER_Z = 0.1592;
/** Palette color id of Kenney's face ink (colormap cell 1:3). */
const INK_ID = 8;

interface Layer {
  /** Center and size of the quad on the face. */
  cx: number;
  cy: number;
  w: number;
  h: number;
}
/** Every layer is 2:1, like an atlas cell. */
const LAYERS: Record<FacePart, Layer> = {
  eyes: { cx: 0, cy: 0.487, w: 0.26, h: 0.13 },
  mouth: { cx: 0, cy: 0.416, w: 0.13, h: 0.065 },
  cheeks: { cx: 0, cy: 0.44, w: 0.26, h: 0.13 },
};

type Ctx = CanvasRenderingContext2D;
/** Draws one style in face coordinates; `ink` is the main color. */
type Draw = (ctx: Ctx, ink: string) => void;

const EX = 0.072;
const EY = 0.4865;

function poly(ctx: Ctx, pts: number[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.fill();
}
function oval(ctx: Ctx, x: number, y: number, rx: number, ry = rx) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}
/** Angles are in face coordinates (y up): 0.5π is the top of the circle. */
function arc(ctx: Ctx, x: number, y: number, r: number, from: number, to: number, width: number) {
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(x, y, r, from * Math.PI, to * Math.PI);
  ctx.stroke();
}
/** Draw for the right eye (x > 0) and mirror it onto the left. */
const both =
  (draw: (ctx: Ctx) => void): Draw =>
  (ctx) => {
    draw(ctx);
    ctx.save();
    ctx.scale(-1, 1);
    draw(ctx);
    ctx.restore();
  };

// Kenney's own shapes, traced from the models.
const CLASSIC_EYE = [0.044, 0.483, 0.051, 0.504, 0.072, 0.511, 0.093, 0.504, 0.1, 0.483, 0.093, 0.462, 0.072, 0.469, 0.051, 0.462];
const LASHES_EYE = [0.044, 0.483, 0.051, 0.504, 0.072, 0.511, 0.118, 0.511, 0.1, 0.483, 0.093, 0.462, 0.072, 0.469, 0.051, 0.462];
const SMILE = [0.031, 0.435, 0.045, 0.429, 0.043, 0.414, 0.02, 0.402, -0.02, 0.402, -0.043, 0.414, -0.045, 0.429, -0.031, 0.435, -0.013, 0.425, 0.013, 0.425];

const happyEye = (ctx: Ctx) => arc(ctx, EX, EY - 0.012, 0.022, 0.2, 0.8, 0.01);

/** Eye styles, drawn white and tinted per player; `blinks` = open eyes that close now and then. */
const EYES: { name: string; draw: Draw; blinks: boolean }[] = [
  { name: "Classic", draw: both((ctx) => poly(ctx, CLASSIC_EYE)), blinks: true },
  { name: "Lashes", draw: both((ctx) => poly(ctx, LASHES_EYE)), blinks: true },
  { name: "Round", draw: both((ctx) => oval(ctx, EX, EY, 0.024)), blinks: true },
  { name: "Dots", draw: both((ctx) => oval(ctx, EX, EY, 0.014)), blinks: true },
  { name: "Happy", draw: both(happyEye), blinks: false },
  {
    name: "Sleepy",
    draw: both((ctx) => {
      ctx.beginPath();
      ctx.ellipse(EX, EY - 0.002, 0.026, 0.02, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(EX - 0.03, EY - 0.005, 0.06, 0.007);
    }),
    blinks: true,
  },
  { name: "Wide", draw: both((ctx) => oval(ctx, EX, EY, 0.02, 0.03)), blinks: true },
  {
    name: "Wink",
    draw: (ctx) => {
      happyEye(ctx);
      oval(ctx, -EX, EY, 0.024);
    },
    blinks: false,
  },
  {
    name: "Fierce",
    draw: both((ctx) => {
      // A round eye under a brow that slopes down toward the nose.
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(EX - 0.04, EY);
      ctx.lineTo(EX + 0.04, EY + 0.034);
      ctx.lineTo(EX + 0.04, EY - 0.05);
      ctx.lineTo(EX - 0.04, EY - 0.05);
      ctx.clip();
      oval(ctx, EX, EY, 0.025);
      ctx.restore();
    }),
    blinks: true,
  },
];
const closedEyes: Draw = both((ctx) => arc(ctx, EX, EY + 0.014, 0.022, 1.2, 1.8, 0.009));

const MOUTHS: { name: string; draw: Draw }[] = [
  { name: "Smile", draw: (ctx) => poly(ctx, SMILE) },
  {
    name: "Grin",
    draw: (ctx) => {
      ctx.beginPath();
      ctx.moveTo(-0.04, 0.434);
      ctx.lineTo(0.04, 0.434);
      ctx.ellipse(0, 0.434, 0.04, 0.034, 0, 0, Math.PI, true);
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-0.04, 0.424, 0.08, 0.01);
      ctx.restore();
    },
  },
  { name: "Flat", draw: (ctx) => arc(ctx, 0, 0.318, 0.1, 0.43, 0.57, 0.008) },
  { name: "Oh", draw: (ctx) => oval(ctx, 0, 0.418, 0.013, 0.016) },
  {
    name: "Smirk",
    draw: (ctx) => {
      ctx.lineWidth = 0.008;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-0.028, 0.424);
      ctx.quadraticCurveTo(0.005, 0.404, 0.036, 0.43);
      ctx.stroke();
    },
  },
  { name: "Frown", draw: (ctx) => arc(ctx, 0, 0.398, 0.03, 0.25, 0.75, 0.008) },
  {
    name: "Cat",
    draw: (ctx) => {
      ctx.lineWidth = 0.007;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(-0.012, 0.426, 0.012, Math.PI, Math.PI * 2);
      ctx.arc(0.012, 0.426, 0.012, Math.PI, Math.PI * 2);
      ctx.stroke();
    },
  },
  {
    name: "Tongue",
    draw: (ctx, ink) => {
      ctx.fillStyle = "#e8647c";
      oval(ctx, 0.008, 0.399, 0.012);
      ctx.fillStyle = ink;
      poly(ctx, SMILE);
    },
  },
];

const FRECKLES = [0.066, 0.445, 0.08, 0.451, 0.094, 0.444, 0.073, 0.435, 0.088, 0.434, 0.101, 0.44];

const CHEEKS: { name: string; draw: Draw }[] = [
  {
    name: "Blush",
    draw: both((ctx) => {
      ctx.fillStyle = "#f2938f";
      oval(ctx, 0.088, 0.432, 0.02, 0.011);
    }),
  },
  {
    name: "Freckles",
    draw: both((ctx) => {
      ctx.fillStyle = "#b0714c";
      for (let i = 0; i < FRECKLES.length; i += 2) oval(ctx, FRECKLES[i], FRECKLES[i + 1], 0.0035);
    }),
  },
  {
    name: "Bandage",
    draw: (ctx) => {
      ctx.save();
      ctx.translate(0.085, 0.433);
      ctx.rotate(0.5);
      ctx.fillStyle = "#f0cf9c";
      ctx.beginPath();
      ctx.roundRect(-0.026, -0.009, 0.052, 0.018, 0.006);
      ctx.fill();
      ctx.fillStyle = "#d9a86a";
      ctx.fillRect(-0.008, -0.009, 0.016, 0.018);
      ctx.restore();
    },
  },
  {
    name: "Whiskers",
    draw: both((ctx) => {
      ctx.lineWidth = 0.004;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (const [y0, y1] of [
        [0.43, 0.438],
        [0.424, 0.424],
        [0.418, 0.41],
      ]) {
        ctx.moveTo(0.062, y0);
        ctx.lineTo(0.112, y1);
      }
      ctx.stroke();
    }),
  },
];

const STYLES: Record<FacePart, { name: string; draw: Draw }[]> = { eyes: EYES, mouth: MOUTHS, cheeks: CHEEKS };
for (const part of Object.keys(STYLES) as FacePart[]) {
  if (STYLES[part].length !== FACE_STYLES[part]) throw new Error(`face.ts: ${part} has ${STYLES[part].length} styles, shared says ${FACE_STYLES[part]}`);
}

/** Style names for the picker. */
export const faceStyleNames = (part: FacePart) => STYLES[part].map((s) => s.name);

/** The style actually shown for a part: eyes default to the head's own (lashes on the female heads), mouths to a smile. */
export function faceStyle(a: Appearance, part: FacePart) {
  const v = a[part];
  if (v >= 0) return v;
  if (part === "eyes") return a.hairstyle.startsWith("female") ? 1 : 0;
  return part === "mouth" ? 0 : -1;
}

// Atlas: 4 x 8 cells of 256 x 128 px. Eyes (plus closed eyes for blinking), then mouths, then cheeks.
const CELL_W = 256;
const CELL_H = 128;
const ATLAS_COLS = 4;
const ATLAS_SIZE = 1024;
const CLOSED_CELL = FACE_STYLES.eyes;
const CELL_BASE: Record<FacePart, number> = { eyes: 0, mouth: CLOSED_CELL + 1, cheeks: CLOSED_CELL + 1 + FACE_STYLES.mouth };

/** Map `layer`'s face coordinates onto a w x h canvas region at (x, y). */
function frame(ctx: Ctx, layer: Layer, x: number, y: number, w: number, h: number) {
  const s = w / layer.w;
  ctx.setTransform(s, 0, 0, -s, x + w / 2 - layer.cx * s, y + h / 2 + layer.cy * s);
}

function drawStyle(ctx: Ctx, draw: Draw, color: string) {
  ctx.save();
  ctx.fillStyle = ctx.strokeStyle = color;
  draw(ctx, color);
  ctx.restore();
}

let atlas: CanvasTexture | null = null;
function faceAtlas(ink: string) {
  if (atlas) return atlas;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext("2d")!;
  const put = (part: FacePart, cell: number, draw: Draw, color: string) => {
    frame(ctx, LAYERS[part], (cell % ATLAS_COLS) * CELL_W, Math.floor(cell / ATLAS_COLS) * CELL_H, CELL_W, CELL_H);
    drawStyle(ctx, draw, color);
  };
  // Eyes are white here and take each player's eye color from vertex colors.
  EYES.forEach((s, i) => put("eyes", CELL_BASE.eyes + i, s.draw, "#ffffff"));
  put("eyes", CLOSED_CELL, closedEyes, "#ffffff");
  MOUTHS.forEach((s, i) => put("mouth", CELL_BASE.mouth + i, s.draw, ink));
  CHEEKS.forEach((s, i) => put("cheeks", CELL_BASE.cheeks + i, s.draw, ink));
  atlas = new CanvasTexture(canvas);
  atlas.colorSpace = SRGBColorSpace;
  atlas.anisotropy = 4;
  return atlas;
}

function setCell(geo: BufferGeometry, cell: number) {
  const x = (cell % ATLAS_COLS) * CELL_W;
  const y = Math.floor(cell / ATLAS_COLS) * CELL_H;
  const u0 = x / ATLAS_SIZE;
  const u1 = (x + CELL_W) / ATLAS_SIZE;
  // CanvasTexture is flipped: the canvas top is v = 1.
  const vTop = 1 - y / ATLAS_SIZE;
  const vBottom = 1 - (y + CELL_H) / ATLAS_SIZE;
  const uv = geo.attributes.uv;
  // PlaneGeometry vertex order: top-left, top-right, bottom-left, bottom-right.
  uv.setXY(0, u0, vTop);
  uv.setXY(1, u1, vTop);
  uv.setXY(2, u0, vBottom);
  uv.setXY(3, u1, vBottom);
  uv.needsUpdate = true;
}

let material: MeshStandardMaterial | null = null;
function faceMaterial(base: MeshStandardMaterial, ink: string) {
  if (material) return material;
  material = base.clone();
  material.map = faceAtlas(ink);
  material.vertexColors = true;
  material.alphaTest = 0.5;
  return material;
}

const inkless = new WeakMap<BufferGeometry, BufferGeometry>();

/**
 * The head geometry without Kenney's painted eyes and mouth. Ink is whatever
 * is painted on the ink plane where the eyes are (usually the dark cell, a
 * colored cell for some lashes); only those cells are dropped, so a beard on
 * the same plane stays. Cached per source geometry, so players share it.
 */
function withoutInk(geo: BufferGeometry) {
  let out = inkless.get(geo);
  if (out) return out;
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const onPlane = (i: number) => Math.abs(pos.getZ(i) - INK_Z) < 0.0004;
  const cell = (i: number) => cellKey(uv.getX(i), uv.getY(i));
  const ink = new Set<number>();
  for (let i = 0; i < pos.count; i++) {
    const x = Math.abs(pos.getX(i));
    const y = pos.getY(i);
    if (onPlane(i) && x > 0.04 && x < 0.125 && y > 0.46 && y < 0.515) ink.add(cell(i));
  }
  const isInk = (i: number) => onPlane(i) && ink.has(cell(i)) && Math.abs(pos.getX(i)) < 0.125 && pos.getY(i) > 0.395 && pos.getY(i) < 0.52;
  const index = geo.index ? Array.from(geo.index.array) : Array.from({ length: pos.count }, (_, i) => i);
  const kept: number[] = [];
  for (let t = 0; t < index.length; t += 3) {
    const [a, b, c] = [index[t], index[t + 1], index[t + 2]];
    if (!(isInk(a) && isInk(b) && isInk(c))) kept.push(a, b, c);
  }
  out = new BufferGeometry();
  for (const [name, attr] of Object.entries(geo.attributes)) out.setAttribute(name, attr);
  out.setIndex(kept);
  out.computeBoundingSphere();
  inkless.set(geo, out);
  return out;
}

/** Drop the head's painted eyes and mouth; call before recoloring, which clones the geometry. */
export function removeFaceInk(model: Object3D) {
  const head = model.getObjectByName("head-mesh") as SkinnedMesh | undefined;
  if (head?.isSkinnedMesh) head.geometry = withoutInk(head.geometry);
}

export interface Face {
  eyes: Mesh | null;
  eyeStyle: number;
}

/**
 * Add the face layers to a character, on its head bone. `base` is the
 * characters' shared material (its colormap gives the palette and ink color).
 */
export function addFace(model: Object3D, a: Appearance, base: Material): Face | null {
  const head = model.getObjectByName("head-mesh") as SkinnedMesh | undefined;
  const map = (base as MeshStandardMaterial).map;
  if (!head?.isSkinnedMesh || !map?.image) return null;
  const boneIndex = head.skeleton.bones.findIndex((b) => b.name === "head");
  if (boneIndex < 0) return null;

  const palette = paletteFrom(map.image as ImageBitmap);
  const ink = palette[INK_ID];
  const mat = faceMaterial(base as MeshStandardMaterial, ink);
  const group = new Group();
  // Head-model space to head-bone space, as the skinned head mesh does it.
  group.applyMatrix4(new Matrix4().multiplyMatrices(head.skeleton.boneInverses[boneIndex], head.bindMatrix));
  head.skeleton.bones[boneIndex].add(group);

  const face: Face = { eyes: null, eyeStyle: -1 };
  for (const part of Object.keys(LAYERS) as FacePart[]) {
    const style = faceStyle(a, part);
    if (style < 0) continue;
    const l = LAYERS[part];
    const geo = new PlaneGeometry(l.w, l.h).translate(l.cx, l.cy, LAYER_Z);
    setCell(geo, CELL_BASE[part] + style);
    const color = new Color(part === "eyes" ? palette[a.eyeColor] ?? ink : "#ffffff");
    geo.setAttribute("color", new Float32BufferAttribute(Array.from({ length: 4 }, () => color.toArray()).flat(), 3));
    const mesh = new Mesh(geo, mat);
    group.add(mesh);
    if (part === "eyes") Object.assign(face, { eyes: mesh, eyeStyle: style });
  }
  return face;
}

/** Close or open the eyes (blinking); styles that are already closed-looking don't blink. */
export function setEyesClosed(face: Face, closed: boolean) {
  if (!face.eyes || !EYES[face.eyeStyle]?.blinks) return;
  setCell(face.eyes.geometry, closed ? CLOSED_CELL : CELL_BASE.eyes + face.eyeStyle);
}

const thumbs = new Map<string, string>();

/**
 * Picker thumbnail (data URL) of one style on a patch of skin. Cheeks are
 * shown with a plain face for context.
 */
export function faceThumb(part: FacePart, style: number, colors: { skin: string; eyes: string; ink: string }) {
  const key = `${part}:${style}:${colors.skin}:${colors.eyes}:${colors.ink}`;
  let url = thumbs.get(key);
  if (url) return url;
  const canvas = document.createElement("canvas");
  canvas.width = 112;
  canvas.height = 56;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = colors.skin;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  frame(ctx, LAYERS[part], 0, 0, canvas.width, canvas.height);
  if (part === "cheeks") {
    drawStyle(ctx, EYES[0].draw, colors.ink);
    drawStyle(ctx, MOUTHS[0].draw, colors.ink);
  }
  if (style >= 0) drawStyle(ctx, STYLES[part][style].draw, part === "eyes" ? colors.eyes : colors.ink);
  url = canvas.toDataURL();
  thumbs.set(key, url);
  return url;
}

/** Ink color for thumbnails, once the palette is known. */
export const faceInk = (palette: string[]) => palette[INK_ID];
