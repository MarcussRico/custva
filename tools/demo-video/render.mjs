/* node render.mjs stills 12.5 40 ...   → stills/t_<sec>.png
   node render.mjs video out.mp4        → every frame at 30fps, piped to ffmpeg */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const manifest = fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8");
const [mode, ...args] = process.argv.slice(2);

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await p.addInitScript(`window.MANIFEST = ${manifest};`);
p.on("pageerror", (e) => console.error("PAGE ERROR", e.message));
await p.goto("file://" + path.join(ROOT, "compose.html"));
await p.evaluate(() => window.ready);
const total = await p.evaluate(() => window.TOTAL);
console.log("total seconds", total.toFixed(1));

if (mode === "stills") {
  fs.mkdirSync(path.join(ROOT, "stills"), { recursive: true });
  for (const s of args) {
    await p.evaluate((t) => window.renderAt(t), Number(s));
    await p.screenshot({ path: path.join(ROOT, "stills", `t_${s}.png`) });
  }
} else {
  const out = args[0] || "out.mp4";
  /* Any ffmpeg with libx264: FFMPEG=/path/to/ffmpeg, or one on PATH. */
  const ffmpeg = process.env.FFMPEG ?? "ffmpeg";
  const FPS = 30;
  const frames = Math.round(total * FPS);
  const ff = spawn(ffmpeg, [
    "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", path.join(ROOT, out)
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    await p.evaluate((t) => window.renderAt(t), i / FPS);
    const buf = await p.screenshot({ type: "jpeg", quality: 94 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % 300 === 0) console.log(`frame ${i}/${frames}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
}
await b.close();
