const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

const openaiClient = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY,
  baseURL: "https://api.perplexity.ai",
});

// ─── Rate-limit backoff tracker ───────────────────────────────────────────────
// Prevents hammering a model that just returned 429. Tracks cooldown per model.
const modelCooldowns = new Map();

function isModelCoolingDown(modelId) {
  const entry = modelCooldowns.get(modelId);
  if (!entry) return false;
  if (Date.now() >= entry.untilMs) {
    modelCooldowns.delete(modelId);
    return false;
  }
  return true;
}

function setModelCooldown(modelId, retryAfterSeconds = 65) {
  const untilMs = Date.now() + retryAfterSeconds * 1000;
  modelCooldowns.set(modelId, { untilMs });
  console.warn(`⏳ ${modelId} rate-limited — cooling down ${retryAfterSeconds}s`);
}

// ─── OpenRouter key reader ────────────────────────────────────────────────────
/**
 * Reads OpenRouter API key from environment variable or openrouter.txt file
 */
function getOpenRouterApiKey() {
  if (process.env.OPENROUTER_API_KEY) {
    return process.env.OPENROUTER_API_KEY;
  }
  try {
    const rootDir = path.resolve(__dirname, "..", "..");
    const openRouterFilePath = path.join(rootDir, "openrouter.txt");
    if (fs.existsSync(openRouterFilePath)) {
      const content = fs.readFileSync(openRouterFilePath, "utf8");
      // Extract bare API key from anywhere in the file (even if file has other code)
      const match = content.match(/sk-or-v1-[a-zA-Z0-9]+/);
      if (match) {
        return match[0];
      }
    }
  } catch (e) {
    console.warn("Could not read openrouter.txt:", e.message);
  }
  return "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";
}

// ─── Gemini model list ────────────────────────────────────────────────────────
// Ordered by Requests-Per-Day (RPD) quota — highest first so we get the most
// headroom before rate limits kick in. Lite models have higher RPD quota.
//
//  Model                       RPM   RPD
//  gemini-3.1-flash-lite       15    500   ← try first (most quota)
//  gemini-3.1-flash-lite-preview 15  500   ← alias
//  gemini-3.5-flash-lite       15     20
//  gemini-2.5-flash-lite       10     20
//  gemini-2.5-flash             5     20
//  gemini-3-flash-preview       5     20
//  gemini-3.5-flash             5     20
//  gemini-3.6-flash             5     20
// Model IDs verified via ModelService.ListModels on 2026-08-09.
const GEMINI_MODELS = [
  "gemini-3.1-flash-lite",       // 500 RPD — highest quota, try first
  "gemini-3.1-flash-lite-preview",
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-3-flash-preview",
  "gemini-3.5-flash",
  "gemini-3.6-flash",
];

/**
 * Call Gemini API as primary provider.
 * Rotates through models ordered by quota; skips models in cooldown.
 */
async function callGeminiAPI(systemInstruction, userContent) {
  const apiKey =
    process.env.GEMINI_API_KEY || "AIzaSyCr43L9g-GluZB4F0_Pf8pPrBD4YH6XgM4";

  let lastError = null;

  for (const model of GEMINI_MODELS) {
    if (isModelCoolingDown(model)) {
      console.log(`⏭️  Skipping Gemini ${model} (rate-limit cooldown)`);
      continue;
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: userContent }],
            },
          ],
        }),
      });

      // Rate-limited: cool down this model and try the next one
      if (response.status === 429) {
        const retryAfter = parseInt(
          response.headers.get("Retry-After") || "65",
          10
        );
        setModelCooldown(model, isNaN(retryAfter) ? 65 : retryAfter);
        lastError = new Error(`Rate limited: ${model}`);
        continue;
      }

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`HTTP ${response.status} — ${model}: ${errorData}`);
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        console.log(`✅ Gemini responded via ${model}`);
        return text;
      }

      throw new Error(`Empty response from ${model}`);
    } catch (err) {
      if (!err.message.startsWith("Rate limited")) {
        console.warn(`⚠️  Gemini ${model} error:`, err.message);
      }
      lastError = err;
    }
  }

  throw lastError || new Error("All Gemini models failed or rate-limited");
}

// ─── OpenRouter model list ────────────────────────────────────────────────────
// Using :free tier models (prompt=$0, completion=$0).
// Ordered from most capable to lightest for graceful quality degradation.
const OPENROUTER_MODELS = [
  "google/gemini-2.0-flash-exp:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "mistralai/mistral-small-3.2-24b-instruct:free",
  "mistralai/mistral-7b-instruct:free",
  "poolside/laguna-s-2.1:free",
  "qwen/qwen3-8b:free",
  "inclusionai/ling-3.0-tiny:free",
];

/**
 * Call OpenRouter API as fallback provider.
 * Uses free-tier (:free) models only; skips models in cooldown.
 */
async function callOpenRouterAPI(systemInstruction, userContent) {
  const apiKey = getOpenRouterApiKey();
  const url = "https://openrouter.ai/api/v1/chat/completions";

  let lastError = null;

  for (const model of OPENROUTER_MODELS) {
    if (isModelCoolingDown(model)) {
      console.log(`⏭️  Skipping OpenRouter ${model} (rate-limit cooldown)`);
      continue;
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/whatsapp-web-bot",
          "X-Title": "WhatsApp Web Bot",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: userContent },
          ],
          max_tokens: 1024,
        }),
      });

      if (response.status === 429) {
        const retryAfter = parseInt(
          response.headers.get("Retry-After") || "65",
          10
        );
        setModelCooldown(model, isNaN(retryAfter) ? 65 : retryAfter);
        lastError = new Error(`Rate limited: ${model}`);
        continue;
      }

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`HTTP ${response.status} — ${model}: ${errorData}`);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (content) {
        console.log(`✅ OpenRouter responded via ${model}`);
        return content;
      }

      throw new Error(`Empty response from ${model}`);
    } catch (err) {
      if (!err.message.startsWith("Rate limited")) {
        console.warn(`⚠️  OpenRouter ${model} error:`, err.message);
      }
      lastError = err;
    }
  }

  throw lastError || new Error("All OpenRouter models failed or rate-limited");
}

// ─── Main orchestrator ────────────────────────────────────────────────────────
/**
 * Analyzes conversation history (last 5 messages), current message,
 * and optional quoted message, generating an AI response.
 * Uses Gemini as primary and OpenRouter as fallback.
 */
async function analyzeChatContextAndRespond({
  historyMessages = [],
  currentMessageText = "",
  quotedMessageText = null,
  quotedChain = [],
  systemPrompt = "You are a helpful, direct WhatsApp AI assistant. Use the recent conversation history, quoted message context, and user prompt to form a natural, accurate response. IMPORTANT: Reply in plain text only — no markdown (no **, no *, no #, no backticks, no bullet dashes), no emojis. Adapt your response length to the context—keep simple answers brief, but provide detailed and comprehensive responses when complex explanations or detailed answers are requested.",
}) {
  let promptContext = "=== RECENT CONVERSATION HISTORY (Last 5 Messages) ===\n";

  if (historyMessages.length === 0) {
    promptContext += "(No previous history)\n";
  } else {
    historyMessages.forEach((msg, idx) => {
      const sender = msg.author || msg.from || "User";
      promptContext += `[Message ${idx + 1}] ${sender}: ${msg.body}\n`;
    });
  }

  if (quotedChain && quotedChain.length > 0) {
    promptContext += `\n=== REPLIED-TO MESSAGE THREAD (Oldest to Newest Ancestor) ===\n`;
    quotedChain.forEach((msg, idx) => {
      const sender = msg.author || msg.from || `User ${idx + 1}`;
      const body = typeof msg === "string" ? msg : (msg.body || msg.caption || "");
      promptContext += `[Quote Level ${idx + 1}] ${sender}: ${body}\n`;
    });
  } else if (quotedMessageText) {
    promptContext += `\n=== REPLIED TO / QUOTED MESSAGE ===\n"${quotedMessageText}"\n`;
  }

  promptContext += `\n=== CURRENT USER MESSAGE ===\n${currentMessageText}\n`;

  // 1. Primary Attempt: Google Gemini
  try {
    const geminiResult = await callGeminiAPI(systemPrompt, promptContext);
    if (geminiResult) return geminiResult;
  } catch (err) {
    console.warn(
      "Gemini primary failed, falling back to OpenRouter:",
      err.message
    );
  }

  // 2. Fallback Attempt: OpenRouter (free tier)
  try {
    const openRouterResult = await callOpenRouterAPI(systemPrompt, promptContext);
    if (openRouterResult) return openRouterResult;
  } catch (err) {
    console.error("OpenRouter fallback also failed:", err.message);
  }

  return "⚠️ Sorry, all AI services are currently unavailable. Please try again in a moment.";
}

/**
 * Legacy single-request chat function (delegates to primary/fallback engine)
 */
async function chatWithoutStreaming(req) {
  return analyzeChatContextAndRespond({
    historyMessages: [],
    currentMessageText: String(req),
    quotedMessageText: null,
  });
}

module.exports = {
  openaiClient,
  callGeminiAPI,
  callOpenRouterAPI,
  analyzeChatContextAndRespond,
  chatWithoutStreaming,
};
