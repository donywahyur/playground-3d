import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useKeyboardControls } from "@react-three/drei";
import {
  CapsuleCollider,
  RigidBody,
  useRapier,
  type RapierCollider,
  type RapierRigidBody,
} from "@react-three/rapier";
import { MathUtils, Vector3, type Group } from "three";
import { AUDIO_MAX_DIST, GRAVITY, JUMP_SPEED, MOVE_SEND_HZ, RUN_SPEED, WALK_SPEED, type Anim, type Appearance, type Emote } from "@hangout/shared";
import { sendMove } from "../../net/session";
import { joystick, localPose, playerActions, resumePose, spawn } from "../../state/runtime";
import { useGame } from "../../state/store";
import { lerpAngle, ticker } from "../math";
import { Avatar, CONTROLLER_OFFSET, FOOT_OFFSET } from "./Avatar";
import { Controls } from "./controls";
import { useOrbitInput } from "./orbit";
import { PlayerBubble } from "./PlayerBubble";
import { freeSeatNear, SIT_GLIDE, sitOn, standSpot, type Seated } from "./seating";

type CharacterController = ReturnType<ReturnType<typeof useRapier>["world"]["createCharacterController"]>;

/** How long each emote plays (s); dance goes on until you move. */
const EMOTE_TIME: Record<Emote, number> = { wave: 2, dance: Infinity, cheer: 2.4, yes: 1.33, no: 1.33 };

const tmpTarget = new Vector3();
const tmpCam = new Vector3();

export function LocalPlayer({ appearance }: { appearance: Appearance }) {
  const body = useRef<RapierRigidBody>(null);
  const collider = useRef<RapierCollider>(null);
  const visual = useRef<Group>(null);
  const range = useRef<Group>(null);
  const { world, rapier } = useRapier();
  const { camera } = useThree();
  const orbit = useOrbitInput();
  const [, getKeys] = useKeyboardControls<Controls>();
  const selfId = useGame((s) => s.selfId);

  // Created in an effect (not useMemo) so StrictMode's mount/unmount/mount gets a live controller.
  const controllerRef = useRef<CharacterController | null>(null);
  useEffect(() => {
    const c = world.createCharacterController(CONTROLLER_OFFSET);
    c.enableAutostep(0.4, 0.2, true);
    c.enableSnapToGround(0.3);
    c.setMaxSlopeClimbAngle(MathUtils.degToRad(50));
    c.setSlideEnabled(true);
    controllerRef.current = c;
    return () => {
      world.removeCharacterController(c);
      controllerRef.current = null;
    };
  }, [world]);

  // Fresh join: the server's spawn. Scene remount (quality change): where the player stood.
  const [start] = useState(() => ({ pos: (resumePose.pos ?? spawn).clone(), rotY: resumePose.pos ? resumePose.rotY : 0 }));
  const seatTick = useMemo(() => ticker(5), []);
  const state = useRef({
    pos: start.pos.clone(),
    vy: 0,
    airTime: 0,
    jumping: false,
    rotY: start.rotY,
    anim: "idle" as Anim,
    nextSend: 0,
    lastSent: "",
    seated: null as Seated | null,
    emote: null as { name: Emote; until: number } | null,
  });

  useFrame(({ clock }, rawDt) => {
    const controller = controllerRef.current;
    if (!body.current || !collider.current || !controller) return;
    const dt = Math.min(rawDt, 0.1);
    const s = state.current;
    resumePose.pos = null;

    // Input (keyboard ignored while typing in chat or with the menu open).
    const { chatOpen, menuOpen } = useGame.getState();
    const keys = chatOpen || menuOpen ? null : getKeys();
    let ix = (keys ? Number(keys.right) - Number(keys.left) : 0) + joystick.x;
    let iz = (keys ? Number(keys.forward) - Number(keys.backward) : 0) + joystick.y;
    const mag = Math.hypot(ix, iz);
    if (mag > 1) {
      ix /= mag;
      iz /= mag;
    }
    const moving = mag > 0.05;
    const jump = Boolean(keys?.jump || joystick.jump);
    const running = moving && (keys?.run || Math.hypot(joystick.x, joystick.y) > 0.9);
    const speed = running ? RUN_SPEED : WALK_SPEED;

    // Camera-relative direction: forward = away from camera on the ground plane.
    const fx = -Math.sin(orbit.yaw);
    const fz = -Math.cos(orbit.yaw);
    const rx = Math.cos(orbit.yaw);
    const rz = -Math.sin(orbit.yaw);
    const mx = (fx * iz + rx * ix) * speed;
    const mz = (fz * iz + rz * ix) * speed;

    // Sit / emote requests from the HUD.
    const now = clock.elapsedTime;
    const toggleSit = playerActions.toggleSit;
    playerActions.toggleSit = false;
    if (playerActions.emote && !s.seated) s.emote = { name: playerActions.emote, until: now + EMOTE_TIME[playerActions.emote] };
    playerActions.emote = null;
    const seat = !s.seated && toggleSit ? freeSeatNear(s.pos.x, s.pos.z) : null;
    if (seat) {
      s.seated = sitOn(seat, s.pos, s.rotY);
      s.emote = null;
    }

    const seated = s.seated;
    if (seated) {
      // Moving, jumping or the sit key again gets you up (reversing a glide that's still under way);
      // `seat` is set only on the frame you sat down, where the key press must not count again.
      if (!seated.leaving && (moving || jump || (toggleSit && !seat))) {
        // Fully seated, you stand up forward, unless something is in the way;
        // a glide still under way just reverses.
        if (seated.t >= 1) {
          const capsule = collider.current;
          const spot = standSpot(seated, (p) =>
            // Tested a little higher, so sloping ground alone doesn't count as blocked.
            Boolean(
              world.intersectionWithShape(
                { x: p.x, y: p.y + 0.1, z: p.z },
                { x: 0, y: 0, z: 0, w: 1 },
                capsule.shape,
                rapier.QueryFilterFlags.EXCLUDE_SENSORS,
                undefined,
                capsule,
              ),
            ),
          );
          if (spot) seated.from.copy(spot);
        }
        seated.leaving = true;
        seated.t = 1 - seated.t;
      }
      seated.t = Math.min(1, seated.t + dt / SIT_GLIDE);
      const k = MathUtils.smootherstep(seated.t, 0, 1);
      if (seated.leaving) s.pos.lerpVectors(seated.to, seated.from, k);
      else s.pos.lerpVectors(seated.from, seated.to, k);
      body.current.setNextKinematicTranslation(s.pos);
      if (!seated.leaving) s.rotY = lerpAngle(s.rotY, seated.rotY, 1 - Math.exp(-dt * 12));
      s.anim = seated.leaving ? "idle" : "sit";
      if (seated.leaving && seated.t >= 1) {
        s.seated = null;
        s.vy = 0;
        s.airTime = 0;
      }
    } else {
      s.vy -= GRAVITY * dt;
      controller.computeColliderMovement(collider.current, { x: mx * dt, y: s.vy * dt, z: mz * dt });
      const m = controller.computedMovement();
      const grounded = controller.computedGrounded();
      if (grounded) {
        s.vy = jump ? JUMP_SPEED : 0;
        s.jumping = jump;
      }
      s.airTime = grounded ? 0 : s.airTime + dt;

      s.pos.set(s.pos.x + m.x, s.pos.y + m.y, s.pos.z + m.z);
      if (s.pos.y < -10) {
        s.pos.copy(spawn);
        s.vy = 0;
      }
      body.current.setNextKinematicTranslation(s.pos);

      if (moving) s.rotY = lerpAngle(s.rotY, Math.atan2(mx, mz), 1 - Math.exp(-dt * 12));
      // A deliberate jump shows the pose immediately; falling only after a short grace
      // period so stepping off small ledges/stairs doesn't flash it.
      const airborne = s.jumping || s.airTime > 0.15;
      if (moving || airborne || (s.emote && now >= s.emote.until)) s.emote = null;
      s.anim = airborne ? "jump" : moving ? (running ? "run" : "walk") : (s.emote?.name ?? "idle");
    }
    if (visual.current) visual.current.rotation.y = s.rotY;
    if (range.current) range.current.position.set(s.pos.x, s.pos.y - FOOT_OFFSET + 0.02, s.pos.z);

    // Third-person camera.
    tmpTarget.set(s.pos.x, s.pos.y + 0.8, s.pos.z);
    tmpCam.set(
      tmpTarget.x + Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * orbit.dist,
      tmpTarget.y + Math.sin(orbit.pitch) * orbit.dist,
      tmpTarget.z + Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * orbit.dist,
    );
    camera.position.lerp(tmpCam, 1 - Math.exp(-dt * 10));
    camera.lookAt(tmpTarget);

    // Audio listener sits at the avatar's head, facing where the camera looks.
    localPose.position.set(s.pos.x, s.pos.y + 0.5, s.pos.z);
    camera.getWorldDirection(localPose.forward);
    localPose.rotY = s.rotY;

    // HUD state: the Sit button shows near a free seat or while seated. Scanning every seat against every
    // player is the costly part, so only a few times a second.
    if (seatTick(dt)) {
      const seatNearby = !s.seated && freeSeatNear(s.pos.x, s.pos.z) !== null;
      const sitting = !!s.seated && !s.seated.leaving;
      const game = useGame.getState();
      if (seatNearby !== game.seatNearby || sitting !== game.sitting) game.set({ seatNearby, sitting });
    }

    // Network: throttle, and skip when nothing changed. Advancing a fixed
    // schedule (instead of "time since last send") keeps the average rate at
    // MOVE_SEND_HZ even though sends are quantized to frames.
    if (now >= s.nextSend) {
      s.nextSend = Math.max(s.nextSend + 1 / MOVE_SEND_HZ, now);
      const msg = {
        x: +s.pos.x.toFixed(2),
        y: +s.pos.y.toFixed(2),
        z: +s.pos.z.toFixed(2),
        rotY: +s.rotY.toFixed(2),
        anim: s.anim,
      };
      const key = JSON.stringify(msg);
      if (key !== s.lastSent) {
        sendMove({ ...msg, t: Math.round(performance.now()) });
        s.lastSent = key;
      }
    }
  });

  return (
    <>
      <RigidBody ref={body} type="kinematicPosition" colliders={false} position={start.pos.toArray()}>
        <CapsuleCollider ref={collider} args={[0.5, 0.35]} />
        <group ref={visual}>
          <Avatar appearance={appearance} getAnim={() => state.current.anim} local />
        </group>
        {/* Your own nametag isn't shown, so the bubble sits lower than on others. */}
        <PlayerBubble id={selfId} y={0.95} />
      </RigidBody>
      {/* Hearing range: others outside this ring can't hear you (and vice versa). */}
      <group ref={range}>
        <mesh rotation-x={-Math.PI / 2}>
          <ringGeometry args={[AUDIO_MAX_DIST - 0.15, AUDIO_MAX_DIST, 96]} />
          <meshBasicMaterial color="white" transparent opacity={0.35} depthWrite={false} />
        </mesh>
      </group>
    </>
  );
}
