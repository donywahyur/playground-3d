import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

/** Any installed Chromium-based browser works; override with BROWSER_PATH. */
const CANDIDATES = [
  process.env.BROWSER_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

export const APP_URL = process.env.APP_URL ?? "http://localhost:5173";
export const OUT_DIR = new URL("./out/", import.meta.url).pathname;
mkdirSync(OUT_DIR, { recursive: true });

export async function launch(extraArgs = []) {
  const executablePath = CANDIDATES.find((p) => existsSync(p));
  if (!executablePath) throw new Error("No Chromium browser found; set BROWSER_PATH");
  return chromium.launch({
    executablePath,
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream", // auto-grant mic
      "--use-fake-device-for-media-stream", // synthetic beep as mic input
      "--autoplay-policy=no-user-gesture-required",
      "--enable-unsafe-swiftshader", // software WebGL
      ...extraArgs,
    ],
  });
}

/** In the Customize submenu: switch to the character's gender tab and select it. */
export async function pickCharacter(page, character) {
  await page.click(`.segmented [role="tab"]:text-is("${character.startsWith("male") ? "Male" : "Female"}")`);
  await page.click(`.character-tile[aria-label="${character}"]`);
}

/** Open the app, pick a character (e.g. "female-b") and join. Requires `pnpm dev` running. */
export async function join(browser, name, { character } = {}) {
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 700 } })).newPage();
  page.on("pageerror", (e) => console.log(`[${name} pageerror]`, e.message));
  await page.goto(APP_URL);
  if (character) {
    await page.click("text=Customize character");
    await pickCharacter(page, character);
    await page.click("text=Done");
  }
  await page.fill('input[placeholder="Your name"]', name);
  await page.click("button.primary");
  await page.waitForSelector(".players");
  return page;
}

/** Runs inside the page: the dev-only session handle. */
export const selfState = (page) =>
  page.evaluate(() => {
    const s = window.__hangout;
    return s.room.state.players.get(s.room.sessionId).toJSON();
  });
