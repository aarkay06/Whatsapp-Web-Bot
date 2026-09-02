const { parseTimeString } = require("../helpers");

async function handleReminder(message, client, recurringMap) {
  const text = message.body.toLowerCase();
  const chatId = message.from;

  // --- One-time Reminder ---
  if (text.startsWith("!remindme ") && !text.startsWith("!remindme every ")) {
    const args = text.split(" ");
    const timeStr = args[1];
    const reminderText =
      message.body.split(" ").slice(2).join(" ") || "Here is your reminder!";
    const parsed = parseTimeString(timeStr);
    if (parsed) {
      message.reply(
        `⏰ Got it! I'll remind you in *${parsed.amount}${parsed.unit}*.`,
      );
      setTimeout(
        () => client.sendMessage(chatId, `⏰ *REMINDER:* ${reminderText}`),
        parsed.ms,
      );
    } else {
      message.reply("Invalid format. Use: `!remindme 10m <message>`");
    }
  }

  // --- Recurring Reminder ---
  if (text.startsWith("!remindme every ")) {
    const args = text.split(" ");
    const timeStr = args[2];
    const reminderText =
      message.body.split(" ").slice(3).join(" ") || "Recurring reminder!";
    const parsed = parseTimeString(timeStr);
    if (parsed) {
      if (recurringMap.has(chatId))
        clearInterval(recurringMap.get(chatId).intervalId);
      const intervalId = setInterval(
        () =>
          client.sendMessage(
            chatId,
            `🔔 *SCHEDULED REMINDER:* ${reminderText}`,
          ),
        parsed.ms,
      );
      recurringMap.set(chatId, { intervalId, text: reminderText });
      message.reply(
        `✅ Recurring reminder set every *${parsed.amount}${parsed.unit}*!\nSend *!cancelreminder* to stop it.`,
      );
    } else {
      message.reply("Invalid format. Use: `!remindme every 10m <message>`");
    }
  }

  // --- Cancel Recurring Reminder ---
  if (text === "!cancelreminder") {
    if (recurringMap.has(chatId)) {
      clearInterval(recurringMap.get(chatId).intervalId);
      recurringMap.delete(chatId);
      message.reply("✅ Recurring reminder cancelled.");
    } else {
      message.reply("No active recurring reminder in this chat.");
    }
  }
}

module.exports = {
  handleReminder,
};
