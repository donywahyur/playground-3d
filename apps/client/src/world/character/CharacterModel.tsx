import { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import {
  AnimationClip,
  LoopOnce,
  QuaternionKeyframeTrack,
  Skeleton,
  Vector3,
  VectorKeyframeTrack,
  type AnimationAction,
  type Group,
  type KeyframeTrack,
  type Material,
  type Mesh,
  type Object3D,
  type SkinnedMesh,
} from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { CHARACTERS, GRAVITY, JUMP_SPEED, type Anim, type Appearance } from "@hangout/shared";
import { modelUrl } from "./catalog";
import { makeEmoteClips } from "./emotes";
import { addFace, removeFaceInk, setEyesClosed } from "./face";
import { applyColors } from "./recolor";

/** Kenney characters are ~0.78 units tall; scale to ~1.55 m. Feet at y=0, facing +Z. */
const MODEL_SCALE = 2;
const FADE = 0.15;
const JUMP_AIR_TIME = (2 * JUMP_SPEED) / GRAVITY;
/** Blinks: eyes shut this long (s), every BLINK_GAP s plus up to as much again at random. */
const BLINK_TIME = 0.12;
const BLINK_GAP = 2.5;

type Clip = "idle" | "walk" | "sprint" | "jump" | "jump-mirror" | "fall" | "sit" | "wave" | "dance" | "cheer" | "emote-yes" | "emote-no";
const CLIP: Record<Anim, Clip> = {
  idle: "idle",
  walk: "walk",
  run: "sprint",
  jump: "jump",
  sit: "sit",
  wave: "wave",
  dance: "dance",
  cheer: "cheer",
  yes: "emote-yes",
  no: "emote-no",
};
// Kenney's jump clip is 0.5s; stretch it over our hop's air time.
const TIME_SCALE: Partial<Record<Clip, number>> = { walk: 1.6, sprint: 1.2, jump: 0.5 / JUMP_AIR_TIME, "jump-mirror": 0.5 / JUMP_AIR_TIME };

/**
 * Left/right mirror of a clip: swap -left/-right bone tracks and reflect
 * across the YZ plane (quaternion (x,y,z,w) -> (x,-y,-z,w), position x -> -x).
 * Kenney's jump always leads with the same leg; alternating with the mirror
 * makes held-jump hops switch legs.
 */
function mirrorClip(clip: AnimationClip, name: string) {
  const swap = (n: string) => (n.includes("-left") ? n.replace("-left", "-right") : n.replace("-right", "-left"));
  const tracks = clip.tracks.map((t): KeyframeTrack => {
    const values = Float32Array.from(t.values);
    if (t instanceof QuaternionKeyframeTrack) {
      for (let i = 0; i < values.length; i += 4) {
        values[i + 1] = -values[i + 1];
        values[i + 2] = -values[i + 2];
      }
      return new QuaternionKeyframeTrack(swap(t.name), Array.from(t.times), Array.from(values));
    }
    if (t instanceof VectorKeyframeTrack && t.name.endsWith(".position")) {
      for (let i = 0; i < values.length; i += 3) values[i] = -values[i];
      return new VectorKeyframeTrack(swap(t.name), Array.from(t.times), Array.from(values));
    }
    const copy = t.clone();
    copy.name = swap(t.name);
    return copy;
  });
  return new AnimationClip(name, clip.duration, tracks);
}

interface Props {
  appearance: Appearance;
  /** Read every frame so animation follows live state without re-rendering. */
  getAnim: () => string;
}

const tmpPos = new Vector3();

/**
 * Every Kenney GLB carries an identical "colormap" material, but each file load
 * makes its own copy (and its own texture upload). Reuse the first one so a new
 * character joining doesn't upload another texture.
 */
let sharedMaterial: Material | null = null;

/** Fetch and parse every character up front so a player joining mid-game doesn't stall on it. */
export function preloadCharacters() {
  for (const c of CHARACTERS) useGLTF.preload(modelUrl(c));
}

/**
 * Put another character's head (hair, glasses, beard) on a cloned body. All Kenney
 * characters share the same 7-bone rig, so the head geometry binds to the
 * body's bones as-is; only its inverse bind matrices come along.
 */
function swapHead(model: Object3D, headScene: Object3D) {
  const src = headScene.getObjectByName("head-mesh") as SkinnedMesh | undefined;
  const dst = model.getObjectByName("head-mesh") as SkinnedMesh | undefined;
  if (!src?.isSkinnedMesh || !dst?.isSkinnedMesh) return;
  dst.geometry = src.geometry;
  dst.skeleton = new Skeleton(dst.skeleton.bones, src.skeleton.boneInverses.map((m) => m.clone()));
}

function Model({ appearance, getAnim }: Props) {
  const { character, hairstyle, skin, hair, top, dress, bottom, shoes, eyes, mouth, cheeks, eyeColor } = appearance;
  const { scene, animations } = useGLTF(modelUrl(character));
  const { scene: headScene } = useGLTF(modelUrl(hairstyle));
  const root = useRef<Group>(null);

  // Each player needs its own skeleton, and its own UVs when recolored.
  const { model, face } = useMemo(() => {
    const look: Appearance = { character, hairstyle, skin, hair, top, dress, bottom, shoes, eyes, mouth, cheeks, eyeColor };
    const m = cloneSkinned(scene);
    if (headScene !== scene) swapHead(m, headScene);
    removeFaceInk(m);
    applyColors(m, look, { body: scene, head: headScene });
    m.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      sharedMaterial ??= mesh.material as Material;
      mesh.material = sharedMaterial;
    });
    // After the material swap above, which would otherwise take over the face's own material.
    const face = sharedMaterial ? addFace(m, look, sharedMaterial) : null;
    return { model: m, face };
  }, [scene, headScene, character, hairstyle, skin, hair, top, dress, bottom, shoes, eyes, mouth, cheeks, eyeColor]);

  const clips = useMemo(() => {
    const jump = animations.find((c) => c.name === "jump");
    return [...animations, ...(jump ? [mirrorClip(jump, "jump-mirror")] : []), ...makeEmoteClips()];
  }, [animations]);
  const { actions } = useAnimations(clips, root);
  useEffect(() => {
    for (const name of ["jump", "jump-mirror"]) {
      const a = actions[name];
      if (!a) continue;
      a.setLoop(LoopOnce, 1);
      a.clampWhenFinished = true;
    }
  }, [actions]);

  const state = useRef({ clip: null as Clip | null, airT: 0, lastY: NaN, rising: false, hops: 0, blinkAt: 0, eyesClosed: false });

  useFrame(({ clock }, rawDt) => {
    if (!root.current) return;
    const dt = Math.max(Math.min(rawDt, 0.1), 1e-4);
    const s = state.current;

    const now = clock.elapsedTime;
    if (face && now >= s.blinkAt) {
      s.eyesClosed = !s.eyesClosed;
      setEyesClosed(face, s.eyesClosed);
      s.blinkAt = now + (s.eyesClosed ? BLINK_TIME : BLINK_GAP * (1 + Math.random()));
    }
    const raw = getAnim() as Anim;
    const anim: Anim = raw in CLIP ? raw : "idle";

    // Detect each takeoff from vertical speed so a held jump (bunny-hopping)
    // replays the jump clip every hop, for local and remote players alike.
    const y = root.current.getWorldPosition(tmpPos).y;
    const rising = Number.isFinite(s.lastY) && (y - s.lastY) / dt > 1;
    const takeoff = anim === "jump" && rising && !s.rising;
    s.lastY = y;
    s.rising = rising;
    // Switch leading leg once per hop: on landing, or on the next takeoff of a held bunny-hop.
    if ((s.clip?.startsWith("jump") && anim !== "jump") || (takeoff && s.airT > 0.1)) s.hops++;
    s.airT = anim === "jump" ? (takeoff ? 0 : s.airT + dt) : 0;

    // Airborne longer than a normal hop (walked off a ledge) -> falling loop.
    // Each hop alternates the leading leg via the mirrored jump.
    let clip: Clip = anim === "jump" && s.airT > JUMP_AIR_TIME + 0.1 ? "fall" : CLIP[anim];
    if (clip === "jump" && s.hops % 2 === 1) clip = "jump-mirror";
    if (clip === s.clip && !takeoff) return;

    const next = actions[clip];
    if (!next) return;
    const prev: AnimationAction | null = s.clip ? actions[s.clip] ?? null : null;
    next.reset().setEffectiveTimeScale(TIME_SCALE[clip] ?? 1).fadeIn(FADE).play();
    if (prev && prev !== next) prev.fadeOut(FADE);
    s.clip = clip;
  });

  return (
    <group ref={root} scale={MODEL_SCALE}>
      <primitive object={model} />
    </group>
  );
}

/** Animated Kenney character. Loads its GLB on demand without blocking the scene. */
export function CharacterModel(props: Props) {
  return (
    <Suspense fallback={null}>
      {/* A new look builds a new model; remount so the animation mixer binds to its bones instead of the old ones
          (cached actions would keep animating the discarded skeleton, leaving the new one in its bind pose). */}
      <Model key={Object.values(props.appearance).join()} {...props} />
    </Suspense>
  );
}
