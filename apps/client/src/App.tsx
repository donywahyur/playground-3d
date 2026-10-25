import { useEffect, useState } from "react";
import { DEFAULT_APPEARANCE } from "@hangout/shared";
import { joinGame } from "./net/session";
import { useGame } from "./state/store";
import { Hud } from "./ui/hud/Hud";
import { JoinScreen } from "./ui/home/JoinScreen";
import { JumpButton, Joystick } from "./ui/hud/Joystick";
import { lockLandscape } from "./ui/landscape";
import { World } from "./world/World";

export function App() {
  const phase = useGame((s) => s.phase);
  const [appearance, setAppearance] = useState(DEFAULT_APPEARANCE);

  // Lock to landscape on the first tap in game, not on Join: going fullscreen while the mic permission prompt
  // is up makes Android Chrome dismiss it, leaving the player listen-only.
  useEffect(() => {
    if (phase !== "playing") return;
    const lock = () => void lockLandscape();
    document.addEventListener("pointerup", lock, { once: true });
    return () => document.removeEventListener("pointerup", lock);
  }, [phase]);

  // Portrait phones get covered by a "rotate" prompt (CSS only shows it then); tapping it tries the lock.
  const rotate = (
    <div className="rotate-overlay" onClick={lockLandscape}>
      <div className="rotate-icon">📱</div>
      <p>Rotate your phone to landscape</p>
    </div>
  );

  if (phase !== "playing") {
    return (
      <>
        <JoinScreen
          onJoin={(name, look) => {
            setAppearance(look);
            joinGame(name, look);
          }}
        />
        {rotate}
      </>
    );
  }

  return (
    <>
      <World appearance={appearance} />
      <Joystick />
      <JumpButton />
      <Hud />
      {rotate}
    </>
  );
}
