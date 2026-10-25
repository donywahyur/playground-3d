import type { IceServer } from "@hangout/shared";

const KEY_ID = process.env.CF_TURN_KEY_ID;
const API_TOKEN = process.env.CF_TURN_API_TOKEN;
// Longer than any session: active players are never signed out.
const TTL_SECONDS = 24 * 3600;

/**
 * Mints short-lived Cloudflare TURN credentials for one player.
 * Returns [] when TURN isn't configured or the API call fails; clients then fall back to STUN only.
 */
export async function createIceServers(): Promise<IceServer[]> {
  if (!KEY_ID || !API_TOKEN) return [];
  try {
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${KEY_ID}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${API_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ttl: TTL_SECONDS }),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { iceServers } = (await res.json()) as { iceServers: IceServer[] };
    // Browsers block port 53, so those URLs only wait for a timeout.
    return iceServers.map((s) => ({
      ...s,
      urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => !/:53(\?|$)/.test(u)),
    }));
  } catch (err) {
    console.warn("[turn] could not create Cloudflare TURN credentials", err);
    return [];
  }
}
