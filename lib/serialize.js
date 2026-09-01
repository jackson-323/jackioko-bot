const { withFooter } = require('./ui');

function getContent(message) {
  const m = message.message || {};
  const type = Object.keys(m)[0];
  const content = m[type];
  const text = m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m.reactionMessage?.text ||
    m.contactMessage?.displayName ||
    m.locationMessage?.name ||
    '';
  return { type, content, text };
}

function serializeMessage(sock, raw) {
  if (!raw || !raw.message) return null;
  const remoteJid = raw.key.remoteJid;
  const isGroup = remoteJid.endsWith('@g.us');
  const fromMe = Boolean(raw.key.fromMe);
  // For group messages prefer participant; for outgoing group messages fallback to socket user id
  const sender = isGroup ? (raw.key.participant || (fromMe ? (sock.user?.id || remoteJid) : remoteJid)) : remoteJid;
  const { type, content, text } = getContent(raw);

  return {
    raw,
    key: raw.key,
    id: raw.key.id,
    chat: remoteJid,
    sender,
    senderNumber: (sender || '').split('@')[0].replace(/\D/g, ''),
    isGroup,
    fromMe,
    type,
    content,
    text: text || '',
    quoted: content?.contextInfo?.quotedMessage,
    mentions: content?.contextInfo?.mentionedJid || [],
    reply: (value) => {
      if (value && typeof value === 'object') return sock.sendMessage(remoteJid, value, { quoted: raw });
      return sock.sendMessage(remoteJid, { text: withFooter(value) }, { quoted: raw });
    }
  };
}

module.exports = { serializeMessage };
