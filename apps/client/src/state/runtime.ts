import { Vector3 } from "three";
import type { Emote, WirePose } from "@hangout/shared";

/**
 * Per-frame mutable data shared between the 3D scene and the audio engine.
 * Kept outside React so updating it never triggers renders.
 */
export const localPose = {
  position: new Vector3(),
  /** Camera forward direction, used as the audio listener orientation. */
  forward: new Vector3(0, 0, -1),
  /** Avatar facing (rad); it faces (sin rotY, cos rotY) on the ground plane. */
  rotY: 0,
};

/** Interpolated (rendered) position of each remote player, keyed by sessionId. */
export const remotePositions = new Map<string, Vector3>();

/** One-shot requests from the HUD (keys, buttons), consumed by the local player each frame. */
export const playerActions = {
  /** Sit on the nearest free seat, or stand up. */
  toggleSit: false,
  emote: null as Emote | null,
};

/** The local player is idle (no input for a while, or the tab is hidden); the scene renders slower. */
export const activity = { idle: false };

/** Touch joystick vector, x = right, y = forward, both in [-1, 1]; `jump` while the jump button is held. */
export const joystick = { x: 0, y: 0, jump: false };

/** A remote player's pose in meters / radians (converted from the server's WirePose). */
export interface NetPlayer {
  x: number;
  y: number;
  z: number;
  rotY: number;
  anim: string;
  /** Sender clock (ms) of this pose. */
  t: number;
}

/** Live server state of each remote player, in wire units (mutated in place by the Colyseus decoder). */
export const remoteStates = new Map<string, WirePose>();

/** Recent poses per remote player (t = sender clock), oldest first; rendered slightly in the past (see net/interp.ts). */
export const remoteSnapshots = new Map<string, NetPlayer[]>();

/** Where the server spawned the local player. */
export const spawn = new Vector3(0, 1, 0);

/** Where the local player picks up when the scene remounts mid-game (quality change); null otherwise. */
export const resumePose = { pos: null as Vector3 | null, rotY: 0 };
