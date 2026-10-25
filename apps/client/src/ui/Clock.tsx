import { useEffect, useState } from "react";
import { clockTime } from "../world/sky/daytime";

/** In-game time of day, shared by every player. */
export function Clock() {
  const [time, setTime] = useState(clockTime);
  useEffect(() => {
    // An in-game minute is under a second, so refresh twice a second.
    const id = setInterval(() => setTime(clockTime()), 500);
    return () => clearInterval(id);
  }, []);
  const label = `${String(time.h).padStart(2, "0")}:${String(time.m).padStart(2, "0")}`;
  return (
    <span className="pill clock" title="Time of day">
      {time.day ? "☀️" : "🌙"} {label}
    </span>
  );
}
