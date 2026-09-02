const fs = require("fs");
const path = require("path");
const {
  getLcUsers,
  setUserLc,
  setUserName,
  getUserDisplayName,
} = require("../services/userStore");

async function getQuotedTarget(message, leaderboard) {
  const isQuoted =
    message.hasQuotedMsg ||
    Boolean(message._data?.quotedStanzaID) ||
    Boolean(message._data?.quotedMsg) ||
    Boolean(message._data?.quotedParticipant);

  if (!isQuoted) return null;

  let quoted;
  try {
    quoted = await message.getQuotedMessage();
  } catch (err) {
    console.warn("getQuotedMessage failed, falling back to message._data:", err?.message || err);
  }

  const rawTarget =
    quoted?.author ||
    quoted?.from ||
    message._data?.quotedParticipant ||
    message._data?.quotedMsg?.author ||
    message._data?.quotedMsg?.from ||
    message._data?.participant;

  const targetUser = rawTarget ? String(rawTarget).split("@")[0].split(":")[0] : undefined;

  if (!targetUser) return null;

  const targetName = getUserDisplayName(
    targetUser,
    quoted?.notifyName || message._data?.quotedMsg?.notifyName || targetUser,
    leaderboard
  );

  return { targetUser, targetName, quoted };
}

async function handleSetName(message, leaderboard) {
  const rawText = message.body.trim();
  const textParts = rawText.split(/\s+/);
  const newName = textParts.slice(1).join(" ").trim();

  let targetUser;
  const targetInfo = await getQuotedTarget(message, leaderboard);

  if (targetInfo) {
    targetUser = targetInfo.targetUser;
  } else {
    const from = message.from ? message.from.split("@")[0].split(":")[0] : undefined;
    const author = message.author ? message.author.split("@")[0].split(":")[0] : undefined;
    targetUser = author ?? from;
  }

  if (!targetUser) {
    return message.reply("Could not identify the target user.");
  }

  if (!newName) {
    const existingName = getUserDisplayName(targetUser, null, leaderboard);
    if (existingName) {
      return message.reply(`Current mapped name: *${existingName}*`);
    }
    return message.reply(
      "Please include a name.\n\n" +
      "*Usage*\n" +
      "/name <your name>\n" +
      "or reply to someone's message with\n" +
      "/name <their name>"
    );
  }

  setUserName(targetUser, newName, leaderboard);

  return message.reply(`Name updated to *${newName}*`);
}

async function handleSetLcId(message, leaderboard) {
  const targetInfo = await getQuotedTarget(message, leaderboard);

  if (!targetInfo) {
    return message.reply(
      "Reply to someone's message first, then send:\n/id <leetcode_username>"
    );
  }

  const { targetUser } = targetInfo;

  const rawText = message.body.trim();
  const lcUsername = rawText.slice(3).trim();

  const lcMap = getLcUsers();
  const displayName = getUserDisplayName(targetUser, targetInfo.targetName, leaderboard);

  if (!lcUsername) {
    const existing = lcMap[targetUser];
    if (existing) {
      return message.reply(`*${displayName}* is mapped to LeetCode: *@${existing}*`);
    }
    return message.reply(
      "LeetCode username can't be empty.\n\n" +
      "*Usage* (reply to their message)\n" +
      "/id <leetcode_username>"
    );
  }

  setUserLc(targetUser, lcUsername);

  return message.reply(`Mapped *@${lcUsername}* to *${displayName}*`);
}

async function handleLeetcode(message, leaderboard) {
  let loadingMsg;
  try {
    loadingMsg = await message.reply("Fetching LeetCode stats, hang tight...");
  } catch (_) { }

  const lcMap = getLcUsers();
  const mapEntries = Object.entries(lcMap);

  let targetList = [];
  if (mapEntries.length > 0) {
    targetList = mapEntries.map(([waUser, username]) => ({
      username,
      waUser,
      displayName: getUserDisplayName(waUser, null, leaderboard),
    }));
  } else {
    // Default handles if no mappings exist yet
    const defaultUsernames = ["KiraZon2", "AarKay6", "Pallabi_", "Q6d75rB7J8"];
    targetList = defaultUsernames.map((username) => ({
      username,
      waUser: null,
      displayName: null,
    }));
  }

  let replyMessage = "*LEETCODE LEADERBOARD*\n";
  replyMessage += "━━━━━━━━━━━━━━\n\n";

  for (const item of targetList) {
    const { username, displayName: waDisplayName } = item;
    try {
      const response = await fetch("https://leetcode.com/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Referer: "https://leetcode.com",
        },
        body: JSON.stringify({
          query: `
          query getUserProfile($username: String!) {
            matchedUser(username: $username) {
              profile {
                realName
              }
              submitStats {
                acSubmissionNum {
                  difficulty
                  count
                }
              }
            }
          }
        `,
          variables: { username },
        }),
      });

      const data = await response.json();

      if (!data.data || !data.data.matchedUser) {
        const headerName = waDisplayName ? `${waDisplayName} (@${username})` : username;
        replyMessage += `*${headerName}*\nUser not found or profile is private\n\n`;
        continue;
      }

      const profile = data.data.matchedUser.profile;
      const stats = data.data.matchedUser.submitStats.acSubmissionNum;

      const profileName = profile.realName ? profile.realName : username;
      const finalDisplayName = waDisplayName || profileName;

      const all = stats.find((s) => s.difficulty === "All")?.count || 0;
      const easy = stats.find((s) => s.difficulty === "Easy")?.count || 0;
      const medium = stats.find((s) => s.difficulty === "Medium")?.count || 0;
      const hard = stats.find((s) => s.difficulty === "Hard")?.count || 0;

      replyMessage += `*${finalDisplayName}* (@${username})\n`;
      replyMessage += `Easy ${easy}  Med ${medium}  Hard ${hard}\n`;
      replyMessage += `Total solved: *${all}*\n\n`;
    } catch (error) {
      console.error(`Failed to fetch stats for ${username}:`, error);
      const headerName = waDisplayName ? `${waDisplayName} (@${username})` : username;
      replyMessage += `*${headerName}*\nError fetching data\n\n`;
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  if (loadingMsg && typeof loadingMsg.reply === "function") {
    return loadingMsg.reply(replyMessage.trim());
  }
  return message.reply(replyMessage.trim());
}

async function fetchDailyLeetCode() {
  const API_URL = "https://alfa-leetcode-api.onrender.com/daily";

  try {
    const response = await fetch(API_URL);
    if (!response.ok)
      throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();

    // 1. Extract the core data
    const title = data.questionTitle;
    const link = data.questionLink;
    const difficulty = data.difficulty;
    const rawHtml = data.question;

    // 2. Transform HTML to WhatsApp Markdown
    const cleanText = formatForWhatsApp(rawHtml);

    // 3. Construct the final message structure
    const difficultyTag =
      difficulty === "Hard" ? "[Hard]" : difficulty === "Medium" ? "[Medium]" : "[Easy]";

    const message =
      `*DAILY LEETCODE*\n━━━━━━━━━━━━━━\n\n` +
      `*${title}*  ${difficultyTag}\n\n` +
      `${cleanText}\n\n` +
      `Link: ${link}`;

    return message;
  } catch (error) {
    console.error("Failed to fetch daily LeetCode:", error);
    return "Failed to fetch today's LeetCode problem. The API might be down.";
  }
}

// The O(N) Regex Sanitization Pipeline
function formatForWhatsApp(html) {
  let text = html;

  // Convert structural tags to WhatsApp markdown
  text = text.replace(/<strong>(.*?)<\/strong>/g, "*$1*");
  text = text.replace(/<b>(.*?)<\/b>/g, "*$1*");
  text = text.replace(/<code>(.*?)<\/code>/g, "```$1```");

  // Handle lists and paragraphs for mobile readability
  text = text.replace(/<li>/g, "- ");
  text = text.replace(/<\/p>/g, "\n\n");
  text = text.replace(/<br\s*\/?>/g, "\n");

  // Strip all remaining rogue HTML tags (like <ul>, <div>, <span>)
  text = text.replace(/<[^>]*>?/g, "");

  // Decode HTML entities (the weird &quot; stuff in your payload)
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&amp;/g, "&");

  // Clean up excessive newlines caused by tag stripping
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

async function handleDailyLeetcode(message) {
  const replyText = await fetchDailyLeetCode();
  return message.reply(replyText);
}

function timeAgo(unixTimestamp) {
  const seconds = Math.floor((Date.now() - unixTimestamp * 1000) / 1000);
  if (seconds < 0) return "just now";
  const intervals = [
    { label: "year", secs: 31536000 },
    { label: "month", secs: 2592000 },
    { label: "day", secs: 86400 },
    { label: "hour", secs: 3600 },
    { label: "minute", secs: 60 },
    { label: "second", secs: 1 },
  ];
  for (const i of intervals) {
    const count = Math.floor(seconds / i.secs);
    if (count >= 1) {
      return `${count} ${i.label}${count > 1 ? "s" : ""} ago`;
    }
  }
  return "just now";
}

function formatTimestamp(unixTimestamp) {
  const d = new Date(unixTimestamp * 1000);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

// ---- Comedy helpers for /topper ----

const STATUS_ROASTS = {
  Accepted: [
    "nailed it first try, absolute show-off",
    "clean solve, no notes, insufferable",
    "flawless victory, ego +10",
  ],
  "Wrong Answer": [
    "got humbled by the judge",
    "close, but the judge said no",
    "task failed successfully",
  ],
  "Time Limit Exceeded": [
    "their code went on a coffee break",
    "O(n!) strikes again",
    "still running... we'll wait",
  ],
  "Runtime Error": [
    "code exploded mid-flight",
    "NullPointerException says hi",
    "crashed harder than my sleep schedule",
  ],
  "Compile Error": [
    "forgot a semicolon, doomed us all",
    "syntax said absolutely not",
  ],
  "Memory Limit Exceeded": [
    "tried to allocate the entire RAM stick",
  ],
  Default: ["mysterious LeetCode sorcery"],
};

function pickRoast(status) {
  const options = STATUS_ROASTS[status] || STATUS_ROASTS.Default;
  return options[Math.floor(Math.random() * options.length)];
}

function rankRoast(ranking) {
  if (!ranking || ranking <= 0) return "Rank: unranked mystery figure";
  if (ranking <= 10000) return `Global Rank #${ranking.toLocaleString("en-IN")} — practically LeetCode royalty`;
  if (ranking <= 100000) return `Global Rank #${ranking.toLocaleString("en-IN")} — respectable nerd status`;
  if (ranking <= 500000) return `Global Rank #${ranking.toLocaleString("en-IN")} — grinding in the trenches`;
  return `Global Rank #${ranking.toLocaleString("en-IN")} — still loading...`;
}

function nightOwlLine(unixTimestamp) {
  const hour = new Date(unixTimestamp * 1000).getHours();
  if (hour >= 0 && hour < 5) return "Coding at this hour? Sleep is clearly optional.";
  if (hour >= 5 && hour < 9) return "Grinding before sunrise, certified psycho behavior.";
  if (hour >= 9 && hour < 17) return "A civilized daytime submission. How rare.";
  if (hour >= 17 && hour < 21) return "Evening grind session, respectable.";
  return "Late night LeetCode, the true grindset hours.";
}

async function handleTopper(message, leaderboard) {
  const rawText = message.body.trim();
  const textParts = rawText.split(/\s+/);
  const lcMap = getLcUsers();

  let targetUser;
  let targetName;
  let lcUsername;

  const targetInfo = await getQuotedTarget(message, leaderboard);

  if (textParts.length > 1) {
    lcUsername = textParts.slice(1).join(" ").trim();
    targetName = lcUsername;
  } else if (targetInfo) {
    targetUser = targetInfo.targetUser;
    targetName = getUserDisplayName(targetUser, targetInfo.targetName, leaderboard);
    lcUsername = lcMap[targetUser];
  } else {
    const from = message.from ? message.from.split("@")[0].split(":")[0] : undefined;
    const author = message.author ? message.author.split("@")[0].split(":")[0] : undefined;
    targetUser = author ?? from;
    targetName = getUserDisplayName(targetUser, null, leaderboard);
    lcUsername = lcMap[targetUser];
  }

  if (!lcUsername) {
    return message.reply(
      "*DAMN TOPPER LOG*\n\n" +
      "No LeetCode ID on file. Set one first by replying to a message with:\n" +
      "/id <leetcode_username>"
    );
  }

  const query = `
    query getTopperData($username: String!, $limit: Int!) {
      matchedUser(username: $username) {
        profile {
          realName
          ranking
        }
        submitStats {
          acSubmissionNum {
            difficulty
            count
          }
        }
      }
      recentSubmissionList(username: $username, limit: $limit) {
        title
        titleSlug
        timestamp
        statusDisplay
        lang
      }
    }
  `;

  try {
    const response = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Referer: "https://leetcode.com",
      },
      body: JSON.stringify({
        query,
        variables: { username: lcUsername, limit: 5 },
      }),
    });

    const data = await response.json();
    const submissions = data?.data?.recentSubmissionList;
    const matchedUser = data?.data?.matchedUser;
    const ranking = matchedUser?.profile?.ranking;
    const totalSolved =
      matchedUser?.submitStats?.acSubmissionNum?.find((s) => s.difficulty === "All")?.count;

    if (!submissions || submissions.length === 0) {
      return message.reply(
        `*DAMN TOPPER LOG*\n\n` +
        `${targetName} (@${lcUsername})\n` +
        `Zero recent submissions. Either taking a break or the grind died quietly.`
      );
    }

    const acceptedCount = submissions.filter((s) => s.statusDisplay === "Accepted").length;
    const failCount = submissions.length - acceptedCount;

    let verdict;
    if (acceptedCount === submissions.length) {
      verdict = "Perfect run. Either a genius or the questions were suspiciously easy.";
    } else if (acceptedCount === 0) {
      verdict = "Zero for five. The compiler is personally offended.";
    } else if (failCount > acceptedCount) {
      verdict = "More fails than wins. Bold strategy, let's see if it pays off.";
    } else {
      verdict = "Mixed bag, but the W's outweigh the L's. Barely.";
    }

    let replyMsg = `*DAMN TOPPER LOG*\n━━━━━━━━━━━━━━\n\n`;
    replyMsg += `${targetName} (@${lcUsername})\n`;
    if (totalSolved !== undefined) replyMsg += `Lifetime solved: *${totalSolved}*\n`;
    replyMsg += `${rankRoast(ranking)}\n\n`;
    replyMsg += `${verdict}\n\n`;
    replyMsg += `*Last 5 Submissions*\n`;

    submissions.forEach((sub, idx) => {
      const ts = parseInt(sub.timestamp, 10);
      const relativeTime = timeAgo(ts);
      const langStr = sub.lang ? ` (${sub.lang})` : "";
      const roast = pickRoast(sub.statusDisplay);

      replyMsg += `\n${idx + 1}. ${sub.title}${langStr}\n`;
      replyMsg += `   ${sub.statusDisplay} — ${roast}\n`;
      replyMsg += `   ${relativeTime}\n`;
    });

    const latestTs = parseInt(submissions[0].timestamp, 10);
    replyMsg += `\n${nightOwlLine(latestTs)}`;

    return message.reply(replyMsg.trim());
  } catch (error) {
    console.error("Error in handleTopper:", error);
    return message.reply(
      `*DAMN TOPPER LOG*\n\nCouldn't reach LeetCode for @${lcUsername}. Even the API needed a break.`
    );
  }
}

module.exports = {
  handleLeetcode,
  handleDailyLeetcode,
  fetchDailyLeetCode,
  formatForWhatsApp,
  handleSetLcId,
  handleSetName,
  getLcUsers,
  handleTopper,
};