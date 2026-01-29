// Discord Bot Code

const https = require("https");

function sendDiscordMessage(body) {
  return new Promise((resolve, reject) => {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
      reject(new Error("Missing DISCORD_WEBHOOK_URL env var"));
      return;
    }

    const url = new URL(webhookUrl);
    const payload = JSON.stringify(body || {});
    const options = {
      hostname: url.hostname,
      path: `${url.pathname}${url.search}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
          return;
        }

        const detail = data ? `: ${data}` : "";
        reject(new Error(`Discord webhook error ${res.statusCode}${detail}`));
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}

module.exports = { sendDiscordMessage };
