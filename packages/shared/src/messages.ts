import type { Appearance } from "./appearance.ts";
import { ANIMS, type Anim } from "./constants.ts";

export interface JoinOptions {
  name: string;
  appearance: Appearance;
}

/** A player's pose in meters / radians, as the game uses it. */
export interface MoveMessage {
  x: number;
  y: number;
  z: number;
  rotY: number;
  anim: Anim;
  /** Sender's clock (ms) when this pose was sampled; lets receivers interpolate on the sender's timeline. */
  t: number;
}

/**
 * The same pose as sent and stored on the wire, in small integers: positions in cm (int16, ±327 m; the world
 * is ±80 m), rotY in 1e-4 rad (int16, normalized to ±π), anim as an index into ANIMS (uint8), t as uint32.
 * A move is a 13-byte binary message instead of ~80 bytes of msgpack; patches carry 2-byte fields instead of
 * 5-byte floats.
 */
export interface WirePose {
  x: number;
  y: number;
  z: number;
  rotY: number;
  anim: number;
  t: number;
}

const POS_SCALE = 100;
const ROT_SCALE = 10_000;
const MOVE_BYTES = 13;
const int16 = (v: number) => Math.max(-32768, Math.min(32767, Math.round(v)));

export const toWire = (m: MoveMessage): WirePose => ({
  x: int16(m.x * POS_SCALE),
  y: int16(m.y * POS_SCALE),
  z: int16(m.z * POS_SCALE),
  rotY: int16(Math.atan2(Math.sin(m.rotY), Math.cos(m.rotY)) * ROT_SCALE),
  anim: Math.max(0, ANIMS.indexOf(m.anim)),
  t: Math.max(0, Math.round(m.t)) >>> 0,
});

export const fromWire = (w: WirePose): MoveMessage => ({
  x: w.x / POS_SCALE,
  y: w.y / POS_SCALE,
  z: w.z / POS_SCALE,
  rotY: w.rotY / ROT_SCALE,
  anim: ANIMS[w.anim] ?? "idle",
  t: w.t,
});

/** The "move" message body (sent with sendBytes). */
export function encodeMove(m: MoveMessage): Uint8Array {
  const w = toWire(m);
  const v = new DataView(new ArrayBuffer(MOVE_BYTES));
  v.setInt16(0, w.x);
  v.setInt16(2, w.y);
  v.setInt16(4, w.z);
  v.setInt16(6, w.rotY);
  v.setUint8(8, w.anim);
  v.setUint32(9, w.t);
  return new Uint8Array(v.buffer);
}

/** Null if the bytes aren't a move. */
export function decodeMove(bytes: Uint8Array): WirePose | null {
  if (bytes.byteLength !== MOVE_BYTES) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, MOVE_BYTES);
  const anim = v.getUint8(8);
  if (anim >= ANIMS.length) return null;
  return { x: v.getInt16(0), y: v.getInt16(2), z: v.getInt16(4), rotY: v.getInt16(6), anim, t: v.getUint32(9) };
}

export interface VoiceMessage {
  muted?: boolean;
  speaking?: boolean;
}

export type RtcKind = "offer" | "answer" | "ice";

/** client -> server */
export interface RtcSignalOut {
  to: string;
  kind: RtcKind;
  data: unknown;
}

/** server -> client */
export interface RtcSignalIn {
  from: string;
  kind: RtcKind;
  data: unknown;
}

/** server -> client once after joining ("ice"): STUN/TURN servers with short-lived TURN credentials; empty when TURN isn't configured. */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** Clock sync: the client sends its own clock `t`, the server echoes it back with its clock. */
export interface ClockReply {
  t: number;
  server: number;
}

export interface ChatMessage {
  from: string;
  name: string;
  text: string;
  at: number;
}
