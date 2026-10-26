export const ROOM_NAME = "hangout";
export const ROOM_MAX = 8; // P2P voice mesh gets heavy past this
export const SERVER_PORT = 2567;

export const NAME_MAX_LEN = 20;
export const CHAT_MAX_LEN = 200;

// Movement
export const WALK_SPEED = 4;
export const RUN_SPEED = 8;
export const GRAVITY = 25;
// Peak height = JUMP_SPEED² / (2·GRAVITY) ≈ 0.6 m; air time = 2·JUMP_SPEED / GRAVITY ≈ 0.44 s.
export const JUMP_SPEED = 5.5;
export const WORLD_HALF_SIZE = 80;
// Server state patch rate. Clients send moves at the same rate so every patch
// carries one fresh position (mismatched rates make remote players pulse).
export const PATCH_HZ = 20;
export const MOVE_SEND_HZ = PATCH_HZ;

// Proximity voice
export const AUDIO_REF_DIST = 2; // full volume inside this radius (m)
export const AUDIO_MAX_DIST = 20; // silent beyond this radius (m)
// Voice is only sent to players who could hear it. Two thresholds so walking along the edge doesn't flap,
// and sending resumes a few meters before the voice becomes audible.
export const VOICE_SEND_ON = AUDIO_MAX_DIST + 4;
export const VOICE_SEND_OFF = AUDIO_MAX_DIST + 8;
/** Opus cap per voice stream (bps); speech stays clear well below Chrome's 32 kbps default. */
export const VOICE_MAX_BITRATE = 24_000;

// Day/night cycle. Every client derives the time of day from the server clock.
export const DAY_LENGTH_MS = 24 * 60_000; // one in-game hour per real minute

/** No input for this long (ms) marks a player idle (a hidden tab does at once). */
export const IDLE_AFTER_MS = 30_000;
/** No input for this long (ms) signs the player out. */
export const IDLE_SIGNOUT_MS = 10 * 60_000;
/** WebSocket close code the server uses when it signs out an idle player. */
export const CLOSE_IDLE = 4100;

/** Time of day in [0, 1) for a server timestamp (ms); 0 is sunrise. */
export const dayPhase = (serverMs: number) => (((serverMs % DAY_LENGTH_MS) + DAY_LENGTH_MS) % DAY_LENGTH_MS) / DAY_LENGTH_MS;

/** Emotes, in the order of their number keys (1..5). Synced through `anim` like the other poses. */
export const EMOTES = ["wave", "dance", "cheer", "yes", "no"] as const;
export type Emote = (typeof EMOTES)[number];

// New entries go at the end: the wire format sends the index.
export const ANIMS = ["idle", "walk", "run", "jump", "sit", ...EMOTES, "swim", "tread"] as const;
export type Anim = (typeof ANIMS)[number];
export const isAnim = (v: unknown): v is Anim => ANIMS.includes(v as Anim);
