async function handleBotProxy(message) {
  const text = message.body;
  fetch("http://localhost:5000/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: text }),
  })
    .then((r) => r.json())
    .then((d) => message.reply(d.reply))
    .catch((e) =>
      message.reply("Error: Is your local server running? " + e.message),
    );
}

module.exports = {
  handleBotProxy,
};
