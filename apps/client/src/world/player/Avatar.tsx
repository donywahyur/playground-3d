import type { Appearance } from "@hangout/shared";
import { CharacterModel } from "../character/CharacterModel";

/** Distance from the capsule collider center down to the feet. */
export const FOOT_OFFSET = 0.85;
/** Gap the Rapier character controller keeps between the capsule and the ground. */
export const CONTROLLER_OFFSET = 0.01;

interface Props {
  appearance: Appearance;
  /** Read every frame so animation follows live state without re-rendering. */
  getAnim: () => string;
  /** The local player: always casts a real shadow and animates at full rate. */
  local?: boolean;
}

/** Player avatar positioned so its feet sit on the ground below the capsule center. Faces +Z. */
export function Avatar({ appearance, getAnim, local }: Props) {
  return (
    <group position-y={-(FOOT_OFFSET + CONTROLLER_OFFSET)}>
      <CharacterModel appearance={appearance} getAnim={getAnim} local={local} />
      <mesh rotation-x={-Math.PI / 2} position-y={0.01}>
        <circleGeometry args={[0.4, 24]} />
        <meshBasicMaterial color="black" transparent opacity={0.15} depthWrite={false} />
      </mesh>
    </group>
  );
}
