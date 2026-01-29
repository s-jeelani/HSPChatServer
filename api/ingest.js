const { sendDiscordMessage } = require("../bot/discord");
const { buildMinecraftEmbed } = require("../bot/formatDiscordEmbed");

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
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    json(res, 405, { ok: false, error: "Use POST" });
    return;
  }

  try {
    const contentType = String(req.headers["content-type"] || "");
    let body = req.body;

    if (body === undefined) {
      const raw = await readRequestBody(req);
      if (!raw || !raw.trim()) {
        json(res, 400, { ok: false, error: "Missing message" });
        return;
      }

      if (contentType.includes("application/json")) {
        try {
          body = JSON.parse(raw);
        } catch (err) {
          json(res, 400, { ok: false, error: "Invalid JSON" });
          return;
        }
      } else {
        body = raw;
      }
    }

    if (typeof body === "string") {
      json(res, 400, { ok: false, error: "Expected JSON payload" });
      return;
    }

    const embedPayload = buildMinecraftEmbed(body);
    if (!embedPayload) {
      json(res, 400, { ok: false, error: "Missing name or message" });
      return;
    }

    await sendDiscordMessage(embedPayload);
    json(res, 200, { ok: true });
  } catch (err) {
    console.error(err);
    json(res, 500, { ok: false, error: String(err?.message || err) });
  }
};
