/** Phones play in landscape: the HUD and joystick are laid out for a wide screen. */
const isPhone = () => matchMedia("(pointer: coarse)").matches;

/**
 * Goes fullscreen and locks the screen to landscape. Must run inside a user gesture. Android browsers only
 * allow the lock while fullscreen; iOS supports neither, so there the rotate overlay (`.rotate-overlay`) asks instead.
 */
export async function lockLandscape() {
  if (!isPhone()) return;
  const orientation = screen.orientation as ScreenOrientation & { lock?: (o: "landscape") => Promise<void> };
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.({ navigationUI: "hide" });
    await orientation.lock?.("landscape");
  } catch {}
}
