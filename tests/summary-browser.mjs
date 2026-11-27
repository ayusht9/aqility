import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const origin = process.env.BASE_URL || "http://127.0.0.1:5173";
const artifacts = await mkdtemp(join(tmpdir(), "aqility-summary-"));
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || "chrome", headless: true });
const context = await browser.newContext();
// Exercise playback state without producing audio in automated tests.
await context.addInitScript(() => {
  window.spoken = []; window.cancelCount = 0;
  Object.defineProperty(window, "speechSynthesis", { value: {
    speak(value) { window.spoken.push(value.text); window.lastReading = value; },
    cancel() { window.cancelCount++; }, getVoices() { return []; },
  } });
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", e => errors.push(e.message));
try {
  await page.route("https://air-quality-api.open-meteo.com/**", route => route.abort());
  await page.route("https://api.open-meteo.com/**", route => route.abort());
  await page.goto(origin);
  assert.equal(await page.locator("#generate-summary").isDisabled(), true);
  await page.getByRole("button", { name: "Explore demo", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("#generate-summary").disabled);
  const pending = page.waitForResponse(r => r.url().endsWith("/api/summary"));
  await page.locator("#generate-summary").click();
  const response = await pending;
  assert.equal(response.status(), 200);
  assert.doesNotMatch(JSON.stringify(response.request().postDataJSON()), /asthma|heart|profile|email|user_id/);
  await page.waitForFunction(() => document.querySelector("#generate-summary").getAttribute("aria-busy") === "false");
  assert.equal(await page.locator("#summary-source").textContent(), "Local summary");
  assert.match(await page.locator("#generated-summary").textContent(), /Illustrative demo data/);
  await page.locator("#listen-summary").click();
  assert.equal(await page.locator("#listen-summary").getAttribute("aria-pressed"), "true");
  assert.equal(await page.evaluate(() => window.spoken[0]), await page.locator("#generated-summary").textContent());
  await page.locator("#listen-summary").click();
  assert.equal(await page.locator("#listen-summary").textContent(), "Listen");
  await page.locator("#listen-summary").click();
  await page.evaluate(() => window.lastReading.onend());
  assert.match(await page.locator("#summary-status").textContent(), /finished/);
  await page.locator("#listen-summary").click();
  await page.evaluate(() => window.lastReading.onerror());
  assert.match(await page.locator("#summary-status").textContent(), /unavailable/);
  await page.locator("#activity").selectOption("run");
  assert.equal(await page.locator("#listen-summary").isDisabled(), true);
  assert.equal(await page.locator("#summary-source").textContent(), "");
  await page.route("**/api/summary", route => route.fulfill({ json: { source: "ai", summary: "AI test summary <b>plain text</b>." } }));
  await page.locator("#generate-summary").click();
  await page.waitForFunction(() => document.querySelector("#summary-source").textContent === "AI-generated summary");
  assert.equal(await page.locator("#generated-summary b").count(), 0);
  await page.locator("#listen-summary").click();
  await page.locator("#activity").selectOption("walk");
  assert.equal(await page.locator("#listen-summary").getAttribute("aria-pressed"), "false");
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route("**/api/summary", async route => {
    await gate;
    await route.fulfill({ json: { source: "ai", summary: "Stale summary" } }).catch(() => {});
  });
  const started = page.waitForRequest("**/api/summary");
  await page.locator("#generate-summary").click(); await started;
  await page.locator("#activity").selectOption("run"); release();
  await page.waitForLoadState("networkidle");
  assert.doesNotMatch(await page.locator("#generated-summary").textContent(), /Stale/);
  await page.unroute("**/api/summary");
  await page.route("**/api/summary", route => route.abort());
  await page.locator("#generate-summary").click();
  await page.waitForFunction(() => document.querySelector("#summary-status").textContent.includes("AI is unavailable"));
  assert.equal(await page.locator("#listen-summary").isDisabled(), false);
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator(".summary-panel").scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const scan = await new AxeBuilder({ page }).include(".summary-panel").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    assert.deepEqual(scan.violations.map(v => v.id), []);
    await page.screenshot({ path: join(artifacts, `summary-${width}.png`) });
  }
  const unsupported = await browser.newPage();
  await unsupported.addInitScript(() => Object.defineProperty(window, "speechSynthesis", { value: undefined }));
  await unsupported.goto(origin);
  assert.match(await unsupported.locator("#summary-status").textContent(), /unavailable in this browser/);
  await unsupported.close();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks: "live local API, privacy, AI rendering, offline fallback, speech start/stop/end/error, context reset, stale request, unsupported speech, mobile layout, accessibility", artifacts, realAI: "Not exercised: no credentials", audio: "Mocked browser speech; audible output requires a device check" }, null, 2));
} finally { await browser.close(); }
