import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { MathUtils, Vector3, type Group } from "three";
import { useShallow } from "zustand/react/shallow";
import { fromWire } from "@hangout/shared";
import { sampleSnapshots } from "../../net/interp";
import { remotePositions, remoteStates } from "../../state/runtime";
import { useGame } from "../../state/store";
import { Avatar } from "./Avatar";
import { PlayerBubble } from "./PlayerBubble";
import { lerpAngle, ticker } from "../math";

/** Nametags hide past TAG_HIDE (m from the camera) and come back inside TAG_SHOW; each one is a DOM overlay
 * repositioned every frame, and at that distance it's too small to read anyway. */
const TAG_SHOW = 28;
const TAG_HIDE = 32;

/** Name + mic state. Its own store subscription, so speaking changes re-render only this tag. */
function Nametag({ id }: { id: string }) {
  const tag = useGame(useShallow((s) => {
    const p = s.players[id];
    return { name: p?.name, muted: p?.muted, speaking: p?.speaking };
  }));
  return (
    <div className={`nametag${tag.speaking && !tag.muted ? " speaking" : ""}`}>
      {tag.muted && <span title="Muted">🔇 </span>}
      {tag.name}
    </div>
  );
}

const RemotePlayer = memo(function RemotePlayer({ id }: { id: string }) {
  const group = useRef<Group>(null);
  const visual = useRef<Group>(null);
  const anim = useRef("idle");
  // Shallow-compared so a new (but equal) appearance object doesn't re-render the avatar.
  const appearance = useGame(useShallow((s) => s.players[id]?.appearance));
  const getAnim = useCallback(() => anim.current, []);
  const [tagShown, setTagShown] = useState(true);
  const tagShownRef = useRef(true);
  const tagTick = useMemo(() => ticker(4), []);

  useFrame(({ camera }, delta) => {
    // Snapshot interpolation: render slightly in the past, between the two poses
    // around that time, so motion is smooth and constant-speed. Before the
    // player's first move there are no poses; draw the spawn state.
    const live = remoteStates.get(id);
    const s = sampleSnapshots(id, performance.now()) ?? (live && { a: fromWire(live), b: fromWire(live), alpha: 1 });
    if (!s || !group.current || !visual.current) return;
    const { a, b, alpha } = s;
    const g = group.current;
    g.position.set(MathUtils.lerp(a.x, b.x, alpha), MathUtils.lerp(a.y, b.y, alpha), MathUtils.lerp(a.z, b.z, alpha));
    visual.current.rotation.y = lerpAngle(a.rotY, b.rotY, alpha);
    anim.current = alpha < 1 ? a.anim : b.anim;
    let pos = remotePositions.get(id);
    if (!pos) remotePositions.set(id, (pos = new Vector3()));
    pos.set(g.position.x, g.position.y + 0.5, g.position.z);

    if (tagTick(delta)) {
      const d = camera.position.distanceTo(g.position);
      const show = tagShownRef.current ? d < TAG_HIDE : d < TAG_SHOW;
      if (show !== tagShownRef.current) setTagShown((tagShownRef.current = show));
    }
  });

  if (!appearance) return null;
  return (
    <group ref={group}>
      <group ref={visual}>
        <Avatar appearance={appearance} getAnim={getAnim} />
      </group>
      {tagShown && (
        <Html position-y={1.05} center distanceFactor={10} zIndexRange={[10, 0]}>
          <Nametag id={id} />
        </Html>
      )}
      <PlayerBubble id={id} y={1.22} />
    </group>
  );
});

export function RemotePlayers() {
  // Only the id list: per-player fields are selected inside each player.
  const ids = useGame(useShallow((s) => Object.keys(s.players).filter((id) => id !== s.selfId)));
  return (
    <>
      {ids.map((id) => (
        <RemotePlayer key={id} id={id} />
      ))}
    </>
  );
}
