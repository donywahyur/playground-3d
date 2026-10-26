import { useEffect, useState } from "react";
import { pingServer } from "../../net/session";

const INTERVAL_MS = 2000;
/** Round trips this slow (ms) show in red. */
const SLOW_MS = 250;

/** Round trip to the game server, refreshed every couple of seconds; "…" until the first reply or while one is overdue. */
export function Ping() {
  const [ms, setMs] = useState<number | null>(null);
  const [overdue, setOverdue] = useState(false);
  useEffect(() => {
    let lastPong = performance.now();
    const ping = () => {
      // A hidden tab's timers are throttled, which would read as lag.
      if (document.hidden) {
        lastPong = performance.now();
        return;
      }
      if (performance.now() - lastPong > INTERVAL_MS * 2) setOverdue(true);
      pingServer((rtt) => {
        lastPong = performance.now();
        setMs(Math.round(rtt));
        setOverdue(false);
      });
    };
    ping();
    const id = setInterval(ping, INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
  const label = ms === null || overdue ? "…" : `${ms} ms`;
  return (
    <span className={`pill ping${overdue || (ms ?? 0) >= SLOW_MS ? " warn" : ""}`} title="Ping: round trip to the game server">
      📶 {label}
    </span>
  );
}
