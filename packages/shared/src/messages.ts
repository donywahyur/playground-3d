import type { Appearance } from "./appearance.ts";
import type { Anim } from "./constants.ts";

export interface JoinOptions {
  name: string;
  appearance: Appearance;
}

export interface MoveMessage {
  x: number;
  y: number;
  z: number;
  rotY: number;
  anim: Anim;
  /** Sender's clock (ms) when this pose was sampled; lets receivers interpolate on the sender's timeline. */
  t: number;
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
