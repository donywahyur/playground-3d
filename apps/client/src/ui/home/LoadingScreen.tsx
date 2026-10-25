import { useEffect, useRef, useState } from "react";
import { useProgress } from "@react-three/drei";
import { Logo } from "../Logo";

/** Loading must stay idle this long before it counts as done; models load in waves (GLB, then its textures). */
const SETTLE_MS = 400;
/** Matches the fade-out in index.css. */
const FADE_MS = 500;
const TIP_MS = 3500;

const TIPS = [
  "The closer someone is, the louder you hear them.",
  "Press E near a bench, stump or crate to sit.",
  "Keys 1–5 play emotes: wave, dance, cheer, yes, no.",
  "Tab opens the world map.",
  "Shift to run, Space to jump.",
  "Press Enter to chat.",
  "Lamps and campfires light up at night.",
];

/**
 * Covers the join screen while the world and characters load (three's default
 * loading manager, which useGLTF goes through), then fades out and calls onDone.
 */
export function LoadingScreen({ onDone }: { onDone: () => void }) {
  const { active, progress, total } = useProgress();
  const [done, setDone] = useState(false);
  const [gone, setGone] = useState(false);
  const [tip, setTip] = useState(() => Math.floor(Math.random() * TIPS.length));
  // Progress drops back whenever a new batch of files starts; never show it going backwards.
  const shown = useRef(0);
  shown.current = done ? 100 : Math.max(shown.current, progress);

  useEffect(() => {
    if (done || active || total === 0) return;
    const id = setTimeout(() => {
      setDone(true);
      onDone();
    }, SETTLE_MS);
    return () => clearTimeout(id);
  }, [active, total, done, onDone]);

  useEffect(() => {
    if (!done) return;
    const id = setTimeout(() => setGone(true), FADE_MS);
    return () => clearTimeout(id);
  }, [done]);

  useEffect(() => {
    const id = setInterval(() => setTip((t) => (t + 1) % TIPS.length), TIP_MS);
    return () => clearInterval(id);
  }, []);

  if (gone) return null;
  const pct = Math.round(shown.current);
  return (
    <div className={`loading${done ? " done" : ""}`} role="status" aria-live="polite">
      <div className="loading-body">
        <div className="loading-icon" aria-hidden>
          🌳
        </div>
        <Logo />
        <div className="loading-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div style={{ width: `${pct}%` }} />
        </div>
        <p className="muted small">{done ? "Ready" : `Loading the world… ${pct}%`}</p>
      </div>
      <p className="loading-tip muted small" key={tip}>
        Tip: {TIPS[tip]}
      </p>
    </div>
  );
}
