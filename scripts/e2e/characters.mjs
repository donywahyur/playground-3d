// Join-screen picker + recolor, sync to another player, walking and held-jump hops.
// Screenshots land in scripts/e2e/out/.
import { OUT_DIR, launch, join, pickCharacter, APP_URL } from "./lib.mjs";

const browser = await launch();

// Recolor on the join screen: female-c with custom hair/top/bottom/shoes.
const lobby = await (await browser.newContext({ viewport: { width: 1000, height: 1200 }, deviceScaleFactor: 2 })).newPage();
lobby.on("pageerror", (e) => console.log("[lobby pageerror]", e.message));
await lobby.goto(APP_URL);
await lobby.waitForTimeout(1500); // let the preview model load
await lobby.screenshot({ path: OUT_DIR + "join-main.png" });
await lobby.click("text=Customize character");
await pickCharacter(lobby, "female-c");
await lobby.waitForSelector(".color-row");
await lobby.screenshot({ path: OUT_DIR + "join-customize.png" });
for (const [part, id] of [["Hair", 7], ["Top", 2], ["Bottom", 1], ["Shoes", 4], ["Skin", 14]]) {
  await lobby.click(`[aria-label="${part}"] [aria-label="${part} color ${id}"]`);
}
await lobby.waitForTimeout(800);
await lobby.screenshot({ path: OUT_DIR + "join-recolored.png" });
await lobby.click("text=Done");
await lobby.click('input[placeholder="Your name"]');
await lobby.fill('input[placeholder="Your name"]', "Hana");
await lobby.click("button.primary");
await lobby.waitForSelector(".players");
const her = lobby;

const him = await join(browser, "Kai", { character: "male-a" });
await him.waitForTimeout(2500);
const seen = await him.evaluate(() =>
  [...window.__hangout.room.state.players.values()].map(
    (p) => `${p.name}:${p.character} skin=${p.skin} hair=${p.hair} top=${p.top} bottom=${p.bottom} shoes=${p.shoes}`,
  ),
);
console.log("Kai sees:\n  " + seen.join("\n  "));
await him.screenshot({ path: OUT_DIR + "game.png" });

// Held jump (visual check: legs should alternate each hop).
await her.keyboard.down("Space");
for (let i = 0; i < 2; i++) {
  await her.waitForTimeout(i === 0 ? 250 : 450);
  await her.screenshot({ path: OUT_DIR + `hop-${i}.png` });
}
await her.keyboard.up("Space");
await browser.close();
console.log("screenshots in", OUT_DIR);
