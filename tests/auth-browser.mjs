import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const artifacts = await mkdtemp(join(tmpdir(), "aqility-auth-qa-"));
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || "chrome",
  headless: true,
});
const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage();
const errors = [],
  requests = [],
  scans = [];
page.on("pageerror", (error) => errors.push(error.message));
const origin = process.env.BASE_URL || "http://127.0.0.1:5173";
const authOrigin = "https://aqility-test.supabase.co";
const user = {
  id: "c19f8d4e-3c9f-4f19-bfb1-9f692ffad152",
  aud: "authenticated",
  role: "authenticated",
  email: "tester@example.com",
  email_confirmed_at: new Date().toISOString(),
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: new Date().toISOString(),
};
const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const token = () =>
  `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, aud: "authenticated", role: "authenticated", email: user.email, exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
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
    violations: result.violations.map((item) => ({
      id: item.id,
      nodes: item.nodes.map((node) => node.target),
    })),
  });
}

try {
  // Never send emails in automated tests. Only provider network responses are mocked; the real SDK is exercised.
  await page.route("https://air-quality-api.open-meteo.com/**", (route) =>
    route.abort(),
  );
  await page.route("https://api.open-meteo.com/**", (route) => route.abort());
  await page.route("**/auth-config.json", (route) =>
    route.fulfill({ json: { supabaseUrl: "", publishableKey: "" } }),
  );
  await page.goto(origin);
  await page
    .getByRole("button", { name: "Log in", exact: true })
    .first()
    .click();
  await page.waitForFunction(
    () => !document.querySelector("#auth-unavailable").hidden,
  );
  assert.equal(await page.locator("#auth-send").isDisabled(), true);
  await scan("unconfigured provider");
  await page.keyboard.press("Escape");
  await page.route("**/auth-config.json", (route) =>
    route.fulfill({
      json: {
        supabaseUrl: authOrigin,
        publishableKey: "sb_publishable_browser_test",
      },
    }),
  );
  await page.route(authOrigin + "/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "GET,POST,OPTIONS",
        },
      });
      return;
    }
    const payload = request.postDataJSON();
    requests.push({ path, payload });
    if (path.endsWith("/otp")) {
      await route.fulfill({ json: {} });
      return;
    }
    if (path.endsWith("/verify")) {
      if (payload.token === "111111") {
        await route.fulfill({
          status: 403,
          json: { code: "otp_expired", msg: "Token has expired or is invalid" },
        });
        return;
      }
      await route.fulfill({
        json: {
          access_token: token(),
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: "test-refresh-token",
          user,
        },
      });
      return;
    }
    if (path.endsWith("/user")) {
      await route.fulfill({ json: user });
      return;
    }
    if (path.endsWith("/logout")) {
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fulfill({
      status: 400,
      json: { msg: "Unexpected test request" },
    });
  });
  await page
    .getByRole("button", { name: "Register", exact: true })
    .first()
    .click();
  await page.waitForFunction(
    () => !document.querySelector("#auth-send").disabled,
  );
  await page.getByLabel("Your name", { exact: false }).fill("Test User");
  await page.getByLabel("Email address", { exact: true }).fill(user.email);
  await scan("registration email");
  await page.getByRole("button", { name: "Send registration code" }).click();
  await page
    .getByLabel("Verification code", { exact: true })
    .waitFor({ state: "visible" });
  assert.equal(
    requests.find((r) => r.path.endsWith("/otp")).payload.create_user,
    true,
  );
  assert.deepEqual(requests.find((r) => r.path.endsWith("/otp")).payload.data, {
    display_name: "Test User",
  });
  assert.equal(await page.locator("#auth-resend").isDisabled(), true);
  await page.getByLabel("Verification code", { exact: true }).fill("111111");
  await page.getByRole("button", { name: "Verify & register" }).click();
  await page.waitForFunction(() =>
    document
      .querySelector("#auth-status")
      .textContent.includes("invalid or has expired"),
  );
  assert.equal(await page.locator("#account-open").isVisible(), false);
  await scan("invalid verification code");
  await page.setViewportSize({ width: 390, height: 844 });
  await scan("mobile code entry");
  await page.screenshot({
    path: join(artifacts, "registration-code-mobile.png"),
    fullPage: true,
  });
  await page.getByLabel("Verification code", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Verify & register" }).click();
  await page.locator("#account-open").waitFor({ state: "visible" });
  assert.equal(await page.locator("#auth-dialog").isVisible(), false);
  await page.reload();
  await page.locator("#account-open").waitFor({ state: "visible" });
  assert.ok(requests.some((r) => r.path.endsWith("/user")));
  await page.locator("#account-open").click();
  assert.equal(await page.locator("#account-email").textContent(), user.email);
  await scan("account dialog");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("button", { name: "Log in", exact: true })
    .first()
    .waitFor({ state: "visible" });
  assert.equal(
    await page.evaluate(() => sessionStorage.getItem("aqility.auth")),
    null,
  );
  await page
    .getByRole("button", { name: "Log in", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Email address", { exact: true })
    .fill("returning@example.com");
  await page.getByRole("button", { name: "Send login code" }).click();
  await page
    .getByLabel("Verification code", { exact: true })
    .waitFor({ state: "visible" });
  const logins = requests.filter((r) => r.path.endsWith("/otp"));
  assert.equal(logins.at(-1).payload.create_user, false);
  assert.ok(!("display_name" in (logins.at(-1).payload.data || {})));
  await page.keyboard.press("Escape");
  await page.reload();
  await page
    .getByRole("button", { name: "Log in", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Email address", { exact: true })
    .fill("rate@example.com");
  await page.route(authOrigin + "/auth/v1/otp", (route) =>
    route.fulfill({
      status: 429,
      json: { code: "over_email_send_rate_limit", msg: "rate limited" },
    }),
  );
  await page.getByRole("button", { name: "Send login code" }).click();
  await page.waitForFunction(() =>
    document
      .querySelector("#auth-status")
      .textContent.includes("Too many requests"),
  );
  assert.equal(await page.locator("#auth-code-form").isVisible(), false);
  await scan("rate limit error");
  assert.deepEqual(errors, []);
  assert.equal(
    scans.reduce((total, item) => total + item.violations.length, 0),
    0,
  );
  console.log(
    JSON.stringify(
      {
        checks:
          "unconfigured provider, registration, login, invalid OTP, cooldown, SDK session restoration, account, sign out, rate limits, accessibility",
        emailDelivery:
          "Mocked provider; actual delivery requires connected Supabase and sender configuration",
        artifacts,
        scans,
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(artifacts, "results.json"),
    JSON.stringify({ errors, scans }, null, 2),
  );
} finally {
  await browser.close();
}
