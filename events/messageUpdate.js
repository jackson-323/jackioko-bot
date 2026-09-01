const { readJson } = require('../lib/database');

async function handleMessageUpdate(sock, event) {
  const chat = event.key?.remoteJid;
  if (!chat?.endsWith('@g.us')) return;
  const groups = readJson('groups.json');
  if (!groups[chat]?.antidelete) return;
  if (event.update?.messageStubType || event.update?.message === null) {
    await sock.sendMessage(chat, { text: 'A message was deleted.' }).catch(() => {});
  }
}

module.exports = { handleMessageUpdate };
