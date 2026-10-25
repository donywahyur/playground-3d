# PlayGround

A small 3D world in the browser where up to 8 people walk around and talk. Voice works like real life: the
closer someone is, the louder you hear them, and they sound like they're on your left or right depending on
where you're facing. Past 20 m they go silent, so you can wander off for a private chat.

## Joining

1. Pick a name.
2. Optionally tap **Customize character**: choose one of 12 characters, mix outfit and hairstyle, pick a face
   (eyes, mouth, cheeks, eye color) and recolor skin, hair, top, bottom and shoes. Your look is remembered.
3. Tap **Join with mic** and allow the microphone. If you don't, you join listen-only; tap **🎙️ Listen-only**
   later to try again (it also tells you why the mic isn't available).

## The world

The camp sits in the middle with its tent and campfire. Around it: a town to the north, a beach with a pirate
ship to the east, a graveyard to the south and wild woods everywhere else.

Time passes for everyone at once: a full day takes 24 minutes (one in-game hour per real minute). The clock in
the top bar reads 06:00 at sunrise and 18:00 at sunset; lamps and campfires light up at night.

## Controls

| | Computer | Phone (landscape) |
|---|---|---|
| Move | WASD / arrows | Joystick, left half of the screen |
| Run | Hold Shift | Push the joystick all the way |
| Jump | Space (hold to keep hopping) | ⤒ button, bottom right |
| Look around | Drag, or mouse look with camera lock (L) | Drag on the right half |
| Zoom | Scroll | |
| Sit | E near a bench, stump, stool or crate | 🪑 Sit button |
| Emotes | 1–5: wave, dance, cheer, yes, no | 😀 button |
| Chat | Enter | Chat box, bottom right |
| Mute | M | 🎙️ button |
| Map | Tab or the 🗺️ button | 🗺️ button or tap the minimap |
| Menu | Esc or ☰ | ☰ |

The menu has voice volume and Exit game. On phones it also has the player list and the joystick style:
**Flexible** (appears under your thumb) or **Fixed** (stays in the corner). Phones play in landscape only.

## Seeing who's around

- The **player list** shows everyone in the room; a ring lights up around a player's dot while they talk.
- **Name tags** float over each player. Chat lines appear as speech bubbles over the speaker, "…" while
  someone is typing.
- The **minimap** shows the area around you (50 m); the full map shows the whole world and where everyone is.
  The white ring on the ground is your hearing range.
- Players who haven't touched anything for 30 seconds (or switched tabs) get a "zzZ" bubble. After 10 minutes
  idle they're signed out.

## How it works

The server keeps everyone's position and passes chat along, but voice never goes through it: each pair of
players talks directly, browser to browser (WebRTC). That's why a room is capped at 8. Each voice is then
placed in 3D at that player's position, so volume and left/right follow where they stand relative to you. When
two players can't reach each other directly, voice goes through a relay (TURN) instead.

Characters and world by [Kenney](https://kenney.nl) (CC0).
