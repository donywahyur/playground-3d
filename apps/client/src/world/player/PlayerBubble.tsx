import { useEffect, useReducer } from "react";
import { Html } from "@react-three/drei";
import { useShallow } from "zustand/react/shallow";
import { useGame } from "../../state/store";

/** How long (ms) a chat line stays over the speaker: longer lines stay longer. */
const sayTime = (text: string) => Math.min(10_000, 4000 + text.length * 60);

/**
 * Speech bubble over a player: their latest chat line for a few seconds, else
 * "…" while they type, else "zzZ" while idle. `y` is where the bubble's tail
 * points, above the player's origin; the bubble grows upward from there.
 */
export function PlayerBubble({ id, y }: { id: string | null; y: number }) {
  const { idle, typing, said } = useGame(
    useShallow((s) => {
      const p = id ? s.players[id] : undefined;
      return { idle: !!p?.idle, typing: !!p?.typing, said: id ? s.said[id] : undefined };
    }),
  );
  // Re-render when the chat line expires.
  const [, expire] = useReducer((n: number) => n + 1, 0);
  const left = said ? said.at + sayTime(said.text) - performance.now() : 0;
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(expire, left);
    return () => clearTimeout(t);
    // Only a new line restarts the timer.
  }, [said]);

  let content;
  if (said && left > 0) content = <div className="bubble say">{said.text}</div>;
  else if (typing)
    content = (
      <div className="bubble dots" title="Typing">
        <span>•</span>
        <span>•</span>
        <span>•</span>
      </div>
    );
  else if (idle)
    content = (
      <div className="bubble zzz" title="Idle">
        <span>z</span>
        <span>z</span>
        <span>Z</span>
      </div>
    );
  if (!content) return null;
  return (
    <Html position-y={y} distanceFactor={10} zIndexRange={[10, 0]}>
      <div className="bubble-anchor">{content}</div>
    </Html>
  );
}
