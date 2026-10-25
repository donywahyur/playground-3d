import { useEffect, useState } from "react";
import { PALETTE_SIZE, type Appearance } from "@hangout/shared";
import { ACCENT } from "./catalog";
import { paletteSamplePoint } from "./recolor";

const COLORMAP_URL = "/characters/Textures/colormap.png";
let cached: string[] | null = null;

/** Palette color ids that look like skin tones (cream + Kenney's three skin pairs). */
export const SKIN_IDS = [0, 13, 14, 15];
export const ALL_IDS = Array.from({ length: PALETTE_SIZE }, (_, i) => i);

/** A player's color in lists and on the map: their top color, else the character's accent. */
export const playerColor = (a: Appearance, palette: string[] | null) => (a.top >= 0 && palette ? palette[a.top] : ACCENT[a.character]);

/** Hex swatch per palette color id, sampled from a loaded colormap image (cached after the first call). */
export function paletteFrom(img: CanvasImageSource & { width: number; height: number }) {
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  cached = Array.from({ length: PALETTE_SIZE }, (_, id) => {
    const { x, y } = paletteSamplePoint(id);
    const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
    return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  });
  return cached;
}

/** Hex swatch per palette color id, sampled from the characters' colormap. */
export function usePalette() {
  const [colors, setColors] = useState<string[] | null>(cached);
  useEffect(() => {
    if (cached) return;
    const img = new Image();
    img.onload = () => setColors(paletteFrom(img));
    img.src = COLORMAP_URL;
  }, []);
  return colors;
}
