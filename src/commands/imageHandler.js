const { MessageMedia } = require("whatsapp-web.js");
const { getQuotedMessageSafe, downloadMediaFromRawQuoted } = require("./mediaHandler");

const WORKER_BASE_URL = "https://cloudflare-image-workers.rajkrishna8060.workers.dev";

/**
 * Call Cloudflare Worker API for Text-to-Image or Image-to-Image
 */
async function callCloudflareImageAPI({ prompt, base64Image = null }) {
  if (base64Image) {
    // Image-to-Image modification
    const payload = {
      model: "@cf/black-forest-labs/flux-2-klein-4b",
      prompt: prompt,
      image: base64Image,
      n: 1,
      size: "1024x1024",
    };

    // First attempt: POST /v1/images/generations
    let res = await fetch(`${WORKER_BASE_URL}/v1/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    let data = await res.json().catch(() => null);

    // Second attempt: Fallback to MCP run_model if generations returned error
    if (!res.ok || !data?.data?.[0]?.url) {
      const mcpPayload = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "run_model",
          arguments: {
            taskType: "edits",
            model_id: "@cf/black-forest-labs/flux-2-klein-4b",
            prompt: prompt,
            image: base64Image,
          },
        },
      };

      const mcpRes = await fetch(`${WORKER_BASE_URL}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mcpPayload),
      });

      const mcpData = await mcpRes.json().catch(() => null);

      if (mcpData?.result?.content?.[0]?.text) {
        const textContent = mcpData.result.content[0].text;
        try {
          const parsed = JSON.parse(textContent);
          if (parsed.url) return parsed.url;
          if (parsed.data?.[0]?.url) return parsed.data[0].url;
        } catch (_) {
          if (textContent.startsWith("http://") || textContent.startsWith("https://")) {
            return textContent.trim();
          }
          if (mcpData.result.content[0].isError) {
            throw new Error(textContent);
          }
        }
      }

      const errMsg = data?.error?.message || `Worker returned HTTP status ${res.status}`;
      throw new Error(errMsg);
    }

    return data.data[0].url;
  } else {
    // Text-to-Image generation
    const payload = {
      model: "@cf/black-forest-labs/flux-1-schnell",
      prompt: prompt,
      n: 1,
      size: "1024x1024",
    };

    const res = await fetch(`${WORKER_BASE_URL}/v1/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.data?.[0]?.url) {
      // Fallback: Try MCP run_model tool call for generations
      const mcpPayload = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "run_model",
          arguments: {
            taskType: "generations",
            model_id: "@cf/black-forest-labs/flux-1-schnell",
            prompt: prompt,
          },
        },
      };

      const mcpRes = await fetch(`${WORKER_BASE_URL}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mcpPayload),
      });

      const mcpData = await mcpRes.json().catch(() => null);
      if (mcpData?.result?.content?.[0]?.text) {
        const textContent = mcpData.result.content[0].text;
        try {
          const parsed = JSON.parse(textContent);
          if (parsed.url) return parsed.url;
          if (parsed.data?.[0]?.url) return parsed.data[0].url;
        } catch (_) {
          if (textContent.startsWith("http://") || textContent.startsWith("https://")) {
            return textContent.trim();
          }
          if (mcpData.result.content[0].isError) {
            throw new Error(textContent);
          }
        }
      }

      const errMsg = data?.error?.message || `Worker returned HTTP status ${res.status}`;
      throw new Error(errMsg);
    }

    return data.data[0].url;
  }
}

/**
 * Handle /img and !img commands
 */
async function handleImageCommand(message, client) {
  let textPrompt = message.body.replace(/^[\/!]img\s*/i, "").trim();
  let media = null;
  let quotedMsg = null;

  // Check if current message has media
  if (message.hasMedia) {
    try {
      const downloaded = await message.downloadMedia();
      if (downloaded && downloaded.mimetype?.startsWith("image/")) {
        media = downloaded;
      }
    } catch (err) {
      console.warn("[IMG COMMAND] Failed to download direct message media:", err.message);
    }
  }

  // Check quoted message if media or prompt not found
  if (message.hasQuotedMsg) {
    try {
      quotedMsg = await getQuotedMessageSafe(message, client);
      if (quotedMsg) {
        // If user didn't provide prompt text, fallback to quoted message body text
        if (!textPrompt && quotedMsg.body && typeof quotedMsg.body === "string") {
          textPrompt = quotedMsg.body.trim();
        }

        // If no direct media found yet, try downloading media from quoted message
        if (!media) {
          const rawQuoted = message._data?.quotedMsg;
          const isMediaQuoted =
            quotedMsg.hasMedia ||
            Boolean(quotedMsg.mediaKey) ||
            Boolean(quotedMsg._data?.mediaKey) ||
            Boolean(quotedMsg._data?.directPath) ||
            Boolean(quotedMsg._data?.isMedia) ||
            (quotedMsg.type || quotedMsg._data?.type) === "image" ||
            rawQuoted?.type === "image" ||
            rawQuoted?.kind === "image";

          if (isMediaQuoted) {
            try {
              const qMedia = await quotedMsg.downloadMedia();
              if (qMedia && qMedia.mimetype?.startsWith("image/")) {
                media = qMedia;
              }
            } catch (qErr) {
              console.warn("[IMG COMMAND] quotedMsg.downloadMedia() failed:", qErr.message);
            }

            if (!media && rawQuoted) {
              const rawMedia = await downloadMediaFromRawQuoted(client, rawQuoted);
              if (rawMedia && rawMedia.mimetype?.startsWith("image/")) {
                media = rawMedia;
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn("[IMG COMMAND] getQuotedMessageSafe error:", err.message);
    }
  }

  // Validate prompt
  if (!textPrompt) {
    return await message.reply(
      "🎨 *AI Image Generation & Editing*\n\n" +
      "*Usage:*\n" +
      "• `/img <prompt>` — Create an image from text\n" +
      "• Send an image with caption `/img <prompt>` — Edit/modify the image\n" +
      "• Reply to an image with `/img <prompt>` — Edit/modify the image"
    );
  }

  const isImageToImage = Boolean(media && media.data);

  try {
    // Send status indicator
    if (isImageToImage) {
      await message.reply("⏳ *Modifying image... Please wait.*");
    } else {
      await message.reply("⏳ *Generating image... Please wait.*");
    }

    const imageUrl = await callCloudflareImageAPI({
      prompt: textPrompt,
      base64Image: isImageToImage ? media.data : null,
    });

    // Download the generated image URL and convert to MessageMedia
    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) {
      throw new Error(`Failed to download generated image from worker (${imgResponse.status})`);
    }

    const arrayBuffer = await imgResponse.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = imgResponse.headers.get("content-type") || "image/png";

    const resultMedia = new MessageMedia(mimeType, base64Data);



    const chatId = message.fromMe ? (message.to ?? message.from) : message.from;
    await client.sendMessage(chatId, resultMedia);
  } catch (err) {
    console.error("[IMG COMMAND ERROR]", err);
    await message.reply(`❌ *Image request failed.*\n_Error: ${err.message}_`);
  }
}

module.exports = {
  handleImageCommand,
};
