import { useEffect, type RefObject } from "react";
import { useThree } from "@react-three/fiber";
import { Frustum, Matrix4, Sphere, Vector3, type Camera, type DirectionalLight, type InstancedMesh, type Scene } from "three";
import { FOG } from "./sky/daytime";

/**
 * Per-instance culling for the instanced props. Each model's InstancedMesh
 * spans the whole world, so three's per-object frustum test never culls it,
 * and every instance went through both the main and the shadow pass.
 *
 * Right before each render the instances are re-sorted into a prefix that
 * casts shadows (inside the sun's shadow box, near enough to the view to throw
 * a shadow into it, and tall enough to matter) followed by the rest of what's
 * on screen. The main pass draws both; the shadow pass only the prefix.
 */

/** `?cull=0` draws every instance in both passes, as before, to compare frame rates. */
const ENABLED = new URLSearchParams(location.search).get("cull") !== "0";

/** Instances shorter than this (m) don't cast shadows. */
const MIN_CASTER_HEIGHT = 0.6;
/** How far a caster just outside the view can still throw a shadow into it (m). */
const SHADOW_REACH = 12;

export interface CulledPart {
  mesh: InstancedMesh;
  /** World matrix of every instance, 16 floats each. */
  matrices: Float32Array;
  /** World bounding sphere of every instance: x, y, z, radius. */
  spheres: Float32Array;
  /** Whether each instance is tall enough to cast a shadow. */
  casts: Uint8Array;
  /** Instance order last written to the mesh, and how many of those the main and shadow passes draw. */
  order: Int32Array;
  drawn: number;
  shadowed: number;
}

/** Per scene (the game and the join screen backdrop each have one): its parts and the sun. */
interface SceneCulling {
  parts: Set<CulledPart>;
  sun: DirectionalLight | null;
}
const scenes = new WeakMap<Scene, SceneCulling>();
function stateOf(scene: Scene) {
  let s = scenes.get(scene);
  if (!s) scenes.set(scene, (s = { parts: new Set(), sun: null }));
  return s;
}

/**
 * Cull this scene's instanced props before every render, with `sun` as the
 * light whose shadow frustum picks the casters.
 */
export function useCulling(sun: RefObject<DirectionalLight | null>) {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    if (!ENABLED) return;
    const state = stateOf(scene);
    state.sun = sun.current;
    scene.onBeforeRender = (_gl, _scene, camera) => cullParts(state, camera);
    return () => {
      state.sun = null;
      scene.onBeforeRender = () => {};
    };
  }, [scene, sun]);
}

/**
 * Take over drawing an InstancedMesh's instances. `matrices` holds all of
 * them; `heights` is each instance's height in meters.
 */
export function addCulled(scene: Scene, mesh: InstancedMesh, matrices: Float32Array, heights: Float32Array): () => void {
  if (!ENABLED) {
    mesh.instanceMatrix.array.set(matrices);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = true;
    return () => {};
  }
  const state = stateOf(scene);
  const n = heights.length;
  const geo = mesh.geometry;
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  const local = geo.boundingSphere!;
  const spheres = new Float32Array(n * 4);
  const m = new Matrix4();
  const c = new Vector3();
  for (let i = 0; i < n; i++) {
    m.fromArray(matrices, i * 16);
    c.copy(local.center).applyMatrix4(m);
    spheres.set([c.x, c.y, c.z, local.radius * m.getMaxScaleOnAxis()], i * 4);
  }
  const part: CulledPart = {
    mesh,
    matrices,
    spheres,
    casts: Uint8Array.from(heights, (h) => Number(h >= MIN_CASTER_HEIGHT)),
    order: new Int32Array(n).fill(-1),
    drawn: 0,
    shadowed: 0,
  };
  mesh.castShadow = part.casts.includes(1);
  // Both passes ask the mesh whether it's in their frustum: answer from the counts instead of one world-sized sphere.
  mesh.intersectsFrustum = (f) => (state.sun && f === state.sun.shadow.getFrustum() ? part.shadowed > 0 : part.drawn > 0);
  mesh.onBeforeShadow = () => {
    mesh.count = part.shadowed;
  };
  mesh.onAfterShadow = () => {
    mesh.count = part.drawn;
  };
  state.parts.add(part);
  return () => {
    state.parts.delete(part);
  };
}

const viewFrustum = new Frustum();
const viewProj = new Matrix4();
const sphere = new Sphere();
let next = new Int32Array(0);

function inFrustum(f: Frustum, s: Float32Array, i: number, pad: number) {
  sphere.center.set(s[i], s[i + 1], s[i + 2]);
  sphere.radius = s[i + 3] + pad;
  return f.intersectsSphere(sphere);
}

/** Sort every part's instances for this frame: after matrices update, before the render lists are built. */
function cullParts({ parts, sun }: SceneCulling, camera: Camera) {
  viewFrustum.setFromProjectionMatrix(viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const shadow = sun?.castShadow ? sun.shadow : null;
  // Same matrices the shadow pass is about to compute from the light's current position.
  if (shadow && sun) shadow.updateMatrices(sun);
  const shadowFrustum = shadow?.getFrustum();
  const cam = camera.position;

  for (const p of parts) {
    const n = p.casts.length;
    if (next.length < n) next = new Int32Array(n);
    const s = p.spheres;
    // Shadow casters first, then the rest of what's visible; `later` collects the visible non-casters.
    let shadowed = 0;
    let later = n;
    for (let i = 0; i < n; i++) {
      const si = i * 4;
      const near = Math.hypot(s[si] - cam.x, s[si + 1] - cam.y, s[si + 2] - cam.z) < FOG.far + s[si + 3];
      if (!near) continue;
      const caster = !!shadowFrustum && p.casts[i] === 1 && inFrustum(shadowFrustum, s, si, 0) && inFrustum(viewFrustum, s, si, SHADOW_REACH);
      if (caster) next[shadowed++] = i;
      else if (inFrustum(viewFrustum, s, si, 0)) next[--later] = i;
    }
    // Pack the visible non-casters right after the casters.
    let drawn = shadowed;
    for (let j = later; j < n; j++) next[drawn++] = next[j];

    let changed = drawn !== p.drawn || shadowed !== p.shadowed;
    for (let j = 0; j < drawn && !changed; j++) changed = next[j] !== p.order[j];
    if (changed) {
      const out = p.mesh.instanceMatrix.array as Float32Array;
      for (let j = 0; j < drawn; j++) {
        const i = next[j];
        p.order[j] = i;
        out.set(p.matrices.subarray(i * 16, i * 16 + 16), j * 16);
      }
      p.mesh.instanceMatrix.clearUpdateRanges();
      p.mesh.instanceMatrix.addUpdateRange(0, drawn * 16);
      p.mesh.instanceMatrix.needsUpdate = true;
    }
    p.drawn = drawn;
    p.shadowed = shadowed;
    p.mesh.count = drawn;
  }
}
