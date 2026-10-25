export enum Controls {
  forward = "forward",
  backward = "backward",
  left = "left",
  right = "right",
  run = "run",
  jump = "jump",
}

/**
 * drei's KeyboardControls only clears a key on `keyup`. A context menu, alt-tab
 * or tab switch swallows that event and leaves the player walking forever, so
 * we fake a `keyup` for every mapped key whenever focus is lost.
 */
export function releaseAllKeys() {
  for (const { keys } of keyMap) {
    for (const code of keys) window.dispatchEvent(new KeyboardEvent("keyup", { code, key: code }));
  }
}

export const keyMap = [
  { name: Controls.forward, keys: ["ArrowUp", "KeyW"] },
  { name: Controls.backward, keys: ["ArrowDown", "KeyS"] },
  { name: Controls.left, keys: ["ArrowLeft", "KeyA"] },
  { name: Controls.right, keys: ["ArrowRight", "KeyD"] },
  { name: Controls.run, keys: ["ShiftLeft", "ShiftRight"] },
  { name: Controls.jump, keys: ["Space"] },
];
