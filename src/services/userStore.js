const fs = require("fs");
const path = require("path");

const USER_FILE = path.join(__dirname, "../../user.json");
const LEADERBOARD_FILE = path.join(__dirname, "../../leaderboard.json");

function isPhoneNumber(userId) {
  if (!userId) return true;
  const clean = String(userId).trim();
  // Standard phone numbers start with country code 91 (or 10-13 digits)
  if (clean.startsWith("91") && clean.length <= 13) return true;
  if (/^\d{10,13}$/.test(clean) && !clean.startsWith("1") && !clean.startsWith("2")) return true;
  return false;
}

function getUsersData() {
  try {
    if (fs.existsSync(USER_FILE)) {
      const data = JSON.parse(fs.readFileSync(USER_FILE, "utf8"));
      // Filter out any phone numbers if present
      const cleanData = {};
      for (const [id, info] of Object.entries(data)) {
        if (!isPhoneNumber(id)) {
          cleanData[id] = info;
        }
      }
      return cleanData;
    }
  } catch (err) {
    console.error("Error reading user.json:", err);
  }
  return {};
}

function saveUsersData(usersData) {
  try {
    fs.writeFileSync(USER_FILE, JSON.stringify(usersData, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing user.json:", err);
  }
}

function isValidUserId(userId) {
  if (!userId) return false;
  const clean = String(userId).trim();
  if (!/^\d+$/.test(clean)) return false;
  if (isPhoneNumber(clean)) return false;
  if (clean.length >= 17 || clean.startsWith("120")) return false;
  return true;
}

function getUser(userId) {
  if (!isValidUserId(userId)) return null;
  const users = getUsersData();
  return users[userId] || null;
}

function getUserDisplayName(userId, fallback = null, leaderboard = null) {
  if (!userId) return fallback || "Unknown";
  const users = getUsersData();
  if (users[userId] && users[userId].name) {
    return users[userId].name;
  }
  if (leaderboard && leaderboard[userId] && leaderboard[userId].name && leaderboard[userId].name !== userId) {
    return leaderboard[userId].name;
  }
  return fallback || userId;
}

function setUserName(userId, name, leaderboard = null) {
  if (!isValidUserId(userId) || !name) return;
  const users = getUsersData();
  if (!users[userId]) {
    users[userId] = { score: 0, guesses: 0 };
  }
  users[userId].name = name;
  saveUsersData(users);

  if (leaderboard) {
    leaderboard[userId] = {
      user: userId,
      name: name,
      score: users[userId].score || 0,
      guesses: users[userId].guesses || 0,
    };
    try {
      fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(leaderboard, null, 2), "utf8");
    } catch (err) {
      console.error("Error writing leaderboard.json:", err);
    }
  }
}

function setUserLc(userId, lcUsername) {
  if (!isValidUserId(userId) || !lcUsername) return;
  const users = getUsersData();
  if (!users[userId]) {
    users[userId] = { score: 0, guesses: 0 };
  }
  users[userId].lc = lcUsername;
  saveUsersData(users);
}

function getLcUsers() {
  const users = getUsersData();
  const lcMap = {};
  for (const [userId, data] of Object.entries(users)) {
    if (data && data.lc) {
      lcMap[userId] = data.lc;
    }
  }
  return lcMap;
}

function addPoints(userId, pts, guesses = 0, leaderboard = null) {
  if (!isValidUserId(userId)) return;
  const users = getUsersData();
  if (!users[userId]) {
    users[userId] = {
      name: userId,
      score: 0,
      guesses: 0,
    };
  }
  users[userId].score = (users[userId].score || 0) + pts;
  users[userId].guesses = (users[userId].guesses || 0) + guesses;
  saveUsersData(users);

  if (leaderboard) {
    if (!leaderboard[userId]) {
      leaderboard[userId] = {
        user: userId,
        name: users[userId].name || userId,
        score: users[userId].score,
        guesses: users[userId].guesses,
      };
    } else {
      leaderboard[userId].score = users[userId].score;
      leaderboard[userId].guesses = users[userId].guesses;
      leaderboard[userId].name = users[userId].name || leaderboard[userId].name;
    }
    try {
      fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(leaderboard, null, 2), "utf8");
    } catch (err) {
      console.error("Error writing leaderboard.json:", err);
    }
  }
}

function getOverallLeaderboardText() {
  const users = getUsersData();
  const list = [];

  for (const [userId, data] of Object.entries(users)) {
    if (isPhoneNumber(userId)) continue;
    const name = data.name || userId;
    const score = data.score || 0;
    list.push({ userId, name, score });
  }

  list.sort((a, b) => b.score - a.score);

  let msg = "🏆 *Overall Game Leaderboard* 🏆\n\n";
  if (list.length === 0) {
    msg += "No scores recorded yet!";
  } else {
    list.forEach((item, index) => {
      msg += `${index + 1}. *${item.name}* : ${item.score} pts\n`;
    });
  }
  return msg;
}

const BOT_OWNER_ID = "270085025448186";

// Proactively increment bot_messages when the bot sends any message.
// This runs BEFORE the message echoes back via message_create, so by the time
// the echo arrives and increments total_messages, bot_messages is already set.
function setupBotMessageTracker(client) {
  if (!client || client._botTrackerInstalled) return;
  client._botTrackerInstalled = true;

  const originalSendMessage = client.sendMessage.bind(client);
  client.sendMessage = async function (chatId, content, options) {
    // Increment bot_messages count BEFORE the send so it's ready when the
    // echo arrives and increments total_messages.
    incrementBotMessageCount(String(chatId));
    return originalSendMessage(chatId, content, options);
  };
}

function incrementUserMessageCount(userId, chatId) {
  if (!isValidUserId(userId) || !chatId) return;
  const users = getUsersData();
  if (!users[userId]) return;

  users[userId].total_messages = users[userId].total_messages || {};
  users[userId].total_messages[chatId] = (users[userId].total_messages[chatId] || 0) + 1;
  saveUsersData(users);
}

function incrementBotMessageCount(chatId) {
  if (!chatId) return;
  const users = getUsersData();
  if (!users[BOT_OWNER_ID]) return;

  users[BOT_OWNER_ID].bot_messages = users[BOT_OWNER_ID].bot_messages || {};
  users[BOT_OWNER_ID].bot_messages[chatId] = (users[BOT_OWNER_ID].bot_messages[chatId] || 0) + 1;
  saveUsersData(users);
}

function getVellaLeaderboardText(chatId, leaderboard = null) {
  const users = getUsersData();
  const list = [];

  for (const [userId, data] of Object.entries(users)) {
    if (!isValidUserId(userId)) continue;
    const msgMap = data.total_messages || {};
    const totalCount = msgMap[chatId] || 0;
    const botCount = (userId === BOT_OWNER_ID) ? (data.bot_messages?.[chatId] || 0) : 0;
    const netCount = Math.max(0, totalCount - botCount);

    if (netCount > 0) {
      const name = getUserDisplayName(userId, userId, leaderboard);
      list.push({ userId, name, count: netCount });
    }
  }

  list.sort((a, b) => b.count - a.count);

  let msg = "🛋️ *Vella Leaderboard* 🛋️\n\n";
  if (list.length === 0) {
    msg += "No recorded messages for this group yet!";
  } else {
    list.forEach((item, index) => {
      msg += `${index + 1}. *${item.name}* : ${item.count} msgs\n`;
    });
  }
  return msg;
}

module.exports = {
  isPhoneNumber,
  isValidUserId,
  getUsersData,
  saveUsersData,
  getUser,
  getUserDisplayName,
  setUserName,
  setUserLc,
  getLcUsers,
  addPoints,
  getOverallLeaderboardText,
  incrementUserMessageCount,
  incrementBotMessageCount,
  getVellaLeaderboardText,
  setupBotMessageTracker,
  BOT_OWNER_ID,
};
