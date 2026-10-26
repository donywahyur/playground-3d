import { useCallback, useEffect, useState } from "react";
import { EMOTES } from "@hangout/shared";
import { enableMic, setMuted } from "../../net/session";
import { playerActions } from "../../state/runtime";
import { canCamLock, isTouch, useGame } from "../../state/store";
import { Clock } from "../Clock";
import { Actions } from "./Actions";
import { Chat } from "./Chat";
import { Menu } from "./Menu";
import { Minimap, WorldMap } from "./Minimap";
import { Ping } from "./Ping";
import { PlayerList, PlayersPopup } from "./PlayerList";

function toggleCamLock() {
  const game = useGame.getState();
  game.setCamLock(!game.camLock);
}

/** Keyboard shortcuts for the HUD; `closeHelp` hides the controls panel once the player opens something. */
function useHudKeys(closeHelp: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const game = useGame.getState();
      if (e.code === "Escape") {
        // Esc inside the chat box just closes the chat (handled there).
        if (e.target instanceof HTMLInputElement && e.target.type === "text") return;
        if (game.mapOpen) return game.set({ mapOpen: false });
        if (game.playersOpen) return game.set({ playersOpen: false });
        game.set({ menuOpen: !game.menuOpen });
        closeHelp();
        return;
      }
      if (e.target instanceof HTMLInputElement) return;
      if (game.menuOpen) return;
      if (e.code === "KeyM") setMuted(!game.muted);
      if (e.code === "KeyL" && canCamLock) toggleCamLock();
      if (e.code === "KeyE") playerActions.toggleSit = true;
      const digit = /^Digit([1-9])$/.exec(e.code);
      const emote = digit && EMOTES[Number(digit[1]) - 1];
      if (emote) playerActions.emote = emote;
      if (e.code === "Tab") {
        e.preventDefault();
        game.set({ mapOpen: !game.mapOpen });
        closeHelp();
      }
      if (e.code === "Enter") {
        e.preventDefault();
        game.set({ chatOpen: true });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeHelp]);
}

export function Hud() {
  const mic = useGame((s) => s.mic);
  const micError = useGame((s) => s.micError);
  const [micWhy, setMicWhy] = useState(false);
  const muted = useGame((s) => s.muted);
  const set = useGame((s) => s.set);
  const menuOpen = useGame((s) => s.menuOpen);
  const mapOpen = useGame((s) => s.mapOpen);
  const playersOpen = useGame((s) => s.playersOpen);
  const camLock = useGame((s) => s.camLock);
  const [help, setHelp] = useState(true);
  const closeHelp = useCallback(() => setHelp(false), []);
  useHudKeys(closeHelp);

  return (
    <div className="hud">
      {!isTouch && <PlayerList />}

      <div className="toolbar">
        <Clock />
        <Ping />
        {mic === "denied" ? (
          <button
            className="pill warn"
            onClick={async () => {
              closeHelp();
              // Retry first (shows the browser's permission prompt if it still can); explain only if that fails.
              setMicWhy(!(await enableMic()));
            }}
            title={micError ?? "Microphone unavailable: tap to try again"}
          >
            🎙️ <span className="pill-label">Listen-only</span>
          </button>
        ) : (
          <button className={`pill${muted ? " warn" : ""}`} onClick={() => setMuted(!muted)} title="Toggle mic (M)">
            {muted ? "🔇" : "🎙️"} <span className="pill-label">{muted ? "Muted" : "Mic on"}</span>
          </button>
        )}
        {canCamLock && (
          <button
            className={`pill${camLock ? " active" : ""}`}
            onClick={toggleCamLock}
            title={camLock ? "Camera lock on: the mouse turns the camera (L)" : "Camera lock off: drag to turn the camera (L)"}
            aria-pressed={camLock}
          >
            {camLock ? "🔒 Mouse look" : "🖱️ Drag look"}
          </button>
        )}
        <button
          className={`pill${mapOpen ? " active" : ""}`}
          onClick={() => {
            set({ mapOpen: !mapOpen, menuOpen: false, playersOpen: false });
            closeHelp();
          }}
          title="Map (Tab)"
          aria-label="Map"
          aria-expanded={mapOpen}
        >
          🗺️
        </button>
        <button className="pill" onClick={() => setHelp((h) => !h)} title="Controls">
          ?
        </button>
        <button
          className={`pill${menuOpen ? " active" : ""}`}
          onClick={() => {
            set({ menuOpen: !menuOpen, mapOpen: false, playersOpen: false });
            closeHelp();
          }}
          title="Menu (Esc)"
          aria-label="Menu"
          aria-expanded={menuOpen}
        >
          ☰
        </button>
      </div>

      {micWhy && micError && (
        <div className="panel help" onClick={() => setMicWhy(false)}>
          <div className="panel-title">Listen-only</div>
          <div>{micError}</div>
          <div className="muted small">Tap 🎙️ to try again.</div>
        </div>
      )}
      {menuOpen && <Menu />}
      {playersOpen && <PlayersPopup />}
      {mapOpen && <WorldMap />}

      {help && !menuOpen && !playersOpen && (
        <div className="panel help" onClick={closeHelp}>
          <div className="panel-title">Controls</div>
          <div>WASD / arrows: move · Shift: run · Space: jump</div>
          <div>{camLock ? "Mouse: rotate camera (click to capture)" : "Drag: rotate camera"} · Scroll: zoom</div>
          {canCamLock && <div>L: toggle camera lock</div>}
          <div>E: sit (near a seat) · 1-5: emotes</div>
          <div>M: mute · Tab: map · Enter: chat · Esc: menu</div>
          <div className="muted small">The white ring is your hearing range.</div>
        </div>
      )}

      <Actions />
      <Minimap />
      <Chat />
    </div>
  );
}
