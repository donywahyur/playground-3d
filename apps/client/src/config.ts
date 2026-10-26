import { SERVER_PORT } from "@hangout/shared";

export const SERVER_URL: string =
  import.meta.env.VITE_SERVER_URL ??
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:${SERVER_PORT}`;

/** Commit this client was built from (VITE_BUILD_ID, set by the Docker build in CI); "dev" locally. */
export const BUILD_ID: string = import.meta.env.VITE_BUILD_ID || "dev";

/** The server's GET /status, over HTTP(S) next to the WebSocket URL (or the dev proxy path). */
export const STATUS_URL = `${SERVER_URL.replace(/^ws/, "http").replace(/\/$/, "")}/status`;

/** Used when the server has no TURN configured or its "ice" message doesn't arrive in time. */
export const STUN_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

/** How long to wait for the server's TURN credentials before falling back to STUN only. */
export const ICE_WAIT_MS = 5000;
