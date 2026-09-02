// src/games/spellingbee.js
// Inverse of Movie Hangman — vowels are hidden, consonants are shown.
// Players see the consonant skeleton + definition and type the full word.
// Commands: /spellingbee | /bee | !spellingbee | !bee  — new puzzle
//           /beeskip | !beeskip                        — skip
//           /beestop | !beestop                        — end game

const { addPoints, getUserDisplayName } = require("../services/userStore");

const VOWELS = new Set(["a", "e", "i", "o", "u"]);
const TIMER_MS = 45_000; // 45 seconds

/** Pick a word with at least 5 letters and at least one vowel */
function pickWord(words) {
  const pool = words.filter((w) => {
    if (!w.Word || w.Word.length < 5) return false;
    return w.Word.toLowerCase().split("").some((c) => VOWELS.has(c));
  });
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Build the consonant skeleton.
 * Vowels → _ | consonants → shown uppercase | spaces → kept | others → shown
 */
function buildSkeleton(word) {
  return word
    .toLowerCase()
    .split("")
    .map((c) => {
      if (c === " ") return " ";
      if (!/[a-z]/.test(c)) return c;
      return VOWELS.has(c) ? "_" : c.toUpperCase();
    })
    .join(" ");
}

/** Count hidden vowels for scoring */
function vowelCount(word) {
  return word.toLowerCase().split("").filter((c) => VOWELS.has(c)).length;
}

function buildPuzzleMsg(entry) {
  const skeleton = buildSkeleton(entry.Word);
  const pos = entry.part_of_speech ? ` (${entry.part_of_speech})` : "";
  const hidden = vowelCount(entry.Word);
  return (
    `SPELLING BEE  -  ${entry.Word.length} letters${pos}\n` +
    `Fill in the ${hidden} missing vowel${hidden !== 1 ? "s" : ""}.\n\n` +
    `${skeleton}\n\n` +
    `Meaning: ${entry.Definitons}\n\n` +
    `Type the full word to win. 45 seconds.`
  );
}

/** Start a fresh puzzle — called on win to auto-advance (NOT on timeout) */
function startNext(message, beeState, words, chatId) {
  const entry = pickWord(words);
  if (!entry) { message.reply("No words available. Type /bee to try again."); return; }
  const timerId = setTimeout(async () => {
    if (beeState.has(chatId)) {
      const s = beeState.get(chatId);
      beeState.delete(chatId);
      // Timeout — do NOT auto-start again
      await message.reply(`Time's up! The word was: ${s.word.toUpperCase()}\n\nType /bee to play again.`);
    }
  }, TIMER_MS);
  beeState.set(chatId, { word: entry.Word.toLowerCase(), timerId });
  message.reply(buildPuzzleMsg(entry));
}

async function handleSpellingBee(message, beeState, words, leaderboard, user, chatId) {
  const text = (message.body || "").toLowerCase().trim();

  const START_CMDS = ["/spellingbee", "!spellingbee", "/bee", "!bee"];
  const SKIP_CMDS  = ["/beeskip", "!beeskip"];
  const STOP_CMDS  = ["/beestop", "!beestop"];

  // ── Start ─────────────────────────────────────────────────────────
  if (START_CMDS.includes(text)) {
    if (beeState.has(chatId)) {
      return message.reply("A Spelling Bee is already running. Type /beestop to end it first.");
    }
    const entry = pickWord(words);
    if (!entry) return message.reply("No words available right now.");

    const timerId = setTimeout(async () => {
      if (beeState.has(chatId)) {
        const s = beeState.get(chatId);
        beeState.delete(chatId);
        await message.reply(
          `Time's up! The word was: ${s.word.toUpperCase()}\n\nType /bee to play again.`
        );
      }
    }, TIMER_MS);

    beeState.set(chatId, { word: entry.Word.toLowerCase(), timerId });
    return message.reply(buildPuzzleMsg(entry));
  }

  // ── Skip ──────────────────────────────────────────────────────────
  if (SKIP_CMDS.includes(text)) {
    if (!beeState.has(chatId)) {
      return message.reply("No Spelling Bee running. Type /bee to start one.");
    }
    const old = beeState.get(chatId);
    clearTimeout(old.timerId);
    beeState.delete(chatId);

    const entry = pickWord(words);
    const timerId = setTimeout(async () => {
      if (beeState.has(chatId)) {
        const s = beeState.get(chatId);
        beeState.delete(chatId);
        await message.reply(
          `Time's up! The word was: ${s.word.toUpperCase()}\n\nType /bee to play again.`
        );
      }
    }, TIMER_MS);

    beeState.set(chatId, { word: entry.Word.toLowerCase(), timerId });
    return message.reply(
      `Skipped. The word was: ${old.word.toUpperCase()}\n\n` +
      buildPuzzleMsg(entry)
    );
  }

  // ── Stop ──────────────────────────────────────────────────────────
  if (STOP_CMDS.includes(text)) {
    if (!beeState.has(chatId)) return message.reply("No Spelling Bee running.");
    const { word, timerId } = beeState.get(chatId);
    clearTimeout(timerId);
    beeState.delete(chatId);
    return message.reply(`Game stopped. The word was: ${word.toUpperCase()}`);
  }

  // ── In-game guess ─────────────────────────────────────────────────
  if (!beeState.has(chatId)) return;
  if (text.startsWith("/") || text.startsWith("!") || text.length < 2) return;

  const state = beeState.get(chatId);

  if (text === state.word) {
    clearTimeout(state.timerId);
    beeState.delete(chatId);

    const pts = Math.max(1, vowelCount(state.word));
    if (user) addPoints(user, pts, 1, leaderboard);
    const name = getUserDisplayName(user, user, leaderboard);

    await message.reply(
      `Correct! ${name} got it!\n` +
      `The word was: ${state.word.toUpperCase()}  (+${pts} pts)\n\n` +
      `Next word in 2 seconds...`
    );
    setTimeout(() => startNext(message, beeState, words, chatId), 2000);
  }
}

module.exports = { handleSpellingBee };
