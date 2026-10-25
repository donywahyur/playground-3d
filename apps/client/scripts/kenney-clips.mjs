// Dev tool: print bone motion of selected Kenney clips over time (run from apps/client: node scripts/kenney-clips.mjs <glb> <clips>).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const req = createRequire(process.cwd() + "/package.json");
const base = req.resolve("three").replace(/build\/three\.c?js$/, "");
const THREE = await import(base + "build/three.module.js");
const { GLTFLoader } = await import(base + "examples/jsm/loaders/GLTFLoader.js");
const file = process.argv[2] ?? "public/characters/character-female-a.glb";
// Drop texture references (external image URI can't load in Node); geometry/animation is all we need.
globalThis.ProgressEvent ??= class extends Event { constructor(t, o = {}) { super(t); Object.assign(this, o); } };
const raw = readFileSync(file);
const jsonLen = raw.readUInt32LE(12);
const json = JSON.parse(raw.subarray(20, 20 + jsonLen).toString());
delete json.images; delete json.textures; delete json.samplers;
for (const m of json.materials ?? []) delete m.pbrMetallicRoughness?.baseColorTexture;
const gltfJson = { ...json, buffers: [{ byteLength: json.buffers[0].byteLength, uri: "data:application/octet-stream;base64," + raw.subarray(20 + jsonLen + 8).toString("base64") }] };
new GLTFLoader().parse(JSON.stringify(gltfJson), "", (g) => {
  const deg = (q) => { const e = new THREE.Euler().setFromQuaternion(q); return [e.x, e.y, e.z].map((v) => Math.round((v * 180) / Math.PI)); };
  for (const name of (process.argv[3] ?? "jump,fall").split(",")) {
    const clip = g.animations.find((c) => c.name === name);
    const mixer = new THREE.AnimationMixer(g.scene);
    const a = mixer.clipAction(clip).play();
    console.log(`== ${name} (${clip.duration.toFixed(2)}s) t | root y | leg-L rot | leg-R rot | torso rot | arm-L rot`);
    const bone = (n) => g.scene.getObjectByName(n);
    for (let t = 0; t <= clip.duration + 1e-6; t += clip.duration / 8) {
      a.time = t; mixer.update(0);
      console.log(t.toFixed(2), bone("root").position.y.toFixed(3), deg(bone("leg-left").quaternion).join(","), deg(bone("leg-right").quaternion).join(","), deg(bone("torso").quaternion).join(","), deg(bone("arm-left").quaternion).join(","));
    }
  }
}, (e) => console.error("ERR", e));
