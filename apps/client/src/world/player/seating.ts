import { Vector3 } from "three";
import { remotePositions } from "../../state/runtime";
import { SEATS } from "../env/Environment";
import type { Seat } from "../env/seats";
import { CONTROLLER_OFFSET, FOOT_OFFSET } from "./Avatar";

/** How close (m) a seat must be to sit on it. */
const SIT_RANGE = 1.6;
/** Seconds to glide into or out of a seat (also keeps the move under the server's speed cap). */
export const SIT_GLIDE = 0.3;
/** The sit pose's hips are ~6 cm behind the model origin; shift forward so they land on the seat. */
const SIT_HIPS_BACK = 0.06;
/**
 * Standing up steps this far (m) forward of the seat: the first distance that's
 * clear. The longer ones get you past seats whose collider is bigger than the
 * seat itself (stumps in a rock cluster).
 */
const STAND_STEPS = [0.75, 1.2, 1.6];

export interface Seated {
  /** Where you stood before sitting; also where you get up to when the spot ahead of the seat is blocked. */
  from: Vector3;
  /** Capsule center while seated. */
  to: Vector3;
  rotY: number;
  /** Glide progress 0..1, into the seat or (leaving) back out. */
  t: number;
  leaving: boolean;
}

/** Nearest seat in range that no other player is sitting on. */
export function freeSeatNear(x: number, z: number): Seat | null {
  let best: Seat | null = null;
  let bestD = SIT_RANGE;
  for (const seat of SEATS) {
    const d = Math.hypot(seat.x - x, seat.z - z);
    if (d >= bestD) continue;
    let taken = false;
    for (const p of remotePositions.values()) if (Math.hypot(p.x - seat.x, p.z - seat.z) < 0.45) taken = true;
    if (taken) continue;
    best = seat;
    bestD = d;
  }
  return best;
}

/** Start gliding from capsule position `pos` into `seat`; round seats keep the current facing `rotY`. */
export function sitOn(seat: Seat, pos: Vector3, rotY: number): Seated {
  const facing = seat.rotY ?? rotY;
  const y = seat.y + FOOT_OFFSET + CONTROLLER_OFFSET;
  const to = new Vector3(seat.x + Math.sin(facing) * SIT_HIPS_BACK, y, seat.z + Math.cos(facing) * SIT_HIPS_BACK);
  return { from: pos.clone(), to, rotY: facing, t: 0, leaving: false };
}

const tmpAhead = new Vector3();

/**
 * The first clear spot in front of the seat to stand up to (a shared vector),
 * or null if all are blocked. `blocked` tests a capsule position.
 */
export function standSpot(seated: Seated, blocked: (pos: Vector3) => boolean): Vector3 | null {
  for (const step of STAND_STEPS) {
    tmpAhead.set(seated.to.x + Math.sin(seated.rotY) * step, seated.from.y, seated.to.z + Math.cos(seated.rotY) * step);
    if (!blocked(tmpAhead)) return tmpAhead;
  }
  return null;
}
