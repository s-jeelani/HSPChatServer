// Discord Bot Code

const https = require("https");

function sendDiscordMessage(message) {
  return new Promise((resolve, reject) => {
    const token = process.env.DISCORD_TOKEN;
    const channelId = process.env.DISCORD_CHANNEL_ID;

    if (!token || !channelId) {
      reject(new Error("Missing DISCORD_TOKEN or DISCORD_CHANNEL_ID env var"));
      return;
    }

    const body = JSON.stringify({ content: message });
    const options = {
      hostname: "discord.com",
      path: `/api/v10/channels/${channelId}/messages`,
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
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
        reject(new Error(`Discord API error ${res.statusCode}${detail}`));
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    req.write(body);
    req.end();
  });
}

module.exports = { sendDiscordMessage };
