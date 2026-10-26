import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { KeyboardControls } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import type { Appearance } from "@hangout/shared";
import { getSpatial, updateVoiceRange } from "../net/session";
import { localPose, remotePositions, resumePose } from "../state/runtime";
import { useGame } from "../state/store";
import { canvasOptions, FrameDriver } from "./FrameDriver";
import { ticker } from "./math";
import { preloadCharacters } from "./character/CharacterModel";
import { keyMap, releaseAllKeys } from "./player/controls";
import { DayNight } from "./sky/DayNight";
import { Environment, preloadEnvironment } from "./env/Environment";
import { LocalPlayer } from "./player/LocalPlayer";
import { RemotePlayers } from "./player/RemotePlayers";

/** Prevents stuck movement keys when focus leaves the game (see releaseAllKeys). */
function useReleaseKeysOnFocusLoss() {
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      // No browser menu over the 3D view; right-drag orbits the camera instead.
      if (e.target instanceof HTMLCanvasElement) e.preventDefault();
      releaseAllKeys();
    };
    const onVisibility = () => document.hidden && releaseAllKeys();
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("blur", releaseAllKeys);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("blur", releaseAllKeys);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
}

/**
 * Pushes listener + remote positions into the spatial audio graph (its 50 ms smoothing hides the 20 Hz steps),
 * and starts/stops sending voice to each player as they come in and out of earshot.
 */
function AudioSync() {
  const [spatialTick, rangeTick] = useMemo(() => [ticker(20), ticker(4)], []);
  useFrame((_, delta) => {
    if (spatialTick(delta)) getSpatial()?.update(localPose.position, localPose.forward, remotePositions);
    if (rangeTick(delta)) updateVoiceRange(localPose.position);
  });
  return null;
}

export function World({ appearance }: { appearance: Appearance }) {
  useReleaseKeysOnFocusLoss();
  useEffect(() => preloadCharacters(appearance), [appearance]);
  useEffect(preloadEnvironment, []);
  const quality = useGame((s) => s.quality);
  // A quality change remounts the canvas, and with it the local player: keep them where they stand.
  const shownQuality = useRef(quality);
  if (shownQuality.current !== quality) {
    shownQuality.current = quality;
    resumePose.pos = localPose.position.clone().setY(localPose.position.y - 0.5);
    resumePose.rotY = localPose.rotY;
  }
  return (
    <KeyboardControls map={keyMap}>
      <Canvas
        key={quality}
        {...canvasOptions(quality)}
        shadows="percentage"
        camera={{ fov: 55, position: [0, 6, 10] }}
        className="canvas"
        // Dev-only handle for the e2e scripts (renderer stats in e2e:perf).
        onCreated={(state) => import.meta.env.DEV && Object.assign(window, { __three: state })}
      >
        <FrameDriver quality={quality} watchSlow />
        <DayNight />
        <Suspense fallback={null}>
          {/* "vary" steps once per rendered frame, matching the kinematic controller updates. */}
          <Physics timeStep="vary">
            <Environment />
            <LocalPlayer appearance={appearance} />
          </Physics>
          <RemotePlayers />
          <AudioSync />
        </Suspense>
      </Canvas>
    </KeyboardControls>
  );
}
