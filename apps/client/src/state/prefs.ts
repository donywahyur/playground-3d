/**
 * Per-browser settings in localStorage. Storage can be blocked or full
 * (private windows, embedded previews), so reads fall back and writes are
 * best-effort.
 */
export const PREF = {
  name: "hangout:name",
  appearance: "hangout:appearance",
  volume: "hangout:volume",
  camLock: "hangout:camLock",
  mapNorthUp: "hangout:mapNorthUp",
  joystickFixed: "hangout:joystickFixed",
  quality: "hangout:quality",
} as const;
type PrefKey = (typeof PREF)[keyof typeof PREF];

export function loadPref(key: PrefKey): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function savePref(key: PrefKey, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export const loadFlag = (key: PrefKey) => loadPref(key) === "1";
export const saveFlag = (key: PrefKey, on: boolean) => savePref(key, on ? "1" : "0");
