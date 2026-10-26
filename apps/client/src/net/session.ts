import { Callbacks, Client, type Room } from "@colyseus/sdk";
import type { Vector3 } from "three";
import {
  CLOSE_IDLE,
  COLOR_PARTS,
  FACE_PARTS,
  encodeMove,
  fromWire,
  ROOM_NAME,
  sanitizeAppearance,
  type Appearance,
  type ChatMessage,
  type ClockReply,
  type IceServer,
  type MoveMessage,
  type RtcSignalIn,
  type WirePose,
  type RtcSignalOut,
  type VoiceMessage,
} from "@hangout/shared";
import { ICE_WAIT_MS, SERVER_URL, STUN_SERVERS } from "../config";
import { activity, remotePositions, remoteStates, spawn } from "../state/runtime";
import { useGame } from "../state/store";
import { VoiceMesh } from "../voice/mesh";
import { getMic, watchSpeaking } from "../voice/mic";
import { SpatialAudio } from "../voice/spatial";
import { resetClock, syncClock } from "../world/sky/daytime";
import { watchIdle } from "./idle";
import { forgetSnapshots, pushSnapshot } from "./interp";

type ServerPlayer = WirePose &
  Appearance & {
    name: string;
    muted: boolean;
    speaking: boolean;
    idle: boolean;
    typing: boolean;
  };

/** Player fields the UI shows; position changes are read directly each frame instead. */
const UI_FIELDS = ["name", "character", "hairstyle", ...COLOR_PARTS, ...FACE_PARTS, "eyeColor", "muted", "speaking", "idle", "typing"];

interface Session {
  room: Room;
  mic: MediaStream | null;
  spatial: SpatialAudio;
  mesh: VoiceMesh;
  stopSpeaking?: () => void;
  idle: ReturnType<typeof watchIdle>;
  typing: boolean;
}

let session: Session | null = null;

export function getSpatial() {
  return session?.spatial ?? null;
}

/** Voice goes only to players within earshot; call a few times a second with the local position. */
export function updateVoiceRange(listener: Vector3) {
  if (!session) return;
  for (const [id, pos] of remotePositions) session.mesh.setDistance(id, pos.distanceTo(listener));
}

export async function joinGame(name: string, appearance: Appearance) {
  const game = useGame.getState();
  game.set({ phase: "connecting", error: null });

  // Create the AudioContext inside the click handler so autoplay policy lets it run.
  const spatial = new SpatialAudio();
  spatial.resume();
  spatial.setVolume(game.volume);

  const { stream: mic, ...micResult } = await getMic();
  game.set({ mic: mic ? "on" : "denied", micError: "error" in micResult ? micResult.error : null, muted: false });

  let room: Room;
  try {
    const client = new Client(SERVER_URL);
    room = await client.joinOrCreate(ROOM_NAME, { name, appearance });
  } catch (err) {
    mic?.getTracks().forEach((t) => t.stop());
    spatial.destroy();
    game.set({ phase: "join", error: `Could not connect to ${SERVER_URL}` });
    console.error(err);
    return;
  }

  // The server sends TURN credentials right after we join; voice waits for them before gathering candidates.
  const iceServers = new Promise<RTCIceServer[]>((resolve) => {
    room.onMessage("ice", (servers: IceServer[]) => resolve(servers.length ? servers : STUN_SERVERS));
    setTimeout(() => resolve(STUN_SERVERS), ICE_WAIT_MS);
  });

  const mesh = new VoiceMesh(
    room.sessionId,
    mic,
    (to, kind, data) => room.send("rtc", { to, kind, data } satisfies RtcSignalOut),
    (id, stream) => spatial.add(id, stream),
    (id) => spatial.remove(id),
    iceServers,
  );
  const onIdle = (idle: boolean) => {
    activity.idle = idle;
    room.send("idle", idle);
  };
  session = { room, mic, spatial, mesh, idle: watchIdle(onIdle), typing: false };
  useGame.getState().set({ selfId: room.sessionId });
  if (import.meta.env.DEV) Object.assign(window, { __hangout: session });

  if (mic) startSpeaking(session, mic);

  room.onMessage("rtc", (msg: RtcSignalIn) => mesh.handleSignal(msg));
  room.onMessage("chat", (msg: ChatMessage) => useGame.getState().pushChat(msg));
  room.onMessage("clock", (msg: ClockReply) => syncClock(msg.t, msg.server));
  // A few clock samples for the shared time of day; the fastest round trip wins.
  for (let i = 0; i < 3; i++) setTimeout(() => session?.room === room && room.send("clock", Date.now()), i * 1000);

  const cb = Callbacks.get(room) as any;
  cb.onAdd("players", (p: ServerPlayer, id: string) => {
    const sync = () =>
      useGame.getState().upsertPlayer({
        id,
        name: p.name,
        appearance: sanitizeAppearance(p),
        muted: p.muted,
        speaking: p.speaking,
        idle: p.idle,
        typing: p.typing,
      });
    sync();
    for (const field of UI_FIELDS) cb.listen(p, field, sync);

    if (id === room.sessionId) {
      const at = fromWire(p);
      spawn.set(at.x, at.y, at.z);
      useGame.getState().set({ phase: "playing" });
    } else {
      remoteStates.set(id, p);
      mesh.connect(id);
    }
  });
  cb.onRemove("players", (_p: ServerPlayer, id: string) => {
    useGame.getState().removePlayer(id);
    remoteStates.delete(id);
    forgetSnapshots(id);
    remotePositions.delete(id);
    mesh.disconnect(id);
  });

  // Fires after each decoded patch: buffer remote poses for interpolation.
  room.onStateChange(() => {
    const now = performance.now();
    for (const [id, p] of remoteStates) pushSnapshot(id, p, now);
  });

  room.onLeave((code) => {
    // leaveGame() already tore down; only handle unexpected drops here.
    if (session?.room !== room) return;
    teardown();
    resetToJoin(code === CLOSE_IDLE ? "You were signed out after 10 minutes without activity." : "Disconnected from server");
  });
}

function resetToJoin(error: string | null) {
  useGame.getState().set({
    phase: "join",
    error,
    players: {},
    selfId: null,
    chat: [],
    said: {},
    chatOpen: false,
    menuOpen: false,
    mapOpen: false,
    seatNearby: false,
    sitting: false,
  });
}

/** Leave the room on purpose and return to the join screen. */
export function leaveGame() {
  const room = session?.room;
  teardown();
  resetToJoin(null);
  room?.leave(true).catch(() => {});
}

export function setVolume(v: number) {
  session?.spatial.setVolume(v);
  useGame.getState().setVolume(v);
}

function startSpeaking(s: Session, mic: MediaStream) {
  s.stopSpeaking = watchSpeaking(s.spatial.ctx, mic, (speaking) => {
    s.room.send("voice", { speaking } satisfies VoiceMessage);
    // Talking counts as being here.
    if (speaking) s.idle.active();
  });
}

/**
 * Asks for the mic again while listen-only (from a tap, so the browser can show its permission prompt) and
 * starts sending it to everyone. Returns false if it's still unavailable; `micError` then says why.
 */
export async function enableMic() {
  if (!session || session.mic) return true;
  const s = session;
  const result = await getMic();
  if (!result.stream) {
    useGame.getState().set({ micError: result.error });
    return false;
  }
  // Left the game while the prompt was up.
  if (session !== s) {
    result.stream.getTracks().forEach((t) => t.stop());
    return false;
  }
  s.mic = result.stream;
  s.mesh.setLocalStream(result.stream);
  startSpeaking(s, result.stream);
  s.room.send("voice", { muted: false, speaking: false } satisfies VoiceMessage);
  useGame.getState().set({ mic: "on", micError: null, muted: false });
  return true;
}

function teardown() {
  if (!session) return;
  session.stopSpeaking?.();
  session.idle.stop();
  activity.idle = false;
  session.mesh.destroy();
  session.spatial.destroy();
  session.mic?.getTracks().forEach((t) => t.stop());
  remoteStates.clear();
  forgetSnapshots();
  remotePositions.clear();
  resetClock();
  session = null;
}

export function sendMove(msg: MoveMessage) {
  session?.room.sendBytes("move", encodeMove(msg));
}

export function sendChat(text: string) {
  session?.room.send("chat", text);
  // The server clears typing when the line arrives.
  if (session) session.typing = false;
}

/** Tell others whether you have text in the chat box (sent only on change). */
export function setTyping(typing: boolean) {
  if (!session || session.typing === typing) return;
  session.typing = typing;
  session.room.send("typing", typing);
}

export function setMuted(muted: boolean) {
  if (!session?.mic) return;
  session.mic.getAudioTracks().forEach((t) => (t.enabled = !muted));
  session.mesh.setMuted(muted);
  session.room.send("voice", { muted, speaking: false } satisfies VoiceMessage);
  useGame.getState().set({ muted });
}
