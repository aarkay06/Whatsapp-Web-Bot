// index.js
require("dotenv").config();
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const fs = require("fs");

// ==========================================
// 1. DATA & STATE SETUP (Kept in memory to survive hot-reloads)
// ==========================================
const leaderboardJson = fs.readFileSync("leaderboard.json");
let leaderboard = JSON.parse(leaderboardJson);
const wordsJson = fs.readFileSync("words.json", "utf8");
const words = JSON.parse(wordsJson);

// Per-chat state maps
const triviaState = new Map();
const hangmanState = new Map();
const movieHangmanState = new Map();
const recurringMap = new Map();

// Wordle state object (bundled so the handler can modify its properties)
const wordleState = {
  isTheMatchGoingOn: false,
  isTheRoundGoingOn: true,
  data: null,
  word: null,
  def: null,
  lastWord: null,
};

// Bundle all state to pass to the handler
const botState = {
  leaderboard,
  words,
  triviaState,
  hangmanState,
  movieHangmanState,
  recurringMap,
  wordleState,
};

const { setupLcReminderScheduler } = require("./src/services/lcReminderService");

// ==========================================
// 2. WHATSAPP CLIENT SETUP
// ==========================================
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    protocolTimeout: 300000, // 300,000 ms = 5 minutes
  },
});

client.on("qr", (qr) => qrcode.generate(qr, { small: true }));
client.on("ready", () => {
  console.log("Client is ready!");
  setupLcReminderScheduler(client);

  // Attach direct lifecycle listeners to Puppeteer browser & page
  try {
    if (client.pupBrowser) {
      client.pupBrowser.on("disconnected", () => {
        console.error("[HEALTH] Puppeteer browser disconnected! Exiting to allow PM2 restart...");
        process.exit(1);
      });
    }
    if (client.pupPage) {
      client.pupPage.on("close", () => {
        console.error("[HEALTH] WhatsApp Web page closed! Exiting to allow PM2 restart...");
        process.exit(1);
      });
      client.pupPage.on("error", (err) => {
        console.error("[HEALTH] WhatsApp Web page crashed:", err);
        process.exit(1);
      });
    }
  } catch (err) {
    console.error("[HEALTH] Error attaching browser lifecycle listeners:", err);
  }
});

// Periodic health monitor: ensure browser and page are alive
setInterval(async () => {
  try {
    if (client.pupBrowser && !client.pupBrowser.isConnected()) {
      console.error("[HEALTH] Puppeteer browser is not connected. Exiting to allow PM2 restart...");
      process.exit(1);
    }
    if (client.pupPage && client.pupPage.isClosed()) {
      console.error("[HEALTH] WhatsApp page is closed. Exiting to allow PM2 restart...");
      process.exit(1);
    }
  } catch (err) {
    console.error("[HEALTH] Health check encountered error:", err.message);
    process.exit(1);
  }
}, 30000);

client.on("authenticated", () => console.log("AUTHENTICATED!"));
client.on("auth_failure", (msg) => {
  console.error("AUTHENTICATION FAILURE:", msg);
  process.exit(1);
});
client.on("disconnected", (reason) => {
  console.log("Client disconnected:", reason);
  process.exit(1); // Allow PM2 to restart the process on disconnect
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
  const errStr = String(reason?.stack || reason);
  if (
    errStr.includes("ProtocolError") ||
    errStr.includes("Target closed") ||
    errStr.includes("Session closed") ||
    errStr.includes("detached") ||
    errStr.includes("Navigating frame was detached") ||
    errStr.includes("Execution context was destroyed")
  ) {
    console.error("Fatal Puppeteer error detected. Exiting to allow PM2 restart...");
    process.exit(1);
  }
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

client.initialize().catch((err) => {
  console.error("Client initialization failed:", err);
  process.exit(1);
});

// ==========================================
// 3. HOT-RELOADING MESSAGE HANDLER
// ==========================================
client.on("message_create", async (message) => {
  try {
    // 1. Clear the cached handler so changes take effect immediately
    const handlerPath = require.resolve("./handler.js");
    delete require.cache[handlerPath];

    // 2. Load the fresh handler
    const { processMessage } = require("./handler.js");

    // 3. Execute logic, passing down the client, utilities, and memory state
    await processMessage(message, client, MessageMedia, botState);
  } catch (err) {
    console.error("Hot-reload Handler Error:", err);
  }
});

// ==========================================
// 4. SLEEP & WAKE DETECTOR FOR PM2 RESTART
// ==========================================
// Detects when the laptop resumes from sleep/hibernate (timer gap > 10s).
// Triggers clean client shutdown and process exit so PM2 automatically restarts the bot.
let lastCheckTime = Date.now();
const SLEEP_CHECK_INTERVAL_MS = 2000;
const WAKE_THRESHOLD_MS = 10000;

setInterval(async () => {
  const now = Date.now();
  const timeDiff = now - lastCheckTime;
  if (timeDiff > WAKE_THRESHOLD_MS) {
    const durationSec = Math.round(timeDiff / 1000);
    console.log(
      `[SYSTEM WAKE] System resumed after ~${durationSec}s of sleep. Restarting bot...`
    );
    try {
      await client.destroy();
    } catch (err) {
      console.error(
        "[SYSTEM WAKE] Error destroying client during restart:",
        err.message
      );
    }
    process.exit(0);
  }
  lastCheckTime = now;
}, SLEEP_CHECK_INTERVAL_MS);

