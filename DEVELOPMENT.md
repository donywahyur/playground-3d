# PlayGround: development

Multiplayer 3D hangout in the browser with proximity voice chat: the closer another player is, the louder you hear them (silent past 20 m, panned left/right by camera direction).

- **Client**: Vite + React + React Three Fiber + drei + @react-three/rapier
- **Server**: Colyseus 0.18 (authoritative positions, WebRTC signaling relay)
- **Voice**: P2P WebRTC full mesh (max 8 per room), Web Audio `PannerNode` per remote player

## Run

```sh
pnpm install
pnpm dev
```

Open http://localhost:5173 in two browser windows (one incognito). Server runs on :2567.

## Layout

```
packages/shared/src/
  constants.ts        room, movement, voice range, day length, idle timers, emotes/anims
  appearance.ts       characters, recolor parts, face styles, sanitizeAppearance
  messages.ts         client <-> server message types

apps/server/src/
  PlaygroundRoom.ts   room state, move validation, rtc relay, chat, signs out players idle 10 min
  state.ts            Colyseus schema (Player, PlaygroundState)
  turn.ts             mints short-lived Cloudflare TURN credentials, sent to each player on join

apps/client/src/
  App.tsx             join screen until connected, then world + HUD
  config.ts           server URL, STUN fallback
  state/
    store.ts          zustand store for the UI (players, chat, menus, settings)
    runtime.ts        per-frame data outside React (local pose, remote positions, HUD actions, joystick)
    prefs.ts          localStorage settings (name, look, volume, camera lock, map rotation)
  net/
    session.ts        join flow, state callbacks, wires voice to state
    interp.ts         snapshot interpolation of remote players on the sender's clock
    idle.ts           idle after 30 s without input (or a hidden tab); synced, shown as a "zzZ" bubble
  voice/
    mesh.ts           one RTCPeerConnection per remote player
    spatial.ts        distance-based volume (PannerNode, linear model)
    mic.ts            getUserMedia + speaking detection
  ui/
    home/             join screen: JoinScreen, Customize (character/outfit/hair/face/colors), LoadingScreen,
                      HomeScene (backdrop: the live camp at the current time of day, your character by the
                      tent camp fire; the camera centers it in the space beside the menu panel)
    hud/              in-game overlay: Hud (toolbar + shortcuts), PlayerList, Chat, Actions (sit/emotes), Menu,
                      Joystick (touch), Minimap (corner map centered on you, 50 m radius, drawn on a 2D canvas
                      from env/layout.ts; the 🗺️ button, Tab or tapping it opens the full WorldMap)
    Clock.tsx, Logo.tsx shared by both
  world/
    World.tsx         canvas, physics and the scene
    math.ts           lerpAngle, rotateXZ, seeded PRNG
    culling.ts        per-instance culling of the instanced props for the view and the sun's shadow (`?cull=0` turns it off)
    player/           LocalPlayer (character controller + third-person camera), orbit.ts (camera input),
                      seating.ts (sit on the nearest free seat with E), RemotePlayers, Avatar,
                      PlayerBubble (chat lines, "…" while typing, "zzZ" while idle), controls.ts (key map)
    sky/              daytime.ts: time of day from the server clock (24 min per day), sun/moon, sky, fog and
                      light colors; DayNight.tsx renders them. The HUD clock reads 06:00 at sunrise, 18:00 at sunset
    character/        GLB character loader + animation mapping (catalog.ts lists models),
                      emotes.ts: wave/dance/cheer clips built on the shared rig (Kenney has no such clips),
                      recolor.ts: per-player skin/hair/top/dress/bottom/shoes by remapping UVs on the colormap;
                      outfit (body mesh) and hairstyle (head mesh) can come from different models,
                      face.ts: drawn eyes/mouth/cheeks (+ eye color, blinking) on the head bone,
                      replacing Kenney's painted eyes and mouth; atlas drawn on a canvas at runtime
    env/              Environment.tsx (ground, walls, paths, all zones), layout.ts (the map), props.tsx
                      (instanced kit-model renderer + colliders), seats.ts (seat spots on benches, stools,
                      stumps and crates), Lamps.tsx (lights the zones' lamps at night)
      zones/          ForestCamp (center), Town (N), Beach (E), Graveyard (S), Wilds (belt, W, corners)

apps/client/public/characters/  Kenney "Mini Characters" (CC0, www.kenney.nl): 12 GLBs + colormap + previews
apps/client/public/kits/        Kenney CC0 kits used by the zones: mini-forest, fantasy-town, pirate, graveyard
```

Preview a time of day with `?time=0.8` in the URL (0 sunrise, 0.33 noon, 0.65 sunset, 0.83 midnight). Cycle length is `DAY_LENGTH_MS` in `packages/shared/src/constants.ts`.

Tune hearing range in `packages/shared/src/constants.ts` (`AUDIO_REF_DIST`, `AUDIO_MAX_DIST`).

## E2E smoke scripts

With `pnpm dev` running: `pnpm e2e:characters` / `pnpm e2e:recolor` / `pnpm e2e:perf` (draw calls and triangles, main and shadow pass, at five spots; `pnpm e2e:perf cull=0` for the unculled numbers) (headless Chromium via playwright-core; set `BROWSER_PATH` if Chrome/Brave/Edge aren't in /Applications). Screenshots go to `scripts/e2e/out/`.

`apps/client/scripts/` has dev tools for the Kenney models (clip motion dump, detected recolor cells), and `hair-thumbs.mjs`, which renders the hairstyle picker's head close-ups into `public/characters/previews/hair-*.png` (with `pnpm dev` running, from `apps/client`).

## Testing on phones / other machines

`getUserMedia` needs a secure context: `localhost` works, but `http://192.168.x.x` does not, so phones on your LAN will join listen-only. Use an HTTPS tunnel (e.g. `cloudflared tunnel --url http://localhost:5173`) and point `VITE_SERVER_URL` at a `wss://` tunnel for the server.

## TURN (Cloudflare)

Players behind strict NATs need a TURN relay for voice. The server uses [Cloudflare Realtime TURN](https://developers.cloudflare.com/realtime/turn/) (first 1,000 GB/month free):

1. Cloudflare dashboard, Realtime, TURN: create a TURN key.
2. Set `CF_TURN_KEY_ID` and `CF_TURN_API_TOKEN` on the **server** (never as `VITE_*`, those are public).

On join, the server asks Cloudflare for 24 h credentials and sends them to that player only (`ice` message). Without the env vars, or if the call fails, voice falls back to STUN only.

## Deploy

- Client: Vercel/Netlify (`apps/client`, build `pnpm build`), set `VITE_SERVER_URL=wss://...`
- Server: Fly.io / Railway / any Node host with WebSockets (`pnpm --filter @hangout/server start`, respects `PORT`); set `CF_TURN_KEY_ID` / `CF_TURN_API_TOKEN` for TURN
