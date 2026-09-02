async function handleIpl(message, client, iplPollers) {
  const text = message.body.toLowerCase();
  const IPL_API_BASE = "http://localhost:5000";
  const IPL_POLL_INTERVAL_MS = 60 * 5000;

  const chat = await message.getChat();
  const targetChatId = chat.id._serialized;

  const formatLiveScore = (data) => {
    if (data.status !== "Live" || data.live_count === 0) {
      return `🏏 *IPL ${data.season} Live Score*\n\n❌ No live matches right now.`;
    }

    const lines = [""];

    for (const [, match] of Object.entries(data.live_score)) {
      lines.push(
        ` *${match.team_1}*  ${match.score_1}  _(${match.overs_1} ov)_`,
        ` *${match.team_2}*  ${match.score_2}  _(${match.overs_2} ov)_`,
      );

      if (match.bowler) {
        lines.push(
          ``,
          ` bowling: *${match.bowler.name}*  ${match.bowler.overs}ov  ${match.bowler.wickets}/${match.bowler.runs}`,
        );
      }

      lines.push(``);
    }

    return lines.join("\n").trimEnd();
  };

  const fetchAndSend = async () => {
    try {
      const res = await fetch(`${IPL_API_BASE}/ipl-live-score-s2`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.status_code !== 200)
        throw new Error(data.message || "API error");
      await client.sendMessage(targetChatId, formatLiveScore(data));
    } catch (err) {
      await client.sendMessage(
        targetChatId,
        `⚠️ *IPL Score Update Failed*\n\n${err.message}`,
      );
    }
  };

  if (text === "/ipl stop") {
    if (iplPollers.has(targetChatId)) {
      clearInterval(iplPollers.get(targetChatId));
      iplPollers.delete(targetChatId);
      message.reply("🛑 *IPL live score updates stopped.*");
    } else {
      message.reply("ℹ️ No active IPL updates in this chat.");
    }
  } else if (text === "/ipl status") {
    message.reply(
      iplPollers.has(targetChatId)
        ? "✅ IPL updates are *active*.\nSend `/ipl stop` to stop."
        : "❌ IPL updates are *not active*.\nSend `/ipl` to start.",
    );
  } else {
    if (iplPollers.has(targetChatId)) {
      message.reply(
        "⚠️ IPL updates already running.\nSend `/ipl stop` to stop.",
      );
    } else {
      await message.reply(
        "✅ *IPL live score updates started!*\nSend `/ipl stop` to stop.",
      );
      fetchAndSend();
      const intervalId = setInterval(fetchAndSend, IPL_POLL_INTERVAL_MS);
      iplPollers.set(targetChatId, intervalId);
    }
  }
}

module.exports = {
  handleIpl,
};
