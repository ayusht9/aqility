import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { synthesizeVoice, handleVoice } from "../voice-api.js";

test("voice provider receives bounded summary text with server authentication", async () => {
  const wav = Buffer.alloc(44); wav.write("RIFF"); wav.write("WAVE", 8);
  const audio = await synthesizeVoice("Environmental summary.", {
    env: { SMALLEST_API_KEY: "test-only-key" },
    fetcher: async (url, options) => {
      assert.equal(url, "https://api.smallest.ai/waves/v1/tts");
      assert.equal(options.headers.Authorization, "Bearer test-only-key");
      assert.deepEqual(JSON.parse(options.body), { text: "Environmental summary.", voice_id: "meher",
        model: "lightning_v3.1_pro", sample_rate: 24000, output_format: "wav" });
      return new Response(wav);
    },
  });
  assert.deepEqual(audio, wav);
});

test("voice rejects invalid text and skips provider without credentials", async () => {
  await assert.rejects(synthesizeVoice("", { env: {} }));
  await assert.rejects(synthesizeVoice("x".repeat(2001), { env: {} }));
  assert.equal(await synthesizeVoice("Summary", { env: {}, fetcher: () => { throw new Error("must not call"); } }), null);
});

test("voice rejects provider errors and non-audio responses", async () => {
  await assert.rejects(synthesizeVoice("Summary", { env: { SMALLEST_API_KEY: "test" },
    fetcher: async () => new Response("private error", { status: 401 }) }), /Voice provider unavailable/);
  await assert.rejects(synthesizeVoice("Summary", { env: { SMALLEST_API_KEY: "test" },
    fetcher: async () => new Response("not audio") }), /Invalid voice response/);
});

test("voice endpoint exposes configuration status only and validates requests", async () => {
  const server = http.createServer(handleVoice);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/voice`;
  const post = (body, headers = {}) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body });
  try {
    const config = await (await fetch(url)).json();
    assert.deepEqual(Object.keys(config), ["configured"]);
    assert.equal(typeof config.configured, "boolean");
    assert.equal((await fetch(url, { method: "PUT" })).status, 405);
    assert.equal((await post("{}", { Origin: "https://other.example" })).status, 403);
    assert.equal((await post("{}", { "Content-Type": "text/plain" })).status, 415);
    assert.equal((await post("not json")).status, 400);
    assert.equal((await post("null")).status, 400);
    const typed = await post("{}", { "Content-Type": "Application/JSON; charset=utf-8" });
    assert.equal(typed.status, 400);
    assert.equal(typed.headers.get("cache-control"), "no-store");
    assert.equal((await post(JSON.stringify({ text: "x".repeat(2001) }))).status, 400);
    assert.equal((await post("x".repeat(12001))).status, 413);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
