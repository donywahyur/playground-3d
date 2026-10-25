import { AnimationClip, Euler, Quaternion, QuaternionKeyframeTrack, VectorKeyframeTrack, type KeyframeTrack } from "three";

/**
 * Kenney's Mini Characters ship no wave, dance or cheer, so these are built
 * here as looping clips on the shared 7-bone rig. Every bone's rest rotation is
 * identity, with the arms straight out sideways (T-pose):
 *   arm-left (+x side): rotation about z, +90° up, -90° down (idle is -45°)
 *   arm-right (-x side): mirrored, -90° up, +90° down (idle is +45°)
 *   legs: rotation about x, negative swings the leg forward
 * Angles below are in degrees; `root.position` is in model units (~0.78 tall).
 */

type Pose = Partial<Record<"torso" | "head" | "arm-left" | "arm-right" | "leg-left" | "leg-right", [number, number, number]>> & {
  /** Root height offset (model units). */
  lift?: number;
};

const FPS = 24;
const D = Math.PI / 180;
const tmpE = new Euler();
const tmpQ = new Quaternion();

/** Sample a pose function over one loop of `duration` seconds into a clip. */
function clipFrom(name: string, duration: number, pose: (phase: number) => Pose) {
  const frames = Math.round(duration * FPS);
  const times: number[] = [];
  const rot = new Map<string, number[]>();
  const lift: number[] = [];
  for (let i = 0; i <= frames; i++) {
    const t = (i / frames) * duration;
    times.push(t);
    // Phase in [0, 1); the last frame repeats the first so the loop is seamless.
    const p = pose((i % frames) / frames);
    for (const [bone, value] of Object.entries(p)) {
      if (bone === "lift") continue;
      const [x, y, z] = value as [number, number, number];
      tmpQ.setFromEuler(tmpE.set(x * D, y * D, z * D));
      let list = rot.get(bone);
      if (!list) rot.set(bone, (list = []));
      list.push(tmpQ.x, tmpQ.y, tmpQ.z, tmpQ.w);
    }
    lift.push(0, p.lift ?? 0, 0);
  }
  const tracks: KeyframeTrack[] = [...rot].map(([bone, values]) => new QuaternionKeyframeTrack(`${bone}.quaternion`, times, values));
  tracks.push(new VectorKeyframeTrack("root.position", times, lift));
  return new AnimationClip(name, duration, tracks);
}

const wave = (p: number) => Math.sin(p * Math.PI * 2);
/** 0..1 bounce, twice per loop. */
const bounce = (p: number) => Math.abs(Math.sin(p * Math.PI * 2));

export function makeEmoteClips(): AnimationClip[] {
  return [
    // Right arm up and out, waving side to side twice a second. Arms stay off
    // vertical and swing a little forward: straight up, the big head hides them.
    clipFrom("wave", 1, (p) => ({
      "arm-right": [0, 25, -50 + 22 * wave(p * 2)],
      "arm-left": [0, 0, -50],
      torso: [0, 0, -4],
      head: [0, 0, 3 * wave(p * 2)],
    })),
    // Arms pumping in a V on every hop.
    clipFrom("cheer", 0.8, (p) => {
      const b = bounce(p);
      return {
        "arm-left": [0, -20, 35 + 25 * b],
        "arm-right": [0, 20, -35 - 25 * b],
        torso: [-6 * b, 0, 0],
        head: [-10 * b, 0, 0],
        lift: 0.05 * b,
      };
    }),
    // Swaying, alternating arms, a bounce on each beat.
    clipFrom("dance", 1.2, (p) => {
      const s = wave(p);
      return {
        torso: [0, 20 * s, 8 * s],
        head: [0, -10 * s, -6 * s],
        "arm-left": [0, 0, 20 + 55 * s],
        "arm-right": [0, 0, 20 + 55 * s],
        "leg-left": [-15 * Math.max(0, s), 0, 0],
        "leg-right": [-15 * Math.max(0, -s), 0, 0],
        lift: 0.025 * bounce(p),
      };
    }),
  ];
}
