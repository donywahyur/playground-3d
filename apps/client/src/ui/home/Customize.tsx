import { useState } from "react";
import { CHARACTERS, COLOR_PARTS, FACE_PARTS, hasDress, type Appearance, type CharacterId, type ColorPart, type FacePart } from "@hangout/shared";
import { hairPreviewUrl, previewUrl } from "../../world/character/catalog";
import { faceInk, faceStyle, faceStyleNames, faceThumb } from "../../world/character/face";
import { ALL_IDS, SKIN_IDS, usePalette } from "../../world/character/palette";

const PART_LABEL: Record<ColorPart, string> = {
  skin: "Skin",
  hair: "Hair",
  top: "Top",
  dress: "Dress",
  bottom: "Bottom",
  shoes: "Shoes",
};

const FACE_LABEL: Record<FacePart, string> = { eyes: "Eyes", mouth: "Mouth", cheeks: "Cheeks" };

type Gender = "male" | "female";
const GENDERS: Gender[] = ["male", "female"];
const genderOf = (c: CharacterId): Gender => (c.startsWith("male") ? "male" : "female");

/** What a character tile picks: the whole look, or just its outfit or hairstyle; or the face pickers. */
export type PickMode = "character" | "outfit" | "hairstyle" | "face";
const PICK_MODES: { mode: PickMode; label: string }[] = [
  { mode: "character", label: "Character" },
  { mode: "outfit", label: "Outfit" },
  { mode: "hairstyle", label: "Hairstyle" },
  { mode: "face", label: "Face" },
];

interface ColorRowProps {
  label: string;
  ids: number[];
  value: number;
  palette: string[];
  onChange: (v: number) => void;
}

function ColorRow({ label, ids, value, palette, onChange }: ColorRowProps) {
  return (
    <div className="color-row">
      <span>{label}</span>
      <div className="swatches" role="radiogroup" aria-label={label}>
        <button
          type="button"
          role="radio"
          aria-checked={value === -1}
          aria-label="Original"
          title="Original"
          className={`swatch original${value === -1 ? " selected" : ""}`}
          onClick={() => onChange(-1)}
        />
        {ids.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            aria-label={`${label} color ${id}`}
            className={`swatch${value === id ? " selected" : ""}`}
            style={{ background: palette[id] }}
            onClick={() => onChange(id)}
          />
        ))}
      </div>
    </div>
  );
}

/** Eyes, mouth and cheeks as thumbnail tiles, plus the eye color. */
function FacePicker({ look, update, palette }: { look: Appearance; update: (p: Partial<Appearance>) => void; palette: string[] }) {
  const ink = faceInk(palette);
  const colors = { skin: palette[look.skin >= 0 ? look.skin : SKIN_IDS[1]], eyes: look.eyeColor >= 0 ? palette[look.eyeColor] : ink, ink };
  return (
    <>
      {FACE_PARTS.map((part) => {
        const names = faceStyleNames(part);
        const shown = faceStyle(look, part);
        // Cheeks can be left bare; eyes and mouth always show something.
        const options = part === "cheeks" ? [-1, ...names.keys()] : [...names.keys()];
        return (
          <div className="field" key={part}>
            <span>{FACE_LABEL[part]}</span>
            <div className="face-grid" role="radiogroup" aria-label={FACE_LABEL[part]}>
              {options.map((i) => (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={shown === i}
                  aria-label={i < 0 ? "None" : names[i]}
                  title={i < 0 ? "None" : names[i]}
                  className={`face-tile${shown === i ? " selected" : ""}`}
                  onClick={() => update({ [part]: i })}
                >
                  <img src={faceThumb(part, i, colors)} alt="" draggable={false} />
                </button>
              ))}
            </div>
            {part === "eyes" && (
              <ColorRow label="Eye color" ids={ALL_IDS} value={look.eyeColor} palette={palette} onChange={(v) => update({ eyeColor: v })} />
            )}
          </div>
        );
      })}
    </>
  );
}

/** Submenu: Male/Female tabs with that gender's characters (or the face pickers), then colors. */
export function Customize({
  look,
  update,
  mode,
  setMode,
  onDone,
}: {
  look: Appearance;
  update: (p: Partial<Appearance>) => void;
  mode: PickMode;
  setMode: (m: PickMode) => void;
  onDone: () => void;
}) {
  const palette = usePalette();
  const [gender, setGender] = useState<Gender>(() => genderOf(look.character));
  const isPicked = (c: CharacterId) =>
    mode === "outfit" ? c === look.character : mode === "hairstyle" ? c === look.hairstyle : c === look.character && c === look.hairstyle;
  const pick = (c: CharacterId) =>
    update(mode === "outfit" ? { character: c } : mode === "hairstyle" ? { hairstyle: c } : { character: c, hairstyle: c });

  return (
    <>
      <div className="submenu-header">
        <button type="button" className="link" onClick={onDone}>
          ← Back
        </button>
        <span className="panel-title">Customize</span>
      </div>

      {mode !== "face" && (
        <div className="segmented" role="tablist" aria-label="Gender">
          {GENDERS.map((g) => (
            <button
              key={g}
              type="button"
              role="tab"
              aria-selected={gender === g}
              className={gender === g ? "selected" : ""}
              onClick={() => setGender(g)}
            >
              {g === "male" ? "Male" : "Female"}
            </button>
          ))}
        </div>
      )}
      <div className="segmented four" role="tablist" aria-label="Pick">
        {PICK_MODES.map(({ mode: m, label }) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? "selected" : ""} onClick={() => setMode(m)}>
            {label}
          </button>
        ))}
      </div>
      {mode === "face" ? (
        palette && <FacePicker look={look} update={update} palette={palette} />
      ) : (
        <div className={`character-grid crop-${mode}`} role="radiogroup" aria-label={PICK_MODES.find((p) => p.mode === mode)!.label}>
          {CHARACTERS.filter((c) => genderOf(c) === gender).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={isPicked(c)}
              aria-label={c}
              className={`character-tile${isPicked(c) ? " selected" : ""}`}
              onClick={() => pick(c)}
            >
              <img src={mode === "hairstyle" ? hairPreviewUrl(c) : previewUrl(c)} alt="" draggable={false} />
            </button>
          ))}
        </div>
      )}

      {palette && (
        <div className="field">
          <div className="field-header">
            <span>Colors</span>
            <button type="button" className="link" onClick={() => update(Object.fromEntries(COLOR_PARTS.map((p) => [p, -1])))}>
              Reset
            </button>
          </div>
          {COLOR_PARTS.filter((p) => p !== "dress" || hasDress(look.character)).map((p) => (
            <ColorRow
              key={p}
              label={PART_LABEL[p]}
              ids={p === "skin" ? SKIN_IDS : ALL_IDS}
              value={look[p]}
              palette={palette}
              onChange={(v) => update({ [p]: v })}
            />
          ))}
        </div>
      )}

      <button type="button" className="primary" onClick={onDone}>
        Done
      </button>
    </>
  );
}
