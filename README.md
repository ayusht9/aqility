# Aqility

Run all commands from the repository root. Application files live directly here: `dist/`, `scripts/`, `tests/`, `package.json`, and `server.js`.

An urban air-quality assistant for a hackathon. Run `npm start`, then open http://localhost:5173. Run `npm test` for health-guidance, history, planning, and authentication validation checks. The public environmental dashboard requires no API keys. Email authentication needs a configured Supabase project; its official browser SDK is bundled locally.

## Summary and spoken playback

Choose **AI summary** in the quick briefing panel, then **Listen** to read it aloud or **Stop reading** to stop. Playback is opt-in and stops when dashboard inputs change or the tab is hidden. Browsers without speech support retain the written summary. Voices come from the browser/operating system; some speech services may process text remotely.

The summary covers environmental readings and the selected activity for a general adult. Health profile and account fields are excluded from requests; personalized precautions remain in the dashboard. Loading or changing data clears the old briefing. Demo data and missing readings remain explicitly labeled.

Without AI credentials, the button produces a **Local summary** from the existing rules. To enable generated summaries, set the server-only `AI_GATEWAY_API_KEY` in your environment or a local `.env` file; `.env.example` lists the settings. Start with `node --env-file=.env server.js` if using a file. `AI_SUMMARY_MODEL` defaults to `google/gemini-3.8-flash`. Never put the gateway key in `dist/` or public browser configuration. The server uses the AI SDK, limits request size/concurrency/frequency, and falls back to the local summary on provider failure. No live AI generation has been verified without credentials.

`/api/summary` requires the Node server (or a production backend implementing the same endpoint). Static-only hosting keeps local summaries and browser speech through the client fallback. This change does not publish the hosted site. Run `npm run test:summary` with the app server running for browser checks. These exercise the real local API; generated responses and speech playback are mocked for deterministic checks. Audible playback needs a device check.

## Email OTP authentication

Login and registration use Supabase Auth email OTP. Login sets `shouldCreateUser: false`; registration sets it to `true`. Only the email and optional display name are sent to Supabase. Health fields never enter authentication requests. A numeric code is verified by the provider, never generated or checked in browser code. There are no production test codes or mocked authentication endpoints.

`dist/auth-config.json` connects to the Aqility Supabase project (`oyupodxlyxapqhgidxyr`) in the Mumbai region, owned by `ayusht9`. It contains only the public URL and publishable key. The live Auth settings endpoint responds successfully with email authentication and registration enabled. No real inbox delivery has been verified yet.

Dashboard setup remains required: set the site URL, apply the numeric-code template to both email templates, and configure custom SMTP using the steps below. The connected Supabase tools cannot edit those Auth settings. Manage the project at https://supabase.com/dashboard/project/oyupodxlyxapqhgidxyr. The hosted website must also be redeployed with this configuration before it uses this project.

To activate:

1. Use the existing Aqility project above. Email authentication and registration are enabled.
2. Configure the site URL as `https://aqility-air-companion.afloatsesame32.chatgpt.site`.
3. Edit both **Confirm signup** and **Magic Link** email templates to include `{{ .Token }}` as the numeric code, instead of a link-only template. A sample is in `docs/email-otp-template.html`. Review the configured code length and expiry; the form accepts 6–10 numeric digits. Use a short expiry suitable for login (for example, ten minutes).
4. Configure custom SMTP with a verified sending domain for deliveries to public users. Supabase's built-in email sender is restricted to authorized team addresses and is not a production email service. Keep SMTP credentials in Supabase's settings, never in browser files or Git. Provider email and verification rate limits remain authoritative; the 60-second client resend delay only improves the interface.
5. Set the public `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY` environment values, then run `npm run configure:auth`. This writes the public browser configuration. Only `sb_publishable_…` keys are accepted; secret/service-role keys are deliberately rejected. Public project settings may be committed; SMTP passwords, service keys, and management credentials must not be.
6. Run `npm install`, `npm run build`, and the checks below. Deploy the tested configuration, then verify real registration, inbox delivery, invalid/expired codes, repeat login, and sign-out using an email address you own.

Session storage, renewal, and revocation are handled by the Supabase SDK. Sessions use `sessionStorage` and survive reloads within the tab; restoration checks the provider's current user endpoint. Signing out revokes the local session and clears the in-memory health profile. No private server resources or cross-device profile storage are added in this feature. Any future account-owned database/API must validate identity and ownership server-side, with row-level security; frontend account visibility is not an authorization boundary.

`npm run test:auth` runs a real-browser integration suite with the real SDK and **mocked provider responses**. It never sends email. It checks unavailable setup, registration versus login, wrong/expired codes, cooldown, session restoration, account display, sign-out, rate-limit errors, and accessibility. Keep `npm start` running and use installed Chrome, as for the dashboard browser suite.

Official setup references: [Passwordless email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless), [email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), and [API key types](https://supabase.com/docs/guides/getting-started/api-keys).

## Interface and accessibility

The analytical dashboard includes current-condition metrics, 7-day daily and 24-hour hourly trend views, an exact-value table, labeled CSV downloads, interactive forecast hours, pollutant explanations, and a health profile. Charts resize their coordinate system to keep labels readable on small screens. Risks have text labels as well as color.

Controls support keyboards, visible focus, native modal focus containment and Escape dismissal. Dialogs have accessible titles and descriptions. Loading, error, profile, and forecast changes are announced to assistive technology. Mobile forecast targets use two columns. Reduced-motion and forced-colors preferences are respected. The interface uses system fonts and no external font requests.

For browser regression checks, run `npm install`, keep `npm start` running, then run `npm run test:browser`. The script uses installed Google Chrome by default (`BROWSER_CHANNEL=chromium` uses Playwright Chromium after installing it separately). Tests cover chart periods and table data, CSV, profile apply/cancel and focus restoration, city search, hourly selection, error recovery, five viewport sizes, and axe scans of desktop, mobile, dialogs and errors. Reports and screenshots are saved to a temporary directory printed by the script. Automated checks complement manual accessibility testing; they do not certify WCAG conformance.

## Features

- City search and optional device location.
- Open-Meteo/CAMS modeled US AQI, pollutant concentrations, and weather.
- Previous seven days of archived hourly AQI estimates, aggregated daily.
- Next 24 hours of outdoor planning, filtered for daytime, pollution, temperature, rain, and UV.
- Optional in-memory age and health profile; no health fields sent to providers or saved in browser storage.
- Explicit demo mode, error states, keyboard-accessible native dialogs, responsive layout, and chart text alternatives.

## Scope and sources

The planner uses an explainable rules engine, not a clinical risk model. Optional AI summaries rephrase its environmental report; they do not drive the planner or assess individual medical risk. The app connects environmental conditions with published health precautions, not patient records or epidemiological outcome statistics. Historical data are archived model estimates, not observations. Do not interpret the historical comparison as evidence of a causal health relationship.

AQI precautions: https://www.airnow.gov/aqi/aqi-basics/ and https://www.airnow.gov/sites/default/files/2023-03/air-quality-guide-for-particle-pollution_0.pdf. Model data: https://open-meteo.com/en/docs/air-quality-api, https://open-meteo.com/en/docs and https://atmosphere.copernicus.eu/. Open-Meteo free endpoint is for noncommercial use; review its licensing before commercialization.

The planner applies conservative prototype thresholds (temperature below 10°C or at least 30°C, UV at least 6, rain probability at least 40%) alongside AQI rules. These thresholds are planning heuristics, not validated medical cutoffs. The app does not diagnose, prescribe medication, or guarantee safe outdoor conditions. AI summaries can make mistakes and require evaluation before production use. No credentials should be added to static browser code.
