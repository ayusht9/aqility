import { chromium } from "playwright";
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { resolve, join } from "node:path";
import { synthesizeVoice } from "../voice-api.js";
import { createHash } from "node:crypto";

const out = resolve(process.env.DEMO_OUTPUT_DIR || "exports/demo-video");
await mkdir(out, { recursive: true });
const exists = path => access(path).then(() => true, () => false);
const scenes = [
  { id: "intro", title: "Your air.\nYour next move.", text: "Air quality is only the start. Aqility helps you choose what to do next." },
  { id: "overview", title: "Your air.\nAt a glance.", text: "See your city's air quality and weather. This walkthrough uses clearly labeled demo data." },
  { id: "routine", title: "Your day.\nYour routine.", text: "Choose your routine: commuting, staying home, family trips, or community activities." },
  { id: "impact", title: "Small choices.\nClearer impact.", text: "Get lower emission alternatives and indoor air tips. Every card explains why it fits and how your choice can help. Health details stay in your browser." },
  { id: "planner", title: "Plan your\nnext move.", text: "Compare the next twenty four hours, and check precautions before choosing an outdoor activity." },
  { id: "summary", title: "Clear actions.\nSimple words.", text: "Tap A I summary. G P T five nano turns conditions and your action plan into a clear briefing." },
  { id: "voice", title: "Press play.\nHear your air.", text: "Tap Listen to hear the briefing with Smallest A I. Stop whenever you need." },
  { id: "outro", title: "Know your air.\nPlan your day.", text: "Built for Hack two skill Prompt Wars Virtual. Know your air. Plan your day. Check local advisories; this is not medical advice." },
];
await writeFile(join(out, "storyboard.json"), JSON.stringify(scenes, null, 2));

async function narration() {
  const manifestPath = join(out, "narration-cache.json");
  const manifest = await exists(manifestPath) ? JSON.parse(await readFile(manifestPath, "utf8")) : {};
  for (const scene of scenes) {
    const file = join(out, `${scene.id}.wav`);
    const signature = createHash("sha256").update(JSON.stringify({ text: scene.text, voice: process.env.SMALLEST_VOICE_ID || "meher", model: "lightning_v3.1_pro" })).digest("hex");
    if (await exists(file) && manifest[scene.id] === signature) continue;
    const audio = await synthesizeVoice(scene.text);
    if (!audio) throw new Error("Set SMALLEST_API_KEY in .env for the video voiceover.");
    await writeFile(file, audio);
    manifest[scene.id] = signature;
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`Voiceover ready: ${scene.id}`);
  }
}
async function capture() {
  if (await exists(join(out, "capture.json"))) {
    const previous = JSON.parse(await readFile(join(out, "capture.json"), "utf8"));
    if (previous.format === "landscape" && previous.storyVersion === 2) { console.log("Reusing updated landscape app recording."); return; }
  }
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 },
    recordVideo: { dir: out, size: { width: 1280, height: 800 } }, reducedMotion: "reduce" });
  const clock = Date.now();
  const page = await context.newPage();
  const video = page.video();
  const shots = [];
  const wait = ms => page.waitForTimeout(ms);
  // Cursor halo is a recording overlay; all controls and responses are the actual app.
  await page.addInitScript(() => {
    addEventListener("DOMContentLoaded", () => {
      const dot = document.createElement("div"); dot.id = "demo-cursor";
      dot.style.cssText = "position:fixed;width:28px;height:28px;border:3px solid #c9f75b;background:#087c7240;border-radius:50%;pointer-events:none;z-index:99999;left:-100px;top:-100px;box-shadow:0 0 0 6px #087c7220";
      document.body.append(dot);
      addEventListener("mousemove", e => { dot.style.left = `${e.clientX - 14}px`; dot.style.top = `${e.clientY - 14}px`; });
    });
  });
  async function click(selector) {
    const locator = page.locator(selector).first();
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 20 });
    await wait(300); await locator.click();
  }
  async function shot(id, action) {
    const start = (Date.now() - clock) / 1000;
    await action();
    shots.push({ id, start, duration: (Date.now() - clock) / 1000 - start });
    await page.screenshot({ path: join(out, `${id}-app.png`) });
    console.log(`Actual app scene recorded: ${id}`);
  }
  try {
    await page.goto(process.env.BASE_URL || "http://127.0.0.1:5173");
    await page.locator("#demo-toggle").click();
    await page.waitForFunction(() => document.querySelector("#mode-badge").textContent === "Demo data");
    await page.locator(".metrics").scrollIntoViewIfNeeded();
    await shot("overview", async () => { await wait(1700); await page.mouse.wheel(0, 220); await wait(1700); await page.mouse.wheel(0, -150); await wait(1000); });
    await page.locator("#daily-plan").scrollIntoViewIfNeeded();
    await shot("routine", async () => {
      await wait(800);
      for (const routine of ["home", "family", "community"]) {
        await page.locator("#routine").selectOption(routine); await wait(1100);
      }
      await page.locator("#routine").selectOption("family"); await wait(1000);
    });
    await shot("impact", async () => {
      await wait(1200);
      await page.mouse.wheel(0, 170); await wait(1800);
      await page.mouse.move(950, 590, { steps: 20 }); await wait(1000);
      await page.mouse.wheel(0, -120); await wait(1300);
    });
    await page.locator("#forecast").scrollIntoViewIfNeeded();
    await shot("planner", async () => {
      await wait(900); await page.locator("#activity").selectOption("run"); await wait(1000);
      await page.locator("#activity").selectOption("walk"); await wait(700);
      await click(".hour:nth-child(3)"); await wait(1300); await page.mouse.wheel(0, 250); await wait(1100);
    });
    await page.locator("#ai-summary").scrollIntoViewIfNeeded();
    let generated;
    await shot("summary", async () => {
      await wait(700);
      const response = page.waitForResponse(r => r.url().endsWith("/api/summary"), { timeout: 25000 });
      await click("#generate-summary"); generated = await (await response).json();
      if (generated.source !== "ai") throw new Error("Real AI generation unavailable; refusing to record a fake success.");
      await page.waitForFunction(() => document.querySelector("#summary-source").textContent === "AI-generated summary");
      await wait(1900);
    });
    await shot("voice", async () => {
      const response = page.waitForResponse(r => r.url().endsWith("/api/voice") && r.request().method() === "POST", { timeout: 30000 });
      await click("#listen-summary"); const audio = await response;
      if (!audio.ok()) throw new Error("Real cloud voice unavailable.");
      await writeFile(join(out, "app-voice.wav"), await audio.body());
      await page.waitForFunction(() => document.querySelector("#summary-status").textContent.includes("Reading with smallest.ai"));
      await wait(3200); await click("#listen-summary"); await wait(800);
    });
    await context.close();
    const path = await video.path();
    await writeFile(join(out, "capture.json"), JSON.stringify({ video: path, shots, format: "landscape", storyVersion: 2, origin: process.env.BASE_URL || "http://127.0.0.1:5173",
      realAI: true, realCloudVoice: true, environment: "Illustrative demo data", summary: generated.summary }, null, 2));
  } finally { await browser.close(); }
}
const results = await Promise.allSettled([narration(), capture()]);
for (const result of results) if (result.status === "rejected") throw result.reason;
console.log("Capture and narration complete.");
