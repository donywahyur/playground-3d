import { create } from "zustand";
import type { Appearance, ChatMessage } from "@hangout/shared";
import { loadFlag, loadPref, PREF, saveFlag, savePref } from "./prefs";

export interface PlayerInfo {
  id: string;
  name: string;
  appearance: Appearance;
  muted: boolean;
  speaking: boolean;
  /** Away from the keyboard for a while; shows a bubble over them. */
  idle: boolean;
  /** Has text in the chat box. */
  typing: boolean;
}

function loadVolume() {
  const saved = loadPref(PREF.volume);
  const v = Number(saved);
  return saved !== null && v >= 0 && v <= 1 ? v : 1;
}

/** Mouse look needs a real mouse and the Pointer Lock API (not on touch devices). */
export const canCamLock = typeof window !== "undefined" && "exitPointerLock" in document && matchMedia("(pointer: fine)").matches;

/** Phones and tablets: on-screen joystick, compact HUD. */
export const isTouch = typeof window !== "undefined" && matchMedia("(pointer: coarse)").matches;

/**
 * Rendering quality. Low: no antialiasing, pixel ratio 1, 30 fps, small shadow map that only your own character
 * casts into. High: today's look at up to 60 fps. Auto starts Low on phones/tablets and machines with few cores,
 * and drops to Low for the session if the frame rate can't keep up.
 */
export type QualityPref = "auto" | "low" | "high";
export type Quality = "low" | "high";
const QUALITY_PREFS: QualityPref[] = ["auto", "low", "high"];
const weakDevice = typeof navigator !== "undefined" && (isTouch || (navigator.hardwareConcurrency ?? 8) <= 4);

function loadQualityPref(): QualityPref {
  const saved = loadPref(PREF.quality) as QualityPref | null;
  return saved && QUALITY_PREFS.includes(saved) ? saved : "auto";
}

const resolveQuality = (pref: QualityPref, autoLow: boolean): Quality => (pref === "auto" ? (weakDevice || autoLow ? "low" : "high") : pref);

export type Phase = "join" | "connecting" | "playing";
export type MicState = "off" | "on" | "denied";

interface GameStore {
  phase: Phase;
  error: string | null;
  selfId: string | null;
  players: Record<string, PlayerInfo>;
  mic: MicState;
  /** Why the mic is unavailable, when `mic` is "denied". */
  micError: string | null;
  muted: boolean;
  chat: ChatMessage[];
  /** Each player's latest chat line and when it arrived (performance.now()), for the bubble over their head. */
  said: Record<string, { text: string; at: number }>;
  chatOpen: boolean;
  menuOpen: boolean;
  /** Players popup, opened from the menu on touch screens. */
  playersOpen: boolean;
  /** Full-screen world map. */
  mapOpen: boolean;
  /** A free seat is close enough to sit on. */
  seatNearby: boolean;
  sitting: boolean;
  /** Voice volume, 0..1. */
  volume: number;
  /** Camera lock: the mouse is captured and moving it turns the camera (no drag needed). */
  camLock: boolean;
  /** Minimap keeps north up instead of turning with the camera. */
  mapNorthUp: boolean;
  /** Touch joystick stays put in the corner instead of appearing where the thumb lands. */
  joystickFixed: boolean;
  qualityPref: QualityPref;
  /** Auto saw a low frame rate this session. */
  autoLow: boolean;
  /** What renders now (qualityPref resolved). The canvases remount when it changes. */
  quality: Quality;
  set: (patch: Partial<GameStore>) => void;
  /** The setters below also remember the choice for next time. */
  setVolume: (v: number) => void;
  setCamLock: (on: boolean) => void;
  setMapNorthUp: (on: boolean) => void;
  setJoystickFixed: (on: boolean) => void;
  setQualityPref: (pref: QualityPref) => void;
  /** The frame rate stays low: Auto switches to Low for the rest of the session. */
  reportSlow: () => void;
  upsertPlayer: (p: PlayerInfo) => void;
  removePlayer: (id: string) => void;
  pushChat: (m: ChatMessage) => void;
}

export const useGame = create<GameStore>((set) => ({
  phase: "join",
  error: null,
  selfId: null,
  players: {},
  mic: "off",
  micError: null,
  muted: false,
  chat: [],
  said: {},
  chatOpen: false,
  menuOpen: false,
  playersOpen: false,
  mapOpen: false,
  seatNearby: false,
  sitting: false,
  volume: loadVolume(),
  camLock: canCamLock && loadFlag(PREF.camLock),
  mapNorthUp: loadFlag(PREF.mapNorthUp),
  joystickFixed: loadFlag(PREF.joystickFixed),
  qualityPref: loadQualityPref(),
  autoLow: false,
  quality: resolveQuality(loadQualityPref(), false),
  set: (patch) => set(patch),
  setVolume: (volume) => {
    savePref(PREF.volume, String(volume));
    set({ volume });
  },
  setCamLock: (camLock) => {
    saveFlag(PREF.camLock, camLock);
    set({ camLock });
  },
  setMapNorthUp: (mapNorthUp) => {
    saveFlag(PREF.mapNorthUp, mapNorthUp);
    set({ mapNorthUp });
  },
  setJoystickFixed: (joystickFixed) => {
    saveFlag(PREF.joystickFixed, joystickFixed);
    set({ joystickFixed });
  },
  setQualityPref: (qualityPref) => {
    savePref(PREF.quality, qualityPref);
    set((s) => ({ qualityPref, quality: resolveQuality(qualityPref, s.autoLow) }));
  },
  reportSlow: () => set((s) => ({ autoLow: true, quality: resolveQuality(s.qualityPref, true) })),
  upsertPlayer: (p) => set((s) => ({ players: { ...s.players, [p.id]: p } })),
  removePlayer: (id) =>
    set((s) => {
      const { [id]: _, ...rest } = s.players;
      return { players: rest };
    }),
  pushChat: (m) =>
    set((s) => ({ chat: [...s.chat.slice(-49), m], said: { ...s.said, [m.from]: { text: m.text, at: performance.now() } } })),
}));
