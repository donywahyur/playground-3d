import { useEffect, useState } from "react";
import type { ServerStatus } from "@hangout/shared";
import { BUILD_ID, STATUS_URL } from "../../config";

/**
 * ok: the server answers and runs this client's build.
 * updating: it runs a different build (an update is half deployed: one side is new, the other isn't yet).
 * offline: no answer (restarting during a deploy, or down).
 */
export type ServerState = "checking" | "ok" | "updating" | "offline";

export const UPDATING_MESSAGE = "An update is being installed. Joining opens again in a minute or two.";

const POLL_MS = 5000;
const TIMEOUT_MS = 4000;

/** Polls the game server's /status while the join screen is open. */
export function useServerStatus(): ServerState {
  const [state, setState] = useState<ServerState>("checking");
  useEffect(() => {
    let stopped = false;
    let timer = 0;
    const check = async () => {
      let next: ServerState;
      try {
        const res = await fetch(STATUS_URL, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
        const { build } = (await res.json()) as ServerStatus;
        next = build === BUILD_ID ? "ok" : "updating";
      } catch {
        next = "offline";
      }
      if (stopped) return;
      setState(next);
      timer = window.setTimeout(check, POLL_MS);
    };
    check();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);
  return state;
}
