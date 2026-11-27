import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const artifacts = await mkdtemp(join(tmpdir(), "aqility-qa-"));
console.log("Browser QA artifacts:", artifacts);

const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || "chrome",
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(process.env.BASE_URL || "http://127.0.0.1:5173");
  await page.getByRole("button", { name: "Explore demo", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector("#mode-badge").textContent === "Demo data",
  );
  assert.equal(await page.locator(".hour").count(), 8);
  await page.screenshot({
    path: join(artifacts, "dashboard-desktop.png"),
    fullPage: true,
  });
  const scans = [];
  async function scan(label) {
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .map((animation) => animation.finished.catch(() => {})),
      ),
    );
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    scans.push({
      label,
      violations: result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    });
  }
  await scan("desktop");
  await page.getByRole("button", { name: "24 hours", exact: true }).click();
  await page
    .getByRole("button", { name: "Show data table", exact: true })
    .click();
  assert.equal(await page.locator("#history-rows tr").count(), 24);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV", exact: true }).click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /demo-24h/);
  await page
    .getByRole("button", { name: "Hide data table", exact: true })
    .click();
  await page.getByRole("button", { name: "7 days", exact: true }).click();
  const edit = page.getByRole("button", {
    name: "Edit health profile",
    exact: true,
  });
  await edit.click();
  await page
    .getByLabel("Asthma or another lung condition", { exact: true })
    .check();
  await scan("profile dialog");
  await page.keyboard.press("Escape");
  assert.equal(
    await edit.evaluate((el) => el === document.activeElement),
    true,
  );
  await edit.click();
  assert.equal(
    await page
      .getByLabel("Asthma or another lung condition", { exact: true })
      .isChecked(),
    false,
  );
  await page
    .getByLabel("Asthma or another lung condition", { exact: true })
    .check();
  await page.getByRole("button", { name: "Apply profile" }).click();
  assert.match(
    await page.locator("#profile-summary").textContent(),
    /extra precautions/,
  );
  await page.locator("#activity").selectOption("run");
  assert.match(await page.locator("#profile-summary").textContent(), /running/);
  const hour = page.locator(".hour").first();
  await hour.focus();
  await page.keyboard.press("Enter");
  assert.equal(await hour.getAttribute("aria-pressed"), "true");
  // Search path is mocked to keep city tests deterministic and avoid provider availability dependence.
  await page.route("https://geocoding-api.open-meteo.com/**", (route) =>
    route.fulfill({
      json: {
        results: [
          {
            name: "Bengaluru",
            country: "India",
            admin1: "Karnataka",
            latitude: 12.97,
            longitude: 77.59,
            timezone: "Asia/Kolkata",
          },
        ],
      },
    }),
  );
  await page.locator("#city-open").click();
  await scan("location dialog");
  await page.getByLabel("City name", { exact: true }).fill("Bengaluru");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .getByRole("button", { name: "Bengaluru, Karnataka, India" })
    .click();
  await page.waitForFunction(
    () => document.querySelector("#mode-badge").textContent === "Demo data",
  );
  assert.match(await page.locator("#city-name").textContent(), /Bengaluru/);
  for (const width of [1280, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => scrollTo(0, 0));
    const dimensions = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      width: innerWidth,
    }));
    assert.ok(
      dimensions.scroll <= dimensions.width,
      `Horizontal overflow at ${width}: ${JSON.stringify(dimensions)}`,
    );
    if (width === 390) {
      await scan("mobile");
      await page.screenshot({
        path: join(artifacts, "dashboard-mobile.png"),
        fullPage: true,
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.route("https://air-quality-api.open-meteo.com/**", (route) =>
    route.abort(),
  );
  await page.route("https://api.open-meteo.com/**", (route) => route.abort());
  await page.getByRole("button", { name: "Return to live data" }).click();
  await page.waitForFunction(
    () => document.querySelector("#mode-badge").textContent === "Unavailable",
  );
  assert.equal(await page.locator("#error-banner").isVisible(), true);
  assert.equal(await page.locator("#aqi").textContent(), "—");
  await scan("error state");
  await page.getByRole("button", { name: "Explore demo", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector("#mode-badge").textContent === "Demo data",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => scrollTo(0, 0));
  await page.keyboard.press("Control+Home");
  assert.deepEqual(errors, []);
  await writeFile(
    join(artifacts, "results.json"),
    JSON.stringify({ errors, scans }, null, 2),
  );
  assert.equal(
    scans.reduce((sum, scan) => sum + scan.violations.length, 0),
    0,
    "Accessibility scans must pass",
  );
  console.log(
    JSON.stringify(
      {
        checks:
          "forecast selection, chart periods, accessible table, CSV, profile apply/cancel, Escape focus restoration, city search, 5 viewport widths, error recovery",
        errors,
        scans,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
