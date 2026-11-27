import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { summaryInput, localSummary } from "../dist/summary-data.js";
import { createSummary, handleSummary } from "../summary-api.js";

const reading = { time: "2026-11-27T12:00", aqi: 180, temp: 25, uv: 3, rain: 10 };
const input = () => ({ city: "Delhi, India", activity: "walk", demo: true,
  current: { ...reading }, hours: [{ ...reading }] });

test("summary whitelist excludes health, account, and unrelated reading fields", () => {
  const value = input();
  value.profile = { asthma: true }; value.email = "private@example.com";
  value.current.health = "private";
  const clean = JSON.stringify(summaryInput(value));
  assert.doesNotMatch(clean, /private|asthma|email|health|profile/);
});

test("summary preserves demo label and indoor guidance for unhealthy air", () => {
  const summary = localSummary(input());
  assert.match(summary, /Illustrative demo data/);
  assert.match(summary, /180 \(Unhealthy\)/);
  assert.match(summary, /indoors/);
  assert.match(summary, /No lower-concern daytime window/);
});

test("missing readings stay unavailable and never become a recommended window", () => {
  const data = input(); data.current.aqi = null; data.hours[0].aqi = null;
  assert.match(localSummary(data), /US AQI unavailable \(Unavailable\)/);
  assert.doesNotMatch(localSummary(data), /option is/);
  assert.throws(() => summaryInput({ ...data, hours: Array(25).fill(reading) }));
  assert.throws(() => summaryInput({ ...data, activity: "toString" }));
  assert.throws(() => summaryInput({ ...data, current: { ...reading, time: "2026-02-30T12:00" } }));
});

test("forecast recommendations exclude past and beyond-24-hour readings", () => {
  const data = input();
  data.hours = [{ ...reading, time: "2026-11-26T12:00", aqi: 20 },
    { ...reading, time: "2026-11-28T12:00", aqi: 20 }];
  assert.match(localSummary(data), /No lower-concern daytime window/);
});

test("missing credentials skip provider; provider failures return labeled local summaries", async () => {
  const missing = await createSummary(input(), { env: {}, generate: () => { throw new Error("must not call"); } });
  assert.equal(missing.source, "local");
  const failed = await createSummary(input(), { env: { AI_GATEWAY_API_KEY: "test" },
    generate: async () => { throw new Error("private provider details"); } });
  assert.deepEqual(failed, missing);
});

test("AI request uses bounded instructions and sanitized environmental report", async () => {
  const data = input(); data.profile = { asthma: true };
  const response = await createSummary(data, { env: { AI_GATEWAY_API_KEY: "test", AI_SUMMARY_MODEL: "test/model" },
    generate: async options => {
      assert.equal(options.model, "test/model");
      assert.equal(options.maxRetries, 0);
      assert.equal(options.maxOutputTokens, 400);
      assert.doesNotMatch(options.prompt, /asthma|profile":/);
      assert.match(options.instructions, /Do not weaken indoor recommendations/);
      return { text: "Conditions favor indoor activity. Check local advisories." };
    } });
  assert.equal(response.source, "ai");
});

test("OpenAI key selects GPT-5 nano directly and disables response storage", async () => {
  const response = await createSummary(input(), {
    env: { OPENAI_API_KEY: "test-key", AI_GATEWAY_API_KEY: "test-gateway" },
    generate: async options => {
      assert.equal(options.model.modelId, "gpt-5-nano");
      assert.equal(options.model.provider, "openai.responses");
      assert.equal(options.providerOptions.openai.store, false);
      assert.equal(options.providerOptions.openai.reasoningEffort, "minimal");
      assert.equal(options.maxOutputTokens, 1000);
      return { text: "General environmental summary." };
    },
  });
  assert.equal(response.source, "ai");
});

test("real OpenAI SDK sends GPT-5 nano request and parses a provider response", async t => {
  let called = false;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(String(url), "https://api.openai.com/v1/responses");
    const body = JSON.parse(options.body);
    assert.equal(body.model, "gpt-5-nano");
    assert.equal(body.store, false);
    assert.equal(body.reasoning.effort, "minimal");
    assert.equal(body.max_output_tokens, 1000);
    called = true;
    return Response.json({ id: "resp_test", object: "response", created_at: 1795780800,
      model: "gpt-5-nano", status: "completed", error: null, incomplete_details: null,
      output: [{ id: "msg_test", type: "message", role: "assistant", status: "completed",
        content: [{ type: "output_text", text: "Conditions favor indoor activity.", annotations: [] }] }],
      usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110,
        input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } },
    });
  });
  const result = await createSummary(input(), { env: { OPENAI_API_KEY: "test-only-not-a-real-key" } });
  assert.equal(called, true);
  assert.deepEqual(result, { source: "ai", summary: "Illustrative demo data. Conditions favor indoor activity." });
});

test("summary HTTP boundary rejects bad method, foreign origins, malformed and oversized bodies", async () => {
  const server = http.createServer(handleSummary);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/summary`;
  const post = (body, headers = {}) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body });
  try {
    assert.equal((await fetch(url)).status, 405);
    assert.equal((await post("{}", { Origin: "https://other.example" })).status, 403);
    assert.equal((await post("not json")).status, 400);
    assert.equal((await post(JSON.stringify({ city: "x" }))).status, 400);
    assert.equal((await post("x".repeat(16001))).status, 413);
    assert.equal((await post("{}", { "Content-Type": "text/plain" })).status, 415);
    for (let i = 0; i < 8; i++) await post("{}");
    assert.equal((await post("{}")).status, 429);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
