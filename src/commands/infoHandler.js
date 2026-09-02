const { ZODIAC_SIGNS, wyrPrompts } = require("../constants");
const {
  fetchDefinition,
  fetchHoroscope,
  fetchMeme,
} = require("../services/apiService");

async function handleInfo(message, client, MessageMedia, leaderboard, user) {
  const text = message.body.toLowerCase();
  const chatId = message.from;

  if (text === "!wyr") {
    const randomPrompt =
      wyrPrompts[Math.floor(Math.random() * wyrPrompts.length)];
    return message.reply("🤔 *Would You Rather*\n\n" + randomPrompt);
  }

  if (text.startsWith("!name ")) {
    const newName = message.body.split(" ").slice(1).join(" ");
    if (message.hasQuotedMsg) {
      const quotedMsg = await message.getQuotedMessage();
      const quotedUser = quotedMsg.author
        ? quotedMsg.author.split("@")[0].split(":")[0]
        : quotedMsg.from.split("@")[0].split(":")[0];
      if (leaderboard[quotedUser]) {
        leaderboard[quotedUser].name = newName;
        message.reply(`Name updated to ${newName}`);
      }
    }
  }

  if (text.startsWith("!define ")) {
    const term = text.split(" ").slice(1).join(" ").trim();
    try {
      const entry = await fetchDefinition(term);
      if (!entry) {
        message.reply(`❓ No definition found for *${term}*.`);
      } else {
        let msg = `📖 *${entry.word}*`;
        if (entry.phonetic) msg += `  _(${entry.phonetic})_`;
        msg += "\n\n";
        entry.meanings.slice(0, 3).forEach((meaning) => {
          msg += `*${meaning.partOfSpeech}*\n`;
          meaning.definitions.slice(0, 2).forEach((d, i) => {
            msg += `  ${i + 1}. ${d.definition}\n`;
            if (d.example) msg += `     _"${d.example}"_\n`;
          });
          msg += "\n";
        });
        message.reply(msg.trim());
      }
    } catch (err) {
      message.reply("Error fetching definition. Try again!");
    }
  }

  if (text.startsWith("!horoscope")) {
    const sign = text.split(" ")[1]?.trim().toLowerCase();
    if (!sign || !ZODIAC_SIGNS.includes(sign)) {
      message.reply(`♈ Please provide a valid sign!`);
    } else {
      try {
        const horoscope = await fetchHoroscope(sign);
        if (horoscope)
          message.reply(
            `✨ *${sign.charAt(0).toUpperCase() + sign.slice(1)} — Today's Horoscope*\n\n${horoscope}`,
          );
        else message.reply("Couldn't fetch horoscope right now.");
      } catch (err) {
        message.reply("Error fetching horoscope.");
      }
    }
  }

  if (text === "!meme") {
    try {
      const meme = await fetchMeme();
      if (meme?.url) {
        const media = await MessageMedia.fromUrl(meme.url, {
          unsafeMime: true,
        });
        await client.sendMessage(chatId, media, {
          caption: `😂 *${meme.title}*\nr/${meme.subreddit}`,
        });
      } else message.reply("Couldn't fetch a meme right now.");
    } catch (err) {
      message.reply("Error fetching meme.");
    }
  }
}

module.exports = {
  handleInfo,
};
