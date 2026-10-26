// Shrinks the Kenney GLBs in apps/client/public in place: `node scripts/optimize-models.mjs`.
// Already-compressed files are skipped, so it is safe to run again after adding models.
//
// - Characters: drop the animation clips the game never plays (see CLIP in world/character/CharacterModel.tsx),
//   then meshopt-compress losslessly. No quantization: heads are swapped between files (shared bind matrices)
//   and recolor.ts / face.ts read and rewrite the geometry.
// - Kits: quantize positions and normals, then meshopt-compress.
// Texture coordinates are never quantized: colors come from exact cells of the shared colormap.
// Textures stay external (Textures/colormap.png): the client decodes each URL once (three's Cache, main.tsx),
// where an embedded copy per file would be decoded ~120 times.
// drei's useGLTF registers the meshopt decoder by default.
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Format, Logger, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { prune, quantize, reorder } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

const PUBLIC = new URL("../apps/client/public/", import.meta.url).pathname;
/** Clips loaded from the GLBs; wave/dance/cheer are built in code (world/character/emotes.ts). */
const CHARACTER_CLIPS = new Set(["idle", "walk", "sprint", "jump", "fall", "sit", "emote-yes", "emote-no"]);

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });

/** Like io.write for a .glb, but keeps each texture's external URI instead of embedding the image. */
async function writeGlbExternalImages(file, doc) {
  const textures = doc.getRoot().listTextures();
  const uris = textures.map((t) => t.getURI());
  for (const t of textures) t.setImage(null);
  const { json, resources } = await io.writeJSON(doc, { format: Format.GLB });
  json.images?.forEach((img, i) => (img.uri = uris[i]));

  const pad = (buf, byte) => {
    const out = new Uint8Array(Math.ceil(buf.byteLength / 4) * 4).fill(byte);
    out.set(buf);
    return out;
  };
  const chunk = (data, type) => {
    const head = new Uint8Array(8);
    new DataView(head.buffer).setUint32(0, data.byteLength, true);
    new DataView(head.buffer).setUint32(4, type, true);
    return [head, data];
  };
  const parts = chunk(pad(new TextEncoder().encode(JSON.stringify(json)), 0x20), 0x4e4f534a);
  const bin = Object.values(resources)[0];
  if (bin?.byteLength) parts.push(...chunk(pad(bin, 0), 0x004e4942));
  const total = 12 + parts.reduce((n, p) => n + p.byteLength, 0);
  const header = new Uint8Array(12);
  new DataView(header.buffer).setUint32(0, 0x46546c67, true);
  new DataView(header.buffer).setUint32(4, 2, true);
  new DataView(header.buffer).setUint32(8, total, true);
  writeFileSync(file, Buffer.concat([header, ...parts]));
}

const glbs = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? glbs(join(dir, e.name)) : e.name.endsWith(".glb") ? [join(dir, e.name)] : [],
  );

let before = 0;
let after = 0;
for (const file of glbs(PUBLIC)) {
  const doc = await io.read(file);
  doc.setLogger(new Logger(Logger.Verbosity.WARN));
  if (doc.getRoot().listExtensionsUsed().some((e) => e.extensionName === "EXT_meshopt_compression")) continue;
  const size = statSync(file).size;
  const character = file.includes("/characters/");

  if (character) {
    for (const anim of doc.getRoot().listAnimations()) if (!CHARACTER_CLIPS.has(anim.getName())) anim.dispose();
    await doc.transform(prune(), reorder({ encoder: MeshoptEncoder, target: "size" }));
  } else {
    await doc.transform(
      prune(),
      reorder({ encoder: MeshoptEncoder, target: "size" }),
      quantize({ pattern: /^(POSITION|NORMAL)$/, quantizePosition: 14, quantizeNormal: 10 }),
    );
  }
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await writeGlbExternalImages(file, doc);

  const out = statSync(file).size;
  before += size;
  after += out;
  console.log(`${file.slice(PUBLIC.length).padEnd(52)} ${(size / 1024).toFixed(0).padStart(5)} KB -> ${(out / 1024).toFixed(0).padStart(4)} KB`);
}
console.log(`total ${(before / 1048576).toFixed(2)} MB -> ${(after / 1048576).toFixed(2)} MB`);
