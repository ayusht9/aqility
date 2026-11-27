import {
  normalizeEmail,
  validEmail,
  validCode,
  validateAuthConfig,
  authErrorMessage,
} from "./auth-validation.js";

/** Passwordless authentication is delegated to Supabase; no codes or credentials are created here. */
export function initAuth() {
  const $ = (selector) => document.querySelector(selector);
  let client = null,
    readyPromise = null,
    mode = "login",
    pending = null,
    busy = false,
    timer = null,
    session = null;
  const deadlines = new Map();
  const dialog = $("#auth-dialog");

  function status(message, error = false) {
    $("#auth-status").textContent = message;
    $("#auth-status").classList.toggle("is-error", error);
  }
  function updateCooldown() {
    const deadline = (pending && deadlines.get(pending.email)) || 0;
    const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    $("#auth-resend").disabled = busy || !pending || seconds > 0;
    $("#auth-resend").textContent =
      seconds > 0 ? `Resend in ${seconds}s` : "Resend code";
  }
  function startCooldown() {
    clearInterval(timer);
    updateCooldown();
    timer = setInterval(updateCooldown, 1000);
  }
  function setBusy(value) {
    busy = value;
    $("#auth-send").disabled = value || !client;
    $("#auth-verify").disabled = value;
    $("#auth-change-email").disabled = value;
    dialog
      .querySelectorAll("[data-auth-tab]")
      .forEach((button) => (button.disabled = value));
    $("#auth-email-form").setAttribute("aria-busy", String(value));
    $("#auth-code-form").setAttribute("aria-busy", String(value));
    updateCooldown();
  }
  function showEmailStep() {
    pending = null;
    $("#auth-email-form").hidden = false;
    $("#auth-code-form").hidden = true;
    $("#auth-mode-switch").hidden = false;
    $("#auth-code").value = "";
    status("");
    clearInterval(timer);
    if (dialog.open) $("#auth-email").focus();
  }
  function setMode(nextMode) {
    mode = nextMode;
    showEmailStep();
    $("#auth-title").textContent =
      mode === "register" ? "Create your account" : "Welcome back";
    $("#auth-description").textContent =
      mode === "register"
        ? "Register with your email and verify it with a one-time code. No password needed."
        : "Log in with a verification code sent to your email. No password needed.";
    $("#auth-name-field").hidden = mode !== "register";
    $("#auth-send").textContent =
      mode === "register" ? "Send registration code" : "Send login code";
    $("#auth-verify").textContent =
      mode === "register" ? "Verify & register" : "Verify & log in";
    dialog
      .querySelectorAll("[data-auth-tab]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.authTab === mode),
        ),
      );
  }
  function showCodeStep() {
    $("#auth-email-form").hidden = true;
    $("#auth-code-form").hidden = false;
    $("#auth-mode-switch").hidden = true;
    $("#auth-destination").textContent = pending.email;
    $("#auth-code").value = "";
    startCooldown();
    status(
      "Code requested. Check your inbox and spam folder. Only the most recent code will work.",
    );
    if (dialog.open) $("#auth-code").focus();
  }
  function renderSession(next) {
    const previous = session;
    session = next?.user?.email ? next : null;
    $("#signed-out-actions").hidden = !!session;
    $("#account-open").hidden = !session;
    $("#account-email").textContent = session?.user.email || "";
    if (previous && !session) {
      $("#account-dialog").close();
      window.dispatchEvent(new Event("aqility:signedout"));
    }
  }

  async function ready() {
    if (readyPromise) return readyPromise;
    readyPromise = (async () => {
      try {
        const response = await fetch("./auth-config.json", {
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok)
          throw new Error("Authentication configuration unavailable");
        const config = validateAuthConfig(await response.json());
        if (!config) throw new Error("Authentication is not configured");
        const { createClient } = await import("./vendor/supabase.js");
        client = createClient(config.supabaseUrl, config.publishableKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
            storage: window.sessionStorage,
            storageKey: "aqility.auth",
          },
          global: {
            fetch: (url, options = {}) =>
              fetch(url, {
                ...options,
                signal: options.signal
                  ? AbortSignal.any([
                      options.signal,
                      AbortSignal.timeout(15000),
                    ])
                  : AbortSignal.timeout(15000),
              }),
          },
        });
        client.auth.onAuthStateChange((event, next) => {
          if (event !== "INITIAL_SESSION") renderSession(next);
        });
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        if (data.session) {
          const verified = await client.auth.getUser();
          if (verified.error || !verified.data.user) {
            await client.auth.signOut({ scope: "local" });
            renderSession(null);
          } else renderSession({ ...data.session, user: verified.data.user });
        } else renderSession(null);
        $("#auth-unavailable").hidden = true;
        return client;
      } catch {
        client = null;
        readyPromise = null;
        $("#auth-unavailable").hidden = false;
        return null;
      } finally {
        setBusy(false);
      }
    })();
    return readyPromise;
  }

  document.querySelectorAll(".auth-open").forEach((button) =>
    button.addEventListener("click", async () => {
      const nextMode = button.dataset.authMode;
      if (!pending || nextMode !== mode) setMode(nextMode);
      else showCodeStep();
      dialog.showModal();
      $("#auth-unavailable").hidden = true;
      setBusy(true);
      status("Preparing email sign-in…");
      const provider = await ready();
      setBusy(false);
      if (!provider) status("Email sign-in is not available yet.", true);
      else if (!pending) status("");
      if (dialog.open) $(pending ? "#auth-code" : "#auth-email").focus();
    }),
  );
  dialog
    .querySelectorAll("[data-auth-tab]")
    .forEach((button) =>
      button.addEventListener("click", () => setMode(button.dataset.authTab)),
    );
  $("#auth-guest").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    clearInterval(timer);
    $("#auth-code").value = "";
  });
  $("#auth-change-email").addEventListener("click", showEmailStep);

  async function requestCode(challenge) {
    const deadline = deadlines.get(challenge.email) || 0;
    if (deadline > Date.now()) {
      status("Please wait before requesting another code.", true);
      return false;
    }
    const { error } = await client.auth.signInWithOtp({
      email: challenge.email,
      options: {
        shouldCreateUser: challenge.mode === "register",
        ...(challenge.name ? { data: { display_name: challenge.name } } : {}),
      },
    });
    if (error) {
      if (error.status === 429)
        deadlines.set(challenge.email, Date.now() + 60000);
      throw error;
    }
    deadlines.set(challenge.email, Date.now() + 60000);
    pending = challenge;
    return true;
  }
  $("#auth-email-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || !client) return;
    const email = normalizeEmail($("#auth-email").value);
    if (!validEmail(email)) {
      status("Enter a valid email address.", true);
      $("#auth-email").focus();
      return;
    }
    setBusy(true);
    status("Requesting your verification code…");
    try {
      if (
        await requestCode({
          email,
          mode,
          name:
            mode === "register"
              ? $("#auth-name").value.trim().slice(0, 80)
              : "",
        })
      )
        showCodeStep();
    } catch (error) {
      status(authErrorMessage(error, "send"), true);
    } finally {
      setBusy(false);
    }
  });
  $("#auth-resend").addEventListener("click", async () => {
    if (busy || !client || !pending) return;
    setBusy(true);
    status("Requesting a new code…");
    try {
      if (await requestCode(pending)) showCodeStep();
    } catch (error) {
      status(authErrorMessage(error, "send"), true);
    } finally {
      setBusy(false);
    }
  });
  $("#auth-code-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || !client || !pending) return;
    const token = $("#auth-code").value.trim();
    if (!validCode(token)) {
      status("Enter the complete numeric code from your email.", true);
      $("#auth-code").focus();
      return;
    }
    setBusy(true);
    status("Verifying your code…");
    try {
      const { data, error } = await client.auth.verifyOtp({
        email: pending.email,
        token,
        type: "email",
      });
      if (error) throw error;
      if (!data.session?.user?.email)
        throw new Error("No authenticated session");
      renderSession(data.session);
      pending = null;
      $("#auth-code").value = "";
      $("#auth-email-form").reset();
      dialog.close();
      $("#account-open").focus();
      $("#announcement").textContent =
        "Email verified. You are signed in to Aqility.";
    } catch (error) {
      status(authErrorMessage(error, "verify"), true);
      $("#auth-code").setAttribute("aria-invalid", "true");
      $("#auth-code").focus();
    } finally {
      setBusy(false);
    }
  });
  $("#auth-code").addEventListener("input", () =>
    $("#auth-code").removeAttribute("aria-invalid"),
  );
  $("#account-open").addEventListener("click", () => {
    $("#account-status").textContent = "";
    $("#account-dialog").showModal();
  });
  $("#auth-signout").addEventListener("click", async () => {
    if (!client) return;
    $("#auth-signout").disabled = true;
    $("#account-status").textContent = "Signing out…";
    try {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw error;
      renderSession(null);
      pending = null;
      $("#auth-code").value = "";
      $("#announcement").textContent = "You are signed out.";
      $(".auth-open").focus();
    } catch (error) {
      $("#account-status").textContent = authErrorMessage(error, "signout");
    } finally {
      $("#auth-signout").disabled = false;
    }
  });
  // Restore only provider-managed sessions; public environmental data never depends on signing in.
  ready();
}
