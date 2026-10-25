import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { MathUtils } from "three";
import { useGame } from "../../state/store";

const CAM_MIN_DIST = 3;
const CAM_MAX_DIST = 16;

/** Third-person camera placement around the player. */
export interface Orbit {
  /** Heading (rad); 0 puts the camera on the player's +z side. */
  yaw: number;
  /** Elevation (rad) above the ground plane. */
  pitch: number;
  dist: number;
}

/**
 * Drag to orbit the camera (or, with camera lock on, just move the mouse),
 * wheel to zoom. Returns the orbit, updated in place by the input handlers.
 */
export function useOrbitInput(): Orbit {
  const { gl } = useThree();
  const orbit = useRef<Orbit>({ yaw: 0, pitch: 0.35, dist: 8 }).current;

  useEffect(() => {
    const el = gl.domElement;
    let dragId: number | null = null;
    let lx = 0;
    let ly = 0;
    const locked = () => document.pointerLockElement === el;
    const lock = () => {
      // Rejects (or throws) without a recent user gesture; the next click retries.
      try {
        Promise.resolve(el.requestPointerLock()).catch(() => {});
      } catch {}
    };
    const turn = (dx: number, dy: number) => {
      orbit.yaw -= dx * 0.005;
      orbit.pitch = MathUtils.clamp(orbit.pitch + dy * 0.005, 0.05, 1.3);
    };
    const down = (e: PointerEvent) => {
      if (useGame.getState().camLock && e.pointerType === "mouse") {
        if (!locked()) lock();
        return;
      }
      dragId = e.pointerId;
      lx = e.clientX;
      ly = e.clientY;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== dragId) return;
      turn(e.clientX - lx, e.clientY - ly);
      lx = e.clientX;
      ly = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === dragId) dragId = null;
    };
    const look = (e: MouseEvent) => {
      if (locked()) turn(e.movementX, e.movementY);
    };
    // Release the mouse for chat, the menu, or when the lock is switched off;
    // switching it on (a click or keypress) captures it straight away.
    const unsub = useGame.subscribe((g, prev) => {
      if (g.camLock && !prev.camLock && !g.menuOpen && !g.chatOpen) lock();
      if (locked() && (!g.camLock || g.menuOpen || g.chatOpen)) document.exitPointerLock();
    });
    const wheel = (e: WheelEvent) => {
      orbit.dist = MathUtils.clamp(orbit.dist + e.deltaY * 0.01, CAM_MIN_DIST, CAM_MAX_DIST);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: true });
    document.addEventListener("mousemove", look);
    return () => {
      unsub();
      document.removeEventListener("mousemove", look);
      if (locked()) document.exitPointerLock();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [gl, orbit]);

  return orbit;
}
