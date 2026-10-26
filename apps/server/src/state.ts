import { schema, t, type SchemaType } from "@colyseus/schema";

export const Player = schema(
  {
    name: t.string(),
    character: t.string(),
    hairstyle: t.string(),
    skin: t.int8(),
    hair: t.int8(),
    top: t.int8(),
    dress: t.int8(),
    bottom: t.int8(),
    shoes: t.int8(),
    eyes: t.int8(),
    mouth: t.int8(),
    cheeks: t.int8(),
    eyeColor: t.int8(),
    // Pose in wire units (WirePose in @hangout/shared: cm, 1e-4 rad, ANIMS index); fromWire converts.
    x: t.int16(),
    y: t.int16(),
    z: t.int16(),
    rotY: t.int16(),
    anim: t.uint8(),
    /** Sender clock (ms) of the latest move, relayed for client-side interpolation. */
    t: t.uint32(),
    muted: t.boolean(),
    speaking: t.boolean(),
    /** No input for a while (or the tab is hidden); shows a bubble over the player. */
    idle: t.boolean(),
    /** Has text in the chat box; shows a "…" bubble. */
    typing: t.boolean(),
  },
  "Player",
);
export type Player = SchemaType<typeof Player>;

export const PlaygroundState = schema(
  {
    players: t.map(Player),
  },
  "PlaygroundState",
);
export type PlaygroundState = SchemaType<typeof PlaygroundState>;
