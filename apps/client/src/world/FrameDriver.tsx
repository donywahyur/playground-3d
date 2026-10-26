import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { activity } from "../state/runtime";
import { useGame, type Quality } from "../state/store";

/** Frame rate caps. Uncapped, a 120 Hz screen renders twice as often as a 60 Hz one for no gain here. */
export const MAX_FPS: Record<Quality, number> = { high: 60, low: 30 };
/** While idle (no input for a while) the world still moves, but nobody is looking closely. */
const IDLE_FPS = 15;

/** Auto quality: a window this long (ms) below SLOW_RATIO of the cap counts as slow; two in a row switch to Low. */
const SLOW_WINDOW = 5000;
const SLOW_RATIO = 0.66;
/** Ignore the first seconds: loading and shader compiles stall frames. */
const WARMUP = 10_000;

/**
 * Renders the canvas (frameloop="never") at most `MAX_FPS[quality]` times a second, IDLE_FPS while idle.
 * With `watchSlow`, also reports a frame rate that stays well below the cap (Auto quality then goes Low).
 */
export function FrameDriver({ quality, watchSlow = false }: { quality: Quality; watchSlow?: boolean }) {
  const advance = useThree((s) => s.advance);
  useEffect(() => {
    let raf = 0;
    let start = -1;
    let last = -Infinity;
    let windowStart = 0;
    let frames = 0;
    let slowWindows = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (start < 0) start = windowStart = now;
      const fps = activity.idle ? IDLE_FPS : MAX_FPS[quality];
      // A little slack so display jitter doesn't skip a frame we meant to draw.
      if (now - last < 1000 / fps - 2) return;
      // A long gap (hidden tab) restarts the slow-frame window.
      if (now - last > 1000) windowStart = now;
      last = now;
      advance((now - start) / 1000);

      frames++;
      if (now - windowStart < SLOW_WINDOW) return;
      const slow = frames < ((now - windowStart) / 1000) * fps * SLOW_RATIO;
      slowWindows = slow ? slowWindows + 1 : 0;
      if (watchSlow && slowWindows >= 2 && now - start > WARMUP && quality === "high" && !useGame.getState().autoLow) {
        useGame.getState().reportSlow();
      }
      windowStart = now;
      frames = 0;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [advance, quality, watchSlow]);
  return null;
}

/** Canvas options per quality; the canvas must remount (key it by quality) for the GL options to apply. */
export function canvasOptions(quality: Quality) {
  const high = quality === "high";
  return {
    frameloop: "never" as const,
    // High caps DPR at 1.5: on retina screens full 2x quadruples fill cost for little visible gain.
    dpr: high ? ([1, 1.5] as [number, number]) : 1,
    gl: { antialias: high, powerPreference: high ? ("high-performance" as const) : ("low-power" as const) },
  };
}
