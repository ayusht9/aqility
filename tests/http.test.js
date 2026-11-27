import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { readJsonBody, BodyTooLargeError, createRequestLimiter } from "../lib/http.js";

test("JSON body limit counts UTF-8 bytes across chunks", async () => {
  const body = Buffer.from(JSON.stringify({ city: "東京" }));
  const request = () => Readable.from([body.subarray(0, 4), body.subarray(4)]);
  assert.deepEqual(await readJsonBody(request(), body.length), { city: "東京" });
  await assert.rejects(readJsonBody(request(), body.length - 1), BodyTooLargeError);
  await assert.rejects(readJsonBody(Readable.from([Buffer.from("{")]), 10), SyntaxError);
});

test("limiter releases concurrency once and retains request counts until expiry", () => {
  let time = 0;
  const limiter = createRequestLimiter({ maxRequests: 2, maxActive: 1, windowMs: 100, now: () => time });
  const release = limiter.acquire("first");
  assert.equal(limiter.acquire("second"), null);
  release();
  release();
  const second = limiter.acquire("first");
  assert.equal(limiter.acquire("second"), null);
  second();
  assert.equal(limiter.acquire("first"), null);
  time = 100;
  assert.equal(typeof limiter.acquire("first"), "function");
});

test("limiter bounds client storage and evicts expired entries", () => {
  let time = 0;
  const limiter = createRequestLimiter({ maxClients: 1, windowMs: 100, now: () => time });
  limiter.acquire("first")();
  assert.equal(limiter.acquire("second"), null);
  time = 100;
  assert.equal(typeof limiter.acquire("second"), "function");
});
