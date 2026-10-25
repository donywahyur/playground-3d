// Every character with the same recolor (hair purple, top yellow, bottom green, shoes red, skin brown),
// to eyeball that part detection works on all 12. Output: scripts/e2e/out/recolor-grid.png
import { readFileSync } from "node:fs";
import { OUT_DIR, launch, pickCharacter, APP_URL } from "./lib.mjs";

const IDS = ["female-a", "female-b", "female-c", "female-d", "female-e", "female-f", "male-a", "male-b", "male-c", "male-d", "male-e", "male-f"];
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 1000, height: 1200 } })).newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(APP_URL);
await page.click("text=Customize character");
await page.waitForSelector(".color-row");
for (const [part, id] of [["Hair", 7], ["Top", 2], ["Bottom", 1], ["Shoes", 4], ["Skin", 14]]) {
  await page.click(`[aria-label="${part}"] [aria-label="${part} color ${id}"]`);
}
for (const id of IDS) {
  await pickCharacter(page, id);
  await page.waitForTimeout(700);
  await page.locator(".home-stage").screenshot({ path: OUT_DIR + `recolor-${id}.png` });
}
// Stitch into one grid image.
const html =
  `<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(6,1fr);gap:4px;font:14px sans-serif;color:#fff">` +
  IDS.map((id) => `<div><img src="data:image/png;base64,${readFileSync(OUT_DIR + `recolor-${id}.png`).toString("base64")}" style="width:100%;display:block"><div style="text-align:center">${id}</div></div>`).join("") +
  "</body>";
const grid = await (await browser.newContext({ viewport: { width: 1800, height: 560 } })).newPage();
await grid.setContent(html);
await grid.screenshot({ path: OUT_DIR + "recolor-grid.png", fullPage: true });
await browser.close();
console.log("wrote", OUT_DIR + "recolor-grid.png");
