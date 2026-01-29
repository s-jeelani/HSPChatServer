const http = require("http");
const fs = require("fs");
const path = require("path");
const { sendDiscordMessage } = require("./bot/discord");

function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const raw = line.slice(eq + 1).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;
    const value = raw.replace(/^["']|["']$/g, "");
    process.env[key] = value;
  }
}

loadDotEnv();

const PORT = process.env.PORT || 3000;
const MAX_BODY_BYTES = 1024 * 1024;

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let data = "";

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      data += chunk.toString("utf8");
    });

    req.on("end", () => resolve(data));
    req.on("error", (err) => reject(err));
  });
}

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  const url = req.url ? req.url.split("?")[0] : "";

  if (url === "/health") {
    json(res, 200, { ok: true, status: "up" });
    return;
  }

  if (req.method === "POST" && (url === "/api/ingest" || url === "/message")) {
    try {
      const body = await readRequestBody(req);
      const contentType = String(req.headers["content-type"] || "");
      let message = "";

      if (contentType.includes("application/json")) {
        let parsed = {};
        try {
          parsed = body ? JSON.parse(body) : {};
        } catch (err) {
          json(res, 400, { ok: false, error: "Invalid JSON" });
          return;
        }
        if (typeof parsed?.message === "string") {
          message = parsed.message;
        } else if (typeof parsed?.content === "string") {
          message = parsed.content;
        } else if (body.trim()) {
          message = JSON.stringify(parsed);
        }
      } else {
        message = body;
      }

      if (!message || !message.trim()) {
        json(res, 400, { ok: false, error: "Missing message" });
        return;
      }

      await sendDiscordMessage(message);
      json(res, 200, { ok: true });
    } catch (err) {
      console.error(err);
      json(res, 500, { ok: false, error: String(err?.message || err) });
    }
    return;
  }

  json(res, 404, { ok: false, error: "Not Found" });
});

server.listen(PORT, () => {
  console.log(`listening on ${PORT}`);
});
