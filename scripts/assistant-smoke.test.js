const assert = require('node:assert/strict');
const fs = require('fs-extra');
const path = require('path');
const personality = require('../modules/assistant/personality');
const memory = require('../modules/assistant/memory');
const ai = require('../modules/assistant/ai');

(async () => {
  const dbDir = path.join(__dirname, '..', 'database');
  await fs.remove(path.join(dbDir, 'personality.json'));
  await fs.remove(path.join(dbDir, 'memory.json'));

  await personality.ensure();
  await memory.ensure();

  await personality.learnFromOutgoing({ text: 'Hey! I am heading out 😊' });
  const profile = await personality.getProfile();
  assert.ok(Array.isArray(profile.commonGreetings));
  assert.ok(profile.commonGreetings.some((item) => item.includes('hey')));

  await memory.remember({ jid: '123@s.whatsapp.net', name: 'Mina', relationship: 'Friend' });
  const contact = await memory.recall('123@s.whatsapp.net');
  assert.equal(contact.name, 'Mina');
  assert.equal(contact.relationship, 'Friend');

  const summary = await memory.summarize('123@s.whatsapp.net');
  assert.ok(typeof summary === 'string' && summary.length > 0);

  const prompt = await ai.buildPrompt({
    personality: profile,
    contact: contact,
    recentConversation: [{ role: 'user', content: 'Hello' }],
    incomingMessage: 'Hi there',
    awayMode: true
  });

  assert.ok(prompt.includes('JACKIOKO AI'));
  console.log('assistant smoke test passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
