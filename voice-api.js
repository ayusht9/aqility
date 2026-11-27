import { sendJson, validateJsonRequest, readJsonBody, BodyTooLargeError, createRequestLimiter } from "./lib/http.js";
export async function synthesizeVoice(text, { env = process.env, fetcher = fetch } = {}) {
  if (typeof text !== "string" || !text.trim() || text.length > 2000)
    throw new Error("Invalid voice text");
  if (!env.SMALLEST_API_KEY) return null;
  const response = await fetcher("https://api.smallest.ai/waves/v1/tts", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SMALLEST_API_KEY}`, "Content-Type": "application/json", Accept: "audio/wav" },
    body: JSON.stringify({ text: text.trim(), voice_id: env.SMALLEST_VOICE_ID || "meher",
      model: "lightning_v3.1_pro", sample_rate: 24000, output_format: "wav" }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error("Voice provider unavailable"); }
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    // Stay below Vercel Functions' 4.5 MB response limit.
    if (size > 4 * 1024 * 1024) throw new Error("Voice response too large");
    chunks.push(chunk);
  }
  const audio = Buffer.concat(chunks);
  if (audio.length < 44 || audio.toString("ascii", 0, 4) !== "RIFF" || audio.toString("ascii", 8, 12) !== "WAVE")
    throw new Error("Invalid voice response");
  return audio;
}

const limiter = createRequestLimiter();
export async function handleVoice(req, res) {
  const send = (code, value) => sendJson(res, code, value);
  if (req.method === "GET") return send(200, { configured: !!process.env.SMALLEST_API_KEY });
  if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return send(405, { error: "Use POST." }); }
  if (!validateJsonRequest(req, res)) return;
  const release = limiter.acquire(req.socket.remoteAddress);
  if (!release) {
    res.setHeader("Retry-After", "60");
    return send(429, { error: "Please try again shortly." });
  }
  try {
    let text;
    try {
      text = (await readJsonBody(req, 12000))?.text;
      if (typeof text !== "string" || !text.trim() || text.length > 2000) throw new Error();
    } catch (error) {
      if (error instanceof BodyTooLargeError) return send(413, { error: "Voice text is too large." });
      return send(400, { error: "Invalid voice text." });
    }
    const audio = await synthesizeVoice(text);
    if (!audio) return send(503, { error: "Voice service is not configured." });
    res.writeHead(200, { "Content-Type": "audio/wav", "Content-Length": audio.length,
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    res.end(audio);
  } catch { send(502, { error: "Voice service is unavailable. Try browser playback." }); }
  finally { release(); }
}
