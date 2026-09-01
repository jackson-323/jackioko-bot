const detector = require('./detector');
const matcher = require('./matcher');
const generator = require('./generator');
const memory = require('./memory');
const context = require('./context');

async function reply(message, user = {}) {
  if (!message || typeof message !== 'string') {
    return null;
  }

  const clean = message.trim();

  const category = await detector.detect(clean);

  if (!category) {
    return null;
  }

  const match = await matcher.find(category, clean);

  if (!match) {
    return null;
  }

  const response = await generator.generate(category, match, user);

  if (!response) {
    return null;
  }

  try {
    await memory.save(user.id || user.jid || 'unknown', clean, response);
  } catch {}

  try {
    await context.update(user.id || user.jid || 'unknown', category);
  } catch {}

  return {
    source: 'brain',
    confidence: 100,
    category,
    text: response
  };
}

module.exports = {
  reply
};