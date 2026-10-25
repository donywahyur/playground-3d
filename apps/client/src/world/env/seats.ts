import { rotateXZ } from "../math";
import type { Placement } from "./props";

/** Where a seated player's hips go (meters). */
export interface Seat {
  x: number;
  z: number;
  /** Height of the seat surface. */
  y: number;
  /** Facing while seated; omitted for round seats (stools), where you keep your facing. */
  rotY?: number;
}

/** A seat on a model, in model units: position, surface height and facing (rad, 0 = model's +z). */
export interface SeatSpot {
  x: number;
  z: number;
  y: number;
  face?: number;
}

/** Seats on every placement of a prop with kit scale `k`. */
export function seatsOn(at: Placement[], k: number, spots: SeatSpot[]): Seat[] {
  return at.flatMap(([px, pz, rot = 0, scale = 1, py = 0]) =>
    spots.map((spot): Seat => {
      const s = k * scale;
      const [dx, dz] = rotateXZ(spot.x * s, spot.z * s, rot);
      return { x: px + dx, z: pz + dz, y: py + spot.y * s, rotY: spot.face === undefined ? undefined : rot + spot.face };
    }),
  );
}

/**
 * The low stump in the mini-forest "stones" cluster (the others are too tall to
 * sit on). It sits on the cluster's corner; you face out, with the rocks behind
 * you, so standing up has room ahead.
 */
export const STUMP_SEAT: SeatSpot[] = [{ x: -0.2, z: 0.2, y: 0.24, face: Math.atan2(-0.2, 0.2) }];
