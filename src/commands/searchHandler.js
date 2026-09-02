const {
  analyzeChatContextAndRespond,
} = require("../services/aiService");
const { lyrics } = require("../services/lyricsService");
const { movie } = require("../services/movieService");

async function getQuotedMessageChain(message, maxDepth = 5) {
  const chain = [];
  let curr = message;

  while (chain.length < maxDepth && curr && curr.hasQuotedMsg) {
    let quoted = null;

    // 1. Standard getQuotedMessage call
    try {
      quoted = await curr.getQuotedMessage();
    } catch (err) {
      console.warn("[AI CONTEXT] Standard getQuotedMessage failed:", err.message);
    }

    // 2. Raw _data.quotedMsg fallback
    if (!quoted && curr._data?.quotedMsg) {
      try {
        const MessageClass = curr.constructor;
        const rawQuoted = curr._data.quotedMsg;
        const stanzaId = curr._data.quotedStanzaID;
        const participant = curr._data.quotedParticipant;
        const remote = curr.from;

        const formattedRaw = {
          ...rawQuoted,
          id: rawQuoted.id || {
            fromMe: false,
            remote: remote,
            id: stanzaId,
            _serialized: stanzaId ? `false_${remote}_${stanzaId}${participant ? `_${participant}` : ''}` : stanzaId
          }
        };

        quoted = new MessageClass(curr.client, formattedRaw);
      } catch (fallbackErr) {
        console.warn("[AI CONTEXT] Fallback construction failed:", fallbackErr.message);
      }
    }

    if (!quoted) break;

    chain.push(quoted);
    curr = quoted;
  }

  // Reverse array so the chain is ordered chronologically (oldest ancestor -> newest quote)
  return chain.reverse();
}

async function handleAiChatCommand(message) {
  // Ensure message.id._serialized is populated (WhatsApp Web stores serialized ID in message.id["$1"])
  if (message?.id && !message.id._serialized && message.id["$1"]) {
    message.id._serialized = message.id["$1"];
  }

  const text = message.body;

  // 1. Fetch last 5 messages in this chat context (safely wrapped)
  let historyMessages = [];
  try {
    const chat = await message.getChat();
    if (chat && typeof chat.fetchMessages === "function") {
      const fetched = await chat.fetchMessages({ limit: 5 });
      historyMessages = fetched.slice(-5);
    }
  } catch (err) {
    console.warn("Could not fetch chat history for AI command:", err?.message || err);
  }

  // 2. Fetch quoted message chain (m -> P -> Q -> ...) up to 5 ancestors
  let quotedChain = [];
  let quotedMessageText = null;
  if (message.hasQuotedMsg) {
    try {
      quotedChain = await getQuotedMessageChain(message, 5);
      if (quotedChain.length > 0) {
        quotedMessageText = quotedChain[quotedChain.length - 1]?.body || null;
      }
    } catch (err) {
      console.warn("Could not fetch quoted message chain for AI command:", err?.message || err);
    }
  }

  // 3. Extract user query string
  const currentMessageText =
    text.replace(/^(!ai|\/ai)\s*/i, "").trim() || text;

  let loadingMsg;
  try {
    loadingMsg = await message.reply("🤖 Thinking...");
  } catch (_) {
    // If reply fails, proceed to attempt response
  }

  const replyText = await analyzeChatContextAndRespond({
    historyMessages,
    currentMessageText,
    quotedMessageText,
    quotedChain,
  });

  if (loadingMsg && typeof loadingMsg.reply === "function") {
    return loadingMsg.reply(replyText);
  }
  return message.reply(replyText);
}

async function handleSearch(message) {
  const text = message.body.toLowerCase();

  if (
    text.startsWith("!ai ") ||
    text.startsWith("/ai ") ||
    text === "!ai" ||
    text === "/ai"
  ) {
    return await handleAiChatCommand(message);
  }

  if (text.startsWith("!lyrics ")) {
    const song = await lyrics(text.split(" ").slice(1).join(" "));
    return message.reply(song);
  }

  if (text.startsWith("!movie ")) {
    const result = await movie(text.split(" ").slice(1).join(" "));
    if (result?.results?.length > 0) {
      const id = result.results[0].id;
      const name = result.results[0].title.replace(/ /g, "%20");
      return message.reply(`https://broflix.ci/watch/movie/${id}?title=${name}`);
    } else {
      return message.reply("Movie not found.");
    }
  }
}

module.exports = {
  handleSearch,
  handleAiChatCommand,
};
