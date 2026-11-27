import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateAuthConfig,
  validEmail,
  normalizeEmail,
  validCode,
  authErrorMessage,
} from "../dist/auth-validation.js";

test("authentication stays unavailable without a configured provider", () => {
  assert.equal(
    validateAuthConfig({ supabaseUrl: "", publishableKey: "" }),
    null,
  );
  assert.equal(validateAuthConfig(null), null);
});
test("only browser-safe publishable keys are accepted", () => {
  const base = { supabaseUrl: "https://project.supabase.co" };
  assert.deepEqual(
    validateAuthConfig({
      ...base,
      publishableKey: "sb_publishable_example123",
    }),
    { ...base, publishableKey: "sb_publishable_example123" },
  );
  for (const key of [
    "sb_secret_unsafe",
    "service_role",
    "eyJhbGciOiJIUzI1NiJ9.privileged.sig",
  ])
    assert.throws(() => validateAuthConfig({ ...base, publishableKey: key }));
});
test("auth provider must be an HTTPS origin without embedded credentials", () => {
  for (const url of [
    "http://project.supabase.co",
    "https://user:password@project.supabase.co",
    "https://project.supabase.co/path",
    "javascript:alert(1)",
    "https://project.supabase.co/?x=y",
  ])
    assert.throws(() =>
      validateAuthConfig({
        supabaseUrl: url,
        publishableKey: "sb_publishable_example",
      }),
    );
});
test("email validation trims whitespace and rejects invalid formats", () => {
  assert.equal(normalizeEmail(" user@example.com "), "user@example.com");
  for (const email of [
    "",
    "bad",
    "a@b",
    "has space@example.com",
    "a".repeat(255) + "@example.com",
  ])
    assert.equal(validEmail(email), false);
  assert.equal(validEmail("first+last@example.com"), true);
});
test("OTP input accepts complete numeric codes only", () => {
  assert.equal(validCode("123456"), true);
  assert.equal(validCode("1234567890"), true);
  for (const code of ["12345", "12345678901", "abcdef", "123 456", "<script>"])
    assert.equal(validCode(code), false);
});
test("auth messages do not leak provider internals or account existence", () => {
  assert.match(authErrorMessage({ status: 429 }, "send"), /Too many requests/);
  assert.match(
    authErrorMessage({ code: "otp_expired" }, "verify"),
    /invalid or has expired/,
  );
  assert.doesNotMatch(
    authErrorMessage({ message: "user not found: secret@example.com" }, "send"),
    /secret|not found/,
  );
});
