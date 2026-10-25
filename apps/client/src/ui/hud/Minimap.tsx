import { useEffect, useRef } from "react";
import { localPose, remotePositions } from "../../state/runtime";
import { useGame } from "../../state/store";
import { playerColor, usePalette } from "../../world/character/palette";
import { PLAZA_R, STAGE } from "../../world/env/zones/ForestCamp";
import { BEACH_X, EDGE, GRAVEYARD, GROUND, HALF, PATHS, SHORE_X, TOWN, WEST_CLEARING, type Rect } from "../../world/env/layout";
import { WILDS_TREES } from "../../world/env/zones/Wilds";

/** Meters from the player to the map's rim. */
const RANGE = 50;
/** The pre-drawn world covers all the ground there is. */
const EXTENT = EDGE;
/** Resolution of the pre-drawn world. */
const PX_PER_M = 4;

const TREE = "#3f7f58";

const LABELS = [
  { name: "Camp", x: -14, z: 16 },
  { name: "Town", x: 0, z: (TOWN.z0 + TOWN.z1) / 2 },
  { name: "Graveyard", x: 0, z: (GRAVEYARD.z0 + GRAVEYARD.z1) / 2 },
  { name: "Beach", x: 56, z: -14 },
  { name: "Wilds", x: WEST_CLEARING.x, z: WEST_CLEARING.z - 14 },
];

let worldLayer: HTMLCanvasElement | null = null;

/** The static part of the map (ground, zones, paths, trees), drawn once north-up at PX_PER_M. */
function getWorldLayer() {
  if (worldLayer) return worldLayer;
  const c = document.createElement("canvas");
  c.width = c.height = EXTENT * 2 * PX_PER_M;
  const g = c.getContext("2d")!;
  // World meters (x east, z south) to canvas pixels.
  g.scale(PX_PER_M, PX_PER_M);
  g.translate(EXTENT, EXTENT);
  const rect = ({ x0, x1, z0, z1 }: Rect, fill: string, stroke?: string) => {
    g.fillStyle = fill;
    g.fillRect(x0, z0, x1 - x0, z1 - z0);
    if (!stroke) return;
    g.strokeStyle = stroke;
    g.lineWidth = 0.8;
    g.strokeRect(x0, z0, x1 - x0, z1 - z0);
  };
  const circle = (x: number, z: number, r: number, fill: string) => {
    g.fillStyle = fill;
    g.beginPath();
    g.arc(x, z, r, 0, Math.PI * 2);
    g.fill();
  };

  rect({ x0: -EXTENT, x1: EXTENT, z0: -EXTENT, z1: EXTENT }, GROUND.grass);
  rect({ x0: BEACH_X, x1: SHORE_X, z0: -EXTENT, z1: EXTENT }, GROUND.sand);
  rect({ x0: SHORE_X, x1: EXTENT, z0: -EXTENT, z1: EXTENT }, GROUND.water);
  for (const [x, z] of WILDS_TREES) circle(x, z, 1.3, TREE);
  rect(TOWN, "#d9c9a6", "#8a7350");
  rect(GRAVEYARD, "#557a63", "#2f3d35");
  circle(WEST_CLEARING.x, WEST_CLEARING.z, 4, GROUND.dirt);

  for (const { x, z, w, d } of PATHS) rect({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 }, GROUND.dirt);
  rect({ x0: -1.3, x1: 1.3, z0: STAGE.z, z1: 0 }, GROUND.dirt);
  circle(0, 0, PLAZA_R, GROUND.dirt);
  rect({ x0: -STAGE.w / 2, x1: STAGE.w / 2, z0: STAGE.z - STAGE.d / 2, z1: STAGE.z + STAGE.d / 2 }, "#8d8378");

  // The invisible walls.
  g.strokeStyle = "rgba(255, 255, 255, 0.5)";
  g.lineWidth = 0.6;
  g.setLineDash([2, 2]);
  g.strokeRect(-HALF, -HALF, HALF * 2, HALF * 2);
  return (worldLayer = c);
}

interface View {
  /** CSS pixels (the canvas is square). */
  size: number;
  /** World point at the center of the map. */
  cx: number;
  cz: number;
  /** Meters from the center to the edge. */
  range: number;
  /** Map rotation: what's in this direction (rad, 0 = north, clockwise) is drawn at the top. */
  heading: number;
  /** Round minimap: clip to a circle, pin far players to the rim, draw the rim and N marker. */
  round: boolean;
  /** Write player names next to their dots. */
  names: boolean;
}

const labelStyle = (ctx: CanvasRenderingContext2D, weight: number) => {
  ctx.font = `${weight} 10px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 3;
  // Round joins: miter joins spike out of letters like "y".
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillStyle = "#fff";
};

function drawMap(ctx: CanvasRenderingContext2D, dpr: number, palette: string[] | null, v: View) {
  const r = v.size / 2;
  const scale = r / v.range;
  const p = localPose.position;
  const { players, selfId } = useGame.getState();
  const cos = Math.cos(-v.heading);
  const sin = Math.sin(-v.heading);
  /** World point (m) to map pixels from the center. */
  const toMap = (x: number, z: number): [number, number] => {
    const dx = x - v.cx;
    const dz = z - v.cz;
    return [(dx * cos - dz * sin) * scale, (dx * sin + dz * cos) * scale];
  };
  const inside = (x: number, y: number, pad: number) => (v.round ? Math.hypot(x, y) < r - pad : Math.abs(x) < r - pad && Math.abs(y) < r - pad);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, v.size, v.size);
  ctx.save();
  if (v.round) {
    ctx.beginPath();
    ctx.arc(r, r, r, 0, Math.PI * 2);
    ctx.clip();
  }
  ctx.translate(r, r);
  ctx.rotate(-v.heading);
  ctx.scale(scale, scale);
  ctx.translate(-v.cx, -v.cz);
  ctx.drawImage(getWorldLayer(), -EXTENT, -EXTENT, EXTENT * 2, EXTENT * 2);
  ctx.restore();

  ctx.save();
  ctx.translate(r, r);
  labelStyle(ctx, 600);
  for (const l of LABELS) {
    const [x, y] = toMap(l.x, l.z);
    if (!inside(x, y, 14)) continue;
    ctx.strokeText(l.name, x, y);
    ctx.fillText(l.name, x, y);
  }

  // Other players; on the minimap, ones out of range stick to the rim so you can still find them.
  for (const [id, pos] of remotePositions) {
    const info = players[id];
    let [x, y] = toMap(pos.x, pos.z);
    const d = Math.hypot(x, y);
    if (v.round && d > r - 6) [x, y] = [(x / d) * (r - 6), (y / d) * (r - 6)];
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = info ? playerColor(info.appearance, palette) : "#ccc";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    if (v.names && info) {
      labelStyle(ctx, 500);
      ctx.strokeText(info.name, x, y - 11);
      ctx.fillText(info.name, x, y - 11);
    }
  }

  // You: an arrow pointing where your character faces.
  const [px, py] = toMap(p.x, p.z);
  const [fx, fy] = toMap(p.x + Math.sin(localPose.rotY), p.z + Math.cos(localPose.rotY));
  ctx.translate(px, py);
  if (v.names && selfId && players[selfId]) {
    labelStyle(ctx, 700);
    ctx.strokeText("You", 0, -13);
    ctx.fillText("You", 0, -13);
  }
  ctx.rotate(Math.atan2(fy - py, fx - px));
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, 5);
  ctx.lineTo(-2.5, 0);
  ctx.lineTo(-5, -5);
  ctx.closePath();
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#1b1f2a";
  ctx.stroke();
  ctx.restore();

  // North marker: on the rim for the minimap, top center for the full map.
  if (v.round) {
    ctx.beginPath();
    ctx.arc(r, r, r - 1, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.stroke();
  }
  const [nx, ny] = [-Math.sin(v.heading), -Math.cos(v.heading)];
  const [cx, cy] = [r + nx * (r - 9), r + ny * (r - 9)];
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fillStyle = "#1b1f2a";
  ctx.fill();
  labelStyle(ctx, 700);
  ctx.fillStyle = "#ff6b6b";
  ctx.fillText("N", cx, cy + 0.5);
}

/** Redraws a square canvas every animation frame, sized to its CSS box. */
function useMapCanvas(view: () => Omit<View, "size">) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const palette = usePalette();
  const paletteRef = useRef(palette);
  paletteRef.current = palette;
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext("2d")!;
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const size = el.clientWidth;
      const dpr = Math.min(window.devicePixelRatio, 2);
      if (el.width !== Math.round(size * dpr)) el.width = el.height = Math.round(size * dpr);
      drawMap(ctx, dpr, paletteRef.current, { size, ...viewRef.current() });
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  return canvas;
}

/** Circular map in a corner, centered on you. Click it to open the full map. */
export function Minimap() {
  const canvas = useMapCanvas(() => {
    const { position: p, forward: f } = localPose;
    return {
      cx: p.x,
      cz: p.z,
      range: RANGE,
      // Turning with the camera puts what's ahead of the camera at the top.
      heading: useGame.getState().mapNorthUp ? 0 : Math.atan2(f.x, -f.z),
      round: true,
      names: false,
    };
  });
  return <canvas ref={canvas} className="minimap" onClick={() => useGame.getState().set({ mapOpen: true, menuOpen: false })} title="Open map (Tab)" aria-label="Minimap" />;
}

/** The whole world, north up, with everyone's names. */
export function WorldMap() {
  const northUp = useGame((s) => s.mapNorthUp);
  const set = useGame((s) => s.set);
  const setNorthUp = useGame((s) => s.setMapNorthUp);
  const canvas = useMapCanvas(() => ({ cx: 0, cz: 0, range: HALF + 4, heading: 0, round: false, names: true }));
  return (
    <div className="map-backdrop" onClick={() => set({ mapOpen: false })}>
      <div className="panel world-map" role="dialog" aria-label="Map" onClick={(e) => e.stopPropagation()}>
        <div className="menu-header">
          <span className="panel-title">Map</span>
          <button className="icon-btn" onClick={() => set({ mapOpen: false })} aria-label="Close map">
            ✕
          </button>
        </div>
        <canvas ref={canvas} className="world-map-canvas" />
        <div className="field-header">
          <span className="muted small">Corner map</span>
          <div className="segmented" role="tablist" aria-label="Corner map rotation">
            <button className={northUp ? "" : "selected"} role="tab" aria-selected={!northUp} onClick={() => setNorthUp(false)}>
              Turns with camera
            </button>
            <button className={northUp ? "selected" : ""} role="tab" aria-selected={northUp} onClick={() => setNorthUp(true)}>
              North up
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
