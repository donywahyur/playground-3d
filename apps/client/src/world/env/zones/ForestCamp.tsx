import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { mulberry32, rotateXZ } from "../../math";
import { fireLamp, type Lamp } from "../Lamps";
import { BELT, onPath } from "../layout";
import { seatsOn, STUMP_SEAT, type Seat } from "../seats";
import { Blocks, kitModel, kitScale, PlankRamp, Props, type Block, type Placement } from "../props";

// The original hangout spot: a plaza with a pavilion, stage to the north, tent
// camp to the east, archery range to the west, lookout tower north-east.
// Kenney "Mini Forest".

const f = (name: string) => kitModel("mini-forest", name);
const M = {
  tree: f("tree"),
  treeHigh: f("tree-high"),
  structure: f("building-structure"),
  roof: f("building-roof"),
  platform: f("building-platform"),
  rocksHigh: f("rocks-high"),
  rocksLow: f("rocks-low"),
  stones: f("stones"),
  tent: f("tent"),
  target: f("target"),
  fence: f("fence"),
  flag: f("flag"),
  plant: f("plant"),
  patchGrass: f("patch-grass"),
  patchDirt: f("patch-dirt"),
};
export const FOREST = M;
/** The mini-forest rocks: front faces only (their inner faces show through as near-black), a little lighter. */
export const ROCK_LOOK = { singleSided: true, tint: 1.3 };
/** Borrowed from the graveyard kit for the camp's night fires. */
const fireBasket = kitModel("graveyard", "fire-basket");

/** Mini-forest units to meters (same as the characters). */
const S = kitScale("mini-forest");

export const PLAZA_R = 9;
export const STAGE = { z: -26, w: 12, d: 6, h: 0.52 * S };
// Ramp from the ground up to the stage's front edge (z = STAGE.z + d/2).
export const RAMP = { len: 4.4, z: STAGE.z + STAGE.d / 2 + 2.1 };
/** Plank ramp up the front (1, plaza side) or back (-1, town path) of the stage. */
function StageRamp({ side }: { side: 1 | -1 }) {
  const z = STAGE.z + side * (RAMP.z - STAGE.z);
  return <PlankRamp from={[0, 0, z + (side * RAMP.len) / 2]} to={[0, STAGE.h, z - (side * RAMP.len) / 2]} width={2.4} />;
}

/**
 * Lookout tower: the platform's floor is 0.1 units thick, railed on its local
 * ±z sides and open on ±x; a plank ramp runs up to the open -x side.
 */
const TOWER = { x: 22, z: -21, rot: 0.3 };
const TOWER_FLOOR = 1.1 * S;
const RAMP_RUN = 5;
const towerAt = (lx: number, lz: number, y: number): [number, number, number] => {
  const [dx, dz] = rotateXZ(lx, lz, TOWER.rot);
  return [TOWER.x + dx, y, TOWER.z + dz];
};
const TOWER_BLOCKS: Block[] = [
  { x: TOWER.x, z: TOWER.z, w: 1.2 * S, d: 1.2 * S, y: S, h: TOWER_FLOOR - S, rot: TOWER.rot },
  ...[-1, 1].map((side): Block => {
    const [x, , z] = towerAt(0, side * 0.45 * S, 0);
    return { x, z, w: 1 * S, d: 0.075 * S, y: TOWER_FLOOR, h: 0.4 * S, rot: TOWER.rot };
  }),
];

/** Places features occupy; scattered trees and decor stay out of these circles. */
const CLEARINGS: [x: number, z: number, r: number][] = [
  [0, 0, PLAZA_R + 2],
  [0, STAGE.z + 1, 10],
  [24, 7, 8],
  [-22, 10, 8],
  [22, -21, 5],
];
const clear = (x: number, z: number, pad = 0) => !onPath(x, z, pad + 1) && CLEARINGS.every(([cx, cz, r]) => Math.hypot(x - cx, z - cz) > r + pad);

const TREES: Placement[] = [];
const TALL_TREES: Placement[] = [];
const PLANTS: Placement[] = [];
const GRASS_PATCHES: Placement[] = [];
{
  const rand = mulberry32(7);
  for (const [gx, gz, n] of [
    [-14, -12, 3],
    [13, 15, 4],
    [-12, 20, 3],
    [10, -12, 2],
    [-26, -16, 3],
    [27, 22, 3],
  ] as const) {
    for (let i = 0, tries = 0; i < n && tries < 50; tries++) {
      const x = gx + (rand() * 2 - 1) * 4;
      const z = gz + (rand() * 2 - 1) * 4;
      if (!clear(x, z, 1.5) || [...TREES, ...TALL_TREES].some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 2.5)) continue;
      (rand() < 0.4 ? TALL_TREES : TREES).push([x, z, rand() * Math.PI * 2, 1 + rand() * 0.4]);
      i++;
    }
  }
  const lim = BELT.inner - 2;
  for (let i = 0; i < 70; i++) {
    const x = (rand() * 2 - 1) * lim;
    const z = (rand() * 2 - 1) * lim;
    if (!clear(x, z)) continue;
    (rand() < 0.6 ? PLANTS : GRASS_PATCHES).push([x, z, rand() * Math.PI * 2, rand() < 0.6 ? 1 : 1.5]);
  }
}

/** Fire baskets: one in the tent camp, two at the foot of the stage ramp. */
const FIRES: Placement[] = [
  [23.6, 8.2, 0, 1.4],
  [-2.6, RAMP.z + RAMP.len / 2 + 0.6, 0, 1.2],
  [2.6, RAMP.z + RAMP.len / 2 + 0.6, 0, 1.2],
];
/** Fires plus a light hanging under the pavilion roof, lit at night. */
export const CAMP_LAMPS: Lamp[] = [
  ...FIRES.map(([x, z, , scale]) => fireLamp(x, z, scale)),
  { x: 0, y: 2.6, z: 0, color: "#ffc070", glow: 0 },
];

/** Stump seats around the pavilion, and one by the tent camp fire. */
const PLAZA_STUMPS: Placement[] = [0, 1, 2, 3].map((i) => {
  const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
  return [Math.cos(a) * 5.5, Math.sin(a) * 5.5, -a];
});
const TENT_STUMPS: Placement[] = [[25, 6, 0.8, 0.8]];
export const CAMP_SEATS: Seat[] = seatsOn([...PLAZA_STUMPS, ...TENT_STUMPS], S, STUMP_SEAT);

/** Fence ring around the plaza with gaps at the four paths. */
const PLAZA_FENCE: Placement[] = [];
{
  const n = 28;
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    // Skip the segments in front of N/E/S/W.
    if (Math.abs(Math.sin(2 * a)) < 0.3) continue;
    PLAZA_FENCE.push([Math.cos(a) * PLAZA_R, Math.sin(a) * PLAZA_R, -a + Math.PI / 2]);
  }
}

const STAGE_ROCKS: Placement[] = [];
for (let ix = 0; ix < STAGE.w / S; ix++)
  for (let iz = 0; iz < STAGE.d / S; iz++)
    STAGE_ROCKS.push([-STAGE.w / 2 + S / 2 + ix * S, STAGE.z - STAGE.d / 2 + S / 2 + iz * S, ((ix + iz) % 4) * (Math.PI / 2)]);

/** Four corner posts of building-structure (0.15 units thick, outer face at ±0.5). */
function posts(x: number, z: number, rot: number, scale: number): Block[] {
  const k = S * scale;
  return [-1, 1].flatMap((sx) =>
    [-1, 1].map((sz) => {
      const [ox, oz] = rotateXZ(sx * 0.425 * k, sz * 0.425 * k, rot);
      return { x: x + ox, z: z + oz, w: 0.15 * k, d: 0.15 * k, h: k, rot };
    }),
  );
}

export function ForestCamp() {
  return (
    <>
      {/* Plaza: pavilion in the middle, stump seats around it */}
      <Props m={M.structure} at={[[0, 0, 0, 1.5]]} />
      <Props m={M.roof} at={[[0, 0, 0, 1.5, 1 * S * 1.5]]} />
      <Props m={M.stones} at={PLAZA_STUMPS} collider={{ box: 0.7 }} />
      <Props m={M.fence} at={PLAZA_FENCE} collider={{ box: 0.9 }} />

      {/* Stage: a rock outcrop with a plank ramp, flags at the back corners */}
      <Props m={M.rocksLow} at={STAGE_ROCKS} {...ROCK_LOOK} />
      <Props
        m={M.flag}
        at={[
          [-STAGE.w / 2 + 0.6, STAGE.z - STAGE.d / 2 + 0.6, 0, 1.4, STAGE.h],
          [STAGE.w / 2 - 0.6, STAGE.z - STAGE.d / 2 + 0.6, 0, 1.4, STAGE.h],
        ]}
        collider={{ trunk: 0.06 }}
      />
      {/* Stage collider (the rock tiles are visual only) */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[STAGE.w / 2, STAGE.h / 2, STAGE.d / 2]} position={[0, STAGE.h / 2, STAGE.z]} />
      </RigidBody>
      <StageRamp side={1} />
      <StageRamp side={-1} />

      <Props m={fireBasket} at={FIRES} />

      {/* Tent camp */}
      <Props
        m={M.tent}
        at={[
          [22, 3.2, -Math.PI / 2 - 0.3, 1.4],
          [27, 8, Math.PI, 1.4],
          [21, 12, -Math.PI / 2 + 0.4, 1.4],
        ]}
        collider={{ box: 0.85 }}
      />
      <Props m={M.patchDirt} at={[[24, 7, 0, 3], [21, 9, 1, 2]]} squash={0.15} />
      <Props m={M.stones} at={TENT_STUMPS} collider={{ box: 0.7 }} />

      {/* Archery range: targets facing the plaza, fence behind */}
      <Props m={M.patchGrass} at={[[-24, 10, 0, 3.5]]} squash={0.15} />
      <Props
        m={M.target}
        at={[
          [-26, 6, Math.PI / 2],
          [-26, 10, Math.PI / 2],
          [-26, 14, Math.PI / 2],
        ]}
        collider={{ box: 0.8 }}
      />
      <Props m={M.fence} at={[0, 1, 2, 3, 4, 5].map((i): Placement => [-28.5, 4.5 + i * 2.2, Math.PI / 2])} collider={{ box: 0.9 }} />

      {/* Lookout tower */}
      <Props m={M.structure} at={[[TOWER.x, TOWER.z, TOWER.rot]]} />
      <Props m={M.platform} at={[[TOWER.x, TOWER.z, TOWER.rot, 1, 1 * S]]} />
      <Props m={M.flag} at={[[TOWER.x - 0.9, TOWER.z - 0.7, TOWER.rot, 1, 1 * S + 0.5 * S]]} />
      <PlankRamp from={towerAt(-0.55 * S - RAMP_RUN, 0, 0)} to={towerAt(-0.55 * S, 0, TOWER_FLOOR)} width={1.2} segments={3} />
      <Blocks blocks={[...posts(0, 0, 0, 1.5), ...posts(TOWER.x, TOWER.z, TOWER.rot, 1), ...TOWER_BLOCKS]} />

      {/* Rocks */}
      <Props
        m={M.rocksHigh}
        {...ROCK_LOOK}
        at={[
          [-31, -30, 0.4, 2, 1 * S],
          [-27, -33, 1.8, 1.6, 0.8 * S],
          [31, 29, 2.2, 2, 1 * S],
          [-33, 22, 1.2, 1.7, 0.85 * S],
          [33, -12, 3.1, 1.6, 0.8 * S],
        ]}
        collider={{ box: 0.85 }}
      />
      <Props
        m={M.rocksLow}
        {...ROCK_LOOK}
        at={[
          [-12, 30, 0.7, 1.2],
          [14, -30, 2.1, 1],
          [30, 14, 1.2, 1.3],
          [-30, -10, 2.6, 1.1],
        ]}
        collider={{ box: 0.85 }}
      />

      <Props m={M.tree} at={TREES} collider={{ trunk: 0.09 }} />
      <Props m={M.treeHigh} at={TALL_TREES} collider={{ trunk: 0.09 }} />
      <Props m={M.plant} at={PLANTS} />
      <Props m={M.patchGrass} at={GRASS_PATCHES} squash={0.5} />
    </>
  );
}
