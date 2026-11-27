import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
try {
  await page.goto(process.env.BASE_URL || "http://127.0.0.1:5173");
  await page.locator("#demo-toggle").click();
  await page.waitForFunction(() => document.querySelectorAll(".action-card").length === 3);
  assert.match(await page.locator("#action-context").textContent(), /New Delhi.*illustrative demo data/);
  for (const [routine, title] of [["home", "Combine your essential errands"], ["family", "Share the family-trip miles"], ["community", "Make parked pickups engine-off"]]) {
    await page.locator("#routine").selectOption(routine);
    assert.equal(await page.locator(".action-card h3").first().textContent(), title);
    assert.equal(await page.locator(".action-details dt").count(), 6);
    assert.equal(await page.locator(".action-source").count(), 3);
  }
  await page.locator("#routine").selectOption("home");
  await page.locator("#daily-plan").screenshot({ path: "docs/images/action-plan.png" });
  const pending = page.waitForResponse(r => r.url().endsWith("/api/summary"));
  await page.locator("#generate-summary").click();
  const response = await pending;
  assert.equal(response.request().postDataJSON().routine, "home");
  assert.doesNotMatch(JSON.stringify(response.request().postDataJSON()), /asthma|heart|email|profile/);
  await page.waitForFunction(() => document.querySelector("#generate-summary").getAttribute("aria-busy") === "false");
  assert.match(await page.locator("#generated-summary").textContent(), /Mostly at home|errands|indoor/i);
  await page.locator("#routine").selectOption("family");
  assert.equal(await page.locator("#listen-summary").isDisabled(), true);
  assert.equal(await page.locator("#summary-source").textContent(), "");
  for (const width of [1440, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator("#daily-plan").scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const scan = await new AxeBuilder({ page }).include("#daily-plan").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    assert.deepEqual(scan.violations.map(v => v.id), []);
  }
  await page.route("https://air-quality-api.open-meteo.com/**", r => r.abort());
  await page.route("https://api.open-meteo.com/**", r => r.abort());
  await page.locator("#demo-toggle").click();
  await page.waitForFunction(() => !document.querySelector("#error-banner").hidden);
  assert.equal(await page.locator(".action-card").count(), 0);
  assert.match(await page.locator("#action-context").textContent(), /Refresh data/);
  assert.deepEqual(errors, []);
  console.log("Routine changes, impact explanations, source links, summary privacy, stale-state clearing, responsive layout and accessibility passed.");
} finally { await browser.close(); }
