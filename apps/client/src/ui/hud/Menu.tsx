import { leaveGame, setVolume } from "../../net/session";
import { isTouch, useGame } from "../../state/store";

export function Menu() {
  const volume = useGame((s) => s.volume);
  const set = useGame((s) => s.set);
  const joystickFixed = useGame((s) => s.joystickFixed);
  const setJoystickFixed = useGame((s) => s.setJoystickFixed);
  const playerCount = useGame((s) => Object.keys(s.players).length);
  const pct = Math.round(volume * 100);

  return (
    <div className="panel menu" role="dialog" aria-label="Menu">
      <div className="menu-header">
        <span className="panel-title">Menu</span>
        <button className="icon-btn" onClick={() => set({ menuOpen: false })} aria-label="Close menu">
          ✕
        </button>
      </div>

      {isTouch && (
        <button className="secondary" onClick={() => set({ menuOpen: false, playersOpen: true })}>
          👥 Players ({playerCount})
        </button>
      )}

      <label className="menu-row">
        <span className="menu-label">
          Voice volume <span className="muted">{pct}%</span>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={pct}
          onChange={(e) => setVolume(Number(e.target.value) / 100)}
        />
      </label>

      {isTouch && (
        <div className="menu-row">
          <span className="menu-label">Joystick</span>
          <div className="segmented" role="tablist" aria-label="Joystick">
            {([false, true] as const).map((f) => (
              <button
                key={String(f)}
                type="button"
                role="tab"
                aria-selected={joystickFixed === f}
                className={joystickFixed === f ? "selected" : ""}
                onClick={() => setJoystickFixed(f)}
              >
                {f ? "Fixed" : "Flexible"}
              </button>
            ))}
          </div>
        </div>
      )}

      <button className="danger" onClick={leaveGame}>
        Exit game
      </button>
      <div className="muted small">Esc to close</div>
    </div>
  );
}
