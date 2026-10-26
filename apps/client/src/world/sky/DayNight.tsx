import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BackSide, Matrix4, Vector3, type AmbientLight, type DirectionalLight, type Fog, type Mesh, type Points, type PointsMaterial } from "three";
import { localPose } from "../../state/runtime";
import { useGame, type Quality } from "../../state/store";
import { mulberry32, ticker } from "../math";
import { useCulling } from "../culling";
import { FOG, sky, updateSky } from "./daytime";

/** Distance from the shadow center to the light (m). */
const LIGHT_DIST = 50;
/** Half-size of the shadow frustum around the player (m). */
const SHADOW_RADIUS = 25;
/** Shadow map size per quality; in Low only your own character casts into it. */
const SHADOW_MAP: Record<Quality, number> = { high: 1024, low: 512 };
const ORIGIN = new Vector3();
const UP = new Vector3(0, 1, 0);
const lightOffset = new Vector3();
const lightRot = new Matrix4();
const lightRotInv = new Matrix4();
const tmpCenter = new Vector3();

/**
 * Sun (or moon) whose shadow frustum follows the local player (and picks the
 * props' shadow casters, see culling.ts), so a small
 * shadow map covers the visible area instead of the whole world. The center is
 * snapped to whole shadow texels in light space so shadow edges don't shimmer
 * while moving.
 */
function Sun() {
  const light = useRef<DirectionalLight>(null);
  const mapSize = SHADOW_MAP[useGame((s) => s.quality)];
  const texel = (SHADOW_RADIUS * 2) / mapSize;
  useCulling(light);
  useFrame(() => {
    const l = light.current;
    if (!l) return;
    lightOffset.copy(sky.lightDir).multiplyScalar(LIGHT_DIST);
    lightRot.lookAt(lightOffset, ORIGIN, UP);
    lightRotInv.copy(lightRot).invert();
    const c = tmpCenter.copy(localPose.position).applyMatrix4(lightRotInv);
    c.x = Math.round(c.x / texel) * texel;
    c.y = Math.round(c.y / texel) * texel;
    c.applyMatrix4(lightRot);
    l.target.position.copy(c);
    l.target.updateMatrixWorld();
    l.position.copy(c).add(lightOffset);
    l.color.copy(sky.lightColor);
    l.intensity = sky.lightIntensity;
  });
  return (
    <directionalLight
      ref={light}
      castShadow
      shadow-mapSize={[mapSize, mapSize]}
      // Offsets lookups along the normal; without it the textured props self-shadow in stripes (acne).
      shadow-normalBias={texel * 1.5}
      shadow-camera-left={-SHADOW_RADIUS}
      shadow-camera-right={SHADOW_RADIUS}
      shadow-camera-top={SHADOW_RADIUS}
      shadow-camera-bottom={-SHADOW_RADIUS}
    />
  );
}

/** Sky dome and stars sit this far out, centered on the camera (inside the camera's far plane). */
const DOME_R = 500;

const skyShader = {
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 top;
    uniform vec3 horizon;
    uniform vec3 sunDir;
    uniform vec3 sunColor;
    uniform float sunGlow;
    uniform float moon;
    varying vec3 vDir;
    void main() {
      vec3 d = normalize(vDir);
      vec3 col = mix(horizon, top, pow(max(d.y, 0.0), 0.5));
      float aboveHorizon = smoothstep(-0.02, 0.02, d.y);
      float s = dot(d, sunDir);
      col += sunColor * sunGlow * (smoothstep(0.9986, 0.999, s) * 3.0 + pow(max(s, 0.0), 24.0) * 0.4) * aboveHorizon;
      col += vec3(0.85, 0.9, 1.0) * moon * smoothstep(0.9992, 0.9995, -s) * aboveHorizon;
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

/** Gradient sky with sun and moon discs; its horizon color matches the fog so distant hills blend in. */
function SkyDome() {
  const mesh = useRef<Mesh>(null);
  const uniforms = useMemo(
    () => ({
      top: { value: sky.top },
      horizon: { value: sky.horizon },
      sunDir: { value: sky.sunDir },
      sunColor: { value: sky.lightColor },
      sunGlow: { value: 0 },
      moon: { value: 0 },
    }),
    [],
  );
  useFrame(({ camera }) => {
    mesh.current?.position.copy(camera.position);
    // Uniforms reference the live `sky` colors/vectors; only the scalars need setting.
    uniforms.sunGlow.value = Math.min(1, Math.max(0, (sky.sunDir.y + 0.25) / 0.25));
    uniforms.moon.value = sky.night;
  });
  return (
    <mesh ref={mesh} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[DOME_R, 32, 16]} />
      <shaderMaterial args={[{ ...skyShader, uniforms }]} side={BackSide} depthWrite={false} fog={false} />
    </mesh>
  );
}

const STAR_COUNT = 900;

function Stars() {
  const points = useRef<Points>(null);
  const mat = useRef<PointsMaterial>(null);
  const positions = useMemo(() => {
    const rand = mulberry32(7);
    const out = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      // Upper hemisphere only, uniform over the sphere's area.
      const y = 0.05 + rand() * 0.95;
      const r = Math.sqrt(1 - y * y);
      const a = rand() * Math.PI * 2;
      out.set([Math.cos(a) * r * DOME_R * 0.9, y * DOME_R * 0.9, Math.sin(a) * r * DOME_R * 0.9], i * 3);
    }
    return out;
  }, []);
  useFrame(({ camera }) => {
    const p = points.current;
    if (!p || !mat.current) return;
    p.visible = sky.night > 0.01;
    p.position.copy(camera.position);
    mat.current.opacity = sky.night * 0.9;
  });
  return (
    <points ref={points} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial ref={mat} size={2} sizeAttenuation={false} color="#ffffff" transparent depthWrite={false} fog={false} />
    </points>
  );
}

/** Time-of-day lighting: sun/moon, ambient, sky, stars and fog color, all driven by daytime.ts. */
export function DayNight() {
  const ambient = useRef<AmbientLight>(null);
  const fog = useRef<Fog>(null);
  // Compute once up front so the first frame isn't drawn with blank colors.
  const initialFog = useMemo(() => {
    updateSky();
    return sky.horizon.clone();
  }, []);
  // A day lasts DAY_LENGTH_MS (24 min), so twice a second is plenty.
  const skyTick = useMemo(() => ticker(2), []);
  useFrame((_, delta) => {
    if (!skyTick(delta)) return;
    updateSky();
    ambient.current?.color.copy(sky.ambientColor);
    if (ambient.current) ambient.current.intensity = sky.ambientIntensity;
    fog.current?.color.copy(sky.horizon);
  });
  return (
    <>
      <fog ref={fog} attach="fog" args={[initialFog, FOG.near, FOG.far]} />
      <ambientLight ref={ambient} />
      <SkyDome />
      <Stars />
      <Sun />
    </>
  );
}
