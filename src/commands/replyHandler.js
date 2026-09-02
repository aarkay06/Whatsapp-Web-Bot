async function handleReply(message, client, autoReplies) {
  if (!message.hasQuotedMsg) {
    return message.reply(
      "❌ Reply to someone's message first, then use `/reply <text>`",
    );
  }

  const chat = await message.getChat();
  const targetChatId = chat.id._serialized;
  const quoted = await message.getQuotedMessage();

  const targetUser = quoted.author ?? quoted.from;

  if (!targetUser) {
    return message.reply("❌ Could not identify the target user.");
  }

  const replyText = message.body.slice(7).trim();

  if (replyText.toLowerCase() === "stop") {
    const key = `${targetChatId}::${targetUser}`;
    if (autoReplies.has(key)) {
      autoReplies.delete(key);
      message.reply("🛑 Auto-reply stopped for that user.");
    } else {
      message.reply("ℹ️ No active auto-reply for that user.");
    }
    return;
  }

  if (!replyText) {
    return message.reply(
      "❌ Reply text cannot be empty.\nUsage: `/reply Shut Up`",
    );
  }

  const key = `${targetChatId}::${targetUser}`;
  autoReplies.set(key, replyText);

  const targetContact = await client.getContactById(targetUser);
  const targetName = targetContact.pushname ?? targetUser.split("@")[0];
}

async function handleAutoReplyTrigger(message, autoReplies) {
  const text = message.body.toLowerCase();
  if (!text.startsWith("/")) {
    const chat = await message.getChat();
    const targetChatId = chat.id._serialized;
    const senderUser = message.author ?? message.from;
    const key = `${targetChatId}::${senderUser}`;

    if (autoReplies.has(key)) {
      await message.reply(autoReplies.get(key));
    }
  }
}

module.exports = {
  handleReply,
  handleAutoReplyTrigger,
};
