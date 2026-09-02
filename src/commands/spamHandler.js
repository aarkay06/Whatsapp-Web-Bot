async function handleSpam(message, client) {
  const isGroup = message.from?.endsWith("@g.us") || message.to?.endsWith("@g.us");
  if (!isGroup) {
    return await message.reply("❌ This command only works in groups.");
  }

  const chatId = message.fromMe ? (message.to ?? message.from) : message.from;

  const rawArgs = message.body.replace(/^[\/!](spam|SPAM)\s*/i, "").trim();
  if (!rawArgs) {
    return await message.reply(
      "❌ Usage: `/spam <message> [count]` or `/spam [count] <message>`\nExample: `/spam hello 5` or `/spam hello` (default & max: 5)"
    );
  }

  const tokens = rawArgs.split(/\s+/);
  let count = 5; // Default limit = 5 if no number specified
  let spamText = "";

  // 1. First token is count (e.g., "/spam 5 hello")
  if (/^\d+$/.test(tokens[0]) && tokens.length > 1) {
    count = parseInt(tokens[0], 10);
    spamText = tokens.slice(1).join(" ");
  }
  // 2. Last token is count (e.g., "/spam Hello 5")
  else if (tokens.length > 1 && /^\d+$/.test(tokens[tokens.length - 1])) {
    count = parseInt(tokens[tokens.length - 1], 10);
    spamText = tokens.slice(0, tokens.length - 1).join(" ");
  }
  // 3. No count token specified (e.g., "/spam Hello") -> default count = 5
  else {
    spamText = rawArgs;
  }

  if (!spamText) {
    return await message.reply("❌ Message cannot be empty.");
  }

  // Cap limit: max 5
  if (count > 5) {
    count = 5;
  }
  if (count < 1) {
    count = 1;
  }

  for (let i = 0; i < count; i++) {
    await client.sendMessage(chatId, spamText);
    await new Promise((r) => setTimeout(r, 400));
  }
}

module.exports = {
  handleSpam,
};
