import { useLayoutEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { CuboidCollider, CylinderCollider, RigidBody } from "@react-three/rapier";
import { Box3, Euler, FrontSide, Matrix4, Quaternion, Vector3, type InstancedMesh, type Material, type Mesh, type MeshStandardMaterial } from "three";
import { addCulled, propShadows } from "../culling";
import { rotateXZ } from "../math";

/**
 * Kenney 3D kits (CC0, www.kenney.nl) under public/kits/<kit>/. Every GLB in a
 * kit loads its texture from ./Textures/colormap.png next to it.
 */
export type Kit = "mini-forest" | "fantasy-town" | "pirate" | "graveyard";

/**
 * Kit units to meters. Characters are scaled x2 (~1.55 m tall); these make
 * each kit look right next to them: mini-forest/graveyard are built at the
 * characters' scale, town tiles become 3 m rooms, the pirate kit is ~1 unit/m.
 */
const KIT_SCALE: Record<Kit, number> = { "mini-forest": 2, "fantasy-town": 3, pirate: 0.9, graveyard: 2 };

export interface ModelRef {
  kit: Kit;
  name: string;
  url: string;
}

const registry = new Map<string, ModelRef>();

/** A kit model; also registers it for preloading. */
export function kitModel(kit: Kit, name: string): ModelRef {
  const url = `/kits/${kit}/${name}.glb`;
  let ref = registry.get(url);
  if (!ref) registry.set(url, (ref = { kit, name, url }));
  return ref;
}

/** Fetch every model the layouts use, so walking into a new zone doesn't stall. */
export function preloadKits() {
  for (const { url } of registry.values()) useGLTF.preload(url);
}

/** x, z, rotY (rad), scale (on top of the kit scale), y. */
export type Placement = [x: number, z: number, rotY?: number, scale?: number, y?: number];

/** How a prop blocks players; omitted = walk-through decoration. */
export type ColliderKind =
  /** Thin cylinder up the middle (trees, poles), radius in model units. */
  | { trunk: number }
  /** Model bounding box, shrunk by this factor around its center. */
  | { box: number };

/**
 * Every GLB in a kit carries its own copy of the kit's colormap material;
 * reuse the first one per kit so each texture uploads once.
 */
const kitMaterial = new Map<Kit, Material>();
function sharedMaterial(kit: Kit, fallback: Material) {
  let m = kitMaterial.get(kit);
  if (!m) kitMaterial.set(kit, (m = fallback));
  return m;
}

/** A variant of the kit material (same texture, so no extra upload). */
const materialVariants = new Map<string, Material>();
function materialVariant(kit: Kit, base: Material, tint: number, singleSided: boolean) {
  if (tint === 1 && !singleSided) return base;
  const key = `${kit}:${tint}:${singleSided}`;
  let m = materialVariants.get(key);
  if (!m) {
    const v = base.clone() as MeshStandardMaterial;
    v.color.multiplyScalar(tint);
    if (singleSided) v.side = FrontSide;
    materialVariants.set(key, (m = v));
  }
  return m;
}

const tmpM = new Matrix4();
const tmpQ = new Quaternion();
const tmpE = new Euler();
const tmpP = new Vector3();
const tmpS = new Vector3();

interface PropsProps {
  m: ModelRef;
  at: Placement[];
  collider?: ColliderKind;
  /** Flattens vertically, so ground patches stay thin when scaled up. */
  squash?: number;
  /** Brightens (> 1) or darkens the model's colors. */
  tint?: number;
  /**
   * Draw front faces only. Kenney marks every material double-sided, but some
   * solid models have inner faces that then show through as dark patches.
   */
  singleSided?: boolean;
}

/**
 * All placements of one model as one InstancedMesh per sub-mesh (one draw call
 * each), plus their colliders in a single fixed body.
 */
export function Props({ m, at, collider, squash = 1, tint = 1, singleSided = false }: PropsProps) {
  const { scene } = useGLTF(m.url);
  const k = KIT_SCALE[m.kit];

  const parts = useMemo(() => {
    scene.updateMatrixWorld(true);
    const list: { mesh: Mesh; local: Matrix4; material: Material }[] = [];
    scene.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      list.push({ mesh, local: mesh.matrixWorld.clone(), material: materialVariant(m.kit, sharedMaterial(m.kit, mesh.material as Material), tint, singleSided) });
    });
    return list;
  }, [scene, m.kit, tint, singleSided]);
  const bounds = useMemo(() => new Box3().setFromObject(scene), [scene]);
  // Whole-model height per placement, so each part of a tall model still casts a shadow.
  const heights = useMemo(() => Float32Array.from(at, ([, , , scale = 1]) => (bounds.max.y - bounds.min.y) * k * scale * squash), [at, bounds, k, squash]);

  if (at.length === 0) return null;
  return (
    <>
      {parts.map((p, i) => (
        <PartInstances key={i} mesh={p.mesh} material={p.material} local={p.local} at={at} heights={heights} k={k} squash={squash} />
      ))}
      {collider && (
        <RigidBody type="fixed" colliders={false}>
          {at.map((pl, i) => (
            <PropCollider key={i} placement={pl} kind={collider} bounds={bounds} k={k} />
          ))}
        </RigidBody>
      )}
    </>
  );
}

interface PartProps {
  mesh: Mesh;
  material: Material;
  local: Matrix4;
  at: Placement[];
  heights: Float32Array;
  k: number;
  squash: number;
}

/** The instances are culled and drawn per frame by culling.ts. */
function PartInstances({ mesh, material, local, at, heights, k, squash }: PartProps) {
  const ref = useRef<InstancedMesh>(null);
  const scene = useThree((s) => s.scene);
  useLayoutEffect(() => {
    const matrices = new Float32Array(at.length * 16);
    at.forEach(([x, z, rotY = 0, scale = 1, y = 0], i) => {
      const s = k * scale;
      tmpM.compose(tmpP.set(x, y, z), tmpQ.setFromEuler(tmpE.set(0, rotY, 0)), tmpS.set(s, s * squash, s)).multiply(local);
      tmpM.toArray(matrices, i * 16);
    });
    return addCulled(scene, ref.current!, matrices, heights);
  }, [scene, at, local, heights, k, squash]);
  return <instancedMesh ref={ref} args={[mesh.geometry, material, at.length]} receiveShadow />;
}

function PropCollider({ placement: [x, z, rotY = 0, scale = 1, y = 0], kind, bounds, k }: { placement: Placement; kind: ColliderKind; bounds: Box3; k: number }) {
  const s = k * scale;
  if ("trunk" in kind) {
    const height = (bounds.max.y - bounds.min.y) * s;
    return <CylinderCollider args={[height / 2, kind.trunk * s]} position={[x, y + bounds.min.y * s + height / 2, z]} />;
  }
  const size = bounds.getSize(new Vector3()).multiplyScalar((s * kind.box) / 2);
  const c = bounds.getCenter(new Vector3()).multiplyScalar(s);
  const [cx, cz] = rotateXZ(c.x, c.z, rotY);
  return <CuboidCollider args={[size.x, size.y, size.z]} position={[x + cx, y + c.y, z + cz]} rotation={[0, rotY, 0]} />;
}

/** Box blockers in meters: center x/z, full width/depth/height, base y, rotY. */
export type Block = { x: number; z: number; w: number; d: number; h: number; y?: number; rot?: number };

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <RigidBody type="fixed" colliders={false}>
      {blocks.map(({ x, z, w, d, h, y = 0, rot = 0 }, i) => (
        <CuboidCollider key={i} args={[w / 2, h / 2, d / 2]} position={[x, y + h / 2, z]} rotation={[0, rot, 0]} />
      ))}
    </RigidBody>
  );
}

/** Placements grouped per model, for layouts built up piece by piece (houses, fences). */
export class PropSet {
  readonly byModel = new Map<ModelRef, Placement[]>();
  add(m: ModelRef, ...at: Placement[]) {
    const list = this.byModel.get(m);
    if (list) list.push(...at);
    else this.byModel.set(m, [...at]);
    return this;
  }
}

/** Render a PropSet; `colliders` picks a collider per model (default none). */
export function PropSetView({ set, colliders }: { set: PropSet; colliders?: (m: ModelRef) => ColliderKind | undefined }) {
  return (
    <>
      {[...set.byModel].map(([m, at]) => (
        <Props key={m.url} m={m} at={at} collider={colliders?.(m)} />
      ))}
    </>
  );
}

/** Kit scale, for layouts that need sizes in meters. */
export const kitScale = (kit: Kit) => KIT_SCALE[kit];

/** One copy of a kit model for a single, individually transformed object (animated or stretched). */
export function useKitModel(m: ModelRef, { receiveShadow = false } = {}) {
  const { scene } = useGLTF(m.url);
  return useMemo(() => {
    const model = scene.clone();
    model.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = propShadows();
      mesh.receiveShadow = receiveShadow;
      mesh.material = sharedMaterial(m.kit, mesh.material as Material);
    });
    return model;
  }, [scene, m.kit, receiveShadow]);
}

const BRIDGE = kitModel("mini-forest", "bridge");
/** Bridge model size (units): walkway along x, rope rails along the z sides. */
const BRIDGE_LEN = 1.04;
const BRIDGE_WIDTH = 0.8;

interface PlankRampProps {
  from: [number, number, number];
  to: [number, number, number];
  width: number;
  /** Bridge pieces laid end to end; long ramps need more than one or the planks stretch apart. */
  segments?: number;
}

/**
 * A plank ramp (the mini-forest bridge, stretched) from `from` up to `to`:
 * [x, y, z] in meters at walkway level, `width` m wide, with a walkable collider.
 */
export function PlankRamp({ from, to, width, segments = 1 }: PlankRampProps) {
  const [x0, y0, z0] = from;
  const [x1, y1, z1] = to;
  const run = Math.hypot(x1 - x0, z1 - z0);
  const len = Math.hypot(run, y1 - y0);
  // Local +x points uphill: turn toward `to`, then tilt up.
  const yaw = Math.atan2(z0 - z1, x1 - x0);
  const pitch = Math.atan2(y1 - y0, run);
  const mid: [number, number, number] = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
  return (
    <>
      <group position={mid} rotation={[0, yaw, pitch, "YXZ"]}>
        {Array.from({ length: segments }, (_, i) => (
          <RampSegment key={i} x={((i + 0.5) / segments - 0.5) * len} scale={[len / segments / BRIDGE_LEN, 1.6, width / BRIDGE_WIDTH]} />
        ))}
      </group>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[len / 2, 0.1, width / 2 + 0.2]} position={[mid[0], mid[1] - 0.1, mid[2]]} rotation={[0, yaw, pitch]} />
      </RigidBody>
    </>
  );
}

function RampSegment({ x, scale }: { x: number; scale: [number, number, number] }) {
  const model = useKitModel(BRIDGE, { receiveShadow: true });
  return <primitive object={model} position={[x, -0.25, 0]} scale={scale} />;
}
