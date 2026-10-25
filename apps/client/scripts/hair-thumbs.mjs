// Dev tool: render the hairstyle thumbnails (head close-ups) into public/characters/previews/hair-<id>.png.
// With `pnpm dev` running: node scripts/hair-thumbs.mjs (from apps/client).
import { writeFileSync } from "node:fs";
import { APP_URL, launch } from "../../../scripts/e2e/lib.mjs";

const browser = await launch();
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(`${APP_URL}/scripts/hair-thumbs.html`);
await page.waitForFunction(() => window.thumbsReady);
const thumbs = await page.evaluate(() => window.renderThumbs());
for (const [id, url] of Object.entries(thumbs)) {
  const file = new URL(`../public/characters/previews/hair-${id}.png`, import.meta.url);
  writeFileSync(file, Buffer.from(url.split(",")[1], "base64"));
  console.log("wrote", file.pathname);
}
await browser.close();
