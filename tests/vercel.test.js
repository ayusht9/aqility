import test from "node:test";
import assert from "node:assert/strict";
import { webHandler } from "../lib/vercel-adapter.js";
import api from "../api/index.js";

test("Vercel adapter preserves request body, origin, client identity and binary response", async () => {
  const request = new Request("https://aqility.example/api/voice", { method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://aqility.example", "x-vercel-forwarded-for": "203.0.113.8" },
    body: JSON.stringify({ text: "Read my summary." }) });
  const response = await webHandler(request, async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    assert.deepEqual(JSON.parse(Buffer.concat(chunks)), { text: "Read my summary." });
    assert.equal(req.method, "POST");
    assert.equal(req.headers.origin, "https://aqility.example");
    assert.equal(req.headers.host, "aqility.example");
    assert.equal(req.socket.remoteAddress, "203.0.113.8");
    res.setHeader("Cache-Control", "no-store");
    res.writeHead(200, { "Content-Type": "audio/wav" });
    res.end(Buffer.from([82, 73, 70, 70]));
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("content-type"), "audio/wav");
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [82, 73, 70, 70]);
});

test("Vercel API dispatches rewritten routes and rejects unsupported paths and methods", async () => {
  const voice = await api.fetch(new Request("https://aqility.example/api?endpoint=voice"));
  assert.equal(typeof (await voice.json()).configured, "boolean");
  const method = await api.fetch(new Request("https://aqility.example/api/summary"));
  assert.equal(method.status, 405);
  const missing = await api.fetch(new Request("https://aqility.example/api/unknown"));
  assert.equal(missing.status, 404);
  const invalid = await api.fetch(new Request("https://aqility.example/api?endpoint=summary", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: "not json" }));
  assert.equal(invalid.status, 400);
});
