import { Suspense, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { KeyboardControls } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import type { Appearance } from "@hangout/shared";
import { getSpatial } from "../net/session";
import { localPose, remotePositions } from "../state/runtime";
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

/** Pushes listener + remote positions into the spatial audio graph each frame. */
function AudioSync() {
  useFrame(() => getSpatial()?.update(localPose.position, localPose.forward, remotePositions));
  return null;
}

export function World({ appearance }: { appearance: Appearance }) {
  useReleaseKeysOnFocusLoss();
  useEffect(preloadCharacters, []);
  useEffect(preloadEnvironment, []);
  return (
    <KeyboardControls map={keyMap}>
      {/* DPR capped at 1.5: on retina screens full 2x quadruples fill cost for little visible gain. */}
      <Canvas
        shadows="percentage"
        dpr={[1, 1.5]}
        camera={{ fov: 55, position: [0, 6, 10] }}
        className="canvas"
        // Dev-only handle for the e2e scripts (renderer stats in e2e:perf).
        onCreated={(state) => import.meta.env.DEV && Object.assign(window, { __three: state })}
      >
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
