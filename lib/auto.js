const config = require('../config');
const { readJson, updateJson } = require('./database');

async function runAutoFeatures(sock, message) {
  const settings = readJson('settings.json');

  if (settings.autoRead !== false && config.autoRead) {
    await sock.readMessages([message.key]).catch(() => {});
  }

  if (config.autoReact && !message.fromMe) {
    await sock.sendMessage(message.chat, { react: { text: '✅', key: message.key } }).catch(() => {});
  }

  if (config.autoRecording) {
    await sock.sendPresenceUpdate('recording', message.chat).catch(() => {});
  }

  if (config.autoSaveContacts && message.senderNumber) {
    updateJson('users.json', (users) => {
      users[message.senderNumber] = {
        jid: message.sender,
        lastSeen: new Date().toISOString(),
        chats: Number(users[message.senderNumber]?.chats || 0) + 1
      };
      return users;
    });
  }
}

module.exports = { runAutoFeatures };
