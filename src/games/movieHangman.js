// src/games/movieHangman.js
// Enhanced Hangman game using popular Hollywood & Bollywood movie titles.
// Rules:
//   - Vowels (a, e, i, o, u) are revealed from the start.
//   - Anyone in the chat can guess by typing a single letter.
//   - Typing the exact movie title also wins the game instantly.
//   - 7 wrong guesses allowed before the hangman is dropped to the shark.
//   - Game is chat-scoped: one active game per WhatsApp chat/group.
//   - The game board is edited in-place on every guess (WhatsApp 15-min edit window).
//   - If the edit window expires, guesses are rejected with an expiry message.

const fs = require("fs");
const { MOVIES } = require("../data/movies");
const { addPoints, getUserDisplayName } = require("../services/userStore");

const VOWELS = new Set(["a", "e", "i", "o", "u"]);

// 15 minutes — WhatsApp's message-edit window
const GAME_TIMEOUT_MS = 15 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────
// ASCII ART STAGES
// Stage 0  → head only (no wrong guesses yet)
// Stage 1  → + mouth  (wrong guess #1)
// Stage 2  → + body   (wrong guess #2)
// Stage 3  → + left arm  (wrong guess #3)
// Stage 4  → + right arm (wrong guess #4)
// Stage 5  → + left leg  (wrong guess #5)
// Stage 6  → + right leg (wrong guess #6)
// Stage 7  → DROPPED into shark water (game over)
// ─────────────────────────────────────────────────────────────────
const MOVIE_HANGMAN_STAGES = [
  // ── Stage 0: Gallows + head ──────────────────────
  "  +----+\n  |    |\n  |    O\n  |     \n  |     \n  |     \n==+====+==\n  ~~~~~~~~\n  ~  🦈  ~\n  ~~~~~~~~",

  // ── Stage 1: + mouth ─────────────────────────────
  "  +----+\n  |    |\n  |   {O}\n  |     \n  |     \n  |     \n==+====+==\n  ~~~~~~~~\n  ~  🦈  ~\n  ~~~~~~~~",

  // ── Stage 2: + body ──────────────────────────────
  "  +----+\n  |    |\n  |   {O}\n  |    |\n  |     \n  |     \n==+====+==\n  ~~~~~~~~\n  ~  🦈  ~\n  ~~~~~~~~",

  // ── Stage 3: + left arm ──────────────────────────
  "  +----+\n  |    |\n  |   {O}\n  |   /|\n  |     \n  |     \n==+====+==\n  ~~~~~~~~\n  ~  🦈  ~\n  ~~~~~~~~",

  // ── Stage 4: + right arm ─────────────────────────
  "  +----+\n  |    |\n  |   {O}\n  |   /|\\\n  |     \n  |     \n==+====+==\n  ~~~~~~~~\n  ~  🦈  ~\n  ~~~~~~~~",

  // ── Stage 5: + left leg ──────────────────────────
  "  +----+\n  |    |\n  |   {O}\n  |   /|\\\n  |   /  \n  |     \n==+====+==\n  ~~~~~~~~\n  ~  🦈  ~\n  ~~~~~~~~",

  // ── Stage 6: + right leg ─────────────────────────
  "  +----+\n  |    |\n  |   {O}\n  |   /|\\\n  |   / \\\n  |     \n==+====+==\n  ~~~~~~~~\n  ~  🦈  ~\n  ~~~~~~~~",

  // ── Stage 7: DROPPED 💀 ───────────────────────────
  "  +----+\n  |    |\n  |     \n  |     \n  |     \n  |     \n==+====+==\n  ~~~~~~~~\n  ~{O}🦈 ~\n  ~/|\\   ~\n  ~/ \\   ~\n  ~~~~~~~~",
];

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────

/**
 * Build the masked display string for the movie title.
 * - Spaces → shown as-is (double space = word gap)
 * - Vowels → always revealed (uppercase)
 * - Non-letter chars (digits, hyphens, etc.) → always shown
 * - Consonants not yet guessed → shown as `_`
 */
function getMaskedDisplay(title, guessed) {
  return title
    .toLowerCase()
    .split("")
    .map((char) => {
      if (char === " ") return "  "; // double space → word gap
      if (!/[a-z]/.test(char)) return char; // digits / symbols always visible
      if (VOWELS.has(char) || guessed.has(char)) return char.toUpperCase();
      return "_";
    })
    .join(" "); // single space between every character
}

/**
 * Check whether all consonants in the title have been guessed.
 */
function isWon(title, guessed) {
  return title
    .toLowerCase()
    .split("")
    .filter((c) => /[a-z]/.test(c) && !VOWELS.has(c))
    .every((c) => guessed.has(c));
}

/** Count empty consonant blanks remaining */
function getEmptyCount(title, guessed) {
  return title
    .toLowerCase()
    .split("")
    .filter((c) => /[a-z]/.test(c) && !VOWELS.has(c) && !guessed.has(c)).length;
}

/** Count unique letters in the title for scoring */
function scoreLetters(displayTitle) {
  return displayTitle.replace(/ /g, "").replace(/[^a-z]/gi, "").length;
}

/** Build score summary for all players in current game session */
function buildScoreSummary(playerScores, leaderboard) {
  if (!playerScores) return "";
  const entries = Object.entries(playerScores);
  if (entries.length === 0) return "";
  entries.sort((a, b) => b[1] - a[1]);
  let summary = "\n\n📊 *Game Points Summary:*\n";
  for (const [uid, pts] of entries) {
    const name = getUserDisplayName(uid, uid, leaderboard);
    summary += `• *${name}*: +${pts} ${pts === 1 ? "pt" : "pts"}\n`;
  }
  return summary.trimEnd();
}

/**
 * Build the full display message (ASCII art + masked title + status).
 */
function buildDisplay(state) {
  const { title, category, guessed, wrong } = state;
  const art = `\`\`\`\n${MOVIE_HANGMAN_STAGES[wrong]}\n\`\`\``;
  const masked = getMaskedDisplay(title, guessed);
  const tried = [...guessed].sort().join(", ") || "none";

  return (
    `${art}\n\n` +
    `🎬 *${category} Movie*\n\n` +
    `${masked}\n\n` +
    `❌ Wrong: ${wrong}/7  |  🔤 Tried: ${tried}`
  );
}

/**
 * Try to edit the stored board message in-place.
 * Returns false if the message could not be edited (e.g. edit window closed).
 */
async function updateBoard(state, newContent) {
  if (!state.boardMessage) return false;

  const rawId = state.boardMessage.id;
  let stanzaId = "";
  let msgIdSerialized = "";

  if (typeof rawId === "string") {
    msgIdSerialized = rawId;
    stanzaId = rawId.includes("_") ? rawId.split("_")[2] : rawId;
  } else if (rawId && typeof rawId === "object") {
    stanzaId = rawId.id || (rawId._serialized ? rawId._serialized.split("_")?.[2] : "");
    msgIdSerialized = rawId._serialized || (rawId.fromMe !== undefined ? `${rawId.fromMe}_${rawId.remote}_${rawId.id}` : stanzaId);
  }

  if (!msgIdSerialized || msgIdSerialized === "undefined") {
    console.error("[BOARD] Cannot edit: boardMessage.id is invalid", rawId);
    return false;
  }

  // Ensure state.boardMessage.id has proper _serialized format for WWebJS Message.prototype.edit
  if (typeof state.boardMessage.id === "object" && state.boardMessage.id !== null) {
    state.boardMessage.id._serialized = msgIdSerialized;
  } else {
    state.boardMessage.id = {
      _serialized: msgIdSerialized,
      id: stanzaId || msgIdSerialized,
      fromMe: true,
      remote: state.boardMessage.to || state.boardMessage.from,
    };
  }

  // 1. Try standard Message.prototype.edit()
  try {
    const result = await state.boardMessage.edit(newContent);
    if (result !== null && result !== undefined) {
      console.log("[BOARD] Standard edit() succeeded!");
      return true;
    }
  } catch (err) {
    console.error("[BOARD] Standard edit() threw:", err?.message || err);
  }

  // 2. Fallback: Direct Puppeteer evaluation searching WAWebCollections by stanza ID
  try {
    const client = state.boardMessage.client;
    if (!client || !client.pupPage) return false;

    const res = await client.pupPage.evaluate(async (serializedId, targetStanzaId, content) => {
      try {
        const Collections = window.require("WAWebCollections");
        const allMsgs = Collections.Msg.models || Collections.Msg.toArray?.() || [];

        // 1. Find message model in WAWebCollections
        let msg = Collections.Msg.get(serializedId);

        if (!msg && targetStanzaId) {
          msg = allMsgs.find(m => m.id && (m.id.id === targetStanzaId || m.id._serialized === targetStanzaId || m.id._serialized?.includes(targetStanzaId)));
        }

        if (!msg && serializedId) {
          const parts = serializedId.split("_");
          if (parts.length >= 3) {
            const key3 = parts.slice(0, 3).join("_");
            msg = Collections.Msg.get(key3) || allMsgs.find(m => m.id?._serialized === key3);
          }
        }

        if (!msg && serializedId) {
          try {
            const fetched = await Collections.Msg.getMessagesById([serializedId]);
            msg = fetched?.messages?.[0];
          } catch (e) {}
        }

        if (!msg) {
          return {
            success: false,
            reason: `Message ${targetStanzaId || serializedId} not found in WAWebCollections (${allMsgs.length} loaded msgs)`
          };
        }

        // 2. Perform edit on found msg model
        if (window.WWebJS && typeof window.WWebJS.editMessage === "function") {
          try {
            await window.WWebJS.editMessage(msg, content, { linkPreview: false });
            return { success: true, method: "window.WWebJS.editMessage" };
          } catch (wwebErr) {
            // fallback to SendEditAction
          }
        }

        const SendEditAction = window.require("WAWebSendMessageEditAction");
        if (!SendEditAction || !SendEditAction.sendMessageEdit) {
          return { success: false, reason: "WAWebSendMessageEditAction missing" };
        }

        const chat = Collections.Chat.get(msg.id.remote) ||
          (await Collections.Chat.find(msg.id.remote));

        const options = { linkPreview: false, mentionedJidList: [] };

        // Attempt 1: sendMessageEdit(msg, content, options)
        try {
          await SendEditAction.sendMessageEdit(msg, content, options);
          return { success: true, method: "sendMessageEdit(msg, content, options)" };
        } catch (e1) {
          // Attempt 2: sendMessageEdit(chat, msg, content, options)
          if (chat) {
            try {
              await SendEditAction.sendMessageEdit(chat, msg, content, options);
              return { success: true, method: "sendMessageEdit(chat, msg, content, options)" };
            } catch (e2) {
              // Attempt 3: sendMessageEdit(msg, content)
              try {
                await SendEditAction.sendMessageEdit(msg, content);
                return { success: true, method: "sendMessageEdit(msg, content)" };
              } catch (e3) {
                return { success: false, e1: String(e1), e2: String(e2), e3: String(e3) };
              }
            }
          }
          return { success: false, e1: String(e1) };
        }
      } catch (err) {
        return { success: false, error: String(err?.stack || err) };
      }
    }, msgIdSerialized, stanzaId, newContent);

    if (res && res.success) {
      console.log(`[BOARD] Fallback edit succeeded via ${res.method}`);
      return true;
    } else {
      console.error("[BOARD] Fallback edit failed:", res);
    }
  } catch (fallbackErr) {
    console.error("[BOARD] Fallback evaluation error:", fallbackErr.message);
  }

  return false;
}




/** Shared win-handling: saves score, edits board to final state, sends short reply. */
async function handleWin(message, state, chatId, movieHangmanState, leaderboard, user, extraIntro, winPts = 0) {
  movieHangmanState.delete(chatId);

  if (user && winPts > 0) {
    addPoints(user, winPts, 1, leaderboard);
    state.playerScores ??= {};
    state.playerScores[user] = (state.playerScores[user] || 0) + winPts;
  } else if (user) {
    addPoints(user, 0, 1, leaderboard);
  }

  const playerName = getUserDisplayName(user, user, leaderboard);
  const scoreSummary = buildScoreSummary(state.playerScores, leaderboard);

  // Edit the board to show the fully-revealed final state
  await updateBoard(state, buildDisplay(state));

  // Win announcement
  await message.reply(
    `${extraIntro}${playerName} got it!\n\n` +
    `The movie was: ${state.displayTitle} (${state.category})\n` +
    `+${winPts} pts${scoreSummary}\n\n` +
    `Next round in 3 seconds...`
  );

  // Auto-start next game after 3s (win path only)
  setTimeout(() => startNextMovieHangman(message, movieHangmanState, chatId), 3000);
}

/** Start a fresh Movie Hangman round (called on win/lose, NOT on expiry or stop) */
async function startNextMovieHangman(message, movieHangmanState, chatId) {
  const movie = MOVIES[Math.floor(Math.random() * MOVIES.length)];
  const title = movie.title.toLowerCase();

  const startContent =
    `📂 Category: ${movie.category}\n` +
    `Words: ${movie.title.split(" ").length} | Letters: ${scoreLetters(movie.title)}\n\n` +
    `\`\`\`\n${MOVIE_HANGMAN_STAGES[0]}\n\`\`\`\n\n` +
    `${getMaskedDisplay(title, new Set())}\n\n` +
    `Type a single letter to guess, or the full title to solve.\n` +
    `Stop: /hstop`;


  movieHangmanState.set(chatId, {
    title,
    displayTitle: movie.title,
    category: movie.category,
    guessed: new Set(),
    wrong: 0,
    playerScores: {},
    boardMessage: null,
    pendingBoardCapture: true,
    startedAt: Date.now(),
  });

  await message.reply(startContent);
}

// ─────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────────────────

/**
 * @param {object} message            - WhatsApp message object
 * @param {Map}    movieHangmanState  - Per-chat game state map
 * @param {object} leaderboard        - Leaderboard object
 * @param {string} user               - Sender's identifier
 * @param {string} chatId             - Normalised chat ID (group or DM)
 */
async function handleMovieHangman(message, movieHangmanState, leaderboard, user, chatId) {
  const text = message.body.toLowerCase().trim();
  // chatId is pre-resolved by the caller (handles fromMe group message quirk)

  // ── Start a new game ──────────────────────────────────────────
  if (["!hangman", "/hangman", "!h", "/h"].includes(text)) {
    if (movieHangmanState.has(chatId)) {
      return message.reply("A game is already running! Stop it with */hstop* or */hangmanstop* first.");
    }

    const movie = MOVIES[Math.floor(Math.random() * MOVIES.length)];
    const title = movie.title.toLowerCase();
    const masked = getMaskedDisplay(title, new Set());

    const startContent =
      `📂 Category: *${movie.category}*\n` +
      `📝 Words: *${movie.title.split(" ").length}* | Letters: *${scoreLetters(movie.title)}*\n\n` +
      `\`\`\`\n${MOVIE_HANGMAN_STAGES[0]}\n\`\`\`\n\n` +
      `${masked}\n\n` +
      `Type a single letter to guess, or the full movie title to solve!\n` +
      `Stop: */hstop* or */hangmanstop*`;

    // Set state BEFORE sending so the board message can be captured
    // from its own message_create event (message.reply() returns undefined
    // in some WWebJS + group-LID setups, so we can't rely on its return value).
    movieHangmanState.set(chatId, {
      title,
      displayTitle: movie.title,
      category: movie.category,
      guessed: new Set(),
      wrong: 0,
      playerScores: {},
      boardMessage: null,        // filled by handler.js when the board's message_create fires
      pendingBoardCapture: true, // signals handler.js to watch for the board message
      startedAt: Date.now(),
    });

    // Send the initial board — will be edited in-place on every guess
    await message.reply(startContent);
    return;
  }

  // ── Stop the game ─────────────────────────────────────────────
  if ([
    "!hangmanstop", "/hangmanstop",
    "!hstop", "/hstop",
    "!hangman stop", "/hangman stop",
    "!h stop", "/h stop"
  ].includes(text)) {
    if (!movieHangmanState.has(chatId)) {
      return message.reply("No hangman game is currently running. Start one with */h* or */hangman*");
    }
    const state = movieHangmanState.get(chatId);
    movieHangmanState.delete(chatId);
    // Edit the board to reflect the game was stopped
    await updateBoard(
      state,
      `🏳️ *Game stopped.*\n\n🎬 The movie was: *${state.displayTitle}* (${state.category})`
    );
    return message.reply(`🏳️ Game stopped.\n\n🎬 The movie was: *${state.displayTitle}* (${state.category})`);
  }

  // ── In-game guesses ── (only reached when a game IS active in this chat)
  if (!movieHangmanState.has(chatId)) return;

  const state = movieHangmanState.get(chatId);
  const playerName = leaderboard[user]?.name ?? user;

  // ── Expiry check ──────────────────────────────────────────────
  // WhatsApp only allows editing messages within ~15 minutes of sending.
  // If that window has passed, end the game gracefully.
  if (Date.now() - state.startedAt > GAME_TIMEOUT_MS) {
    movieHangmanState.delete(chatId);
    return message.reply(
      `⏰ *Game expired!*\n\n` +
      `The 15-minute game window has closed — WhatsApp no longer allows editing the board.\n\n` +
      `🎬 The movie was: *${state.displayTitle}* (${state.category})\n\n` +
      `Type or tap */h* to start a fresh game!`
    );
  }

  // ── Full-title guess ──────────────────────────────────────────
  // Only respond when text is multi-char and not a command
  if (text.length > 1 && !text.startsWith("!") && !text.startsWith("/")) {
    if (text === state.title.toLowerCase()) {
      const emptyCount = getEmptyCount(state.title, state.guessed);
      // Correct! Instant win — mark all consonants as guessed for display
      state.title.toLowerCase().split("").forEach((c) => {
        if (/[a-z]/.test(c) && !VOWELS.has(c)) state.guessed.add(c);
      });
      const extraBonus = emptyCount > 2 ? 3 : 0;
      const winPts = emptyCount + extraBonus;
      return handleWin(message, state, chatId, movieHangmanState, leaderboard, user, "🎯 *Full title solved!*\n\n", winPts);
    }
    // Wrong title guess — silently ignore to avoid spam
    return;
  }

  // ── Single-letter guess ───────────────────────────────────────
  if (text.length !== 1 || !/^[a-z]$/.test(text)) return;

  const letter = text;

  // Vowel attempt
  if (VOWELS.has(letter)) {
    return message.reply(`*${letter.toUpperCase()}* is a vowel — already revealed! Guess a consonant.`);
  }

  // Already tried
  if (state.guessed.has(letter)) {
    return message.reply(`Already tried *${letter.toUpperCase()}*! Pick a different letter.`);
  }

  const emptyCountBefore = getEmptyCount(state.title, state.guessed);
  const isCorrect = state.title.toLowerCase().includes(letter);

  // Record guess
  if (!isCorrect) {
    state.guessed.add(letter);
    state.wrong++;
  } else {
    // Award 1 point immediately for correct letter guess if game is not won on this guess
    if (user && !isWon(state.title, new Set([...state.guessed, letter]))) {
      addPoints(user, 1, 0, leaderboard);
      state.playerScores ??= {};
      state.playerScores[user] = (state.playerScores[user] || 0) + 1;
    }
    state.guessed.add(letter);
  }

  // ── Win by letter guesses ─────────────────────────────────────
  if (isWon(state.title, state.guessed)) {
    const extraBonus = emptyCountBefore > 2 ? 3 : 0;
    const winPts = 1 + extraBonus;
    return handleWin(message, state, chatId, movieHangmanState, leaderboard, user, "", winPts);
  }

  // ── Game over ─────────────────────────────────────────────
  if (state.wrong >= 7) {
    movieHangmanState.delete(chatId);
    await updateBoard(
      state,
      `\`\`\`\n${MOVIE_HANGMAN_STAGES[7]}\n\`\`\`\n\n` +
      `Game Over! The hangman was dropped to the shark.\n\n` +
      `The movie was: ${state.displayTitle} (${state.category})`
    );
    await message.reply(
      `Oh no! Dropped to the shark!\n\n` +
      `The movie was: ${state.displayTitle} (${state.category})\n\n` +
      `Next round in 3 seconds...`
    );
    setTimeout(() => startNextMovieHangman(message, movieHangmanState, chatId), 3000);
    return;
  }

  // ── Continue — edit board in-place, reply with short feedback only ──
  const feedback = isCorrect
    ? `✅ *${letter.toUpperCase()}* is in the title! Nice one, ${playerName}!`
    : `❌ *${letter.toUpperCase()}* is not in the title. Wrong ${state.wrong}/7.`;

  // Edit the game board message (no new board dump in chat if edit succeeds)
  const edited = await updateBoard(state, buildDisplay(state));

  // If board edit succeeded, reply with short feedback only.
  // Otherwise, attach updated board to reply as a fallback.
  return message.reply(edited ? feedback : `${feedback}\n\n${buildDisplay(state)}`);

}

module.exports = { handleMovieHangman };
