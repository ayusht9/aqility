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
    if (size > 8 * 1024 * 1024) throw new Error("Voice response too large");
    chunks.push(chunk);
  }
  const audio = Buffer.concat(chunks);
  if (audio.length < 44 || audio.toString("ascii", 0, 4) !== "RIFF" || audio.toString("ascii", 8, 12) !== "WAVE")
    throw new Error("Invalid voice response");
  return audio;
}

const limits = new Map();
let active = 0;
export async function handleVoice(req, res) {
  const send = (code, value) => {
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    res.end(JSON.stringify(value));
  };
  if (req.method === "GET") return send(200, { configured: !!process.env.SMALLEST_API_KEY });
  if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return send(405, { error: "Use POST." }); }
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`)
    return send(403, { error: "Origin not allowed." });
  if (req.headers["content-type"]?.split(";")[0] !== "application/json") return send(415, { error: "Use JSON." });
  const now = Date.now(), key = req.socket.remoteAddress;
  for (const [ip, entry] of limits) if (entry.until <= now) limits.delete(ip);
  const entry = limits.get(key) || { count: 0, until: now + 60000 };
  if (entry.count >= 10 || active >= 3 || (!limits.has(key) && limits.size >= 1000)) {
    res.setHeader("Retry-After", "60"); return send(429, { error: "Please try again shortly." });
  }
  entry.count++; limits.set(key, entry); active++;
  try {
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 12000) return send(413, { error: "Voice text is too large." });
      chunks.push(chunk);
    }
    let text;
    try {
      text = JSON.parse(Buffer.concat(chunks).toString("utf8")).text;
      if (typeof text !== "string" || !text.trim() || text.length > 2000) throw new Error();
    } catch { return send(400, { error: "Invalid voice text." }); }
    const audio = await synthesizeVoice(text);
    if (!audio) return send(503, { error: "Voice service is not configured." });
    res.writeHead(200, { "Content-Type": "audio/wav", "Content-Length": audio.length,
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    res.end(audio);
  } catch { send(502, { error: "Voice service is unavailable. Try browser playback." }); }
  finally { active--; }
}
