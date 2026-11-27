import { webHandler } from "../lib/vercel-adapter.js";
import { handleSummary } from "../summary-api.js";
import { handleVoice } from "../voice-api.js";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const endpoint = url.searchParams.get("endpoint") || url.pathname.slice(5);
    if (endpoint === "summary") return webHandler(request, handleSummary);
    if (endpoint === "voice") return webHandler(request, handleVoice);
    return Response.json({ error: "Not found." }, { status: 404 });
  },
};
