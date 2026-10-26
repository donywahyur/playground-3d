import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { CHARACTERS, DEFAULT_APPEARANCE, NAME_MAX_LEN, sanitizeAppearance, type Anim, type Appearance } from "@hangout/shared";
import { loadPref, PREF, savePref } from "../../state/prefs";
import { useGame } from "../../state/store";
import { Clock } from "../Clock";
import { Logo } from "../Logo";
import { Customize, type PickMode } from "./Customize";
import { HomeScene } from "./HomeScene";
import { LoadingScreen } from "./LoadingScreen";
import { PatchNotes } from "./PatchNotes";
import { VERSION } from "./releases";

function initialAppearance(): Appearance {
  try {
    const saved = JSON.parse(loadPref(PREF.appearance) ?? "null") as Partial<Appearance> | null;
    if (saved && CHARACTERS.includes(saved.character!)) return sanitizeAppearance(saved);
  } catch {}
  const character = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
  return { ...DEFAULT_APPEARANCE, character, hairstyle: character };
}

/** How long the character waves on arrival and after customizing (s). */
const WAVE_TIME = 2.4;

export function JoinScreen({ onJoin }: { onJoin: (name: string, appearance: Appearance) => void }) {
  const phase = useGame((s) => s.phase);
  const error = useGame((s) => s.error);
  const [view, setView] = useState<"main" | "customize" | "updates">("main");
  const [mode, setMode] = useState<PickMode>("character");
  const [name, setName] = useState(() => loadPref(PREF.name) ?? "");
  const [look, setLook] = useState(initialAppearance);
  const update = (patch: Partial<Appearance>) => setLook((l) => ({ ...l, ...patch }));
  const stage = useRef<HTMLDivElement>(null);
  const anim = useRef<Anim>("idle");
  const [loaded, setLoaded] = useState(false);
  const onLoaded = useCallback(() => setLoaded(true), []);

  // Wave hello on the main view once it shows; cheer while joining.
  useEffect(() => {
    if (!loaded || view !== "main") return void (anim.current = "idle");
    if (phase === "connecting") return void (anim.current = "cheer");
    anim.current = "wave";
    const id = setTimeout(() => (anim.current = "idle"), WAVE_TIME * 1000);
    return () => clearTimeout(id);
  }, [loaded, view, phase]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    savePref(PREF.name, name);
    savePref(PREF.appearance, JSON.stringify(look));
    onJoin(name, look);
  };

  return (
    <div className={`home ${view}`}>
      <HomeScene appearance={look} focus={view === "main" ? "idle" : mode === "face" ? "face" : "turn"} anim={anim} stage={stage} />
      {/* The menu mounts once the world is in, so it animates in over the finished scene. */}
      {loaded && (
        <div className="home-ui">
          {view === "customize" ? (
            <div className="home-panel">
              <Customize look={look} update={update} mode={mode} setMode={setMode} onDone={() => setView("main")} />
            </div>
          ) : view === "updates" ? (
            <div className="home-panel">
              <PatchNotes onBack={() => setView("main")} />
            </div>
          ) : (
            <form className="home-panel" onSubmit={submit}>
              <div className="home-title">
                <Logo />
                <p className="muted">Walk around and talk.</p>
              </div>

              <label className="field">
                Name
                <input value={name} maxLength={NAME_MAX_LEN} placeholder="Your name" onChange={(e) => setName(e.target.value)} />
              </label>
              <button className="primary" disabled={phase === "connecting"}>
                {phase === "connecting" ? "Joining…" : "Join with mic"}
              </button>
              <button type="button" className="secondary" onClick={() => setView("customize")}>
                Customize character
              </button>
              {error && <p className="error">{error}</p>}
              <div className="home-footer">
                <p className="muted small">Characters and world by Kenney (kenney.nl), CC0.</p>
                <button type="button" className="link" onClick={() => setView("updates")}>
                  What's new · v{VERSION}
                </button>
              </div>
            </form>
          )}
          <div className="home-stage" ref={stage}>
            <Clock />
          </div>
        </div>
      )}
      <LoadingScreen onDone={onLoaded} />
    </div>
  );
}
