// Resource use per player with N players in one room, all walking back and forth.
// Voice: WebRTC bytes from getStats, plus SRTP/UDP/IPv4 overhead (wire estimate). State: Colyseus WebSocket bytes.
// Device: browser CPU by process type, JS heap, renderer RSS. Server: CPU/RAM of a docker container, if named.
//
//   APP_URL=http://localhost:8089 SERVER_CONTAINER=bench-srv pnpm e2e:bench 2 4 8
//
// Flags: --silent    the fake mic sends silence instead of a constant beep (shows what DTX saves)
//        --quality=low|high   forces the client's quality setting
// Run it against production builds (the Docker images), not `pnpm dev`. All players share this machine,
// so CPU numbers stop meaning much once it saturates (8 players on an M2 does).
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { APP_URL, launch, OUT_DIR } from "./lib.mjs";

const WARM_MS = 15000;
const WINDOW_MS = 30000;
const SERVER_CONTAINER = process.env.SERVER_CONTAINER;

const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
const sizes = process.argv.slice(2).filter((a) => !a.startsWith("--")).map(Number);
const silent = flags.includes("--silent");
const quality = flags.find((f) => f.startsWith("--quality="))?.split("=")[1];

/** 1 s of 48 kHz mono 16-bit silence; Chrome loops the file. */
function silenceWav() {
  const path = `${OUT_DIR}silence.wav`;
  const samples = 48000;
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(48000, 24);
  buf.writeUInt32LE(96000, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples * 2, 40);
  writeFileSync(path, buf);
  return path;
}

/** Runs in the page before the app: keeps every RTCPeerConnection, optionally pins the quality pref. */
const initScript = (quality) => {
  window.__pcs = [];
  const Orig = window.RTCPeerConnection;
  window.RTCPeerConnection = function (...a) {
    const pc = new Orig(...a);
    window.__pcs.push(pc);
    return pc;
  };
  window.RTCPeerConnection.prototype = Orig.prototype;
  if (quality) localStorage.setItem("hangout:quality", quality);
};

/** Runs in the page: voice counters summed over the open peer connections. */
const voiceStats = async () => {
  const out = { peers: 0, txBytes: 0, txPkts: 0, txHdr: 0, rxBytes: 0, rxPkts: 0, rxHdr: 0, cand: [] };
  for (const pc of window.__pcs) {
    if (pc.connectionState === "closed") continue;
    out.peers++;
    const stats = await pc.getStats();
    let pairId;
    stats.forEach((s) => {
      if (s.type === "outbound-rtp" && s.kind === "audio") {
        out.txBytes += s.bytesSent;
        out.txHdr += s.headerBytesSent;
        out.txPkts += s.packetsSent;
      } else if (s.type === "inbound-rtp" && s.kind === "audio") {
        out.rxBytes += s.bytesReceived;
        out.rxHdr += s.headerBytesReceived;
        out.rxPkts += s.packetsReceived;
      } else if (s.type === "transport") pairId = s.selectedCandidatePairId;
    });
    const pair = pairId && stats.get(pairId);
    if (pair) out.cand.push(`${stats.get(pair.localCandidateId)?.candidateType}/${stats.get(pair.remoteCandidateId)?.candidateType}`);
  }
  return out;
};

function serverStats() {
  if (!SERVER_CONTAINER) return null;
  const [cpu, mem] = execSync(`docker stats --no-stream --format '{{.CPUPerc}} {{.MemUsage}}' ${SERVER_CONTAINER}`).toString().trim().split(" ");
  return { cpu: parseFloat(cpu), mem };
}

const rssMb = (pids = []) =>
  pids.length
    ? execSync(`ps -o rss= -p ${pids.join(",")}`)
        .toString()
        .trim()
        .split(/\s+/)
        .reduce((a, b) => a + Number(b), 0) / 1024
    : 0;

async function run(n) {
  const browser = await launch(silent ? [`--use-file-for-fake-audio-capture=${silenceWav()}`] : []);
  const bs = await browser.newBrowserCDPSession();
  const players = [];
  for (let i = 0; i < n; i++) {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 400 } });
    await ctx.addInitScript(initScript, quality);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log(`[p${i} pageerror]`, e.message));
    const cdp = await ctx.newCDPSession(page);
    const ws = { tx: 0, rx: 0, rxMsgs: 0 };
    // Binary frames arrive base64-encoded.
    const size = (r) => (r.opcode === 1 ? Buffer.byteLength(r.payloadData) : Math.floor((r.payloadData.length * 3) / 4));
    cdp.on("Network.webSocketFrameSent", (e) => (ws.tx += size(e.response)));
    cdp.on("Network.webSocketFrameReceived", (e) => ((ws.rx += size(e.response)), ws.rxMsgs++));
    await cdp.send("Network.enable");
    await cdp.send("Performance.enable");
    // Later players load while earlier ones render, so give the page time.
    await page.goto(APP_URL, { timeout: 120000, waitUntil: "domcontentloaded" });
    await page.waitForSelector('input[placeholder="Your name"]', { timeout: 120000 });
    await page.fill('input[placeholder="Your name"]', `bench${i}`);
    await page.click("button.primary");
    await page.waitForSelector(".players", { timeout: 60000 });
    players.push({ page, cdp, ws });
  }

  // Everyone walks back and forth so moves and patches flow at the real rate.
  let moving = true;
  const walkers = players.map(async ({ page }, i) => {
    let k = i % 2;
    while (moving) {
      const key = k ? "s" : "w";
      await page.keyboard.down(key).catch(() => {});
      await new Promise((r) => setTimeout(r, 1500));
      await page.keyboard.up(key).catch(() => {});
      k ^= 1;
    }
  });
  await new Promise((r) => setTimeout(r, WARM_MS));

  const snap = async () => ({
    t: Date.now(),
    procs: (await bs.send("SystemInfo.getProcessInfo")).processInfo,
    per: await Promise.all(
      players.map(async ({ page, cdp, ws }) => ({
        voice: await page.evaluate(voiceStats),
        ws: { ...ws },
        perf: Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value])),
      })),
    ),
  });
  const a = await snap();
  const srv = [];
  const sampler = setInterval(() => srv.push(serverStats()), 3000);
  await new Promise((r) => setTimeout(r, WINDOW_MS));
  clearInterval(sampler);
  const b = await snap();
  moving = false;
  await Promise.all(walkers);

  const secs = (b.t - a.t) / 1000;
  const kbps = (bytes) => (bytes * 8) / 1000 / secs;
  // On the wire: RTP payload + RTP header + SRTP tag (10) + UDP (8) + IPv4 (20).
  const wire = (bytes, hdr, pkts) => bytes + hdr + pkts * 38;
  const rows = players.map((_, i) => {
    const [x, y] = [a.per[i], b.per[i]];
    const d = (f) => f(y) - f(x);
    return {
      peers: y.voice.peers,
      cand: y.voice.cand,
      voiceUp: kbps(d((s) => wire(s.voice.txBytes, s.voice.txHdr, s.voice.txPkts))),
      voiceDown: kbps(d((s) => wire(s.voice.rxBytes, s.voice.rxHdr, s.voice.rxPkts))),
      wsUp: kbps(d((s) => s.ws.tx)),
      wsDown: kbps(d((s) => s.ws.rx)),
      wsMsgsDown: d((s) => s.ws.rxMsgs) / secs,
      mainThread: (d((s) => s.perf.TaskDuration) / secs) * 100,
      heapMb: y.perf.JSHeapUsedSize / 1048576,
    };
  });

  const cpuByType = {};
  const pidsByType = {};
  for (const p of b.procs) {
    const before = a.procs.find((q) => q.id === p.id);
    cpuByType[p.type] = (cpuByType[p.type] ?? 0) + ((p.cpuTime - (before?.cpuTime ?? 0)) / secs) * 100;
    (pidsByType[p.type] ??= []).push(p.id);
  }
  const avg = (k) => +(rows.reduce((s, r) => s + r[k], 0) / rows.length).toFixed(1);
  const server = srv.filter(Boolean);
  const result = {
    n,
    silent,
    quality: quality ?? "default",
    candidates: [...new Set(rows.flatMap((r) => r.cand))].join(" "),
    perPlayer: {
      voiceUpKbps: avg("voiceUp"),
      voiceDownKbps: avg("voiceDown"),
      wsUpKbps: avg("wsUp"),
      wsDownKbps: avg("wsDown"),
      wsMsgsDownPerSec: avg("wsMsgsDown"),
      mainThreadCpuPct: avg("mainThread"),
      jsHeapMb: avg("heapMb"),
      rendererRssMb: Math.round(rssMb(pidsByType.renderer) / n),
      renderAndGpuCpuPct: +(((cpuByType.renderer ?? 0) + (cpuByType.GPU ?? 0)) / n).toFixed(1),
    },
    browserCpuPctByProcessType: Object.fromEntries(Object.entries(cpuByType).map(([k, v]) => [k, +v.toFixed(1)])),
    gpuProcessRssMb: Math.round(rssMb(pidsByType.GPU)),
    server: server.length
      ? { cpuPctAvg: +(server.reduce((s, x) => s + x.cpu, 0) / server.length).toFixed(1), cpuPctMax: Math.max(...server.map((x) => x.cpu)), mem: server.at(-1).mem }
      : null,
  };
  await browser.close();
  return result;
}

for (const n of sizes.length ? sizes : [2]) {
  console.log(JSON.stringify(await run(n)));
  await new Promise((r) => setTimeout(r, 5000));
}
