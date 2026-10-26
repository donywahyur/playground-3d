import { Room, type Client } from "@colyseus/core";
import {
  BUILD_MISMATCH,
  CHAT_MAX_LEN,
  CLOSE_IDLE,
  IDLE_AFTER_MS,
  IDLE_SIGNOUT_MS,
  NAME_MAX_LEN,
  PATCH_HZ,
  ROOM_MAX,
  RUN_SPEED,
  WORLD_HALF_SIZE,
  decodeMove,
  fromWire,
  sanitizeAppearance,
  toWire,
  type ChatMessage,
  type ClockReply,
  type JoinOptions,
  type RtcSignalIn,
  type RtcSignalOut,
  type VoiceMessage,
} from "@hangout/shared";
import { PlaygroundState, Player } from "./state.ts";
import { BUILD_ID } from "./build.ts";
import { createIceServers } from "./turn.ts";

// Allow some slack over RUN_SPEED for jitter between move packets.
const MAX_SPEED = RUN_SPEED * 1.6;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export class PlaygroundRoom extends Room<{ state: PlaygroundState }> {
  maxClients = ROOM_MAX;
  state = new PlaygroundState();
  private lastMoveAt = new Map<string, number>();
  /** When each idle player's last input was (server ms). */
  private idleSince = new Map<string, number>();

  onCreate() {
    this.setPatchRate(1000 / PATCH_HZ);

    // Sign out players idle too long. Enforced here rather than in the
    // browser, which may freeze a background tab's timers.
    this.clock.setInterval(() => {
      const now = Date.now();
      for (const [id, since] of this.idleSince) {
        if (now - since < IDLE_SIGNOUT_MS) continue;
        this.idleSince.delete(id);
        this.clients.getById(id)?.leave(CLOSE_IDLE, "idle");
      }
    }, 5000);

    // Binary (encodeMove): 13 bytes instead of a msgpack object.
    this.onMessageBytes("move", (client, bytes: Uint8Array) => {
      const p = this.state.players.get(client.sessionId);
      const wire = decodeMove(bytes);
      if (!p || !wire) return;
      const msg = fromWire(wire);
      const cur = fromWire(p);

      const now = Date.now();
      const dt = Math.max((now - (this.lastMoveAt.get(client.sessionId) ?? now)) / 1000, 0.05);
      this.lastMoveAt.set(client.sessionId, now);

      // Cap distance travelled per packet so a client can't teleport.
      let dx = msg.x - cur.x;
      let dz = msg.z - cur.z;
      const dist = Math.hypot(dx, dz);
      const maxDist = MAX_SPEED * dt;
      if (dist > maxDist) {
        dx = (dx / dist) * maxDist;
        dz = (dz / dist) * maxDist;
      }

      const next = toWire({
        ...msg,
        x: clamp(cur.x + dx, -WORLD_HALF_SIZE, WORLD_HALF_SIZE),
        z: clamp(cur.z + dz, -WORLD_HALF_SIZE, WORLD_HALF_SIZE),
        y: clamp(msg.y, -5, 20),
      });
      p.x = next.x;
      p.y = next.y;
      p.z = next.z;
      p.rotY = next.rotY;
      p.anim = next.anim;
      p.t = next.t;
    });

    this.onMessage("voice", (client, msg: VoiceMessage) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      if (typeof msg?.muted === "boolean") p.muted = msg.muted;
      if (typeof msg?.speaking === "boolean") p.speaking = msg.speaking;
    });

    this.onMessage("idle", (client, idle: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || typeof idle !== "boolean") return;
      p.idle = idle;
      // The client reports idle IDLE_AFTER_MS after the last input.
      if (!idle) this.idleSince.delete(client.sessionId);
      else if (!this.idleSince.has(client.sessionId)) this.idleSince.set(client.sessionId, Date.now() - IDLE_AFTER_MS);
    });

    this.onMessage("typing", (client, typing: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (p && typeof typing === "boolean") p.typing = typing;
    });

    // WebRTC signaling relay. The server only forwards; media is peer-to-peer.
    this.onMessage("rtc", (client, msg: RtcSignalOut) => {
      if (!msg || typeof msg.to !== "string") return;
      const target = this.clients.find((c) => c.sessionId === msg.to);
      if (!target) return;
      const out: RtcSignalIn = { from: client.sessionId, kind: msg.kind, data: msg.data };
      target.send("rtc", out);
    });

    this.onMessage("clock", (client, t: number) => {
      if (!isNum(t)) return;
      client.send("clock", { t, server: Date.now() } satisfies ClockReply);
    });

    this.onMessage("chat", (client, text: string) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || typeof text !== "string") return;
      const trimmed = text.trim().slice(0, CHAT_MAX_LEN);
      if (!trimmed) return;
      p.typing = false;
      const out: ChatMessage = { from: client.sessionId, name: p.name, text: trimmed, at: Date.now() };
      this.broadcast("chat", out);
    });
  }

  onJoin(client: Client, options?: Partial<JoinOptions>) {
    // Mid-deploy, client and server can be different builds that don't speak the same protocol.
    if (BUILD_ID !== "dev" && options?.build !== BUILD_ID) throw new Error(BUILD_MISMATCH);

    const name = String(options?.name ?? "").trim().slice(0, NAME_MAX_LEN) || `Guest ${client.sessionId.slice(0, 4)}`;
    const appearance = sanitizeAppearance(options?.appearance);

    // Spawn in a small ring around the center so players don't overlap.
    const angle = Math.random() * Math.PI * 2;
    this.state.players.set(
      client.sessionId,
      new Player({
        name,
        ...appearance,
        ...toWire({ x: Math.cos(angle) * 3, y: 1, z: Math.sin(angle) * 3, rotY: 0, anim: "idle", t: 0 }),
        muted: false,
        speaking: false,
        idle: false,
        typing: false,
      }),
    );

    // Only joined players get TURN credentials, so the relay can't be farmed from outside.
    createIceServers().then((servers) => {
      if (this.clients.getById(client.sessionId)) client.send("ice", servers);
    });
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.lastMoveAt.delete(client.sessionId);
    this.idleSince.delete(client.sessionId);
  }
}
