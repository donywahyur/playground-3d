import { useEffect, useRef } from "react";
import nipplejs from "nipplejs";
import { joystick } from "../../state/runtime";
import { isTouch, useGame } from "../../state/store";

/**
 * Touch-only joystick on the left half of the screen; the right half orbits the camera. Fixed sits in the
 * bottom-left corner, flexible appears under the thumb. See-through so it doesn't hide the world.
 */
export function Joystick() {
  const zone = useRef<HTMLDivElement>(null);
  const fixed = useGame((s) => s.joystickFixed);

  useEffect(() => {
    if (!zone.current || !isTouch) return;
    const manager = nipplejs.create({
      zone: zone.current,
      mode: fixed ? "static" : "dynamic",
      position: { left: "96px", bottom: "96px" },
      color: { front: "rgba(255, 255, 255, 0.35)", back: "rgba(255, 255, 255, 0.12)" },
      restOpacity: 0.6,
    });
    manager.on("move", (evt) => {
      const { vector, force } = evt.data;
      const scale = Math.min(force, 1);
      joystick.x = vector.x * scale;
      joystick.y = vector.y * scale;
    });
    manager.on("end", () => {
      joystick.x = 0;
      joystick.y = 0;
    });
    return () => {
      manager.destroy();
      joystick.x = 0;
      joystick.y = 0;
    };
  }, [fixed]);

  return <div ref={zone} className="joystick-zone" />;
}

/** Touch-only jump button, bottom right under the right thumb; holding it keeps hopping, like holding Space. */
export function JumpButton() {
  const hold = (on: boolean) => () => void (joystick.jump = on);
  useEffect(() => () => void (joystick.jump = false), []);
  return (
    <button
      className="jump-button"
      onPointerDown={hold(true)}
      onPointerUp={hold(false)}
      onPointerCancel={hold(false)}
      onPointerLeave={hold(false)}
      onContextMenu={(e) => e.preventDefault()}
      aria-label="Jump"
    >
      ⤒
    </button>
  );
}
