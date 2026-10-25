/** Playable characters (Kenney "Mini Characters", CC0). Files: public/characters/character-<id>.glb */
export const CHARACTERS = [
  "female-a",
  "female-b",
  "female-c",
  "female-d",
  "female-e",
  "female-f",
  "male-a",
  "male-b",
  "male-c",
  "male-d",
  "male-e",
  "male-f",
] as const;
export type CharacterId = (typeof CHARACTERS)[number];

/** Recolorable parts. Each value is a palette color id 0..15, or -1 to keep the character's original color. */
export const COLOR_PARTS = ["skin", "hair", "top", "dress", "bottom", "shoes"] as const;
export type ColorPart = (typeof COLOR_PARTS)[number];
export const PALETTE_SIZE = 16;

/**
 * Drawn face layers (client: world/character/face.ts) and how many styles each
 * has. A value is a style index, or -1 for the default: the head's own eyes,
 * a smile, bare cheeks.
 */
export const FACE_STYLES = { eyes: 9, mouth: 8, cheeks: 4 } as const;
export type FacePart = keyof typeof FACE_STYLES;
export const FACE_PARTS = Object.keys(FACE_STYLES) as FacePart[];

/**
 * `character` supplies the outfit (body mesh); `hairstyle` the head (hair,
 * glasses, beard) from any character; the face is drawn on top of it.
 */
export type Appearance = { character: CharacterId; hairstyle: CharacterId } & Record<ColorPart, number> &
  Record<FacePart, number> & {
    /** Palette color id of the eyes, or -1 for the usual dark ink. */
    eyeColor: number;
  };

export const DEFAULT_APPEARANCE: Appearance = {
  character: "female-a",
  hairstyle: "female-a",
  skin: -1,
  hair: -1,
  top: -1,
  dress: -1,
  bottom: -1,
  shoes: -1,
  eyes: -1,
  mouth: -1,
  cheeks: -1,
  eyeColor: -1,
};

const inRange = (v: unknown, max: number): v is number => Number.isInteger(v) && (v as number) >= -1 && (v as number) < max;

/** A valid Appearance from untrusted input; anything missing or out of range falls back to the default. */
export function sanitizeAppearance(a: Partial<Appearance> | undefined): Appearance {
  const out: Appearance = { ...DEFAULT_APPEARANCE };
  out.character = CHARACTERS.find((c) => c === a?.character) ?? DEFAULT_APPEARANCE.character;
  out.hairstyle = CHARACTERS.find((c) => c === a?.hairstyle) ?? out.character;
  for (const part of COLOR_PARTS) if (inRange(a?.[part], PALETTE_SIZE)) out[part] = a[part];
  for (const part of FACE_PARTS) if (inRange(a?.[part], FACE_STYLES[part])) out[part] = a[part];
  if (inRange(a?.eyeColor, PALETTE_SIZE)) out.eyeColor = a.eyeColor;
  return out;
}

/** Characters wearing a skirt or dress; "dress" only applies to these. */
export const DRESS_CHARACTERS: readonly CharacterId[] = ["female-c", "female-d"];
export const hasDress = (c: CharacterId) => DRESS_CHARACTERS.includes(c);
