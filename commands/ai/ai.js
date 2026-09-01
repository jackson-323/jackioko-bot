const ai = require('../../modules/assistant/ai');

module.exports = {
  name: 'ai',
  category: 'ai',
  description: 'Verify Ollama connectivity or send a prompt.',
  usage: 'ai test | ai prompt',
  cooldown: 3,
  run: async ({ message, args }) => {
    const command = (args[0] || '').toLowerCase();

    if (command === 'test') {
      const result = await ai.testConnection();
      if (!result.ok) {
        return await message.reply(result.error || '❌ Ollama test failed.');
      }
      return await message.reply(`✅ Ollama Connected\n\nModel: ${result.model}\n\n${result.response}`);
    }

    const prompt = args.join(' ').trim();
    if (!prompt) {
      return await message.reply('Usage: .ai test | .ai prompt');
    }

    const result = await ai.reply({}, {}, [], prompt);
    if (!result.ok) {
      return await message.reply(result.error || '❌ Ollama request failed.');
    }
    return await message.reply(result.text || 'No response.');
  }
};
