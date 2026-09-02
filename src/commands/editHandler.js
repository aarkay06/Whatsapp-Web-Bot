const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const OWNER_ID = "270085025448186";

function getAgyExecutablePath() {
  const customPath = process.env.AGY_PATH;
  if (customPath && fs.existsSync(customPath)) return customPath;

  const localAppData =
    process.env.LOCALAPPDATA ||
    path.join(process.env.USERPROFILE || "C:\\Users\\krish", "AppData", "Local");
  const defaultPath = path.join(localAppData, "agy", "bin", "agy.exe");
  if (fs.existsSync(defaultPath)) return defaultPath;

  return "agy";
}

function cleanOutput(text) {
  if (!text) return "";
  return text
    .replace(
      /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
      ""
    )
    .trim();
}

async function handleEditCommand(message, user) {
  // Authorization check: only handle requests from the owner
  const isOwner = user === OWNER_ID || message.fromMe;
  if (!isOwner) {
    // Silently ignore unauthorized requests without error messages
    return;
  }

  const rawText = message.body || "";
  const prompt = rawText.replace(/^[\/!](edit|agy)\s*/i, "").trim();

  if (!prompt) {
    return message.reply(
      "🤖 *Antigravity Code Assistant*\n\nUsage: `/edit <instructions>` or `/agy <instructions>`\n\nExample:\n`/edit Change spam count in /spam to 10`"
    );
  }

  // Send immediate acknowledgment
  await message.reply(
    `⏳ *Antigravity is working on your request...*\n\n📝 _"${prompt}"_\n\n_(This usually takes 30-60 seconds to analyze and apply changes)_`
  );

  const agyExe = getAgyExecutablePath();
  const rootDir = path.resolve(__dirname, "../../");

  // Context-enriched prompt ensuring the agent stays within the current project
  const fullPrompt = `Workspace directory is ${rootDir}.\nTask: ${prompt}`;
  const args = [
    "-p",
    fullPrompt,
    "--dangerously-skip-permissions",
    "--add-dir",
    rootDir,
  ];

  console.log(`[AGY] Executing: ${agyExe} for prompt: "${prompt}"`);

  const child = spawn(agyExe, args, {
    cwd: rootDir,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    env: { ...process.env },
  });

  let stdoutData = "";
  let stderrData = "";

  child.stdout.on("data", (data) => {
    stdoutData += data.toString();
  });

  child.stderr.on("data", (data) => {
    stderrData += data.toString();
  });

  const timeout = setTimeout(() => {
    try {
      child.kill();
    } catch (_) {}
    message.reply("⏱️ *Antigravity timed out after 5 minutes.*");
  }, 5 * 60 * 1000);

  child.on("close", async (code) => {
    clearTimeout(timeout);
    console.log(`[AGY] Process finished with exit code ${code}`);

    const cleanedStdout = cleanOutput(stdoutData);
    const cleanedStderr = cleanOutput(stderrData);

    if (code !== 0 && !cleanedStdout) {
      console.error("[AGY ERROR]", cleanedStderr || `Exit code ${code}`);
      const errDetails = cleanedStderr || `Process exited with code ${code}`;
      return message.reply(
        `❌ *Antigravity encountered an issue:*\n\n${errDetails.slice(0, 1500)}`
      );
    }

    const resultText = cleanedStdout || cleanedStderr || "Task completed successfully.";
    const truncated =
      resultText.length > 3500
        ? resultText.slice(0, 3500) + "\n\n...(output truncated)..."
        : resultText;

    const replyMsg = `✅ *Antigravity Changes Applied!*\n\n${truncated}`;
    await message.reply(replyMsg);
  });

  child.on("error", async (err) => {
    clearTimeout(timeout);
    console.error("[AGY SPAWN ERROR]", err);
    await message.reply(`❌ *Failed to start Antigravity:* ${err.message}`);
  });
}

module.exports = {
  handleEditCommand,
};
