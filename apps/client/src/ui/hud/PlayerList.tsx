import { useState } from "react";
import { useGame } from "../../state/store";
import { playerColor, usePalette } from "../../world/character/palette";

/** Everyone in the room, with a dot that lights up while they talk. */
export function PlayerRows() {
  const players = useGame((s) => s.players);
  const selfId = useGame((s) => s.selfId);
  const palette = usePalette();
  return Object.values(players).map((p) => (
    <div key={p.id} className="player-row">
      <span className={`dot${p.speaking && !p.muted ? " speaking" : ""}`} style={{ background: playerColor(p.appearance, palette) }} />
      {p.name}
      {p.id === selfId && <span className="muted"> (you)</span>}
      {p.muted && " 🔇"}
    </div>
  ));
}

/** Touch screens: the list as a popup, opened from the menu. */
export function PlayersPopup() {
  const count = useGame((s) => Object.keys(s.players).length);
  const set = useGame((s) => s.set);
  return (
    <div className="panel menu" role="dialog" aria-label="Players">
      <div className="menu-header">
        <span className="panel-title">Players ({count})</span>
        <button className="icon-btn" onClick={() => set({ playersOpen: false })} aria-label="Close players">
          ✕
        </button>
      </div>
      <div className="menu-players">
        <PlayerRows />
      </div>
    </div>
  );
}

/** Collapsible players panel, top left. Touch screens show the list in the menu instead (see Menu.tsx). */
export function PlayerList() {
  const count = useGame((s) => Object.keys(s.players).length);
  const [open, setOpen] = useState(true);
  return (
    <div className="panel players">
      <button type="button" className="panel-title players-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Players ({count}) {open ? "▾" : "▸"}
      </button>
      {open && <PlayerRows />}
    </div>
  );
}
