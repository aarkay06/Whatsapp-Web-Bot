const {
  BOT_OWNER_ID,
  addPoints,
  getUser,
  getUsersData,
  getUserDisplayName,
  isValidUserId,
} = require("../services/userStore");

function findUserInText(text) {
  if (!text) return null;
  const users = getUsersData();
  for (const [userId, data] of Object.entries(users)) {
    if (data.name && new RegExp(`\\b${data.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)) {
      return userId;
    }
  }
  return null;
}

async function getTargetUserFromQuoted(message) {
  let rawTarget = null;
  let quotedBody = "";

  // 1. Direct read from message._data (fast & safe)
  if (message._data) {
    if (message._data.quotedMsg) {
      quotedBody = message._data.quotedMsg.body || "";
      const qm = message._data.quotedMsg;
      if (!qm.fromMe) {
        rawTarget = qm.author || qm.from;
      }
    }
    if (!rawTarget && message._data.quotedParticipant) {
      rawTarget = message._data.quotedParticipant;
    }
  }

  // 2. Fallback: getQuotedMessage call
  if (message.hasQuotedMsg) {
    try {
      const quotedMsg = await message.getQuotedMessage();
      if (quotedMsg) {
        quotedBody = quotedBody || quotedMsg.body || "";
        if (!quotedMsg.fromMe && !rawTarget) {
          rawTarget = quotedMsg.author || quotedMsg.from;
        }
      }
    } catch (err) {
      console.error("[POINTS] getQuotedMessage fallback failed:", err?.message || err);
    }
  }

  // Check candidate ID from rawTarget
  let candidateId = null;
  if (rawTarget) {
    const userStr = typeof rawTarget === "string" ? rawTarget : rawTarget._serialized || "";
    candidateId = userStr.split("@")[0].split(":")[0] || null;
  }

  // If candidate is a valid user and not the bot owner, return candidateId
  if (candidateId && isValidUserId(candidateId) && candidateId !== BOT_OWNER_ID) {
    return candidateId;
  }

  // If candidate is missing, invalid (e.g. Group ID), or is the bot owner (e.g. quoted a bot response),
  // try to find a user name mentioned in the quoted message body
  if (quotedBody) {
    const matchedUser = findUserInText(quotedBody);
    if (matchedUser && isValidUserId(matchedUser)) {
      return matchedUser;
    }
  }

  // Final fallback: if candidateId is valid even if BOT_OWNER_ID, return candidateId
  if (candidateId && isValidUserId(candidateId)) {
    return candidateId;
  }

  return null;
}

async function handlePoints(message, leaderboard, senderUser) {
  const text = (message.selectedButtonId || message.body || "").trim();
  const match = text.match(/^[\/!]?points\s*([+-])?\s*(\d+)$/i);

  // 1. Admin permission check
  const isAdmin = senderUser === BOT_OWNER_ID || message.fromMe;
  if (!isAdmin) {
    return;
  }

  // 2. Syntax check
  if (!match) {
    return message.reply("⚠️ *Usage:* Reply to a user's message with:\n`points +20` or `points -30`");
  }

  // 3. Quoted message check
  if (!message.hasQuotedMsg && !message._data?.quotedParticipant && !message._data?.quotedMsg) {
    return message.reply("⚠️ Please reply to a user's message to add or remove points.");
  }

  // 4. Quoted user resolution
  const targetUser = await getTargetUserFromQuoted(message);

  if (!targetUser || !isValidUserId(targetUser)) {
    return message.reply("❌ Could not identify a valid user from the replied message.");
  }

  // 5. Calculate points delta
  const sign = match[1] === "-" ? -1 : 1;
  const amount = parseInt(match[2], 10);
  const deltaPts = sign * amount;

  // 6. Update score & leaderboard
  addPoints(targetUser, deltaPts, 0, leaderboard);

  // 7. Respond with updated total
  const updatedUser = getUser(targetUser);
  const newScore = updatedUser?.score ?? 0;
  const displayName = getUserDisplayName(targetUser, targetUser, leaderboard);

  if (deltaPts >= 0) {
    return message.reply(
      `🏆 Added *+${deltaPts}* points to *${displayName}*!\n📊 *New Total:* ${newScore} pts`
    );
  } else {
    return message.reply(
      `🏆 Removed *${Math.abs(deltaPts)}* points from *${displayName}*!\n📊 *New Total:* ${newScore} pts`
    );
  }
}

module.exports = {
  handlePoints,
};
