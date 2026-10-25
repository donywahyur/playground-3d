import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { mulberry32, rotateXZ } from "../../math";
import { fireLamp, type Lamp } from "../Lamps";
import { BEACH_X, HALF, onPath, SEA_FLOOR, SHORE_X } from "../layout";
import { Blocks, kitModel, kitScale, PlankRamp, Props, type Block, type Placement } from "../props";
import { seatsOn, type Seat } from "../seats";

// East: a pirate beach (Kenney "Pirate Kit"). Sand slopes into shallow water
// you can wade in; a dock runs out to a moored ship, with a fort tower, a
// beach hut, cannons and palms along the shore, and a fire ringed by crates
// to sit on.

const p = (name: string) => kitModel("pirate", name);
const M = {
  platform: p("platform"),
  pier: p("structure-platform"),
  ship: p("ship-pirate-large"),
  boat: p("boat-row-large"),
  boatSmall: p("boat-row-small"),
  tower: p("tower-complete-large"),
  hut: p("structure"),
  hutRoof: p("structure-roof"),
  palmStraight: p("palm-straight"),
  palmBend: p("palm-bend"),
  palmDetailed: p("palm-detailed-straight"),
  palmDetailedBend: p("palm-detailed-bend"),
  barrel: p("barrel"),
  crate: p("crate"),
  crateBottles: p("crate-bottles"),
  chest: p("chest"),
  cannon: p("cannon"),
  cannonBalls: p("cannon-ball"),
  flag: p("flag-pirate-high"),
  flagPennant: p("flag-pirate-pennant"),
  rocksA: p("rocks-sand-a"),
  rocksB: p("rocks-sand-b"),
  rocksC: p("rocks-sand-c"),
  hole: p("hole"),
  shovel: p("tool-shovel"),
  grass: p("grass-plant"),
  grassSmall: p("grass"),
  bottle: p("bottle-large"),
  fireBasket: kitModel("graveyard", "fire-basket"),
};

const K = kitScale("pirate");
/** Dock tile size (platform is 2.5 units square, 0.23 thick). */
const TILE = 2.5 * K;
const DOCK = { z: 0, x0: 60.5, tiles: 8 };
const DOCK_TOP = 0.23 * K;
const dockX = (i: number) => DOCK.x0 + TILE / 2 + i * TILE;

/** Sea floor height at x (flat land, then the beach slope). */
function groundY(x: number) {
  if (x <= SHORE_X) return 0;
  if (x >= SEA_FLOOR.x) return SEA_FLOOR.y;
  return ((x - SHORE_X) / (SEA_FLOOR.x - SHORE_X)) * SEA_FLOOR.y;
}

// Land tiles lie flat on the sand; over the water they are pier sections on
// legs (0.93 units tall) sunk so every tile's top is level.
const DOCK_LAND: Placement[] = [];
const DOCK_PIER: Placement[] = [];
const dockBlocks: Block[] = [];
for (let i = 0; i < DOCK.tiles; i++) {
  const x = dockX(i);
  if (x + TILE / 2 <= SHORE_X) DOCK_LAND.push([x, DOCK.z]);
  else DOCK_PIER.push([x, DOCK.z, 0, 1, DOCK_TOP - 0.93 * K]);
  const floor = groundY(x + TILE / 2);
  dockBlocks.push({ x, z: DOCK.z, w: TILE, d: TILE, y: floor - 0.5, h: DOCK_TOP - floor + 0.5 });
}
const DOCK_END = dockX(DOCK.tiles - 1) + TILE / 2;

const SHIP = { x: 72, z: -7.6, y: SEA_FLOOR.y + 0.3 };

/**
 * Ship colliders as boxes in model units (the hull runs along model z, bow at
 * +z; the dock is on the model's -x side): [x0, x1, z0, z1, top, bottom = 0].
 * Main deck at 2.1 with an entry port in each side, forecastle at 2.8 and
 * stern deck at 3.5, both up side stairs (SHIP_STAIRS). Rails stand 0.9 above
 * their deck so you can't stumble overboard.
 */
const DECK = 2.1;
const FORE = 2.8;
const STERN = 3.5;
const RAIL = 0.9;
/** Rail inner/outer x, and the entry port z range (wider than drawn so the capsule fits). */
const RIN = 1.78;
const ROUT = 2.27;
const PORT = { z0: -2.25, z1: -1.35 };
const SHIP_BOXES: [number, number, number, number, number, number?][] = [
  // Hull and main deck; the open hatch is walled off
  [-ROUT, ROUT, -6.3, 1.6, DECK],
  [-0.75, 0.7, -2.65, -1.2, DECK + RAIL, DECK],
  // Main mast
  [-0.4, 0.35, -0.8, -0.05, 9, DECK],
  // Main deck rails, broken by the ports
  ...[-1, 1].flatMap((side) => {
    const [x0, x1] = side < 0 ? [-ROUT, -RIN] : [RIN, ROUT];
    return [
      [x0, x1, -3.2, PORT.z0, DECK + RAIL, DECK],
      [x0, x1, PORT.z1, 1.6, DECK + RAIL, DECK],
    ] as [number, number, number, number, number, number][];
  }),
  // Forecastle: the low wall between its stairs, deck tapering to the bow, rails
  [-0.75, 0.75, 1.55, 1.8, 3.3, DECK],
  [-ROUT, ROUT, 1.6, 2.7, FORE],
  [-1.75, 1.75, 2.7, 3.7, FORE],
  [-1.2, 1.2, 3.7, 4.9, FORE],
  [-0.6, 0.6, 4.9, 6.0, FORE],
  [-ROUT, -RIN, 1.6, 2.7, FORE + RAIL, FORE],
  [RIN, ROUT, 1.6, 2.7, FORE + RAIL, FORE],
  // Stern: the cabin front between its stairs, the raised deck, its mast and rails
  [-0.75, 0.75, -4.18, -3.45, STERN + 0.5, DECK],
  [-ROUT, ROUT, -6.3, -4.18, STERN, DECK],
  [-0.25, 0.2, -5.6, -5.05, 9, STERN],
  [-ROUT, -RIN, -6.3, -3.2, STERN + RAIL, DECK],
  [RIN, ROUT, -6.3, -3.2, STERN + RAIL, DECK],
  [-ROUT, ROUT, -6.55, -6.05, STERN + RAIL, STERN],
];
/**
 * The side stairs as smooth slopes from the main deck (their treads are too
 * short for autostep), starting a little early on the stern so they stay under
 * the controller's 50° limit: [x0, x1, z at deck, z at top, top].
 */
const SHIP_STAIRS: [number, number, number, number, number][] = [
  [-RIN, -0.75, 0.6, 1.6, FORE],
  [0.75, RIN, 0.6, 1.6, FORE],
  [-RIN, -0.75, -2.85, -4.18, STERN],
  [0.75, RIN, -2.85, -4.18, STERN],
];

function ShipStairs() {
  return (
    <RigidBody type="fixed" colliders={false}>
      {SHIP_STAIRS.map(([x0, x1, za, zb, top], i) => {
        const run = (zb - za) * K;
        const rise = (top - DECK) * K;
        return (
          <CuboidCollider
            key={i}
            args={[Math.hypot(run, rise) / 2, 0.1, ((x1 - x0) * K) / 2]}
            position={[SHIP.x + ((za + zb) / 2) * K, SHIP.y + ((DECK + top) / 2) * K - 0.1, SHIP.z - ((x0 + x1) / 2) * K]}
            rotation={[0, 0, Math.atan(rise / run)]}
          />
        );
      })}
    </RigidBody>
  );
}

/** Model to world: turned a quarter so the bow points east. */
const shipBlock = ([x0, x1, z0, z1, top, bottom = 0]: (typeof SHIP_BOXES)[number]): Block => ({
  x: SHIP.x + ((z0 + z1) / 2) * K,
  z: SHIP.z - ((x0 + x1) / 2) * K,
  w: (z1 - z0) * K,
  d: (x1 - x0) * K,
  y: SHIP.y + bottom * K,
  h: (top - bottom) * K,
});
/** The forecastle rails where the bow narrows: [x0, z0, x1, z1] (mirrored to both sides). */
const BOW_RAIL = [1.85, 2.7, 0.35, 5.5];
const bowRails = [-1, 1].map((side): Block => {
  const [x0, z0, x1, z1] = BOW_RAIL;
  const dx = (x1 - x0) * side;
  const dz = z1 - z0;
  // Lengthwise along the rail; turned like a model-space box, since the quarter turn just swaps its sides.
  return { ...shipBlock([side * x0 + dx / 2, side * x0 + dx / 2, z0 + dz / 2, z0 + dz / 2, FORE + RAIL, FORE]), w: Math.hypot(dx, dz) * K, d: 0.3 * K, rot: Math.atan2(dx, dz) };
});
/** Gangplank from the dock's north edge up through the ship's south port onto the main deck. */
const PORT_X = SHIP.x + ((PORT.z0 + PORT.z1) / 2) * K;
const GANGPLANK = {
  from: [PORT_X, DOCK_TOP, DOCK.z - TILE / 2 + 0.4] as [number, number, number],
  to: [PORT_X, SHIP.y + DECK * K, SHIP.z + RIN * K - 0.2] as [number, number, number],
};
const TOWER = { x: 57, z: -29 };
const HUT = { x: 53, z: 24, rot: 0.3 };

/** A fire basket with crates around it, each turned to face the fire. */
const FIRE = { x: 54, z: 9, scale: 1.4 };
/** Crates at this scale are ~0.42 m high, a comfortable seat. */
const SEAT_CRATE_SCALE = 0.6;
const FIRE_CRATES: Placement[] = [0.3, 1.9, 3.5, 5].map((a) => [
  FIRE.x + Math.cos(a) * 1.9,
  FIRE.z + Math.sin(a) * 1.9,
  Math.atan2(-Math.cos(a), -Math.sin(a)),
  SEAT_CRATE_SCALE,
]);
export const BEACH_SEATS: Seat[] = seatsOn(FIRE_CRATES, K, [{ x: 0, z: 0, y: 0.77, face: 0 }]);
export const BEACH_LAMPS: Lamp[] = [fireLamp(FIRE.x, FIRE.z, FIRE.scale)];

const PALMS: Placement[][] = [[], [], [], []];
{
  const rand = mulberry32(5);
  const taken: [number, number, number][] = [
    [TOWER.x, TOWER.z, 6],
    [HUT.x, HUT.z, 4],
    [FIRE.x, FIRE.z, 4.5],
    [55, -12, 3],
    [62, 4, 4],
  ];
  for (let tries = 0, n = 0; tries < 600 && n < 22; tries++) {
    const x = BEACH_X + 2 + rand() * (SHORE_X - BEACH_X - 3);
    const z = (rand() * 2 - 1) * (HALF - 4);
    if (onPath(x, z, 2) || Math.abs(z - DOCK.z) < 4 || taken.some(([tx, tz, r]) => Math.hypot(tx - x, tz - z) < r)) continue;
    taken.push([x, z, 4.5]);
    PALMS[Math.floor(rand() * 4)].push([x, z, rand() * Math.PI * 2, 0.8 + rand() * 0.35]);
    n++;
  }
}

const GRASS: Placement[] = [];
{
  const rand = mulberry32(9);
  for (let i = 0; i < 40; i++) {
    const x = BEACH_X - 1 + rand() * 6;
    const z = (rand() * 2 - 1) * (HALF - 2);
    if (!onPath(x, z)) GRASS.push([x, z, rand() * Math.PI * 2, 0.6 + rand() * 0.6]);
  }
}

function hutPosts(): Block[] {
  // structure: 2.5 units square, posts in the corners.
  const c = 1.1 * K;
  return [-1, 1].flatMap((sx) =>
    [-1, 1].map((sz) => {
      const [ox, oz] = rotateXZ(sx * c, sz * c, HUT.rot);
      return { x: HUT.x + ox, z: HUT.z + oz, w: 0.3, d: 0.3, h: 2.2 * K, rot: HUT.rot };
    }),
  );
}

export function Beach() {
  return (
    <>
      {/* Dock and ship */}
      <Props m={M.platform} at={DOCK_LAND} />
      <Props m={M.pier} at={DOCK_PIER} />
      <Props m={M.flag} at={[[DOCK_END - 0.5, DOCK.z + TILE / 2 - 0.4, Math.PI / 2, 0.8, DOCK_TOP]]} collider={{ trunk: 0.06 }} />
      <Props m={M.ship} at={[[SHIP.x, SHIP.z, Math.PI / 2, 1, SHIP.y]]} />
      <ShipStairs />
      <PlankRamp from={GANGPLANK.from} to={GANGPLANK.to} width={0.8} segments={2} />
      <Props m={M.boatSmall} at={[[70, 9, 2.4, 1, -0.75]]} />
      <Blocks blocks={[...dockBlocks, ...SHIP_BOXES.map(shipBlock), ...bowRails]} />

      {/* Fort tower and beach hut */}
      <Props m={M.tower} at={[[TOWER.x, TOWER.z, 0.4]]} collider={{ box: 0.85 }} />
      <Props m={M.flagPennant} at={[[TOWER.x + 2.2, TOWER.z + 2.4, 0.4]]} collider={{ trunk: 0.06 }} />
      <Props m={M.hut} at={[[HUT.x, HUT.z, HUT.rot]]} />
      <Props m={M.hutRoof} at={[[HUT.x, HUT.z, HUT.rot, 1, 2.2 * K]]} />
      <Blocks blocks={hutPosts()} />

      {/* Cargo by the dock, cannons on the shore */}
      <Props m={M.barrel} at={[[59.5, 2.6, 0.3, 0.8], [60.6, 3.6, 1.2, 0.8], [59.8, -2.8, 2, 0.8], [HUT.x + 1, HUT.z - 3.2, 0, 0.7]]} collider={{ box: 0.85 }} />
      <Props m={M.crate} at={[[61.6, 2.8, 0.2], [58.2, -3.4, 1.4]]} collider={{ box: 0.9 }} />
      <Props m={M.crateBottles} at={[[61.4, 2.8, 0.2, 1, 0.77 * K], [HUT.x - 1.5, HUT.z - 3, 2.2]]} collider={{ box: 0.9 }} />
      <Props m={M.crate} at={FIRE_CRATES} collider={{ box: 0.9 }} />
      <Props m={M.fireBasket} at={[[FIRE.x, FIRE.z, 0, FIRE.scale]]} />
      <Props m={M.chest} at={[[55, -12, 0.6]]} collider={{ box: 0.85 }} />
      <Props m={M.hole} at={[[52.5, -14.5, 0]]} squash={0.6} />
      <Props m={M.shovel} at={[[54.4, -14.8, 0.8]]} />
      <Props m={M.bottle} at={[[56.4, -11, 0.4, 0.8]]} />
      <Props
        m={M.cannon}
        at={[
          [63.5, -16, Math.PI / 2],
          [63.5, -20, Math.PI / 2],
          [63, 16, Math.PI / 2],
        ]}
        collider={{ box: 0.85 }}
      />
      <Props m={M.cannonBalls} at={[[62, -18, 0, 0.7, 0.3], [61.4, 17.4, 0, 0.7, 0.3]]} />
      <Props m={M.boat} at={[[58, 12, 0.9]]} collider={{ box: 0.85 }} />

      {/* Rocks on the shore and in the shallows */}
      <Props
        m={M.rocksA}
        at={[
          [64, -34, 0.4],
          [74, 26, 2.1, 1, SEA_FLOOR.y],
        ]}
        collider={{ box: 0.8 }}
      />
      <Props m={M.rocksB} at={[[62, 33, 1.6], [76, -26, 0.8, 1, SEA_FLOOR.y]]} collider={{ box: 0.8 }} />
      <Props m={M.rocksC} at={[[66, -8, 2.7, 0.9, -0.4], [69, 18, 0.5, 0.8, groundY(69)]]} collider={{ box: 0.8 }} />

      <Props m={M.palmStraight} at={PALMS[0]} collider={{ trunk: 0.15 }} />
      <Props m={M.palmBend} at={PALMS[1]} collider={{ trunk: 0.15 }} />
      <Props m={M.palmDetailed} at={PALMS[2]} collider={{ trunk: 0.15 }} />
      <Props m={M.palmDetailedBend} at={PALMS[3]} collider={{ trunk: 0.15 }} />
      <Props m={M.grass} at={GRASS} />
      <Props m={M.grassSmall} at={GRASS.map(([x, z, r, s]): Placement => [x + 1.5, z + 1, r, s])} />
    </>
  );
}
