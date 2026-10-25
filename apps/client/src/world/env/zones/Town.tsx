import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CylinderCollider, RigidBody } from "@react-three/rapier";
import type { Group } from "three";
import { mulberry32, rotateXZ } from "../../math";
import type { Lamp } from "../Lamps";
import { inRect, TOWN } from "../layout";
import { seatsOn, type Seat } from "../seats";
import { Blocks, kitModel, kitScale, Props, PropSet, PropSetView, useKitModel, type Block, type Placement } from "../props";

// North: a little town (Kenney "Fantasy Town Kit"). A cobbled road leads from
// the camp's north path to a square with a fountain and market stalls; houses
// are built from wall and roof modules around it.

const t = (name: string) => kitModel("fantasy-town", name);
const M = {
  road: t("road"),
  fountain: t("fountain-round-detail"),
  stallRed: t("stall-red"),
  stallGreen: t("stall-green"),
  stallBench: t("stall-bench"),
  stool: t("stall-stool"),
  lantern: t("lantern"),
  cart: t("cart-high"),
  hedge: t("hedge-large"),
  tree: t("tree"),
  treeHigh: t("tree-high-round"),
  treeCrooked: t("tree-crooked"),
  rock: t("rock-wide"),
  bannerRed: t("banner-red"),
  bannerGreen: t("banner-green"),
  windmill: t("windmill"),
  chimney: t("chimney"),
  wall: t("wall"),
  wallWindow: t("wall-window-shutters"),
  wallDoor: t("wall-door"),
  woodWall: t("wall-wood"),
  woodWindow: t("wall-wood-window-shutters"),
  woodDoor: t("wall-wood-door"),
  woodWindowSmall: t("wall-wood-window-small"),
  roofGable: t("roof-gable"),
  roofPoint: t("roof-point"),
  roofHighPoint: t("roof-high-point"),
};

/** One town tile (wall module) in meters. */
const T = kitScale("fantasy-town");

const SQUARE = { x: 0, z: -65, half: 9 };

interface House {
  x: number;
  z: number;
  /** Door faces local +x; rot turns the house. */
  rot: number;
  /** Tiles along local z. */
  len: number;
  floors: 1 | 2;
  roof: "gable" | "point" | "high";
  scale?: number;
}

const HOUSES: House[] = [
  // West and east of the square, doors facing it.
  { x: -16, z: -65, rot: 0, len: 3, floors: 1, roof: "gable", scale: 1.2 },
  { x: 16, z: -65, rot: Math.PI, len: 3, floors: 2, roof: "gable" },
  // Corners.
  { x: -25, z: -55, rot: -Math.PI / 4, len: 1, floors: 2, roof: "high" },
  { x: 25, z: -55, rot: Math.PI + Math.PI / 4, len: 1, floors: 1, roof: "point", scale: 1.4 },
  { x: -24, z: -73, rot: -Math.PI / 2, len: 2, floors: 1, roof: "gable", scale: 1.2 },
  { x: 26, z: -73, rot: -Math.PI / 2, len: 1, floors: 2, roof: "high", scale: 1.1 },
  // Along the road in.
  { x: -8, z: -51, rot: 0, len: 1, floors: 1, roof: "point", scale: 1.2 },
  { x: 8, z: -51, rot: Math.PI, len: 2, floors: 1, roof: "gable" },
  // Outskirts.
  { x: -33, z: -63, rot: 0, len: 2, floors: 2, roof: "gable" },
  { x: 33, z: -64, rot: Math.PI, len: 1, floors: 1, roof: "point", scale: 1.3 },
];

/** Windmill sails on the side of this house. */
const MILL = HOUSES[5];

const houseSet = new PropSet();
const houseBlocks: Block[] = [];
for (const [hi, h] of HOUSES.entries()) {
  const sc = h.scale ?? 1;
  const tile = T * sc;
  const place = (lx: number, lz: number, rot: number, y = 0): Placement => {
    const [ox, oz] = rotateXZ(lx, lz, h.rot);
    return [h.x + ox, h.z + oz, h.rot + rot, sc, y];
  };
  for (let floor = 0; floor < h.floors; floor++) {
    const y = floor * tile;
    // Stone ground floor, timber upper floor.
    const [plain, window, door] = floor === 0 ? [M.wall, M.wallWindow, M.wallDoor] : [M.woodWall, M.woodWindow, M.woodWindowSmall];
    for (let j = 0; j < h.len; j++) {
      const lz = (j - (h.len - 1) / 2) * tile;
      const mid = j === Math.floor(h.len / 2);
      houseSet.add(floor === 0 && mid ? door : (j + hi) % 2 ? window : plain, place(0, lz, 0, y));
      houseSet.add((j + hi + floor) % 2 ? plain : window, place(0, lz, Math.PI, y));
      if (j === 0) houseSet.add(h.len === 1 ? window : plain, place(0, lz, Math.PI / 2, y));
      if (j === h.len - 1) houseSet.add(window, place(0, lz, -Math.PI / 2, y));
    }
  }
  const top = h.floors * tile;
  if (h.roof === "gable") {
    for (let j = 0; j < h.len; j++) houseSet.add(M.roofGable, place(0, (j - (h.len - 1) / 2) * tile, Math.PI / 2, top));
    houseSet.add(M.chimney, place(0, (-(h.len - 1) / 2) * tile, Math.PI, top * 0.75));
  } else {
    houseSet.add(h.roof === "point" ? M.roofPoint : M.roofHighPoint, place(0, 0, 0, top));
  }
  if (hi % 3 === 0) houseSet.add(hi % 2 ? M.bannerGreen : M.bannerRed, place(0.52 * tile, 0, 0, top * 0.35));
  houseBlocks.push({ x: h.x, z: h.z, w: tile, d: h.len * tile, h: top + tile * 0.6, rot: h.rot });
}

const ROAD: Placement[] = [];
for (let z = -48.5; z > SQUARE.z + SQUARE.half; z -= T) ROAD.push([0, z]);
for (let ix = -2.5; ix <= 2.5; ix++) for (let iz = -2.5; iz <= 2.5; iz++) ROAD.push([SQUARE.x + ix * T, SQUARE.z + iz * T]);

/** Hedge along the town's south edge, open where the road comes in. */
const HEDGE: Placement[] = [];
for (let x = -36; x <= 36; x += T) if (Math.abs(x) > 3) HEDGE.push([x, TOWN.z1 + 0.5, Math.PI / 2]);

const LANTERNS: Placement[] = [
  [-10, SQUARE.z - 10],
  [10, SQUARE.z - 10],
  [-10, SQUARE.z + 10],
  [10, SQUARE.z + 10],
  [-2.2, -50],
  [2.2, -50],
];
/** Lantern heads, lit at night. */
export const TOWN_LAMPS: Lamp[] = LANTERNS.map(([x, z]) => ({ x, y: 4.1, z, color: "#ffc070", glow: 1.4 }));

/** At full town scale the seats are 0.7 m high; this brings them to ~0.45 m, like the stumps. */
const SEAT_SCALE = 0.65;
/** Benches run along their local z and face the road (local +x). */
const BENCHES: Placement[] = [
  [-2.5, SQUARE.z - 7.5, 0, SEAT_SCALE],
  [2.5, SQUARE.z + 7.5, Math.PI, SEAT_SCALE],
];
const STOOLS: Placement[] = [
  [-7.8, SQUARE.z - 3.5, 0, SEAT_SCALE],
  [7.6, SQUARE.z + 3.2, 0, SEAT_SCALE],
  [-7.4, SQUARE.z + 3.8, 0, SEAT_SCALE],
];
export const TOWN_SEATS: Seat[] = [
  ...seatsOn(BENCHES, T, [-0.25, 0.25].map((z) => ({ x: 0, z, y: 0.23, face: Math.PI / 2 }))),
  ...seatsOn(STOOLS, T, [{ x: 0, z: 0, y: 0.23 }]),
];

const STALLS = [
  { m: M.stallRed, at: [[-5.5, SQUARE.z - 6, Math.PI / 4]] as Placement[] },
  { m: M.stallGreen, at: [[5.5, SQUARE.z - 6, -Math.PI / 4]] as Placement[] },
  { m: M.stallGreen, at: [[-5.5, SQUARE.z + 6, (3 * Math.PI) / 4]] as Placement[] },
  { m: M.stallRed, at: [[5.5, SQUARE.z + 6, (-3 * Math.PI) / 4]] as Placement[] },
];

const TREES: Placement[] = [];
const TALL_TREES: Placement[] = [];
const CROOKED: Placement[] = [];
{
  const rand = mulberry32(11);
  const clearOf = (x: number, z: number) =>
    Math.max(Math.abs(x - SQUARE.x), Math.abs(z - SQUARE.z)) > SQUARE.half + 3 &&
    Math.abs(x) > 4 &&
    HOUSES.every((h) => Math.hypot(x - h.x, z - h.z) > T * (h.scale ?? 1) * (h.len / 2 + 1.2));
  const all: [number, number][] = [];
  for (let tries = 0; tries < 2000 && all.length < 28; tries++) {
    const x = TOWN.x0 + 2 + rand() * (TOWN.x1 - TOWN.x0 - 4);
    const z = TOWN.z0 + 1 + rand() * (TOWN.z1 - TOWN.z0 - 3);
    if (!inRect(TOWN, x, z) || !clearOf(x, z) || all.some(([ax, az]) => Math.hypot(ax - x, az - z) < 4)) continue;
    all.push([x, z]);
    const r = rand();
    (r < 0.4 ? TREES : r < 0.8 ? TALL_TREES : CROOKED).push([x, z, rand() * Math.PI * 2, 0.8 + rand() * 0.3]);
  }
}

export function Town() {
  const fountainR = T * 0.95;
  return (
    <>
      <Props m={M.road} at={ROAD} />
      <Props m={M.fountain} at={[[SQUARE.x, SQUARE.z]]} />
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[0.7, fountainR]} position={[SQUARE.x, 0.7, SQUARE.z]} />
      </RigidBody>
      {STALLS.map((s, i) => (
        <Props key={i} m={s.m} at={s.at} collider={{ box: 0.85 }} />
      ))}
      <Props m={M.stallBench} at={BENCHES} collider={{ box: 0.9 }} />
      <Props m={M.stool} at={STOOLS} />
      <Props m={M.cart} at={[[11.5, SQUARE.z - 8, 0.6]]} collider={{ box: 0.85 }} />
      <Props m={M.lantern} at={LANTERNS} collider={{ trunk: 0.05 }} />
      <Props m={M.hedge} at={HEDGE} collider={{ box: 1 }} />
      <Props m={M.rock} at={[[-35, -76, 0.5, 1.2], [36, -48, 2.1], [-12, -77, 1.3, 0.9]]} collider={{ box: 0.85 }} />

      <PropSetView set={houseSet} />
      <Blocks blocks={houseBlocks} />
      <Windmill />

      <Props m={M.tree} at={TREES} collider={{ trunk: 0.08 }} />
      <Props m={M.treeHigh} at={TALL_TREES} collider={{ trunk: 0.08 }} />
      <Props m={M.treeCrooked} at={CROOKED} collider={{ trunk: 0.08 }} />
    </>
  );
}

/** Sails turning on the windmill house's +x wall. */
function Windmill() {
  const model = useKitModel(M.windmill);
  const sails = useRef<Group>(null);
  useFrame((_, dt) => {
    if (sails.current) sails.current.rotation.x += dt * 0.6;
  });
  const sc = MILL.scale ?? 1;
  const [ox, oz] = rotateXZ(T * sc * 0.5 + 0.35, 0, MILL.rot);
  return (
    <group position={[MILL.x + ox, MILL.floors * T * sc * 0.72, MILL.z + oz]} rotation-y={MILL.rot}>
      <group ref={sails}>
        <primitive object={model} scale={T * 0.6} />
      </group>
    </group>
  );
}
