const fs = require("fs");
const { MessageMedia } = require("whatsapp-web.js");
const { INSTAGRAM_REGEX } = require("../constants");
const { downloadInstagram } = require("../services/instagramService");

async function handleInstagramLink(message, MessageMedia) {
  const igLinks = message.body.match(INSTAGRAM_REGEX);
  if (!igLinks || igLinks.length === 0) return;

  const url = igLinks[0];
  let filePath;
  try {
    filePath = await downloadInstagram(url);
    const media = MessageMedia.fromFilePath(filePath);
    await message.reply(media);
    try {
      await ackMsg.delete(true);
    } catch (_) {}
  } catch (err) {
    console.error("Instagram download error:", err.message);
    message.reply(
      `❌ *Download failed.*\n_Error: ${err.message.slice(0, 120)}_`,
    );
  } finally {
    if (filePath && fs.existsSync(filePath)) fs.unlink(filePath, () => {});
  }
}

async function getQuotedMessageFromPup(client, message) {
  if (!message.id?._serialized) return null;
  return await client.pupPage.evaluate(async (msgId) => {
    try {
      const MsgCollection = window.require('WAWebCollections').Msg;
      let msg = MsgCollection.get(msgId);
      if (!msg) {
        msg = (await MsgCollection.getMessagesById([msgId]))?.messages?.[0];
      }
      if (!msg) return null;

      let quotedMsgObj = msg.quotedMsgObj || msg._quotedMsgObj || msg.quotedMsg;

      if (!quotedMsgObj && msg.quotedStanzaID) {
        const allMsgs = MsgCollection.toArray ? MsgCollection.toArray() : (MsgCollection.models || []);
        quotedMsgObj = allMsgs.find(m => m.id && (m.id.id === msg.quotedStanzaID || (typeof m.id._serialized === 'string' && m.id._serialized.includes(msg.quotedStanzaID))));
        
        if (!quotedMsgObj) {
          const possibleIds = [
            `${false}_${msg.id.remote}_${msg.quotedStanzaID}`,
            `${true}_${msg.id.remote}_${msg.quotedStanzaID}`,
            msg.quotedParticipant ? `${false}_${msg.id.remote}_${msg.quotedStanzaID}_${msg.quotedParticipant}` : null
          ].filter(Boolean);

          for (const pid of possibleIds) {
            try {
              const res = await MsgCollection.getMessagesById([pid]);
              if (res?.messages?.[0]) {
                quotedMsgObj = res.messages[0];
                break;
              }
            } catch (_) {}
          }
        }
      }

      if (!quotedMsgObj) return null;
      return window.WWebJS.getMessageModel(quotedMsgObj);
    } catch (err) {
      return null;
    }
  }, message.id._serialized);
}

async function getQuotedMessageSafe(message, client) {
  if (!message.hasQuotedMsg) return null;

  // 1. Try standard getQuotedMessage
  try {
    const quoted = await message.getQuotedMessage();
    if (quoted && quoted.id) return quoted;
  } catch (err) {
    console.warn("[STICKER] Standard message.getQuotedMessage() failed:", err.message);
  }

  // 2. Try Puppeteer evaluate extraction
  try {
    const modelData = await getQuotedMessageFromPup(client, message);
    if (modelData && !modelData._error) {
      const MessageClass = message.constructor;
      return new MessageClass(client, modelData);
    }
  } catch (pupErr) {
    console.warn("[STICKER] getQuotedMessageFromPup failed:", pupErr.message);
  }

  // 3. Fallback to raw message._data.quotedMsg
  const rawQuoted = message._data?.quotedMsg;
  if (rawQuoted) {
    try {
      const MessageClass = message.constructor;
      const stanzaId = message._data?.quotedStanzaID;
      const participant = message._data?.quotedParticipant;
      const remote = message.from;
      
      const formattedRaw = {
        ...rawQuoted,
        id: rawQuoted.id || {
          fromMe: false,
          remote: remote,
          id: stanzaId,
          _serialized: stanzaId ? `false_${remote}_${stanzaId}${participant ? `_${participant}` : ''}` : stanzaId
        }
      };

      return new MessageClass(client, formattedRaw);
    } catch (fallbackErr) {
      console.error("[STICKER] Fallback construction failed:", fallbackErr.message);
    }
  }

  return null;
}

async function downloadMediaFromRawQuoted(client, rawQuoted) {
  if (!rawQuoted || !rawQuoted.directPath || !rawQuoted.mediaKey) return null;

  try {
    const result = await client.pupPage.evaluate(async (quotedData) => {
      try {
        const mockQpl = {
          addAnnotations: function () { return this; },
          addPoint: function () { return this; },
        };

        const DownloadManager = window.require('WAWebDownloadManager')?.downloadManager;
        if (!DownloadManager) return null;

        const decryptedMedia = await DownloadManager.downloadAndMaybeDecrypt({
          directPath: quotedData.directPath,
          encFilehash: quotedData.encFilehash,
          filehash: quotedData.filehash,
          mediaKey: quotedData.mediaKey,
          mediaKeyTimestamp: quotedData.mediaKeyTimestamp,
          type: quotedData.type,
          signal: new AbortController().signal,
          downloadQpl: mockQpl,
        });

        if (!decryptedMedia) return null;

        const dataUrl = window.WWebJS.arrayBufferToBase64Async
          ? await window.WWebJS.arrayBufferToBase64Async(decryptedMedia)
          : window.WWebJS.arrayBufferToBase64(decryptedMedia);

        return {
          mimetype: quotedData.mimetype,
          data: dataUrl,
          filename: quotedData.filename || undefined,
        };
      } catch (err) {
        return { error: err.message };
      }
    }, {
      directPath: rawQuoted.directPath,
      encFilehash: rawQuoted.encFilehash,
      filehash: rawQuoted.filehash,
      mediaKey: rawQuoted.mediaKey,
      mediaKeyTimestamp: rawQuoted.mediaKeyTimestamp,
      type: rawQuoted.type,
      mimetype: rawQuoted.mimetype,
      filename: rawQuoted.filename,
    });

    if (result && !result.error && result.data && result.mimetype) {
      return new MessageMedia(result.mimetype, result.data, result.filename);
    } else if (result?.error) {
      console.warn("[STICKER] Direct decrypt error:", result.error);
    }
  } catch (err) {
    console.error("[STICKER] downloadMediaFromRawQuoted error:", err.message);
  }

  return null;
}

async function handleSticker(message, client) {
  const chatId = message.fromMe ? (message.to ?? message.from) : message.from;
  try {
    let media;
    if (message.hasMedia) {
      media = await message.downloadMedia();
      if (!media) {
        return await message.reply("❌ Failed to download media from message.");
      }
    } else if (message.hasQuotedMsg) {
      const rawQuoted = message._data?.quotedMsg;
      const quoted = await getQuotedMessageSafe(message, client);

      const isMediaQuoted =
        (quoted && (
          quoted.hasMedia ||
          Boolean(quoted.mediaKey) ||
          Boolean(quoted._data?.mediaKey) ||
          Boolean(quoted._data?.directPath) ||
          Boolean(quoted._data?.isMedia) ||
          ["image", "video", "sticker", "audio", "document"].includes(quoted.type || quoted._data?.type)
        )) ||
        (rawQuoted && (
          Boolean(rawQuoted.mediaKey) ||
          Boolean(rawQuoted.directPath) ||
          Boolean(rawQuoted.isMedia) ||
          ["image", "video", "sticker", "audio", "document"].includes(rawQuoted.type || rawQuoted.kind)
        ));

      if (!isMediaQuoted) {
        return await message.reply("❌ The quoted message doesn't contain an image or video!");
      }

      if (quoted) {
        try {
          media = await quoted.downloadMedia();
        } catch (err) {
          console.warn("[STICKER] quoted.downloadMedia() failed, trying direct decrypt:", err.message);
        }
      }

      if (!media && rawQuoted) {
        media = await downloadMediaFromRawQuoted(client, rawQuoted);
      }

      if (!media) {
        return await message.reply("❌ Failed to download media from the quoted message.");
      }
    } else {
      return await message.reply(
        "Send an image/video with the caption `/sticker` (or `!sticker`), or reply to one with `/sticker` (or `!sticker`)."
      );
    }

    await client.sendMessage(chatId, media, {
      sendMediaAsSticker: true,
      stickerName: "Bot Sticker",
      stickerAuthor: "MyBot",
    });
  } catch (err) {
    console.error("[STICKER ERROR]", err);
    await message.reply(`❌ *Failed to create sticker.*\n_Error: ${err.message}_`);
  }
}

module.exports = {
  handleInstagramLink,
  handleSticker,
  getQuotedMessageSafe,
  downloadMediaFromRawQuoted,
};

