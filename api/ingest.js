const crypto = require("crypto");
const { sendDiscordMessage } = require("../bot/discordSend");

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_RECENT_IDS = 5;
const DEDUPE_KEY = process.env.DEDUPE_KEY || "hspchat:recent-message-ids";
const KV_REST_API_URL = process.env.KV_REST_API_URL;
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;
const HAS_KV = Boolean(KV_REST_API_URL && KV_REST_API_TOKEN);
const inMemoryRecentIds = [];
const BLACKLISTED_WORDS = {
  "@here": "<@630397659995439125>",
  "@everyone": "<@630397659995439125>",
}; // key is blacklisted word, value is word to be replaced with. Sorry Fataled...

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

function computeMessageId(name, message) {
  return crypto.createHash("sha256").update(name).update("\n").update(message).digest("hex");
}

function normalizeId(value) {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value).trim();
}

function updateRecentIds(list, id) {
  const next = Array.isArray(list) ? list.filter((item) => item !== id) : [];
  next.push(id);
  while (next.length > MAX_RECENT_IDS) {
    next.shift();
  }
  return next;
}

function applyBlacklist(message) {
  let sanitized = message;
  for (const [needle, replacement] of Object.entries(BLACKLISTED_WORDS)) {
    if (!needle) {
      continue;
    }
    sanitized = sanitized.split(needle).join(replacement);
  }
  return sanitized;
}

async function kvGetJson(key) {
  if (!HAS_KV) {
    return null;
  }

  const res = await fetch(`${KV_REST_API_URL}/get/${encodeURIComponent(key)}`, {
    headers: {
      Authorization: `Bearer ${KV_REST_API_TOKEN}`,
    },
  });

  if (!res.ok) {
    return null;
  }

  const data = await res.json();
  if (!data || data.result == null) {
    return null;
  }

  try {
    if (typeof data.result === "string") {
      return JSON.parse(data.result);
    }
    return data.result;
  } catch (err) {
    return null;
  }
}

async function kvSetJson(key, value) {
  if (!HAS_KV) {
    return false;
  }

  const res = await fetch(`${KV_REST_API_URL}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_REST_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ value: JSON.stringify(value) }),
  });

  return res.ok;
}

async function readRecentIds() {
  const stored = await kvGetJson(DEDUPE_KEY);
  if (Array.isArray(stored)) {
    return stored.filter((item) => typeof item === "string");
  }
  return inMemoryRecentIds;
}

async function writeRecentIds(list) {
  if (HAS_KV) {
    await kvSetJson(DEDUPE_KEY, list);
    return;
  }
  inMemoryRecentIds.length = 0;
  inMemoryRecentIds.push(...list);
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

    if (typeof body !== "object" || body === null) {
      json(res, 400, { ok: false, error: "Expected JSON payload" });
      return;
    }

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const rawMessage = typeof body?.message === "string" ? body.message.trim() : "";

    if (!name || !rawMessage) {
      json(res, 400, { ok: false, error: "Missing name or message" });
      return;
    }

    const message = applyBlacklist(rawMessage);
    const rawId = normalizeId(body?.id || body?.hash);
    const messageId = rawId || computeMessageId(name, message);
    const recentIds = await readRecentIds();

    if (recentIds.includes(messageId)) {
      json(res, 200, { ok: true, skipped: true, reason: "duplicate", id: messageId });
      return;
    }

    const nextRecentIds = updateRecentIds(recentIds, messageId);
    await writeRecentIds(nextRecentIds);

    const avatarUrl = `https://mc-heads.net/avatar/${encodeURIComponent(name)}/64`;

    await sendDiscordMessage({
      username: name,
      avatar_url: avatarUrl,
      content: message,
    });
    json(res, 200, { ok: true });
  } catch (err) {
    console.error(err);
    json(res, 500, { ok: false, error: String(err?.message || err) });
  }
};
