import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || "chrome", headless: true });
const page = await browser.newPage();
await page.addInitScript(() => {
  window.players = []; window.browserReadings = [];
  window.Audio = class {
    constructor(src) { this.src = src; window.players.push(this); }
    async play() { this.played = true; }
    pause() { this.paused = true; }
    load() {}
    removeAttribute() {}
  };
  Object.defineProperty(window, "speechSynthesis", { value: {
    speak(value) { window.browserReadings.push(value.text); }, cancel() {}, getVoices() { return []; },
  } });
});
let calls = 0;
try {
  await page.route("https://air-quality-api.open-meteo.com/**", r => r.abort());
  await page.route("https://api.open-meteo.com/**", r => r.abort());
  await page.route("**/api/voice", r => {
    if (r.request().method() === "GET") return r.fulfill({ json: { configured: true } });
    calls++;
    assert.deepEqual(Object.keys(r.request().postDataJSON()), ["text"]);
    return r.fulfill({ contentType: "audio/wav", body: Buffer.alloc(44) });
  });
  await page.goto(process.env.BASE_URL || "http://127.0.0.1:5173");
  await page.getByRole("button", { name: "Explore demo", exact: true }).click();
  await page.locator("#generate-summary").click();
  await page.waitForFunction(() => document.querySelector("#generate-summary").getAttribute("aria-busy") === "false");
  await page.locator("#listen-summary").click();
  await page.waitForFunction(() => window.players[0]?.played);
  assert.equal(await page.locator("#listen-summary").getAttribute("aria-pressed"), "true");
  await page.locator("#listen-summary").click();
  assert.equal(await page.evaluate(() => window.players[0].paused), true);
  await page.locator("#listen-summary").click();
  await page.waitForFunction(() => window.players[1]?.played);
  assert.equal(calls, 1, "replay must reuse audio without another provider request");
  await page.evaluate(() => window.players[1].onended());
  assert.match(await page.locator("#summary-status").textContent(), /finished/);
  await page.locator("#listen-summary").click();
  await page.waitForFunction(() => window.players[2]?.played);
  await page.locator("#activity").selectOption("run");
  assert.equal(await page.evaluate(() => window.players[2].paused), true);
  assert.equal(await page.locator("#listen-summary").isDisabled(), true);
  await page.route("**/api/voice", r => r.fulfill({ status: 502, json: { error: "Voice unavailable" } }));
  await page.locator("#generate-summary").click();
  await page.waitForFunction(() => document.querySelector("#generate-summary").getAttribute("aria-busy") === "false");
  await page.locator("#listen-summary").click();
  await page.waitForFunction(() => window.browserReadings.length === 1);
  assert.match(await page.locator("#summary-status").textContent(), /browser voice/);
  await page.locator("#activity").selectOption("walk");
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route("**/api/voice", async r => {
    await gate;
    await r.fulfill({ contentType: "audio/wav", body: Buffer.alloc(44) }).catch(() => {});
  });
  await page.locator("#generate-summary").click();
  await page.waitForFunction(() => document.querySelector("#generate-summary").getAttribute("aria-busy") === "false");
  const requested = page.waitForRequest(r => r.url().endsWith("/api/voice") && r.method() === "POST");
  await page.locator("#listen-summary").click(); await requested;
  await page.locator("#listen-summary").click(); release();
  await page.waitForLoadState("networkidle");
  assert.equal(await page.evaluate(() => window.players.length), 3);
  assert.equal(await page.evaluate(() => window.browserReadings.length), 1);
  assert.match(await page.locator("#summary-status").textContent(), /stopped/);
  console.log("Cloud audio start/stop/end, replay cache, context cleanup, privacy payload and browser fallback passed (mocked provider/audio).");
} finally { await browser.close(); }
