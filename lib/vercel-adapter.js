import { Readable } from "node:stream";

/** Reuse the local HTTP handlers with Vercel's Web-standard function API. */
export async function webHandler(request, handler) {
  const incoming = request.body ? Readable.fromWeb(request.body) : Readable.from([]);
  incoming.method = request.method;
  incoming.headers = Object.fromEntries(request.headers);
  incoming.headers.host ||= new URL(request.url).host;
  incoming.socket = { remoteAddress: request.headers.get("x-vercel-forwarded-for") || "unknown" };
  const headers = new Headers();
  let status = 200, body;
  const response = {
    setHeader(key, value) { headers.set(key, String(value)); },
    writeHead(code, values) { status = code; for (const [key, value] of Object.entries(values || {})) headers.set(key, String(value)); },
    end(value) { body = value; },
  };
  await handler(incoming, response);
  return new Response(body, { status, headers });
}
