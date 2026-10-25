// Draw calls and triangles per frame (main + shadow pass) at a few spots, plus software-rendered fps for
// comparing before/after, and a screenshot of each spot in out/. With `pnpm dev` running: `pnpm e2e:perf`.
// Headless fps is not phone fps. Extra args go into the page URL, e.g. `pnpm e2e:perf cull=0` for the unculled baseline.
import { APP_URL, launch, OUT_DIR } from "./lib.mjs";

/** Name, position, and how far to drag the camera sideways (px) before measuring. */
const SPOTS = [
  ["spawn", [0, 1, 6], 0],
  ["town", [0, 1, -50], 0],
  ["beach", [55, 1, 8], 0],
  ["graveyard", [0, 1, 50], 900],
  ["wilds", [-50, 1, 0], 0],
];

const args = process.argv.slice(2);
const query = [...(args.some((a) => a.startsWith("time=")) ? [] : ["time=0.3"]), ...args].join("&");
const tag = args.join("-").replace(/[^\w-]/g, "");

const browser = await launch();
const rows = [];
for (const [name, [x, y, z], drag] of SPOTS) {
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 700 } })).newPage();
  page.on("pageerror", (e) => console.log(`[${name} pageerror]`, e.message));
  await page.goto(`${APP_URL}/?${query}`);
  await page.waitForFunction(() => performance.getEntriesByType("resource").some((e) => e.name.includes("/src/state/runtime.ts")));
  // Pin the spawn point before joining (the server's spawn is ignored).
  await page.evaluate(async ([x, y, z]) => {
    const url = performance.getEntriesByType("resource").find((e) => e.name.includes("/src/state/runtime.ts")).name;
    const { spawn } = await import(url);
    spawn.set(x, y, z);
    spawn.set = function () {
      return this;
    };
  }, [x, y, z]);
  await page.fill('input[placeholder="Your name"]', `perf-${name}`);
  await page.click("button.primary");
  await page.waitForSelector(".players");
  await page.waitForTimeout(6000);
  if (drag) {
    await page.mouse.move(500, 400);
    await page.mouse.down();
    await page.mouse.move(500 + drag, 400, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(1000);
  }
  rows.push({
    spot: name,
    ...(await page.evaluate(
      () =>
        new Promise((resolve) => {
          const { gl } = window.__three;
          // The shadow map renders inside gl.render; snapshot the counters around it to split the two passes.
          const shadow = { calls: 0, triangles: 0 };
          const renderShadows = gl.shadowMap.render.bind(gl.shadowMap);
          gl.shadowMap.render = (...args) => {
            const { calls, triangles } = gl.info.render;
            renderShadows(...args);
            shadow.calls = gl.info.render.calls - calls;
            shadow.triangles = gl.info.render.triangles - triangles;
          };
          let frames = 0;
          const t0 = performance.now();
          const tick = () => {
            frames++;
            if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
            else {
              const { calls, triangles } = gl.info.render;
              resolve({ calls, triangles, shadowCalls: shadow.calls, shadowTris: shadow.triangles, fps: +((frames * 1000) / (performance.now() - t0)).toFixed(1) });
            }
          };
          requestAnimationFrame(tick);
        }),
    )),
  });
  await page.screenshot({ path: `${OUT_DIR}perf-${name}${tag && `-${tag}`}.png` });
  await page.context().close();
}
console.table(rows);
await browser.close();
