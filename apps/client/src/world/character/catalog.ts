import type { CharacterId } from "@hangout/shared";

// Kenney "Mini Characters" (CC0, www.kenney.nl). The GLBs load their texture
// from ./Textures/colormap.png next to them.
export const modelUrl = (id: CharacterId) => `/characters/character-${id}.glb`;
export const previewUrl = (id: CharacterId) => `/characters/previews/character-${id}.png`;
/** Head close-up for the hairstyle picker, rendered by scripts/hair-thumbs.mjs. */
export const hairPreviewUrl = (id: CharacterId) => `/characters/previews/hair-${id}.png`;

/** Accent color per character, used for the player-list dot. Roughly matches each outfit. */
export const ACCENT: Record<CharacterId, string> = {
  "female-a": "#9b59d0",
  "female-b": "#e8a33d",
  "female-c": "#e0663e",
  "female-d": "#5f6b7a",
  "female-e": "#4a90d9",
  "female-f": "#c0573c",
  "male-a": "#4a7fd0",
  "male-b": "#3d9d6a",
  "male-c": "#3c4f8f",
  "male-d": "#e07a3e",
  "male-e": "#3a3a46",
  "male-f": "#d9b23a",
};
