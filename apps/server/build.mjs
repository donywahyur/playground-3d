// Bundles the server (and @hangout/shared) into one ESM file, so the production image needs no node_modules
// and no TypeScript loader: `node dist/index.mjs`.
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  outfile: "dist/index.mjs",
  logLevel: "warning",
  // Some dependencies are CommonJS and call require() (optional native addons in a try/catch); give them one.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
});
