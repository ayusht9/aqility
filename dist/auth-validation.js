export function normalizeEmail(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function validEmail(value) {
  return (
    typeof value === "string" &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

export function validCode(value) {
  return typeof value === "string" && /^[0-9]{6,10}$/.test(value);
}

export function validateAuthConfig(config) {
  if (!config?.supabaseUrl || !config?.publishableKey) return null;
  let url;
  try {
    url = new URL(config.supabaseUrl);
  } catch {
    throw new Error("Invalid authentication URL");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  )
    throw new Error("Authentication requires a valid HTTPS project origin");
  const key = config.publishableKey;
  // Deliberately accept only public publishable keys. Privileged service keys must never reach a browser.
  if (typeof key !== "string" || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))
    throw new Error("A Supabase publishable key is required");
  return { supabaseUrl: url.origin, publishableKey: key };
}

export function authErrorMessage(error, action) {
  if (
    error?.status === 429 ||
    ["over_email_send_rate_limit", "over_request_rate_limit"].includes(
      error?.code,
    )
  )
    return "Too many requests. Wait a moment before trying again.";
  if (
    error?.code === "otp_expired" ||
    (action === "verify" && error?.status === 403)
  )
    return "This code is invalid or has expired. Check the latest email or request a new code.";
  if (error?.code === "captcha_failed")
    return "We could not complete the security check. Please try again later.";
  if (action === "verify")
    return "The code could not be verified. Check the code and try again.";
  if (action === "signout")
    return "We could not sign you out. Check your connection and try again.";
  return "We could not request a code. Check your email address or try again later.";
}
