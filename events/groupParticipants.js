const { readJson } = require('../lib/database');
const { BRAND, withFooter } = require('../lib/ui');

async function handleGroupParticipantsUpdate(sock, event) {
  const groups = readJson('groups.json');
  const settings = groups[event.id] || {};
  for (const participant of event.participants || []) {
    const jid = typeof participant === 'string' ? participant : participant?.id;
    if (!jid) continue;
    const mention = `@${jid.split('@')[0]}`;
    if (event.action === 'add' && settings.antibot && jid.includes(':')) {
      await sock.groupParticipantsUpdate(event.id, [jid], 'remove').catch(() => {});
      continue;
    }
    if (event.action === 'add' && settings.welcome) {
      await sock.sendMessage(event.id, { text: withFooter(`╭━━━━━━━━━━━━━━━━━━━━━━━╮\n┃ 👋 *Welcome to ${BRAND}*\n┃━━━━━━━━━━━━━━━━━━━━━━━\n┃ ${mention}\n┃ Enjoy your stay.\n╰━━━━━━━━━━━━━━━━━━━━━━━╯`), mentions: [jid] }).catch(() => {});
    }
    if (event.action === 'remove' && settings.goodbye) {
      await sock.sendMessage(event.id, { text: withFooter(`╭━━━━━━━━━━━━━━━━━━━━━━━╮\n┃ 👋 *Goodbye from ${BRAND}*\n┃━━━━━━━━━━━━━━━━━━━━━━━\n┃ ${mention}\n┃ See you again.\n╰━━━━━━━━━━━━━━━━━━━━━━━╯`), mentions: [jid] }).catch(() => {});
    }
  }
}

module.exports = { handleGroupParticipantsUpdate };
