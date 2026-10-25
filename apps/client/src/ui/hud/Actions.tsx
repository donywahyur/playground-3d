import { useState } from "react";
import { EMOTES, type Emote } from "@hangout/shared";
import { playerActions } from "../../state/runtime";
import { useGame } from "../../state/store";

const EMOTE_ICON: Record<Emote, string> = { wave: "👋", dance: "💃", cheer: "🙌", yes: "👍", no: "👎" };

/** Sit (near a seat) and emote buttons; the keyboard does the same with E and 1-5. */
export function Actions() {
  const seatNearby = useGame((s) => s.seatNearby);
  const sitting = useGame((s) => s.sitting);
  const [tray, setTray] = useState(false);
  return (
    <div className="actions">
      {(seatNearby || sitting) && (
        <button className="pill" onClick={() => (playerActions.toggleSit = true)} title="Sit or stand up (E)">
          {sitting ? "Stand up" : "🪑 Sit"}
        </button>
      )}
      {!sitting && (
        <div className="emote-row">
          {tray &&
            EMOTES.map((e, i) => (
              <button
                key={e}
                className="pill emote"
                onClick={() => {
                  playerActions.emote = e;
                  setTray(false);
                }}
                title={`${e[0].toUpperCase() + e.slice(1)} (${i + 1})`}
                aria-label={e}
              >
                {EMOTE_ICON[e]}
              </button>
            ))}
          <button className={`pill emote${tray ? " active" : ""}`} onClick={() => setTray((t) => !t)} title="Emotes (1-5)" aria-label="Emotes" aria-expanded={tray}>
            😀
          </button>
        </div>
      )}
    </div>
  );
}
