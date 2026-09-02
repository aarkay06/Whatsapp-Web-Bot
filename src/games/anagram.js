// src/games/anagram.js
// Players unscramble a shuffled word. First correct answer wins.
// Commands: /anagram (or !anagram) — new puzzle
//           /anagramskip           — skip to next word
//           /anagramstop           — end the game

const { addPoints, getUserDisplayName } = require("../services/userStore");

const TIMER_MS = 60_000; // 60 seconds per puzzle

/** Fisher-Yates shuffle, avoids accidentally returning the real word */
function shuffle(word) {
  const arr = word.split("");
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const result = arr.join("");
  return result === word && word.length > 1 ? shuffle(word) : result;
}

/** Pick a random word of at least 4 letters */
function pickWord(words) {
  const pool = words.filter((w) => w.Word && w.Word.length >= 4);
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Plain-text puzzle card */
function buildPuzzleMsg(entry, scrambled) {
  const pos = entry.part_of_speech ? ` (${entry.part_of_speech})` : "";
  return (
    `ANAGRAM  -  ${entry.Word.length} letters${pos}\n\n` +
    `${scrambled.toUpperCase()}\n\n` +
    `Hint: ${entry.Definitons}\n\n` +
    `Type the correct word to win. 60 seconds on the clock.`
  );
}

/** Start a fresh puzzle in this chat (called on win to auto-advance) */
function startNext(message, anagramState, words, chatId) {
  const entry = pickWord(words);
  if (!entry) { message.reply("No words available. Type /anagram to try again."); return; }
  const scrambled = shuffle(entry.Word.toLowerCase());
  const timerId = setTimeout(async () => {
    if (anagramState.has(chatId)) {
      const s = anagramState.get(chatId);
      anagramState.delete(chatId);
      // Timeout — do NOT auto-start again
      await message.reply(`Time's up! The word was: ${s.word.toUpperCase()}\n\nType /anagram to play again.`);
    }
  }, TIMER_MS);
  anagramState.set(chatId, { word: entry.Word.toLowerCase(), scrambled, timerId });
  message.reply(buildPuzzleMsg(entry, scrambled));
}

async function handleAnagram(message, anagramState, words, leaderboard, user, chatId) {
  const text = (message.body || "").toLowerCase().trim();

  const START_CMDS = ["/anagram", "!anagram"];
  const SKIP_CMDS  = ["/anagramskip", "!anagramskip"];
  const STOP_CMDS  = ["/anagramstop", "!anagramstop"];

  // ── Start ─────────────────────────────────────────────────────────
  if (START_CMDS.includes(text)) {
    if (anagramState.has(chatId)) {
      return message.reply("An anagram is already running. Type /anagramstop to end it first.");
    }
    const entry = pickWord(words);
    if (!entry) return message.reply("No words available. Try again later.");
    const scrambled = shuffle(entry.Word.toLowerCase());
    const timerId = setTimeout(async () => {
      if (anagramState.has(chatId)) {
        const s = anagramState.get(chatId);
        anagramState.delete(chatId);
        await message.reply(`Time's up! The word was: ${s.word.toUpperCase()}\n\nType /anagram to play again.`);
      }
    }, TIMER_MS);
    anagramState.set(chatId, { word: entry.Word.toLowerCase(), scrambled, timerId });
    return message.reply(buildPuzzleMsg(entry, scrambled));
  }

  // ── Skip ──────────────────────────────────────────────────────────
  if (SKIP_CMDS.includes(text)) {
    if (!anagramState.has(chatId)) {
      return message.reply("No anagram running. Type /anagram to start one.");
    }
    const old = anagramState.get(chatId);
    clearTimeout(old.timerId);
    anagramState.delete(chatId);
    const entry = pickWord(words);
    const scrambled = shuffle(entry.Word.toLowerCase());
    const timerId = setTimeout(async () => {
      if (anagramState.has(chatId)) {
        const s = anagramState.get(chatId);
        anagramState.delete(chatId);
        await message.reply(`Time's up! The word was: ${s.word.toUpperCase()}\n\nType /anagram to play again.`);
      }
    }, TIMER_MS);
    anagramState.set(chatId, { word: entry.Word.toLowerCase(), scrambled, timerId });
    return message.reply(
      `Skipped. The word was: ${old.word.toUpperCase()}\n\n` +
      buildPuzzleMsg(entry, scrambled)
    );
  }

  // ── Stop ──────────────────────────────────────────────────────────
  if (STOP_CMDS.includes(text)) {
    if (!anagramState.has(chatId)) return message.reply("No anagram running.");
    const { word, timerId } = anagramState.get(chatId);
    clearTimeout(timerId);
    anagramState.delete(chatId);
    return message.reply(`Game stopped. The word was: ${word.toUpperCase()}`);
  }

  // ── In-game guess ─────────────────────────────────────────────────
  if (!anagramState.has(chatId)) return;
  if (text.startsWith("/") || text.startsWith("!") || text.length < 2) return;

  const state = anagramState.get(chatId);

  if (text === state.word) {
    clearTimeout(state.timerId);
    anagramState.delete(chatId);

    const pts = Math.max(1, Math.floor(state.word.length / 2));
    if (user) addPoints(user, pts, 1, leaderboard);
    const name = getUserDisplayName(user, user, leaderboard);

    await message.reply(
      `Correct! ${name} got it!\n` +
      `The word was: ${state.word.toUpperCase()}  (+${pts} pts)\n\n` +
      `Next word in 2 seconds...`
    );
    setTimeout(() => startNext(message, anagramState, words, chatId), 2000);
  }
}

module.exports = { handleAnagram };
