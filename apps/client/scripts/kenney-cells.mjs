// Dev tool: which colormap cells (16x4 grid of 32px cells) each Kenney model uses, by body region.
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
const req = createRequire(process.cwd() + "/package.json");
const base = req.resolve("three").replace(/build\/three\.c?js$/, "");
await import(base + "build/three.module.js");
const { GLTFLoader } = await import(base + "examples/jsm/loaders/GLTFLoader.js");
globalThis.ProgressEvent ??= class extends Event { constructor(t, o = {}) { super(t); Object.assign(this, o); } };

function load(file) {
  const raw = readFileSync(file);
  const jsonLen = raw.readUInt32LE(12);
  const json = JSON.parse(raw.subarray(20, 20 + jsonLen).toString());
  delete json.images; delete json.textures; delete json.samplers;
  for (const m of json.materials ?? []) delete m.pbrMetallicRoughness?.baseColorTexture;
  json.buffers = [{ byteLength: json.buffers[0].byteLength, uri: "data:application/octet-stream;base64," + raw.subarray(20 + jsonLen + 8).toString("base64") }];
  return new Promise((res, rej) => new GLTFLoader().parse(JSON.stringify(json), "", res, rej));
}

const dir = "public/characters/";
for (const f of readdirSync(dir).filter((f) => f.endsWith(".glb")).sort()) {
  const g = await load(dir + f);
  const regions = {};
  g.scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const { uv, position, skinIndex, skinWeight } = o.geometry.attributes;
    const bones = o.skeleton.bones.map((b) => b.name);
    for (let i = 0; i < uv.count; i++) {
      const cell = `${Math.floor(uv.getX(i) * 16)}:${Math.floor(uv.getY(i) * 4)}`;
      let best = 0;
      for (let k = 1; k < 4; k++) if (skinWeight.getComponent(i, k) > skinWeight.getComponent(i, best)) best = k;
      const bone = bones[skinIndex.getComponent(i, best)];
      const region = o.name.startsWith("head") ? "head" : bone.startsWith("leg") ? (position.getY(i) < 0.07 ? "feet" : "legs") : bone.startsWith("arm") ? "arms" : "torso";
      ((regions[region] ??= {})[cell] ??= 0), regions[region][cell]++;
    }
  });
  const fmt = (h) => Object.entries(h).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}x${n}`).join(" ");
  console.log(f.replace("character-", "").replace(".glb", "").padEnd(9), Object.entries(regions).map(([r, h]) => `${r}[${fmt(h)}]`).join("  "));
}
