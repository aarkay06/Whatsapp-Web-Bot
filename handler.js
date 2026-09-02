// handler.js
const path = require("path");
const fs_debug = require("fs");

// Clear require cache for src submodules to support hot-reloading
Object.keys(require.cache).forEach((key) => {
  if (key.includes(path.join(__dirname, "src"))) {
    delete require.cache[key];
  }
});

// Services
const { getMatchScore } = require("./src/services/cricbuzzService");

// Commands
const {
  handleLeetcode,
  handleDailyLeetcode,
  handleSetLcId,
  handleTopper,
  handleSetName,
} = require("./src/commands/leetcodeHandler");
const { handleLcRemCommand } = require("./src/services/lcReminderService");

const {
  getUserDisplayName,
  isPhoneNumber,
  getUser,
  incrementUserMessageCount,
  incrementBotMessageCount,
  getVellaLeaderboardText,
  setupBotMessageTracker,
  BOT_OWNER_ID,
} = require("./src/services/userStore");
const { handleSpam } = require("./src/commands/spamHandler");
const {
  handleReply,
  handleAutoReplyTrigger,
} = require("./src/commands/replyHandler");
const { handleIpl } = require("./src/commands/iplHandler");
const {
  handleInstagramLink,
  handleSticker,
} = require("./src/commands/mediaHandler");
const { handleGroup } = require("./src/commands/groupHandler");
const { handleReminder } = require("./src/commands/reminderHandler");
const { handleBotProxy } = require("./src/commands/botProxyHandler");
const { handleSearch } = require("./src/commands/searchHandler");
const { handleInfo } = require("./src/commands/infoHandler");
const { handlePoints } = require("./src/commands/pointsHandler");
const { handleImageCommand } = require("./src/commands/imageHandler");
const { handleEditCommand } = require("./src/commands/editHandler");


// Games
const { handleTrivia } = require("./src/games/trivia");
const { handleHangman } = require("./src/games/hangman");
const { handleWordle } = require("./src/games/wordle");
const { handleMovieHangman } = require("./src/games/movieHangman");
const { handleAnagram } = require("./src/games/anagram");
const { handleSpellingBee } = require("./src/games/spellingbee");

// ==========================================
// MAIN MESSAGE PROCESSOR
// ==========================================
async function processMessage(message, client, MessageMedia, state) {
  setupBotMessageTracker(client);

  state.iplPollers ??= new Map();
  state.autoReplies ??= new Map();
  state.movieHangmanState ??= new Map();
  state.anagramState ??= new Map();
  state.beeState ??= new Map();
  const {
    leaderboard,
    words,
    triviaState,
    hangmanState,
    movieHangmanState,
    recurringMap,
    wordleState,
    autoReplies,
    anagramState,
    beeState,
  } = state;
  const rawText = message.selectedButtonId || message.body || "";
  const text = rawText.toLowerCase().trim();

  // ── Message logger ─────────────────────────────────────────────────
  try {
    const sender = message.fromMe
      ? "Me"
      : (message.author || message.from || message.notifyName || "Unknown");
    const logLine = `${sender}: ${message.body || ""}\n`;
    fs_debug.appendFileSync(path.join(__dirname, "message.log"), logLine, "utf8");
  } catch (logErr) {
    console.error("[MSG LOG] Failed to log:", logErr.message);
  }
  // ────────────────────────────────────────────────────────────────

  // ── Chat ID resolution ───────────────────────────────────────────
  // When the bot owner sends a message in a group, message.from is their own
  // LID — NOT the group ID. Only messages received from others have the group
  // ID in message.from. We normalise by using message.to when fromMe=true so
  // every participant in the same chat shares the same chatId key.
  const chatId = message.fromMe ? (message.to ?? message.from) : message.from;

  // ── User identification ──────────
  const from = message.from
    ? message.from.split("@")[0].split(":")[0]
    : undefined;
  const author = message.author
    ? message.author.split("@")[0].split(":")[0]
    : undefined;
  const user = author ?? from;

  if (user && !isPhoneNumber(user)) {
    const userData = getUser(user);
    const mappedName = getUserDisplayName(user, null, leaderboard);
    if (!leaderboard[user]) {
      leaderboard[user] = {
        user,
        name: mappedName || message.notifyName || user,
        score: userData?.score || 0,
        guesses: userData?.guesses || 0,
      };
    } else if (mappedName && leaderboard[user].name !== mappedName) {
      leaderboard[user].name = mappedName;
    }
  }

  // ── Message counting ─────────────────────────────────────────────────────
  // For fromMe messages: the owner's total_messages is always incremented.
  // bot_messages was already pre-incremented at send-time (in setupBotMessageTracker),
  // so net count = total_messages - bot_messages correctly reflects human-sent messages.
  if (message.fromMe) {
    incrementUserMessageCount(BOT_OWNER_ID, chatId);
  } else if (user) {
    incrementUserMessageCount(user, chatId);
  }

  // ── Movie Hangman board message capture ────────────────────────────────
  // message.reply() returns undefined in some WWebJS + group-LID setups.
  // Instead, we detect the outgoing board message from its own message_create
  // event and store it in state — giving us a proper Message instance to edit.
  if (
    message.fromMe &&
    !message.author && // bot's outgoing msg (no author field on own group msgs)
    movieHangmanState.has(chatId)
  ) {
    const _gameState = movieHangmanState.get(chatId);
    if (
      _gameState.pendingBoardCapture &&
      !_gameState.boardMessage &&
      message.body.startsWith("📂")
    ) {
      _gameState.boardMessage = message;
      _gameState.pendingBoardCapture = false;
      console.log("[BOARD] Captured board message from message_create event, id:", message.id?._serialized ?? message.id?.["$1"] ?? "unknown");
    }
  }

  // --- Command Dispatcher ---
  if (/^[\/!]?points\b/i.test(text)) {
    return await handlePoints(message, leaderboard, user);
  }

  if (text === "/ping" || text === "!ping") {
    const uptimeSeconds = Math.floor(process.uptime());
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;
    const uptimeParts = [];
    if (hours > 0) uptimeParts.push(`${hours}h`);
    if (minutes > 0) uptimeParts.push(`${minutes}m`);
    uptimeParts.push(`${seconds}s`);
    const uptimeStr = uptimeParts.join(" ");

    return message.reply(
      `🏓 *Pong!*\n\n✅ Bot is up and running!\n⏱️ *Uptime:* ${uptimeStr}`
    );
  }

  if (text === "/vella" || text === "!vella") {
    return message.reply(getVellaLeaderboardText(chatId, leaderboard));
  }

  if (text.startsWith("/name ") || text === "/name" || text.startsWith("!name ") || text === "!name") {
    return await handleSetName(message, leaderboard);
  }

  if (text === "/lc") {
    return await handleLeetcode(message, leaderboard);
  }

  if (text.startsWith("/id ") || text === "/id") {
    return await handleSetLcId(message, leaderboard);
  }

  if (text === "/topper" || text.startsWith("/topper ")) {
    return await handleTopper(message, leaderboard);
  }

  if (text === "/daily") {
    return await handleDailyLeetcode(message);
  }

  if (
    text === "/lcrem" ||
    text === "!lcrem" ||
    text.startsWith("/lcrem ") ||
    text.startsWith("!lcrem ")
  ) {
    return await handleLcRemCommand(message);
  }


  if (text.startsWith("/spam ")) {
    return await handleSpam(message, client);
  }

  if (text.startsWith("/reply ")) {
    return await handleReply(message, client, autoReplies);
  }

  // await handleAutoReplyTrigger(message, autoReplies);

  if (text === "/ipl" || text === "/ipl stop" || text === "/ipl status") {
    return await handleIpl(message, client, iplPollers);
  }

  // await handleInstagramLink(message, MessageMedia);

  if (
    text === "/sticker" ||
    text === "!sticker" ||
    text.startsWith("/sticker ") ||
    text.startsWith("!sticker ")
  ) {
    return await handleSticker(message, client);
  }

  if (
    text === "/img" ||
    text === "!img" ||
    text.startsWith("/img ") ||
    text.startsWith("!img ")
  ) {
    return await handleImageCommand(message, client);
  }


  if (text.startsWith("!everyone")) {
    return await handleGroup(message, client);
  }

  if (
    text.startsWith("!remindme ") ||
    text.startsWith("!remindme every ") ||
    text === "!cancelreminder"
  ) {
    return await handleReminder(message, client, recurringMap);
  }

  if (text.startsWith("!bot ")) {
    return await handleBotProxy(message);
  }

  if (
    text.startsWith("!ai") ||
    text.startsWith("/ai") ||
    text.startsWith("!lyrics ")
  ) {
    return await handleSearch(message);
  }

  if (
    text === "/edit" ||
    text.startsWith("/edit ") ||
    text === "!edit" ||
    text.startsWith("!edit ") ||
    text === "/agy" ||
    text.startsWith("/agy ") ||
    text === "!agy" ||
    text.startsWith("!agy ")
  ) {
    return await handleEditCommand(message, user);
  }

  if (
    text === "!wyr" ||
    text.startsWith("!name ") ||
    text.startsWith("!define ") ||
    text.startsWith("!horoscope") ||
    text === "!meme"
  ) {
    return await handleInfo(message, client, MessageMedia, leaderboard, user);
  }

  // --- Games ---
  if (text === "!trivia" || text === "/t" || text === "/trivia" || triviaState.has(chatId)) {
    await handleTrivia(message, client, triviaState, leaderboard, user, chatId);
  }

  if (
    text === "!word" ||
    text.startsWith("!g ") ||
    text === "!wordstop"
  ) {
    await handleHangman(message, hangmanState, words, leaderboard, user, chatId);
  }

  // Movie Hangman — start/stop commands (/h, /hangman, !h, !hangman)
  const isHangmanCmd = [
    "!hangman", "/hangman", "!h", "/h",
    "!hangmanstop", "/hangmanstop", "!hstop", "/hstop",
    "!hangman stop", "/hangman stop", "!h stop", "/h stop"
  ].includes(text);

  if (isHangmanCmd) {
    await handleMovieHangman(message, movieHangmanState, leaderboard, user, chatId);
    return;
  }

  // Movie Hangman — in-game: single letter OR full-title guess by ANYONE in the chat
  if (movieHangmanState.has(chatId)) {
    const isSingleLetter = /^[a-z]$/i.test(text);
    const couldBeTitle = !text.startsWith("!") && !text.startsWith("/") && text.length > 1;
    if (isSingleLetter || couldBeTitle) {
      await handleMovieHangman(message, movieHangmanState, leaderboard, user, chatId);
      return;
    }
  }

  if (
    text === "wordle" ||
    text === "leaderboard" ||
    text === "start" ||
    text === "!stop" ||
    text === "skip" ||
    (wordleState.isTheMatchGoingOn && wordleState.word)
  ) {
    await handleWordle(message, wordleState, words, leaderboard, user);
  }

  // Anagram
  const ANAGRAM_CMDS = ["/anagram", "!anagram", "/anagramskip", "!anagramskip", "/anagramstop", "!anagramstop"];
  if (ANAGRAM_CMDS.includes(text) || anagramState.has(chatId)) {
    await handleAnagram(message, anagramState, words, leaderboard, user, chatId);
  }

  // Spelling Bee
  const BEE_CMDS = ["/spellingbee", "!spellingbee", "/bee", "!bee", "/beeskip", "!beeskip", "/beestop", "!beestop"];
  if (BEE_CMDS.includes(text) || beeState.has(chatId)) {
    await handleSpellingBee(message, beeState, words, leaderboard, user, chatId);
  }
}

// Run if called directly
if (require.main === module) {
  getMatchScore()
    .then((data) => { })
    .catch((err) => {
      console.error("Error:", err.message);
      process.exit(1);
    });
}

module.exports = { getMatchScore, processMessage };
