import http from "node:http";
import { readFile } from "node:fs/promises";
import { handleSummary } from "./summary-api.js";
import { handleVoice } from "./voice-api.js";
const files = {
  "/": ["index.html", "text/html"],
  "/app.js": ["app.js", "text/javascript"],
  "/engine.js": ["engine.js", "text/javascript"],
  "/data.js": ["data.js", "text/javascript"],
  "/chart.js": ["chart.js", "text/javascript"],
  "/summary.js": ["summary.js", "text/javascript"],
  "/summary-data.js": ["summary-data.js", "text/javascript"],
  "/style.css": ["style.css", "text/css"],
  "/auth.js": ["auth.js", "text/javascript"],
  "/auth.css": ["auth.css", "text/css"],
  "/auth-validation.js": ["auth-validation.js", "text/javascript"],
  "/auth-config.json": ["auth-config.json", "application/json"],
  "/vendor/supabase.js": ["vendor/supabase.js", "text/javascript"],
};
http
  .createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (pathname === "/api/summary") return handleSummary(req, res);
    if (pathname === "/api/voice") return handleVoice(req, res);
    const entry = files[pathname];
    if (!entry) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    try {
      const body = await readFile(
        new URL("./dist/" + entry[0], import.meta.url),
      );
      res.writeHead(200, {
        "Content-Type": entry[1] + "; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(body);
    } catch {
      res.writeHead(500);
      res.end("Unable to read application file");
    }
  })
  .listen(Number(process.env.PORT || 5173), "127.0.0.1", () =>
    console.log(`Aqility: http://localhost:${process.env.PORT || 5173}`),
  );
