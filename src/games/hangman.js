const fs = require("fs");
const { HANGMAN_STAGES } = require("../constants");
const { addPoints, getUserDisplayName } = require("../services/userStore");

function hangmanDisplay(state) {
  const { word, guessed, wrong } = state;
  const masked = word
    .split("")
    .map((l) => (guessed.has(l) ? l : "_"))
    .join(" ");
  const tried = [...guessed].join(", ") || "none";
  return `${HANGMAN_STAGES[wrong]}\n\n${masked}\n\nWrong: ${wrong}/6 | Tried: ${tried}`;
}

function buildScoreSummary(playerScores, leaderboard) {
  if (!playerScores) return "";
  const entries = Object.entries(playerScores);
  if (entries.length === 0) return "";
  entries.sort((a, b) => b[1] - a[1]);
  let summary = "\nPoints this round:\n";
  for (const [uid, pts] of entries) {
    const name = getUserDisplayName(uid, uid, leaderboard);
    summary += `${name}: +${pts} ${pts === 1 ? "pt" : "pts"}\n`;
  }
  return summary.trimEnd();
}

/** Start a new Word Hangman round (called on win/lose to auto-advance) */
function startNext(message, hangmanState, words, chatId) {
  const hangData = words[Math.floor(Math.random() * words.length)];
  hangmanState.set(chatId, {
    word: hangData.Word.toLowerCase(),
    def: hangData.Definitons,
    guessed: new Set(),
    wrong: 0,
    playerScores: {},
  });
  message.reply(
    `WORD HANGMAN - New round!\n\nHint: ${hangData.Definitons}\n\n${hangmanDisplay(hangmanState.get(chatId))}\n\nGuess a letter: !g <letter>\nGive up: !wordstop`
  );
}

async function handleHangman(message, hangmanState, words, leaderboard, user, chatId) {
  const text = (message.selectedButtonId || message.body || "").toLowerCase().trim();
  // chatId is pre-resolved by the caller (handles fromMe group message quirk)

  if (text === "!word") {
    const hangData = words[Math.floor(Math.random() * words.length)];
    hangmanState.set(chatId, {
      word: hangData.Word.toLowerCase(),
      def: hangData.Definitons,
      guessed: new Set(),
      wrong: 0,
      playerScores: {},
    });
    return message.reply(
      `🎮 *WORD HANGMAN* — New game started!\n\n💡 Hint: ${hangData.Definitons}\n\n${hangmanDisplay(hangmanState.get(chatId))}\n\nGuess a letter: *!g <letter>*\nGive up: *!wordstop*`,
    );
  }

  if (text.startsWith("!g ") && hangmanState.has(chatId)) {
    const letter = text.split(" ")[1]?.trim().toLowerCase();
    if (!letter || letter.length !== 1 || !/[a-z]/.test(letter))
      return message.reply("Please guess a single letter. e.g. *!g a*");

    const hState = hangmanState.get(chatId);
    if (hState.guessed.has(letter))
      return message.reply(
        `You already tried *${letter}*! Pick a different letter.`,
      );

    const emptyCountBefore = hState.word
      .split("")
      .filter((l) => !hState.guessed.has(l)).length;

    const isCorrect = hState.word.includes(letter);
    if (!isCorrect) {
      hState.guessed.add(letter);
      hState.wrong++;
    } else {
      hState.guessed.add(letter);
    }

    const won = hState.word
      .split("")
      .every((l) => hState.guessed.has(l));

    if (won) {
      hangmanState.delete(chatId);
      const extraBonus = emptyCountBefore > 2 ? 3 : 0;
      const winPts = 1 + extraBonus;
      if (user) {
        addPoints(user, winPts, 1, leaderboard);
        hState.playerScores ??= {};
        hState.playerScores[user] = (hState.playerScores[user] || 0) + winPts;
      }
      const displayName = getUserDisplayName(user, user, leaderboard);
      const scoreSummary = buildScoreSummary(hState.playerScores, leaderboard);
      await message.reply(
        `${HANGMAN_STAGES[hState.wrong]}\n\n${hState.word.split("").join(" ")}\n\n${displayName} wins! The word was "${hState.word}" (+${winPts} pts)${scoreSummary}\n\nNext round in 3 seconds...`
      );
      setTimeout(() => startNext(message, hangmanState, words, chatId), 3000);
    } else if (hState.wrong >= 6) {
      hangmanState.delete(chatId);
      await message.reply(
        `${HANGMAN_STAGES[6]}\n\nGame over! The word was "${hState.word}".\n\nNext round in 3 seconds...`
      );
      setTimeout(() => startNext(message, hangmanState, words, chatId), 3000);
    } else {
      if (isCorrect && user) {
        addPoints(user, 1, 0, leaderboard);
        hState.playerScores ??= {};
        hState.playerScores[user] = (hState.playerScores[user] || 0) + 1;
      }
      return message.reply(hangmanDisplay(hState));
    }
  }

  if (text === "!wordstop") {
    if (hangmanState.has(chatId)) {
      const { word } = hangmanState.get(chatId);
      hangmanState.delete(chatId);
      return message.reply(`🏳️ Game stopped. The word was *${word}*.`);
    } else return message.reply("No hangman game is currently running.");
  }
}

module.exports = {
  hangmanDisplay,
  handleHangman,
};
