import { Suspense } from "react";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { Lamps, type Lamp } from "./Lamps";
import { BEACH_X, EDGE, GROUND, HALF, PATHS, SEA_FLOOR, SHORE_X, WATER_Y } from "./layout";
import { preloadKits } from "./props";
import type { Seat } from "./seats";
import { Beach, BEACH_LAMPS, BEACH_SEATS } from "./zones/Beach";
import { CAMP_LAMPS, CAMP_SEATS, ForestCamp, PLAZA_R, RAMP } from "./zones/ForestCamp";
import { Graveyard, GRAVEYARD_LAMPS, GRAVEYARD_SEATS } from "./zones/Graveyard";
import { Town, TOWN_LAMPS, TOWN_SEATS } from "./zones/Town";
import { Wilds, WILDS_SEATS } from "./zones/Wilds";

const SLOPE = { len: Math.hypot(SEA_FLOOR.x - SHORE_X, SEA_FLOOR.y), tilt: Math.atan2(-SEA_FLOOR.y, SEA_FLOOR.x - SHORE_X) };

export const preloadEnvironment = preloadKits;

const LAMPS: Lamp[] = [...CAMP_LAMPS, ...TOWN_LAMPS, ...GRAVEYARD_LAMPS, ...BEACH_LAMPS];
/** Everywhere a player can sit. */
export const SEATS: Seat[] = [...CAMP_SEATS, ...TOWN_SEATS, ...GRAVEYARD_SEATS, ...WILDS_SEATS, ...BEACH_SEATS];

/** Flat ground rectangle from x0..x1, z0..z1 at height y. */
function Ground({ x0, x1, z0, z1, y = 0, color }: { x0: number; x1: number; z0: number; z1: number; y?: number; color: string }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[(x0 + x1) / 2, y, (z0 + z1) / 2]} receiveShadow>
      <planeGeometry args={[x1 - x0, z1 - z0]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

// Note: rapier components only read array `position` / `rotation` props; the
// dash shorthand (`position-y`) is silently ignored for physics.
export function Environment() {
  const slopeMid = (SHORE_X + SEA_FLOOR.x) / 2;
  return (
    <>
      {/* Land west of the shore, the beach slope, then the sea floor */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[(SHORE_X + EDGE) / 2, 0.5, EDGE]} position={[(SHORE_X - EDGE) / 2, -0.5, 0]} />
        <CuboidCollider args={[SLOPE.len / 2 + 0.3, 0.5, EDGE]} position={[slopeMid, SEA_FLOOR.y / 2 - 0.5, 0]} rotation={[0, 0, -SLOPE.tilt]} />
        <CuboidCollider args={[(EDGE - SEA_FLOOR.x) / 2 + 4, 0.5, EDGE]} position={[(SEA_FLOOR.x + EDGE) / 2 + 4, SEA_FLOOR.y - 0.5, 0]} />
      </RigidBody>
      <Ground x0={-EDGE} x1={BEACH_X} z0={-EDGE} z1={EDGE} color={GROUND.grass} />
      <Ground x0={BEACH_X} x1={SHORE_X} z0={-EDGE} z1={EDGE} color={GROUND.sand} />
      <mesh rotation={[-Math.PI / 2, 0, -SLOPE.tilt, "ZYX"]} position={[slopeMid, SEA_FLOOR.y / 2, 0]} receiveShadow>
        <planeGeometry args={[SLOPE.len, EDGE * 2]} />
        <meshStandardMaterial color={GROUND.sand} />
      </mesh>
      <Ground x0={SEA_FLOOR.x} x1={EDGE + 160} z0={-EDGE - 160} z1={EDGE + 160} y={SEA_FLOOR.y} color={GROUND.sand} />
      <Ground x0={SHORE_X - 2} x1={EDGE + 160} z0={-EDGE - 160} z1={EDGE + 160} y={WATER_Y} color={GROUND.water} />

      {/* Invisible boundary walls */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[HALF, 5, 0.5]} position={[0, 5, -HALF]} />
        <CuboidCollider args={[HALF, 5, 0.5]} position={[0, 5, HALF]} />
        <CuboidCollider args={[0.5, 5, HALF]} position={[-HALF, 5, 0]} />
        <CuboidCollider args={[0.5, 5, HALF]} position={[HALF, 5, 0]} />
      </RigidBody>

      {/* Dirt plaza and paths: up to the stage, then on to every zone */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.01} receiveShadow>
        <circleGeometry args={[PLAZA_R, 48]} />
        <meshStandardMaterial color={GROUND.dirt} />
      </mesh>
      {[
        { x: 0, z: (RAMP.z + RAMP.len / 2 - PLAZA_R + 1) / 2, w: 2.6, d: -(RAMP.z + RAMP.len / 2) - PLAZA_R + 1 },
        ...PATHS,
      ].map(({ x, z, w, d }, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[x, 0.01, z]} receiveShadow>
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial color={GROUND.dirt} />
        </mesh>
      ))}

      <Lamps lamps={LAMPS} />

      {/* Each zone streams in on its own, the camp first */}
      <Suspense fallback={null}>
        <ForestCamp />
      </Suspense>
      <Suspense fallback={null}>
        <Wilds />
      </Suspense>
      <Suspense fallback={null}>
        <Town />
      </Suspense>
      <Suspense fallback={null}>
        <Beach />
      </Suspense>
      <Suspense fallback={null}>
        <Graveyard />
      </Suspense>
    </>
  );
}
