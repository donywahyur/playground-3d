import { fromWire, MOVE_SEND_HZ, PATCH_HZ, type WirePose } from "@hangout/shared";
import { remoteSnapshots, type NetPlayer } from "../state/runtime";

const SEND_MS = 1000 / MOVE_SEND_HZ;
/**
 * Remote players are drawn this far behind their latest pose so there are
 * (almost) always two poses to interpolate between. Two patch intervals absorb
 * a late or dropped patch without freezing.
 */
const INTERP_DELAY_MS = (1000 / PATCH_HZ) * 2;
const KEEP_MS = 1000;
/** A gap this long between poses means the sender stood still (it skips unchanged poses). */
const IDLE_MS = SEND_MS * 5;
/** Smoothing for the clock offset estimate; low so network jitter averages out. */
const OFFSET_SMOOTHING = 0.05;

/**
 * Per player: local time minus sender time, averaged. Poses are interpolated on
 * the sender's clock (when each was sampled), not on patch arrival time, which
 * jitters by up to a patch interval because send and patch clocks drift.
 */
const clockOffset = new Map<string, number>();

/** Record a remote player's state after a server patch. */
export function pushSnapshot(id: string, p: WirePose, now: number) {
  if (!p.t) return; // spawned, no move yet: the live state is drawn as-is (see sampleSnapshots)
  let buf = remoteSnapshots.get(id);
  if (!buf) remoteSnapshots.set(id, (buf = []));
  const last = buf[buf.length - 1];
  if (last && p.t <= last.t) return; // patch didn't carry a new move for this player

  const off = clockOffset.get(id);
  clockOffset.set(id, off === undefined ? now - p.t : off + (now - p.t - off) * OFFSET_SMOOTHING);

  // After standing still, the previous pose is old; re-stamp it one send
  // earlier so the first step is interpolated over one send interval, not
  // crawled over the whole idle time.
  if (last && p.t - last.t > IDLE_MS) buf.push({ ...last, t: p.t - SEND_MS });
  buf.push(fromWire(p));
  while (buf.length > 2 && buf[1].t < p.t - KEEP_MS) buf.shift();
}

export function forgetSnapshots(id?: string) {
  if (id === undefined) {
    remoteSnapshots.clear();
    clockOffset.clear();
  } else {
    remoteSnapshots.delete(id);
    clockOffset.delete(id);
  }
}

/**
 * Pose to draw at local time `now` (ms): the two poses around it and the blend
 * factor between them. Holds the newest pose when the render time is past it.
 */
export function sampleSnapshots(id: string, now: number): { a: NetPlayer; b: NetPlayer; alpha: number } | null {
  const buf = remoteSnapshots.get(id);
  const off = clockOffset.get(id);
  if (!buf?.length || off === undefined) return null;
  const t = now - off - INTERP_DELAY_MS;
  let i = buf.length - 1;
  while (i > 0 && buf[i - 1].t > t) i--;
  const b = buf[i];
  const a = i > 0 ? buf[i - 1] : b;
  const alpha = b === a || t >= b.t ? 1 : Math.max(0, (t - a.t) / (b.t - a.t));
  return { a, b, alpha };
}
