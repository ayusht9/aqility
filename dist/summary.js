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
  let cloud = false, voiceRequest = null, audio = null, audioURL = null;
  let cachedAudio = null;
  fetch("/api/voice").then(r => r.ok ? r.json() : {}).then(config => {
    cloud = config.configured === true;
    listen.disabled = !text || (!supported && !cloud);
    if (cloud && !supported && !text) status.textContent = "";
  }).catch(() => {});

  function stop() {
    voiceRequest?.abort(); voiceRequest = null;
    if (audio) { audio.onended = audio.onerror = null; audio.pause(); audio.removeAttribute("src"); audio.load(); audio = null; }
    if (audioURL) { URL.revokeObjectURL(audioURL); audioURL = null; }
    const active = utterance;
    utterance = null;
    if (active) { active.onend = active.onerror = null; speech.cancel(); }
    listen.textContent = "Listen";
    listen.setAttribute("aria-pressed", "false");
  }
  function show(value, label) {
    cachedAudio = null;
    text = value;
    output.textContent = value;
    source.textContent = label;
    listen.disabled = !supported && !cloud;
  }
  function reset(input) {
    request?.abort(); request = null;
    stop(); text = ""; cachedAudio = null;
    data = input ? summaryInput(input) : null;
    button.disabled = !data;
    button.textContent = "AI summary";
    button.setAttribute("aria-busy", "false");
    listen.disabled = true;
    source.textContent = "";
    output.textContent = data ? "Get a short overview of current conditions and the next 24 hours." : "Load a city’s conditions to create a summary.";
    status.textContent = supported || cloud ? "" : "Spoken playback is unavailable in this browser. You can still read the summary.";
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
  function browserPlayback(fallback = false) {
    if (!supported) { status.textContent = "Voice is unavailable. You can still read the summary."; return; }
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
    status.textContent = fallback ? "Voice service unavailable. Reading with browser voice…" : "Reading summary aloud…";
    try { speech.speak(reading); } catch { reading.onerror(); }
  }
  listen.addEventListener("click", async () => {
    if (utterance || voiceRequest || audio) { stop(); status.textContent = "Playback stopped."; return; }
    if (!text) return;
    if (!cloud) { browserPlayback(); return; }
    const controller = new AbortController(); voiceRequest = controller;
    const timeout = setTimeout(() => controller.abort(), 25000);
    listen.textContent = "Stop reading";
    listen.setAttribute("aria-pressed", "true");
    status.textContent = "Preparing smallest.ai voice…";
    try {
      if (!cachedAudio) {
        const response = await fetch("/api/voice", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }), signal: controller.signal });
        if (!response.ok || !response.headers.get("content-type")?.startsWith("audio/")) throw new Error();
        const blob = await response.blob();
        if (voiceRequest !== controller) return;
        if (!blob.size || blob.size > 8 * 1024 * 1024) throw new Error();
        cachedAudio = blob;
      }
      if (voiceRequest !== controller) return;
      audioURL = URL.createObjectURL(cachedAudio);
      const player = new Audio(audioURL); audio = player;
      player.onended = () => { if (audio === player) { stop(); status.textContent = "Playback finished."; } };
      player.onerror = () => { if (audio === player) { stop(); cachedAudio = null; browserPlayback(true); } };
      await player.play();
      if (voiceRequest === controller) status.textContent = "Reading with smallest.ai voice…";
    } catch {
      if (voiceRequest === controller) { stop(); browserPlayback(true); }
    } finally {
      clearTimeout(timeout);
      if (voiceRequest === controller) voiceRequest = null;
    }
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden && (utterance || audio || voiceRequest)) { stop(); status.textContent = "Playback stopped."; } });
  window.addEventListener("pagehide", () => { request?.abort(); stop(); });
  reset(null);
  return { reset };
}
