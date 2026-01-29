function buildMinecraftEmbed(payload) {
  const name = typeof payload?.name === "string" ? payload.name.trim() : "";
  const message = typeof payload?.message === "string" ? payload.message.trim() : "";

  if (!name || !message) {
    return null;
  }

  const timestamp = new Date().toISOString();
  const avatarUrl = `https://mc-heads.net/avatar/${encodeURIComponent(name)}/64`;

  return {
    embeds: [
      {
        author: { name },
        description: message,
        thumbnail: { url: avatarUrl },
        footer: { text: timestamp },
      },
    ],
  };
}

module.exports = { buildMinecraftEmbed };
