import { Suspense, useEffect, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { MathUtils, Vector3, type Group, type PerspectiveCamera } from "three";
import type { Anim, Appearance } from "@hangout/shared";
import { localPose } from "../../state/runtime";
import { useGame } from "../../state/store";
import { canvasOptions, FrameDriver } from "../../world/FrameDriver";
import { CharacterModel, preloadCharacters } from "../../world/character/CharacterModel";
import { DayNight } from "../../world/sky/DayNight";
import { Environment, preloadEnvironment } from "../../world/env/Environment";
import { lerpAngle } from "../../world/math";

/** "face" zooms onto the head for the face pickers; "turn" spins the character while customizing. */
export type HomeFocus = "idle" | "turn" | "face";

/** Where the character stands: in the tent camp east of the plaza, the fire just behind. */
const SPOT = new Vector3(21.6, 0, 9.4);
/** Camera heading from the character (rad); the character faces it. Looks east from the plaza side into the camp. */
const YAW = -1.75;

const VIEWS: Record<HomeFocus, { dist: number; height: number; target: number }> = {
  idle: { dist: 6, height: 2.2, target: 0.9 },
  turn: { dist: 5, height: 1.3, target: 0.75 },
  face: { dist: 3.4, height: 1.05, target: 0.95 },
};

const camPos = new Vector3();
const lookAt = new Vector3();

/**
 * Eases the camera to the current view and shifts its projection so the
 * character sits in the middle of the `stage` element (the part of the screen
 * the menu panel doesn't cover) instead of the middle of the canvas.
 */
function Rig({ focus, stage }: { focus: HomeFocus; stage: RefObject<HTMLElement | null> }) {
  const shift = useRef({ x: 0, y: 0, init: false });
  const target = useRef(new Vector3());
  useFrame(({ camera, size, clock }, dt) => {
    // No stage while the loading screen is up: frame the whole canvas so the scene still draws (and compiles) behind it.
    const r = stage.current?.getBoundingClientRect() ?? { left: 0, top: 0, width: size.width, height: size.height };
    if (!r.width || !r.height) return;
    const k = 1 - Math.exp(-dt * 4);
    const s = shift.current;
    const v = VIEWS[focus];
    // A short stage (phones: a strip above the menu) backs the camera off so the character still fits.
    const dist = v.dist * Math.sqrt(MathUtils.clamp(size.height / r.height, 1, 4));
    // A slow sway on the wide shot so the scene feels alive.
    const yaw = YAW + (focus === "idle" ? Math.sin(clock.elapsedTime * 0.15) * 0.25 : 0);
    camPos.set(SPOT.x + Math.sin(yaw) * dist, SPOT.y + v.height, SPOT.z + Math.cos(yaw) * dist);
    lookAt.set(SPOT.x, SPOT.y + v.target, SPOT.z);
    const x = size.width / 2 - (r.left + r.width / 2);
    const y = size.height / 2 - (r.top + r.height / 2);
    if (!s.init) {
      camera.position.copy(camPos);
      target.current.copy(lookAt);
      Object.assign(s, { x, y, init: true });
    }
    camera.position.lerp(camPos, k);
    camera.lookAt(target.current.lerp(lookAt, k));
    s.x = MathUtils.lerp(s.x, x, k);
    s.y = MathUtils.lerp(s.y, y, k);
    (camera as PerspectiveCamera).setViewOffset(size.width, size.height, s.x, s.y, size.width, size.height);
  });
  return null;
}

function Character({ appearance, focus, anim }: { appearance: Appearance; focus: HomeFocus; anim: RefObject<Anim> }) {
  const group = useRef<Group>(null);
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    if (focus === "turn") g.rotation.y += dt * 0.6;
    else g.rotation.y = lerpAngle(g.rotation.y, YAW + (focus === "idle" ? 0.35 : 0), 1 - Math.exp(-dt * 6));
  });
  return (
    <group ref={group} position={SPOT.toArray()} rotation-y={YAW + 0.35}>
      <CharacterModel appearance={appearance} getAnim={() => anim.current} local />
    </group>
  );
}

/**
 * The join screen's backdrop: the real camp at the current time of day, with
 * the player's character standing by the fire. It also warms the model cache
 * so the world appears at once after joining.
 */
export function HomeScene({
  appearance,
  focus,
  anim,
  stage,
}: {
  appearance: Appearance;
  focus: HomeFocus;
  anim: RefObject<Anim>;
  stage: RefObject<HTMLElement | null>;
}) {
  // Everything the game will need, so the loading screen covers it and joining is instant. Queued during the
  // first render, before any file can finish, so the loading screen's progress counts all of them from the start.
  useState(() => {
    preloadEnvironment();
    preloadCharacters(appearance);
  });
  // Lamps and the sun's shadow area follow the local player; center them on the character.
  useEffect(() => void localPose.position.copy(SPOT), []);
  const quality = useGame((s) => s.quality);
  return (
    <Canvas key={quality} {...canvasOptions(quality)} shadows="percentage" camera={{ fov: 40 }} className="canvas home-canvas">
      <FrameDriver quality={quality} />
      <DayNight />
      <Rig focus={focus} stage={stage} />
      <Suspense fallback={null}>
        {/* Paused: the world's colliders need a physics world, but nothing moves here. */}
        <Physics paused>
          <Environment />
        </Physics>
        <Character appearance={appearance} focus={focus} anim={anim} />
      </Suspense>
    </Canvas>
  );
}
