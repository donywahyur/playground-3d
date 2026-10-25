import { mulberry32, rotateXZ } from "../../math";
import type { Lamp } from "../Lamps";
import { GRAVEYARD } from "../layout";
import { kitModel, kitScale, Props, PropSet, PropSetView, type ModelRef, type Placement } from "../props";
import { seatsOn, type Seat } from "../seats";

// South: an old graveyard (Kenney "Graveyard Kit"). Iron fence with a gateway
// facing the camp, a stone path to the big crypt, rows of graves, lamps and
// pines.

const g = (name: string) => kitModel("graveyard", name);
const M = {
  fence: g("iron-fence"),
  fenceDamaged: g("iron-fence-damaged"),
  gate: g("iron-fence-border-gate"),
  pillar: g("pillar-small"),
  road: g("road"),
  crypt: g("crypt-large"),
  cryptRoof: g("crypt-large-roof"),
  cryptSmall: g("crypt-small"),
  cryptSmallRoof: g("crypt-small-roof"),
  grave: g("grave"),
  graveBorder: g("grave-border"),
  lightSingle: g("lightpost-single"),
  lightAll: g("lightpost-all"),
  pine: g("pine"),
  pineCrooked: g("pine-crooked"),
  pineFall: g("pine-fall"),
  bench: g("bench"),
  benchDamaged: g("bench-damaged"),
  pumpkin: g("pumpkin"),
  pumpkinCarved: g("pumpkin-carved"),
  pumpkinTall: g("pumpkin-tall-carved"),
  candles: g("candle-multiple"),
  fireBasket: g("fire-basket"),
  altar: g("altar-stone"),
  trunk: g("trunk"),
  shovelDirt: g("shovel-dirt"),
  debris: g("debris"),
  hay: g("hay-bale"),
  rocks: g("rocks-tall"),
};
const STONES = [
  g("gravestone-round"),
  g("gravestone-cross"),
  g("gravestone-bevel"),
  g("gravestone-decorative"),
  g("gravestone-roof"),
  g("gravestone-wide"),
  g("gravestone-broken"),
  g("gravestone-cross-large"),
  g("cross-wood"),
];

/** Graveyard units to meters (built at the characters' scale). */
const S = kitScale("graveyard");
/** Fence rectangle; the gateway is in the middle of the north side. */
const YARD = { x0: -22, x1: 22, z0: 49, z1: 76 };
const CRYPT_Z = 71;

const fences = new PropSet();
{
  const rand = mulberry32(3);
  const seg = 1 * S;
  const piece = (): ModelRef => (rand() < 0.15 ? M.fenceDamaged : M.fence);
  for (let x = YARD.x0 + seg / 2; x < YARD.x1; x += seg) {
    if (Math.abs(x) > seg) fences.add(piece(), [x, YARD.z0]);
    fences.add(piece(), [x, YARD.z1]);
  }
  for (let z = YARD.z0 + seg / 2; z < YARD.z1; z += seg) {
    fences.add(piece(), [YARD.x0, z, Math.PI / 2]);
    fences.add(piece(), [YARD.x1, z, Math.PI / 2]);
  }
}

const stones = new PropSet();
const graves = new PropSet();
{
  const rand = mulberry32(13);
  for (let z = 54; z <= 66; z += 4) {
    for (let x = -19.5; x <= 19.5; x += 3) {
      if (Math.abs(x) < 4 || rand() < 0.15) continue;
      const jx = x + (rand() - 0.5) * 0.6;
      stones.add(STONES[Math.floor(rand() * STONES.length)], [jx, z, Math.PI + (rand() - 0.5) * 0.4]);
      if (rand() < 0.7) graves.add(rand() < 0.5 ? M.grave : M.graveBorder, [jx, z + 1.6, 0, 0.9]);
    }
  }
}

const PATH: Placement[] = [];
for (let z = YARD.z0 - 0.4; z < CRYPT_Z - 3; z += 0.8 * S) PATH.push([0, z, Math.floor(z) % 4]);

const PINES: Placement[][] = [[], [], []];
{
  const rand = mulberry32(17);
  const taken: [number, number][] = [];
  for (let tries = 0; tries < 1500 && taken.length < 34; tries++) {
    const x = GRAVEYARD.x0 + rand() * (GRAVEYARD.x1 - GRAVEYARD.x0);
    const z = GRAVEYARD.z0 + rand() * (GRAVEYARD.z1 - GRAVEYARD.z0 + 2);
    // Outside the fence, clear of the gateway approach.
    const inYard = x > YARD.x0 - 1.5 && x < YARD.x1 + 1.5 && z > YARD.z0 - 1.5 && z < YARD.z1 + 1.5;
    if (inYard || (Math.abs(x) < 5 && z < YARD.z0) || taken.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 3)) continue;
    taken.push([x, z]);
    PINES[Math.floor(rand() * 3)].push([x, z, rand() * Math.PI * 2, 0.9 + rand() * 0.4]);
  }
  // A few inside the corners.
  PINES[1].push([-19, 73, 0.4], [19.5, 51.5, 2.2]);
  PINES[0].push([19, 73.5, 1.1], [-19.5, 51, 0.8]);
}

const FIRE_BASKETS: Placement[] = [
  [-1.6, YARD.z0 - 0.8, 0, 1.2],
  [1.6, YARD.z0 - 0.8, 0, 1.2],
];
const CANDLES: Placement[] = [
  [-0.5, CRYPT_Z - 4.6, 0, 1, 0.49 * S],
  [0.6, CRYPT_Z - 4.7, 1, 0.8, 0.49 * S],
];
/** Single lamps hang from an arm along local +z. */
const LIGHTPOSTS: Placement[] = [
  [-1.8, 53, -Math.PI / 2],
  [1.8, 59, Math.PI / 2],
  [-1.8, 65, -Math.PI / 2],
];
const LIGHTPOSTS_ALL: Placement[] = [
  [-6, CRYPT_Z - 3.5],
  [6, CRYPT_Z - 3.5],
];

/** Lamp heads, fires and candles, lit at night. */
export const GRAVEYARD_LAMPS: Lamp[] = [
  ...LIGHTPOSTS.map(([x, z, rot = 0]): Lamp => {
    const [dx, dz] = rotateXZ(0, 0.28 * S, rot);
    return { x: x + dx, y: 1.15 * S, z: z + dz, color: "#ffd27a", glow: 0.9 };
  }),
  ...LIGHTPOSTS_ALL.map(([x, z]): Lamp => ({ x, y: 1.05 * S, z, color: "#ffd27a", glow: 1.8 })),
  ...FIRE_BASKETS.map(([x, z]): Lamp => ({ x, y: 0.6, z, color: "#ff8a3d", glow: 1.5 })),
  { x: 0, y: 0.49 * S + 0.3, z: CRYPT_Z - 4.65, color: "#ffb35c", glow: 0.8 },
];

/** Benches face local +z (the backrest is at -z). */
const BENCHES: Placement[] = [
  [-2.6, 56, Math.PI / 2],
  [2.6, 62, -Math.PI / 2],
];
const BENCHES_DAMAGED: Placement[] = [[2.6, 68, -Math.PI / 2]];
const BENCH_SPOTS = [-0.2, 0.2].map((x) => ({ x, z: 0.03, y: 0.2, face: 0 }));
export const GRAVEYARD_SEATS: Seat[] = seatsOn([...BENCHES, ...BENCHES_DAMAGED], S, BENCH_SPOTS);

export function Graveyard() {
  const dark = { x: (YARD.x0 + YARD.x1) / 2, z: (YARD.z0 + YARD.z1) / 2, w: YARD.x1 - YARD.x0 + 6, d: YARD.z1 - YARD.z0 + 6 };
  return (
    <>
      {/* Darker, unkempt grass inside the yard */}
      <mesh rotation-x={-Math.PI / 2} position={[dark.x, 0.008, dark.z]} receiveShadow>
        <planeGeometry args={[dark.w, dark.d]} />
        <meshStandardMaterial color="#4f7f62" />
      </mesh>

      <PropSetView set={fences} colliders={() => ({ box: 1 })} />
      {/* Double size so its pillars meet the fence ends */}
      <Props m={M.gate} at={[[0, YARD.z0, 0, 2]]} />
      <Props
        m={M.pillar}
        at={[
          [YARD.x0, YARD.z0],
          [YARD.x1, YARD.z0],
          [YARD.x0, YARD.z1],
          [YARD.x1, YARD.z1],
        ]}
        collider={{ box: 1 }}
      />
      <Props m={M.fireBasket} at={FIRE_BASKETS} />
      <Props m={M.road} at={PATH} />

      {/* Crypts at the back */}
      <Props m={M.crypt} at={[[0, CRYPT_Z, Math.PI]]} collider={{ box: 0.95 }} />
      <Props m={M.cryptRoof} at={[[0, CRYPT_Z, Math.PI, 1, 1 * S]]} />
      <Props m={M.cryptSmall} at={[[-14, CRYPT_Z, Math.PI], [14, CRYPT_Z, Math.PI]]} collider={{ box: 0.95 }} />
      <Props m={M.cryptSmallRoof} at={[[-14, CRYPT_Z, Math.PI, 1, 1 * S], [14, CRYPT_Z, Math.PI, 1, 1 * S]]} />
      <Props m={M.altar} at={[[0, CRYPT_Z - 4.6, Math.PI]]} collider={{ box: 0.9 }} />
      <Props m={M.candles} at={CANDLES} />

      <PropSetView set={stones} colliders={() => ({ box: 0.9 })} />
      <PropSetView set={graves} />

      {/* Lamps along the path, benches, autumn bits */}
      <Props m={M.lightSingle} at={LIGHTPOSTS} collider={{ trunk: 0.05 }} />
      <Props m={M.lightAll} at={LIGHTPOSTS_ALL} collider={{ trunk: 0.05 }} />
      <Props m={M.bench} at={BENCHES} collider={{ box: 0.9 }} />
      <Props m={M.benchDamaged} at={BENCHES_DAMAGED} collider={{ box: 0.9 }} />
      <Props m={M.pumpkin} at={[[-3.4, CRYPT_Z - 2.6], [9, 52, 1], [-10.5, 63.5, 2]]} />
      <Props m={M.pumpkinCarved} at={[[3.3, CRYPT_Z - 2.8, 0.3], [-16, 57.6, 1.5]]} />
      <Props m={M.pumpkinTall} at={[[-2.6, CRYPT_Z - 3.2, 0.8], [17, 65.6, 2.5]]} />
      <Props m={M.shovelDirt} at={[[11, 60.5, 0.6]]} />
      <Props m={M.trunk} at={[[-24.5, 47.5, 0.4], [24, 77, 1.3]]} collider={{ box: 0.9 }} />
      <Props m={M.hay} at={[[23.5, 47.5, 0.3], [24.6, 48.4, 1.1]]} collider={{ box: 0.9 }} />
      <Props m={M.debris} at={[[-8, 70], [12.5, 54], [-17, 66]]} />
      <Props m={M.rocks} at={[[-25, 62, 0.8, 1.3], [25, 58, 2.4, 1.1]]} collider={{ box: 0.85 }} />

      <Props m={M.pine} at={PINES[0]} collider={{ trunk: 0.09 }} />
      <Props m={M.pineCrooked} at={PINES[1]} collider={{ trunk: 0.09 }} />
      <Props m={M.pineFall} at={PINES[2]} collider={{ trunk: 0.09 }} />
    </>
  );
}
