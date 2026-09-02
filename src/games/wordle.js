// src/games/wordle.js
// Continuous word-guessing game. A pixelated word + definition is shown;
// anyone in the chat can type the correct word to score and advance.
// Commands:
//   wordle       — show help
//   start        — begin / resume a match
//   skip         — skip current word (no points)
//   leaderboard  — overall scores
//   !stop        — pause the match

const { getUserDisplayName, addPoints, getOverallLeaderboardText } = require("../services/userStore");

/**
 * Pixelify — always reveals at least 1 random letter so the word
 * isn't completely blank on shorter words. Remaining slots are 50/50.
 */
function pixelify(word) {
  if (word.length === 1) return word.toUpperCase();

  const indices = Array.from({ length: word.length }, (_, i) => i);
  // Guarantee at least one revealed position
  const guaranteed = indices.splice(Math.floor(Math.random() * indices.length), 1)[0];

  return word
    .split("")
    .map((ch, i) => {
      if (i === guaranteed) return ch.toUpperCase();
      return Math.random() < 0.5 ? "_" : ch.toUpperCase();
    })
    .join(" ");
}

/** Pick a random word, optionally filtered by difficulty */
function pickWord(words, difficulty) {
  let pool = words.filter((w) => w.Word && w.Word.length >= 3);
  if (difficulty) pool = pool.filter((w) => w.difficulty === difficulty);
  if (pool.length === 0) pool = words; // fallback
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Format the puzzle card shown after each new word */
function buildWordCard(entry) {
  const pixel = pixelify(entry.Word.toLowerCase());
  const pos    = entry.part_of_speech ? `  |  ${entry.part_of_speech}` : "";
  const diff   = entry.difficulty     ? `  |  difficulty ${entry.difficulty}/10` : "";
  const hint   = entry.Definitons     ? `Meaning: ${entry.Definitons}` : "";
  const ex     = entry.example        ? `Example: "${entry.example}"` : "";

  return [
    `${pixel}`,
    `${entry.Word.length} letters${pos}${diff}`,
    "",
    hint,
    ex,
  ]
    .filter(Boolean)
    .join("\n");
}

async function handleWordle(message, wordleState, words, leaderboard, user) {
  const text = (message.body || "").toLowerCase().trim();

  // ── Help ──────────────────────────────────────────────────────────
  if (text === "wordle") {
    return message.reply(
      "WORDLE\n\n" +
      "start        - begin a match\n" +
      "skip         - skip the current word\n" +
      "leaderboard  - see scores\n" +
      "!stop        - pause the match\n\n" +
      "Just type the word to guess. Points = word length."
    );
  }

  // ── Leaderboard ───────────────────────────────────────────────────
  if (text === "leaderboard") {
    return message.reply(getOverallLeaderboardText());
  }

  // ── Start ─────────────────────────────────────────────────────────
  if (text === "start") {
    wordleState.isTheMatchGoingOn = true;
    const entry = pickWord(words);
    wordleState.word    = entry.Word.toLowerCase();
    wordleState.entry   = entry;
    wordleState.guesses = 0;
    console.log("[Wordle] Current word:", wordleState.word);
    return message.reply(buildWordCard(entry));
  }

  // ── Stop ──────────────────────────────────────────────────────────
  if (text === "!stop") {
    if (!wordleState.isTheMatchGoingOn) return message.reply("No Wordle match is running.");
    wordleState.isTheMatchGoingOn = false;
    return message.reply(
      `Match paused. The current word was: ${(wordleState.word || "?").toUpperCase()}\n\nType 'start' to resume.`
    );
  }

  // ── Skip ──────────────────────────────────────────────────────────
  if (text === "skip") {
    if (!wordleState.isTheMatchGoingOn || !wordleState.word) {
      return message.reply("No match running. Type 'start' to begin.");
    }
    const skipped = wordleState.word;
    const entry   = pickWord(words);
    wordleState.word    = entry.Word.toLowerCase();
    wordleState.entry   = entry;
    wordleState.guesses = 0;
    return message.reply(
      `Skipped! The word was: ${skipped.toUpperCase()}\n\n` +
      buildWordCard(entry)
    );
  }

  // ── In-game guess ─────────────────────────────────────────────────
  if (
    wordleState.isTheMatchGoingOn &&
    wordleState.word &&
    !text.startsWith("/") &&
    !text.startsWith("!")
  ) {
    wordleState.guesses = (wordleState.guesses || 0) + 1;

    if (text === wordleState.word) {
      const pts   = Math.max(1, wordleState.word.length);
      const entry = wordleState.entry || {};
      if (user) addPoints(user, pts, 1, leaderboard);

      const name = getUserDisplayName(user, user, leaderboard);

      // Advance to next word immediately
      const next = pickWord(words);
      wordleState.word    = next.Word.toLowerCase();
      wordleState.entry   = next;
      wordleState.guesses = 0;
      console.log("[Wordle] Next word:", wordleState.word);

      return message.reply(
        `${name} got it! (+${pts} pts)\n` +
        `The word was: ${(entry.Word || text).toUpperCase()}\n\n` +
        `--- Next word ---\n\n` +
        buildWordCard(next)
      );
    }
  }
}

module.exports = { handleWordle };

