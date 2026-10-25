// Dev tool: print the colormap cells recolor.ts detects for each Kenney character.
// Run from the repo root: pnpm --filter @hangout/server exec tsx ../client/scripts/detected-parts.mts
import { readFileSync, readdirSync } from "node:fs";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { detectedCells } from "../src/world/character/recolor.ts";

(globalThis as any).ProgressEvent ??= class extends Event {};
const dir = new URL("../public/characters/", import.meta.url).pathname;
for (const f of readdirSync(dir).filter((f) => f.endsWith(".glb")).sort()) {
  const raw = readFileSync(dir + f);
  const n = raw.readUInt32LE(12);
  const json = JSON.parse(raw.subarray(20, 20 + n).toString());
  delete json.images; delete json.textures; delete json.samplers;
  for (const m of json.materials) delete m.pbrMetallicRoughness?.baseColorTexture;
  json.buffers = [{ byteLength: json.buffers[0].byteLength, uri: "data:application/octet-stream;base64," + raw.subarray(28 + n).toString("base64") }];
  const g: any = await new Promise((r, j) => new GLTFLoader().parse(JSON.stringify(json), "", r, j));
  console.log(f.slice(10, -4).padEnd(9), JSON.stringify(detectedCells(g.scene)));
}
