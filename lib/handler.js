const config = require('../config');
const { updateJson, readJson } = require('./database');
const { assertAllowed } = require('./permissions');
const { checkCooldown } = require('./cooldown');
const { checkSpam } = require('./antispam');
const { logCommand, logError } = require('./logger');
const { runAutoFeatures } = require('./auto');
const activity = require('../modules/assistant/activity');
const { status } = require('./ui');

async function handleMessage(sock, message, appState) {
  try {
    await runAutoFeatures(sock, message);
    await enforceGroupSafety(sock, message);

    const settings = readJson('settings.json');
    const prefix = settings.prefix || config.prefix;
    const text = String(message.text || '');
    if (!text.startsWith(prefix)) return;

    const spam = checkSpam(message.sender);
    if (spam.blocked) return;

    const [rawName, ...args] = message.text.slice(prefix.length).trim().split(/\s+/);
    if (!rawName) return;
    const name = rawName.toLowerCase();
    const canonical = appState.aliases.get(name) || name;
    const command = appState.commands.get(canonical);
    if (!command) return;

    const denied = await assertAllowed(sock, message, command);
    if (denied) return message.reply(denied);

    const wait = checkCooldown(message.sender, command.name, Number(command.cooldown || 3));
    if (wait) return message.reply(status('warning', `Please wait ${wait}s before using this command again.`));

    const start = Date.now();
    try {
      // update owner activity when owner sends or uses commands
      if (message.fromMe || String(message.senderNumber) === String(config.ownerNumber)) {
        await activity.touch();
      }
    } catch (e) {}
    if (config.autoTyping) await sock.sendPresenceUpdate('composing', message.chat);

    const context = {
      sock,
      message,
      args,
      text: args.join(' '),
      config,
      prefix,
      commands: appState.commands,
      appState,
      db: { readJson, updateJson }
    };

    await command.run(context);
    appState.commandsUsed += 1;
    updateJson('settings.json', (db) => ({ ...db, commandsUsed: Number(db.commandsUsed || 0) + 1 }));
    logCommand({
      command: command.name,
      sender: message.sender,
      chat: message.chat,
      group: message.isGroup,
      executionMs: Date.now() - start
    });
  } catch (error) {
    logError('Command handler error', error);
    try {
      await message.reply(status('error', 'An error occurred. The bot recovered safely.'));
    } catch {}
  } finally {
    if (config.autoTyping) {
      try { await sock.sendPresenceUpdate('paused', message.chat); } catch {}
    }
  }
}

async function enforceGroupSafety(sock, message) {
  if (!message.isGroup || message.fromMe) return;
  const groups = readJson('groups.json');
  const settings = groups[message.chat] || {};
  const hasLink = /https?:\/\/|chat\.whatsapp\.com\//i.test(message.text || '');
  if (!hasLink || (!settings.antilink && !settings.antilinkhard)) return;

  await sock.sendMessage(message.chat, { delete: message.key }).catch(() => {});
  if (settings.antilinkhard) {
    await sock.groupParticipantsUpdate(message.chat, [message.sender], 'remove').catch(() => {});
  } else {
    await sock.sendMessage(message.chat, { text: status('warning', 'Links are not allowed in this group.') }, { quoted: message.raw }).catch(() => {});
  }
}

module.exports = { handleMessage };
