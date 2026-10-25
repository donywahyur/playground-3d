import { FOREST, ROCK_LOOK } from "./ForestCamp";
import { mulberry32 } from "../../math";
import { BELT, EDGE, HALF, inBeltGap, inZone, onPath, WEST_CLEARING } from "../layout";
import { kitScale, Props, type Placement } from "../props";
import { seatsOn, STUMP_SEAT, type Seat } from "../seats";

// Everything between the zones: the tree belt around the camp, forest in the
// corners and along the edges (partly beyond the invisible walls), and the
// west wilds with cliffs and a hidden camp clearing.

const S = kitScale("mini-forest");

const TREES: Placement[] = [];
const TALL_TREES: Placement[] = [];
const PLANTS: Placement[] = [];
{
  const rand = mulberry32(21);
  const all: [number, number][] = [];
  const free = (x: number, z: number, gap: number) => all.every(([tx, tz]) => Math.hypot(tx - x, tz - z) > gap);
  const ring = (x: number, z: number) => Math.max(Math.abs(x), Math.abs(z));
  const inClearing = (x: number, z: number, pad = 0) => Math.hypot(x - WEST_CLEARING.x, z - WEST_CLEARING.z) < WEST_CLEARING.r + pad;

  for (let tries = 0; tries < 30000 && all.length < 520; tries++) {
    const x = (rand() * 2 - 1) * EDGE;
    const z = (rand() * 2 - 1) * EDGE;
    const r = ring(x, z);
    if (r < BELT.inner) continue;
    if (onPath(x, z, 1.5) || inZone(x, z, 2) || inClearing(x, z, 1.5)) continue;
    // Belt and the west wilds are dense; corners and edges lighter.
    const belt = r < BELT.outer;
    if (belt && inBeltGap(x, z)) continue;
    const west = x < -BELT.outer && Math.abs(z) < 40;
    const gap = belt || west ? 2.8 : r > HALF - 4 ? 3 : 5;
    if (!free(x, z, gap)) continue;
    all.push([x, z]);
    (rand() < 0.45 ? TALL_TREES : TREES).push([x, z, rand() * Math.PI * 2, 1 + rand() * 0.6]);
  }
  for (let i = 0; i < 160; i++) {
    const x = (rand() * 2 - 1) * HALF;
    const z = (rand() * 2 - 1) * HALF;
    if (ring(x, z) < BELT.inner || inZone(x, z, 1) || onPath(x, z)) continue;
    PLANTS.push([x, z, rand() * Math.PI * 2, rand() < 0.6 ? 1 : 1.5]);
  }
}

/** Every wilds tree (x, z), for the minimap. */
export const WILDS_TREES: readonly Placement[] = [...TREES, ...TALL_TREES];

const { x: cx, z: cz } = WEST_CLEARING;
const CLEARING_STUMPS: Placement[] = [
  [cx + 0.5, cz + 1.5, 0, 1.1],
  [cx + 4, cz + 0.5, 2, 0.8],
];
export const WILDS_SEATS: Seat[] = seatsOn(CLEARING_STUMPS, S, STUMP_SEAT);

export function Wilds() {
  return (
    <>
      <Props m={FOREST.tree} at={TREES} collider={{ trunk: 0.09 }} />
      <Props m={FOREST.treeHigh} at={TALL_TREES} collider={{ trunk: 0.09 }} />
      <Props m={FOREST.plant} at={PLANTS} />

      {/* West wilds: cliffs, and a hidden camp in a clearing at the end of the west path */}
      <Props
        m={FOREST.rocksHigh}
        {...ROCK_LOOK}
        at={[
          [-58, -26, 0.3, 2.4, 1.2 * S],
          [-63, -22, 1.4, 1.8, 0.9 * S],
          [-70, 16, 2.0, 2.6, 1.3 * S],
          [-64, 22, 0.8, 2, 1 * S],
          [-74, -8, 2.7, 2.2, 1.1 * S],
          [-52, 30, 1.1, 1.6, 0.8 * S],
        ]}
        collider={{ box: 0.85 }}
      />
      <Props m={FOREST.rocksLow} {...ROCK_LOOK} at={[[-56, 12, 0.4, 1.4], [-68, -30, 1.9, 1.2], [-76, 30, 0.2, 1.5]]} collider={{ box: 0.85 }} />
      <Props m={FOREST.patchDirt} at={[[cx, cz, 0.3, 5]]} squash={0.12} />
      <Props
        m={FOREST.tent}
        at={[
          [cx - 3.5, cz - 3, 0.6, 1.3],
          [cx + 1, cz - 4.5, -0.2, 1.3],
        ]}
        collider={{ box: 0.85 }}
      />
      <Props m={FOREST.stones} at={CLEARING_STUMPS} collider={{ box: 0.7 }} />
      <Props m={FOREST.flag} at={[[cx - 5.5, cz + 2, 0.4, 1.5]]} collider={{ trunk: 0.06 }} />
      <Props m={FOREST.target} at={[[cx + 6, cz - 3, -1.2]]} collider={{ box: 0.8 }} />
    </>
  );
}
