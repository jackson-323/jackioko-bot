const activity = require('../modules/assistant/activity');
const trusted = require('../modules/assistant/trusted');
const memory = require('../modules/assistant/memory');
const personality = require('../modules/assistant/personality');
const ai = require('../modules/assistant/ai');

module.exports = [
 {
    name: 'away',
    aliases: ['afk'],
    category: 'assistant',
    description: 'Enable JACKIOKO AI away mode.',
    usage: 'away',
    cooldown: 3,
    run: async ({ message }) => {

        await activity.setAssistantSettings({
            enabled: true,
            awayMode: true
        });

        // Set last activity far enough in the past so away mode activates immediately
        await activity.touch();

        return await message.reply(
            "✅ JACKIOKO AI Away Mode Activated.\n\nAssistant will now reply immediately."
        );

    }
},

{
    name: 'back',
    aliases: ['resume'],
    category: 'assistant',
    description: 'Disable JACKIOKO AI away mode.',
    usage: 'back',
    cooldown: 3,
    run: async ({ message }) => {

        await activity.setAssistantSettings({
            enabled: false,
            awayMode: false
        });

        await activity.touch();

        return await message.reply(
            "✅ Away Mode Disabled.\nI'm back."
        );

    }
},
  {
    name: 'status',
    aliases: ['assistantstatus'],
    category: 'assistant',
    description: 'Show assistant status and activity state.',
    usage: 'status',
    cooldown: 3,
    run: async ({ message }) => {
      const s = await activity.getAssistantSettings();
      const last = await activity.getLast();
      return await message.reply(`Assistant: ${s.enabled ? 'enabled' : 'disabled'}\nLast active: ${new Date(last).toISOString()}\nTimeout: ${s.timeout} minutes\nTrustedOnly: ${s.trustedOnly}`);
    }
  },
  {
    name: 'ai',
    aliases: ['assistantai'],
    category: 'assistant',
    description: 'Manage assistant trust and AI settings.',
    usage: 'ai on|off|timeout <minutes>|trust <jid>|untrust <jid>|trusted',
    cooldown: 3,
    run: async ({ message, args }) => {
      const cmd = (args[0] || '').toLowerCase();
      if (cmd === 'test') {
        const result = await ai.testConnection();
        if (!result.ok) {
          return await message.reply(`❌ ${result.error}\n\n${result.code || ''}`);
        }
        return await message.reply(`✅ JACKIOKO AI CONNECTED\n\nModel: ${result.model}\n\n${result.response}`);
      }
      if (cmd === 'on') { await activity.setAssistantSettings({ enabled: true }); return await message.reply('AI enabled'); }
      if (cmd === 'off') { await activity.setAssistantSettings({ enabled: false }); return await message.reply('AI disabled'); }
      if (cmd === 'timeout' && args[1]) { await activity.setAssistantSettings({ timeout: parseInt(args[1]) }); return await message.reply('Timeout updated'); }
      if (cmd === 'trust' && args[1]) { await trusted.add(args[1]); return await message.reply('Trusted contact added'); }
      if (cmd === 'untrust' && args[1]) { await trusted.remove(args[1]); return await message.reply('Trusted contact removed'); }
      if (cmd === 'trusted') { const list = await trusted.list(); return await message.reply(JSON.stringify(list, null, 2)); }
      return await message.reply('Usage: .ai test | .ai on|off|timeout <minutes>|trust <jid>|untrust <jid>|trusted');
    }
  },
  {
    name: 'memory',
    aliases: ['mem'],
    category: 'assistant',
    description: 'View the stored memory for the current chat or a specific JID.',
    usage: 'memory [jid]',
    cooldown: 3,
    run: async ({ message, args }) => {
      const jid = args[0] || message.sender || message.chat;
      const entry = await memory.getContact(jid);
      return await message.reply(JSON.stringify(entry, null, 2));
    }
  },
  {
    name: 'personality',
    aliases: ['profile'],
    category: 'assistant',
    description: 'View the learned assistant personality profile.',
    usage: 'personality',
    cooldown: 3,
    run: async ({ message }) => {
      const profile = await personality.getProfile();
      return await message.reply(JSON.stringify(profile, null, 2));
    }
  },
  {
    name: 'train',
    aliases: ['teach'],
    category: 'assistant',
    description: 'Teach the assistant a new phrase or style pattern.',
    usage: 'train text',
    cooldown: 3,
    run: async ({ message, args }) => {
      const trainingText = args.join(' ').trim();
      if (!trainingText) return await message.reply('Send text after the command to train the assistant.');
      await personality.train(trainingText);
      return await message.reply('Training update stored.');
    }
  }
];
