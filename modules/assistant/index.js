const fs = require('fs-extra');
const path = require('path');
const config = require('../../config');
const autoLearn = require("../brain/autolearn");
const activity = require('./activity');
const trusted = require('./trusted');
const personality = require('./personality');
const memory = require('./memory');
const safety = require('./safety');
const ai = require('./ai');
const brain = require('../brain');
const logger = require('./logger');

let sockRef = null;
let autoReplyActive = false;

async function init(sock) {
  const DB = path.join(__dirname, '..', '..', 'database');
  await fs.ensureDir(DB);
  await activity.ensure();
  await trusted.ensure();
  await personality.ensure();
  await memory.ensure();
  await safety.ensure();
  await ai.ensure();
  await logger.ensure();

  if (sock) attachSocket(sock);
  setInterval(() => { if (!sockRef && global.conn) attachSocket(global.conn); }, 5000);
}

function attachSocket(sock) {
  sockRef = sock;
}

async function observe(sock, message) {
  try {
    const settings = await activity.getAssistantSettings();
    const trusts = await trusted.list().catch(() => []);
    const sender = message.sender || message.chat;
    const trust = trusts.some((entry) => entry.jid === sender);

    if (message.fromMe) {
      await autoLearn.learn(message.text);
      await activity.touch().catch(() => {});
      autoReplyActive = false;
      try { await personality.learnFromMessage(message); } catch (error) { console.error('personality learn failed', error); }
      await memory.remember({ jid: sender, name: message.senderName || sender, lastConversation: message.text || '', lastInteractionTime: Date.now() }).catch(() => {});
      await memory.updateConversation(sender, message.text || '', '', { topic: 'outgoing', contactType: 'Unknown' }).catch(() => {});
      await memory.autosave().catch(() => {});
      return { settings, trusts, trust };
    }

    if (!settings.enabled) return { settings, trusts, trust };

    const state = await ai.getState();
    const timeoutMinutes = Number(settings.timeout || state.timeout || 15);
    const ownerAway = state.awayMode === true;
    const shouldAutoReply = ownerAway && (settings.trustedOnly ? trust : true) && !autoReplyActive && state.awayMode !== false;

    if (shouldAutoReply) {
      autoReplyActive = true;
      const category = safety.classify(message.text || '');
      if (safety.isSensitive(category)) {
        await sock.sendMessage(message.chat, { text: 'The owner is currently away. I can notify them personally about this sensitive request.' }, { quoted: message.raw });
        await logger.notifyOwner({ type: 'safety', sender, category, text: message.text }).catch(() => {});
        return { settings, trusts, trust, autoReply: false };
      }

      const profile = await personality.getProfile();
const memorySnapshot = await memory.getContact(sender);
const recentMessages = [{ role: 'user', content: message.text || '' }];

// Try offline brain first
let replyResult = null;

const brainReply = await brain.reply(
    message.text || '',
    {
        id: sender,
        name: memorySnapshot.nickname || sender
    }
);

if (brainReply) {

    replyResult = {
        ok: true,
        text: brainReply.text,
        source: 'brain'
    };

} else {

    replyResult = await ai.generateReply({
        message,
        contact: {
            jid: sender,
            nickname: memorySnapshot.nickname || sender,
            relationship: memorySnapshot.relationship || 'Unknown',
            contactType: memorySnapshot.contactType || 'Unknown'
        },
        profile,
        recentMessages,
        memorySnapshot,
        awayMode: true
    });

}
        
    
      const reply = replyResult?.text || 'Not around right now 😊';
      await memory.remember({
        jid: sender,
        name: memorySnapshot.name || sender,
        nickname: memorySnapshot.nickname || sender,
        relationship: memorySnapshot.relationship || 'Unknown',
        contactType: memorySnapshot.contactType || 'Unknown',
        lastConversation: message.text || '',
        lastInteractionTime: Date.now(),
        summary: `${message.text || ''}`
      }).catch(() => {});
      await memory.updateConversation(sender, message.text || '', reply, { topic: 'incoming', contactType: memorySnapshot.contactType || 'Unknown' }).catch(() => {});
      await memory.autosave().catch(() => {});
      await sock.sendMessage(message.chat, { text: reply }, { quoted: message.raw });
      await logger.notifyOwner({ type: 'autoreply', sender, reply }).catch(() => {});
      return { settings, trusts, trust, autoReply: true };
    }

    return { settings, trusts, trust, autoReply: false };
  } catch (error) {
    console.error('assistant observe failed', error);
    return null;
  }
}

module.exports = { init, attachSocket, observe };
