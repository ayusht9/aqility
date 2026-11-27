/** Shared HTTP boundaries for the local server and Vercel adapter. */
export function sendJson(res, status, value) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}

export function validateJsonRequest(req, res) {
  const { origin, host } = req.headers;
  if (origin && origin !== `http://${host}` && origin !== `https://${host}`) {
    sendJson(res, 403, { error: "Origin not allowed." });
    return false;
  }
  const mediaType = req.headers["content-type"]?.split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    sendJson(res, 415, { error: "Use JSON." });
    return false;
  }
  return true;
}

export class BodyTooLargeError extends Error {
  constructor() {
    super("Request body exceeds the byte limit");
    this.name = "BodyTooLargeError";
  }
}

export async function readJsonBody(req, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > maxBytes) throw new BodyTooLargeError();
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** Limits are per process; each endpoint owns an independent limiter. */
export function createRequestLimiter({ maxRequests = 10, maxActive = 3,
  maxClients = 1000, windowMs = 60000, now = Date.now } = {}) {
  const clients = new Map();
  let active = 0;
  return {
    acquire(key) {
      const time = now();
      for (const [ip, entry] of clients) {
        if (entry.until <= time) clients.delete(ip);
      }
      const entry = clients.get(key) || { count: 0, until: time + windowMs };
      if (entry.count >= maxRequests || active >= maxActive ||
          (!clients.has(key) && clients.size >= maxClients)) return null;
      entry.count++;
      clients.set(key, entry);
      active++;
      let released = false;
      return () => {
        if (!released) active--;
        released = true;
      };
    },
  };
}
