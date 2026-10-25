import { IDLE_AFTER_MS } from "@hangout/shared";

const INPUT_EVENTS = ["keydown", "pointerdown", "pointermove", "mousemove", "wheel", "touchstart"] as const;

/**
 * Watch for input and call `onChange` when the player goes idle or comes
 * back. `active()` counts as input too (e.g. talking into the mic).
 */
export function watchIdle(onChange: (idle: boolean) => void) {
  let last = performance.now();
  let idle = false;
  const set = (v: boolean) => {
    if (v === idle) return;
    idle = v;
    onChange(v);
  };
  const active = () => {
    last = performance.now();
    set(false);
  };
  const check = () => set(document.hidden || performance.now() - last > IDLE_AFTER_MS);
  const visibility = () => (document.hidden ? set(true) : active());

  for (const e of INPUT_EVENTS) window.addEventListener(e, active, { capture: true, passive: true });
  document.addEventListener("visibilitychange", visibility);
  const timer = setInterval(check, 1000);
  return {
    active,
    stop() {
      for (const e of INPUT_EVENTS) window.removeEventListener(e, active, { capture: true });
      document.removeEventListener("visibilitychange", visibility);
      clearInterval(timer);
    },
  };
}
