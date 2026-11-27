import { summaryInput, localSummary } from "./summary-data.js";

export function initSummary() {
  const button = document.querySelector("#generate-summary");
  const listen = document.querySelector("#listen-summary");
  const output = document.querySelector("#generated-summary");
  const status = document.querySelector("#summary-status");
  const source = document.querySelector("#summary-source");
  const speech = window.speechSynthesis;
  const supported = !!speech && typeof window.SpeechSynthesisUtterance === "function";
  let data = null, request = null, text = "", utterance = null;

  function stop() {
    const active = utterance;
    utterance = null;
    if (active) { active.onend = active.onerror = null; speech.cancel(); }
    listen.textContent = "Listen";
    listen.setAttribute("aria-pressed", "false");
  }
  function show(value, label) {
    text = value;
    output.textContent = value;
    source.textContent = label;
    listen.disabled = !supported;
  }
  function reset(input) {
    request?.abort(); request = null;
    stop(); text = "";
    data = input ? summaryInput(input) : null;
    button.disabled = !data;
    button.textContent = "AI summary";
    button.setAttribute("aria-busy", "false");
    listen.disabled = true;
    source.textContent = "";
    output.textContent = data ? "Get a short overview of current conditions and the next 24 hours." : "Load a city’s conditions to create a summary.";
    status.textContent = supported ? "" : "Spoken playback is unavailable in this browser. You can still read the summary.";
  }
  button.addEventListener("click", async () => {
    if (!data || request) return;
    stop();
    const controller = new AbortController(); request = controller;
    button.disabled = true;
    button.textContent = "Summarizing…";
    button.setAttribute("aria-busy", "true");
    show(localSummary(data), "Local summary");
    status.textContent = "Checking AI availability…";
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch("/api/summary", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), signal: controller.signal });
      if (!response.ok) throw new Error("Summary unavailable");
      const result = await response.json();
      if (request !== controller) return;
      if (result.source === "ai" && typeof result.summary === "string" && result.summary.trim() && result.summary.length <= 2000) {
        stop(); show(result.summary, "AI-generated summary");
        status.textContent = "Summary ready. AI can make mistakes; check the dashboard readings.";
      } else {
        status.textContent = "AI is unavailable. Showing a local summary of the dashboard readings.";
      }
    } catch {
      if (request === controller) status.textContent = "AI is unavailable. Showing a local summary of the dashboard readings.";
    } finally {
      clearTimeout(timer);
      if (request === controller) {
        request = null; button.disabled = false; button.textContent = "Refresh AI summary";
        button.setAttribute("aria-busy", "false");
      }
    }
  });
  listen.addEventListener("click", () => {
    if (utterance) { stop(); status.textContent = "Playback stopped."; return; }
    if (!text || !supported) return;
    const reading = new SpeechSynthesisUtterance(text);
    utterance = reading;
    reading.lang = "en";
    const voices = speech.getVoices().filter(v => /^en(?:-|$)/i.test(v.lang));
    reading.voice = voices.find(v => v.localService) || voices[0] || null;
    reading.rate = 0.95;
    reading.onend = () => { if (utterance === reading) { stop(); status.textContent = "Playback finished."; } };
    reading.onerror = () => { if (utterance === reading) { stop(); status.textContent = "Playback unavailable. Please read the summary or try again."; } };
    listen.textContent = "Stop reading";
    listen.setAttribute("aria-pressed", "true");
    status.textContent = "Reading summary aloud…";
    try { speech.speak(reading); } catch { reading.onerror(); }
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden && utterance) { stop(); status.textContent = "Playback stopped."; } });
  window.addEventListener("pagehide", () => { request?.abort(); stop(); });
  reset(null);
  return { reset };
}
