import { chromium } from "playwright";
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { resolve, join } from "node:path";
import { synthesizeVoice } from "../voice-api.js";

const out = resolve("exports/demo-video");
await mkdir(out, { recursive: true });
const exists = path => access(path).then(() => true, () => false);
const scenes = [
  { id: "intro", title: "Before you\nstep outside.", text: "Before you step outside, know what you're breathing. Meet Aqility." },
  { id: "overview", title: "Your environment.\nOne clear view.", text: "See air quality, temperature, and pollution together. This walkthrough uses clearly labeled demo data." },
  { id: "profile", title: "Precautions\nthat fit you.", text: "Set a health profile to adjust precautions. Your health details stay in this browser tab." },
  { id: "planner", title: "Find your\noutdoor window.", text: "Compare the next twenty four hours. Switch your activity and inspect the forecast before planning your day." },
  { id: "summary", title: "Less reading.\nMore clarity.", text: "Need the big picture? Tap A I summary. G P T five nano turns the readings into a short briefing." },
  { id: "voice", title: "Press play.\nHear your briefing.", text: "Then tap Listen. Smallest A I reads the briefing aloud. Stop playback at any time." },
  { id: "outro", title: "Know your air.\nPlan your day.", text: "Know your air. Plan your day. Aqility. Check local advisories. This is planning support, not medical advice." },
];
await writeFile(join(out, "storyboard.json"), JSON.stringify(scenes, null, 2));

async function narration() {
  for (const scene of scenes) {
    const file = join(out, `${scene.id}.wav`);
    if (await exists(file)) continue;
    const audio = await synthesizeVoice(scene.text);
    if (!audio) throw new Error("Set SMALLEST_API_KEY in .env for the video voiceover.");
    await writeFile(file, audio);
    console.log(`Voiceover ready: ${scene.id}`);
  }
}
async function capture() {
  if (await exists(join(out, "capture.json"))) {
    const previous = JSON.parse(await readFile(join(out, "capture.json"), "utf8"));
    if (previous.format === "landscape") { console.log("Reusing existing landscape app recording."); return; }
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
    await shot("profile", async () => {
      await click(".profile-open"); await wait(600);
      await click('input[name="asthma"]'); await wait(1100);
      await click('#profile-form button[type="submit"]'); await wait(1600);
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
    await writeFile(join(out, "capture.json"), JSON.stringify({ video: path, shots, format: "landscape",
      realAI: true, realCloudVoice: true, environment: "Illustrative demo data", summary: generated.summary }, null, 2));
  } finally { await browser.close(); }
}
const results = await Promise.allSettled([narration(), capture()]);
for (const result of results) if (result.status === "rejected") throw result.reason;
console.log("Capture and narration complete.");
