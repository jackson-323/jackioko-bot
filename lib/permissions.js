const config = require('../config');
const { status } = require('./ui');

function isOwner(number) {
  return Boolean(number && number === config.ownerNumber);
}

function isGlobalAdmin(number) {
  return isOwner(number) || config.admins.includes(number);
}

async function getGroupContext(sock, message) {
  if (!message.isGroup) return { isGroup: false, senderAdmin: false, botAdmin: false, metadata: null };
  const metadata = await sock.groupMetadata(message.chat);
  const senderJid = message.sender;
  const botJid = sock.user?.id?.split(':')[0] + '@s.whatsapp.net';
  const admins = metadata.participants.filter((p) => p.admin).map((p) => p.id);
  return {
    isGroup: true,
    metadata,
    senderAdmin: admins.includes(senderJid) || isGlobalAdmin(message.senderNumber),
    botAdmin: admins.includes(botJid)
  };
}

async function assertAllowed(sock, message, command) {
  if (command.owner && !isOwner(message.senderNumber)) return status('permission', 'This command is owner only.');
  if (command.group && !message.isGroup) return status('group', 'This command only works inside groups.');
  if (command.private && message.isGroup) return status('private', 'This command only works in private chat.');
  const group = await getGroupContext(sock, message);
  if (command.admin && !group.senderAdmin) return status('permission', 'This command requires group admin permission.');
  if (command.botAdmin && !group.botAdmin) return status('permission', 'I need group admin permission to do that.');
  return null;
}

module.exports = { isOwner, isGlobalAdmin, getGroupContext, assertAllowed };
