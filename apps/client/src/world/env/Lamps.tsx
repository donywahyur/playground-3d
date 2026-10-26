import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, Color, SRGBColorSpace, type PointLight, type Points } from "three";
import { localPose } from "../../state/runtime";
import { sky } from "../sky/daytime";
import { ticker } from "../math";

/** A light source that switches on at night: position of its flame/bulb in meters. */
export interface Lamp {
  x: number;
  y: number;
  z: number;
  color: string;
  /** Glow sprite diameter (m). */
  glow: number;
}

/** The flame of a fire basket at (x, z), placed at kit `scale`. */
export const fireLamp = (x: number, z: number, scale = 1): Lamp => ({ x, y: 0.4 * scale + 0.1, z, color: "#ff8a3d", glow: 1.2 * scale });

/**
 * Only the nearest few lamps cast real light: every point light costs shading
 * time on every lit surface. By day the pool is hidden so it costs nothing.
 * Showing it changes the light count, which needs other shader variants; those
 * are compiled ahead of time while dusk approaches (see PREWARM_ELEV), so
 * nightfall doesn't stall.
 */
const POOL = 4;
/** Sun elevation (sin of the angle) below which the lit shader variants get precompiled. */
const PREWARM_ELEV = 0.2;
const LIGHT_RANGE = 12;
const LIGHT_INTENSITY = 14;
/** Pooled lights fade out between these distances from the player, so reassigning them doesn't pop. */
const FADE_NEAR = 16;
const FADE_FAR = 26;

const glowShader = {
  vertexShader: /* glsl */ `
    attribute float size;
    attribute vec3 lampColor;
    uniform float viewHalfHeight;
    varying vec3 vColor;
    void main() {
      vColor = lampColor;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * projectionMatrix[1][1] * viewHalfHeight / -mv.z;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform float opacity;
    varying vec3 vColor;
    void main() {
      float d = length(gl_PointCoord - 0.5) * 2.0;
      float a = pow(max(1.0 - d, 0.0), 2.0) * 0.7 + smoothstep(0.3, 0.1, d) * 0.6;
      gl_FragColor = vec4(vColor * a * opacity, 1.0);
    }`,
};

const tmpColor = new Color();

/** Night lighting for the world's lamps: a soft glow on each, real light from the nearest ones. */
export function Lamps({ lamps }: { lamps: Lamp[] }) {
  const lights = useRef<(PointLight | null)[]>([]);
  const glows = useRef<Points>(null);
  const { positions, colors, sizes } = useMemo(() => {
    const positions = new Float32Array(lamps.length * 3);
    const colors = new Float32Array(lamps.length * 3);
    const sizes = new Float32Array(lamps.length);
    lamps.forEach((l, i) => {
      positions.set([l.x, l.y, l.z], i * 3);
      // The glow shader writes straight to the screen, so it takes sRGB values.
      const c = tmpColor.set(l.color).getRGB(tmpColor, SRGBColorSpace);
      colors.set([c.r, c.g, c.b], i * 3);
      sizes[i] = l.glow;
    });
    return { positions, colors, sizes };
  }, [lamps]);
  const uniforms = useMemo(() => ({ opacity: { value: 0 }, viewHalfHeight: { value: 1 } }), []);
  const lampColors = useMemo(() => lamps.map((l) => new Color(l.color)), [lamps]);
  const order = useMemo(() => lamps.map((_, i) => i), [lamps]);
  const dist = useMemo(() => new Float32Array(lamps.length), [lamps]);
  const lightsOn = useRef(false);
  const prewarmed = useRef(false);
  // Nearest-lamp assignment changes slowly as you walk; no need to sort every frame.
  const assignTick = useMemo(() => ticker(10), []);

  const setLightsVisible = (on: boolean) => lights.current.forEach((l) => l && (l.visible = on));

  useFrame(({ gl, scene, camera }, delta) => {
    const on = sky.night > 0;
    if (on !== lightsOn.current) setLightsVisible((lightsOn.current = on));
    if (on || sky.sunDir.y > PREWARM_ELEV) {
      // Re-arm by day, so materials added since (players who joined) get prewarmed too.
      prewarmed.current = on;
    } else if (!prewarmed.current) {
      // compile() reads the lights synchronously, so they only need to be visible during the call.
      prewarmed.current = true;
      setLightsVisible(true);
      gl.compileAsync(scene, camera).catch(() => {});
      setLightsVisible(false);
    }

    if (glows.current) glows.current.visible = sky.night > 0;
    uniforms.opacity.value = sky.night;
    uniforms.viewHalfHeight.value = gl.domElement.height / 2;

    // By day the pool lights are hidden (above); nothing to place.
    if (!on || !assignTick(delta)) return;
    const p = localPose.position;
    lamps.forEach((l, i) => (dist[i] = Math.hypot(l.x - p.x, l.z - p.z)));
    order.sort((a, b) => dist[a] - dist[b]);
    for (let k = 0; k < POOL; k++) {
      const light = lights.current[k];
      if (!light) continue;
      const i = order[k];
      if (i === undefined) {
        light.intensity = 0;
        continue;
      }
      const l = lamps[i];
      const fade = 1 - Math.min(1, Math.max(0, (dist[i] - FADE_NEAR) / (FADE_FAR - FADE_NEAR)));
      light.position.set(l.x, l.y, l.z);
      light.color.copy(lampColors[i]);
      light.intensity = LIGHT_INTENSITY * sky.night * fade;
    }
  });

  return (
    <>
      {Array.from({ length: POOL }, (_, k) => (
        <pointLight key={k} ref={(el) => void (lights.current[k] = el)} visible={false} intensity={0} distance={LIGHT_RANGE} decay={2} />
      ))}
      <points ref={glows} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-lampColor" args={[colors, 3]} />
          <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
        </bufferGeometry>
        <shaderMaterial args={[{ ...glowShader, uniforms }]} transparent depthWrite={false} blending={AdditiveBlending} />
      </points>
    </>
  );
}
