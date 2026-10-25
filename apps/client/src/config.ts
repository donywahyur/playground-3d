import { SERVER_PORT } from "@hangout/shared";

export const SERVER_URL: string =
  import.meta.env.VITE_SERVER_URL ??
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:${SERVER_PORT}`;

/** Used when the server has no TURN configured or its "ice" message doesn't arrive in time. */
export const STUN_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

/** How long to wait for the server's TURN credentials before falling back to STUN only. */
export const ICE_WAIT_MS = 5000;
