async function handleGroup(message, client) {
  const chat = await message.getChat();
  if (chat.isGroup) {
    const customMessage =
      message.body.substring(9).trim() || "Attention everyone!";
    const mentions = [];
    let textMsg = `📣 *Tagging Everyone*\n\n${customMessage}\n\n`;
    for (const participant of chat.participants) {
      const contact = await client.getContactById(participant.id._serialized);
      mentions.push(contact);
      textMsg += `@${participant.id.user} `;
    }
    await chat.sendMessage(textMsg, { mentions });
  } else {
    message.reply("This command only works in groups!");
  }
}

module.exports = {
  handleGroup,
};
