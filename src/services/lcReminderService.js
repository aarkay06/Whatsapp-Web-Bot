const fs = require("fs");
const path = require("path");

const REMINDERS_FILE = path.join(__dirname, "../../lc_reminders.json");
// Anchor date: Saturday, Aug 15th, 2026 (Month is 0-indexed: 7 = August)
const ANCHOR_BIWEEKLY = new Date(2026, 7, 15);

/**
 * Read subscribed chat IDs from JSON file
 */
function getSubscribedChats() {
  try {
    if (fs.existsSync(REMINDERS_FILE)) {
      const data = fs.readFileSync(REMINDERS_FILE, "utf8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed.groups)) return new Set(parsed.groups);
    }
  } catch (err) {
    console.error("[LC REMINDER] Error reading lc_reminders.json:", err.message);
  }
  return new Set();
}

/**
 * Save subscribed chat IDs to JSON file
 */
function saveSubscribedChats(chatSet) {
  try {
    const data = JSON.stringify({ groups: Array.from(chatSet) }, null, 2);
    fs.writeFileSync(REMINDERS_FILE, data, "utf8");
  } catch (err) {
    console.error("[LC REMINDER] Error saving lc_reminders.json:", err.message);
  }
}

/**
 * Check if a given Saturday is a Biweekly Contest Saturday
 * (Every 2 weeks relative to Saturday, August 15, 2026)
 */
function isBiweeklySaturday(date) {
  if (date.getDay() !== 6) return false;
  const anchorMidnight = new Date(
    ANCHOR_BIWEEKLY.getFullYear(),
    ANCHOR_BIWEEKLY.getMonth(),
    ANCHOR_BIWEEKLY.getDate()
  ).getTime();
  const currentMidnight = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ).getTime();

  const diffDays = Math.round((currentMidnight - anchorMidnight) / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.round(diffDays / 7);
  return diffWeeks % 2 === 0;
}

/**
 * Format Date object to readable string
 */
function formatDateStr(date) {
  const options = { weekday: "short", month: "short", day: "numeric", year: "numeric" };
  return date.toLocaleDateString("en-US", options);
}

/**
 * Get next upcoming reminder dates for Biweekly Saturday (7:30 PM) and Weekly Sunday (7:30 AM)
 */
function getNextReminderDates() {
  const now = new Date();

  // 1. Next Biweekly Saturday (7:30 PM)
  let nextSat = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  while (true) {
    if (nextSat.getDay() === 6 && isBiweeklySaturday(nextSat)) {
      if (
        nextSat.getDate() === now.getDate() &&
        nextSat.getMonth() === now.getMonth() &&
        (now.getHours() > 19 || (now.getHours() === 19 && now.getMinutes() >= 30))
      ) {
        // 19:30 has passed today, move to next
      } else {
        break;
      }
    }
    nextSat.setDate(nextSat.getDate() + 1);
  }

  // 2. Next Sunday (7:30 AM)
  let nextSun = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  while (true) {
    if (nextSun.getDay() === 0) {
      if (
        nextSun.getDate() === now.getDate() &&
        nextSun.getMonth() === now.getMonth() &&
        (now.getHours() > 7 || (now.getHours() === 7 && now.getMinutes() >= 30))
      ) {
        // 07:30 has passed today, move to next
      } else {
        break;
      }
    }
    nextSun.setDate(nextSun.getDate() + 1);
  }

  return {
    biweeklySat: `${formatDateStr(nextSat)} at 7:30 PM`,
    weeklySun: `${formatDateStr(nextSun)} at 7:30 AM`,
  };
}

/**
 * Handle /lcRem command
 */
async function handleLcRemCommand(message) {
  const text = message.body.toLowerCase().trim();
  const chatId = message.fromMe ? (message.to ?? message.from) : message.from;
  const chats = getSubscribedChats();

  const isDisable =
    text.includes("off") ||
    text.includes("stop") ||
    text.includes("disable") ||
    text.includes("cancel");
  const isStatus = text.includes("status");

  if (isDisable) {
    if (chats.has(chatId)) {
      chats.delete(chatId);
      saveSubscribedChats(chats);
      return message.reply("🛑 *LeetCode Contest Reminders disabled for this chat.*");
    } else {
      return message.reply("ℹ️ *LeetCode Contest Reminders are not active in this chat.*");
    }
  }

  if (isStatus) {
    const active = chats.has(chatId);
    const { biweeklySat, weeklySun } = getNextReminderDates();
    let replyMsg = `⏰ *LeetCode Reminders Status*\n`;
    replyMsg += `• Status in this chat: *${active ? "ACTIVE ✅" : "INACTIVE ❌"}*\n\n`;
    replyMsg += `*Next Scheduled Contests:*\n`;
    replyMsg += `• 🏆 Biweekly Contest: *${biweeklySat}*\n`;
    replyMsg += `• 🏆 Weekly Contest: *${weeklySun}*\n`;
    if (!active) replyMsg += `\nSend \`/lcRem\` to activate in this group!`;
    return message.reply(replyMsg);
  }

  // Default: activate/enable for this chat
  chats.add(chatId);
  saveSubscribedChats(chats);

  const { biweeklySat, weeklySun } = getNextReminderDates();
  let replyMsg = `⏰ *LeetCode Contest Reminders Activated!*\n\n`;
  replyMsg += `This chat will now receive contest reminders 30 minutes before every contest:\n`;
  replyMsg += `• 🏆 *Biweekly Contest:* Saturdays at 7:30 PM (every 2 weeks)\n`;
  replyMsg += `• 🏆 *Weekly Contest:* Sundays at 7:30 AM (every week)\n\n`;
  replyMsg += `*Next Scheduled Reminders:*\n`;
  replyMsg += `• ${biweeklySat}\n`;
  replyMsg += `• ${weeklySun}\n\n`;
  replyMsg += `_Send \`/lcRem off\` to disable._`;

  return message.reply(replyMsg);
}

// Background scheduler tracking variable
let lastExecutedKey = null;

/**
 * Initialize background scheduler to send reminders at 7:30 PM (Saturdays bi-weekly) & 7:30 AM (Sundays weekly)
 */
function setupLcReminderScheduler(client) {
  console.log("[LC REMINDER] Background scheduler initialized.");

  setInterval(async () => {
    try {
      const now = new Date();
      const day = now.getDay();
      const hours = now.getHours();
      const minutes = now.getMinutes();

      // Time key format e.g. "2026-08-15-19:30"
      const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
        now.getDate()
      ).padStart(2, "0")}-${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

      if (lastExecutedKey === dateKey) return; // Already sent during this minute

      const isBiweeklySatTime = day === 6 && hours === 19 && minutes === 30 && isBiweeklySaturday(now);
      const isWeeklySunTime = day === 0 && hours === 7 && minutes === 30;

      if (!isBiweeklySatTime && !isWeeklySunTime) return;

      lastExecutedKey = dateKey;

      const chats = getSubscribedChats();
      if (chats.size === 0) return;

      let msgText = "";
      if (isBiweeklySatTime) {
        msgText =
          `🏆 *LEETCODE BIWEEKLY CONTEST REMINDER* 🏆\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `⏰ *Contest starts in 30 minutes!* (8:00 PM)\n\n` +
          `🔗 *Join Contest:* https://leetcode.com/contest/\n` +
          `Get ready and good luck everyone! 🚀💻`;
      } else if (isWeeklySunTime) {
        msgText =
          `🏆 *LEETCODE WEEKLY CONTEST REMINDER* 🏆\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `⏰ *Good Morning! Contest starts in 30 minutes!* (8:00 AM)\n\n` +
          `🔗 *Join Contest:* https://leetcode.com/contest/\n` +
          `Get ready and good luck everyone! 🚀💻`;
      }

      console.log(`[LC REMINDER] Sending reminder to ${chats.size} subscribed chats for key ${dateKey}`);

      for (const chatId of chats) {
        try {
          await client.sendMessage(chatId, msgText);
        } catch (sendErr) {
          console.error(`[LC REMINDER] Failed to send to ${chatId}:`, sendErr.message);
        }
      }
    } catch (err) {
      console.error("[LC REMINDER SCHEDULER ERROR]", err.message);
    }
  }, 20000); // Poll check every 20 seconds
}

module.exports = {
  handleLcRemCommand,
  setupLcReminderScheduler,
  getSubscribedChats,
  isBiweeklySaturday,
};
