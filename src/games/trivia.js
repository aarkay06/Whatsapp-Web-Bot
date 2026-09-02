const fs = require("fs");
const { decodeHtml } = require("../helpers");
const { fetchTrivia } = require("../services/apiService");
const { addPoints, getUserDisplayName } = require("../services/userStore");

/** Fetch a trivia question, build state, send the puzzle card */
async function startNext(message, client, triviaState, leaderboard, targetChatId) {
  try {
    const q = await fetchTrivia();
    const question = decodeHtml(q.question);
    const correct = decodeHtml(q.correct_answer);
    const options = [...q.incorrect_answers.map(decodeHtml), correct].sort(
      () => Math.random() - 0.5,
    );
    const labels = ["A", "B", "C", "D"];
    const correctLabel = labels[options.indexOf(correct)];

    let msg = `TRIVIA - ${decodeHtml(q.category)}\nDifficulty: ${q.difficulty}\n\n${question}\n\n`;
    options.forEach((opt, i) => (msg += `${labels[i]}. ${opt}\n`));
    msg += `\nReply A, B, C, or D - 30 seconds.`;

    if (triviaState.has(targetChatId))
      clearTimeout(triviaState.get(targetChatId).timerId);

    // Timeout: announce answer but do NOT auto-start again
    const timerId = setTimeout(async () => {
      if (triviaState.has(targetChatId)) {
        triviaState.delete(targetChatId);
        await client.sendMessage(
          targetChatId,
          `Time's up! The answer was ${correctLabel}. ${correct}\n\nType /t to play again.`,
        );
      }
    }, 30_000);

    triviaState.set(targetChatId, { answer: correctLabel, correct, timerId, wrongGuesses: new Set() });
    await client.sendMessage(targetChatId, msg);
  } catch (err) {
    await client.sendMessage(targetChatId, "Error fetching trivia. Type /t to try again.").catch(() => {});
  }
}

async function handleTrivia(message, client, triviaState, leaderboard, user, chatId) {
  const text = (message.selectedButtonId || message.body || "").toLowerCase().trim();
  const targetChatId = chatId || (message.fromMe ? (message.to ?? message.from) : message.from);

  if (text === "!trivia" || text === "/t" || text === "/trivia") {
    await startNext(message, client, triviaState, leaderboard, targetChatId);
    return;
  }

  if (triviaState.has(targetChatId) && /^[abcd]$/.test(text.trim())) {
    const gState = triviaState.get(targetChatId);
    const guess = text.trim().toUpperCase();
    gState.wrongGuesses ??= new Set();

    if (guess === gState.answer) {
      clearTimeout(gState.timerId);
      triviaState.delete(targetChatId);
      const pts = Math.max(1, 4 - gState.wrongGuesses.size);
      if (user) addPoints(user, pts, 1, leaderboard);
      const displayName = getUserDisplayName(user, user, leaderboard);
      await message.reply(
        `Correct, ${displayName}! (+${pts} pts)\nThe answer was ${gState.answer}. ${gState.correct}\n\nNext question in 3 seconds...`,
      );
      setTimeout(() => startNext(message, client, triviaState, leaderboard, targetChatId), 3000);
    } else {
      gState.wrongGuesses.add(guess);
      if (gState.wrongGuesses.size >= 3) {
        clearTimeout(gState.timerId);
        triviaState.delete(targetChatId);
        await message.reply(
          `Wrong! The correct answer was ${gState.answer}. ${gState.correct}\n\nNext question in 3 seconds...`,
        );
        setTimeout(() => startNext(message, client, triviaState, leaderboard, targetChatId), 3000);
      } else {
        return message.reply(`Wrong! ${3 - gState.wrongGuesses.size} ${gState.wrongGuesses.size === 2 ? "chance" : "chances"} left.`);
      }
    }
  }
}

module.exports = {
  handleTrivia,
};

