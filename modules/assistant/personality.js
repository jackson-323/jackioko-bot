const fs = require('fs-extra');
const path = require('path');

const DB = path.join(__dirname, '..', '..', 'database');
const FILE = path.join(DB, 'personality.json');

let cache = null;

function getBaseProfile() {
  return {
    ownerName: null,
    preferredLanguage: 'en',
    greetingStyle: 'friendly',
    emojiUsage: 0.5,
    sentenceLength: 14,
    humourLevel: 0.2,
    professionalTone: 0.5,
    slangLevel: 0.2,
    favouriteExpressions: [],
    commonGreetings: [],
    frequentlyUsedEmojis: [],
    replyLength: 'medium',
    conversationStyle: 'concise',
    punctuationHabits: { exclamation: 0, question: 0, periods: 0 },
    responseSpeedPreference: 'medium',
    writingTone: 'friendly',
    signOffs: [],
    commonJokes: []
  };
}

function hasSensitiveContent(text) {
  return /password|passcode|pin|otp|verification code|bank|account|card|ssn|address|phone number/i.test(text);
}

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

async function ensure() {
  await fs.ensureDir(DB);
  if (!await fs.pathExists(FILE)) {
    await fs.writeJson(FILE, getBaseProfile(), { spaces: 2 });
  }
  const persisted = await fs.readJson(FILE).catch(() => ({}));
  if (!persisted || typeof persisted !== 'object') {
    cache = {};
  } else {
    cache = { ...getBaseProfile(), ...persisted };
    cache.punctuationHabits = { ...getBaseProfile().punctuationHabits, ...(cache.punctuationHabits || {}) };
  }
  if (JSON.stringify(cache) !== JSON.stringify(persisted)) {
    await fs.writeJson(FILE, cache, { spaces: 2 }).catch(() => {});
  }
  return cache;
}

async function autosave() {
  if (!cache) return;
  await fs.writeJson(FILE, cache, { spaces: 2 }).catch((error) => {
    console.error('assistant personality autosave failed', error);
  });
}

async function getProfile() {
  if (!cache) await ensure();
  return cache;
}

async function learnFromMessage(message) {
  try {
    if (!cache) await ensure();
    const text = normalizeText(message?.text || message?.content || message || '');
    if (!text || hasSensitiveContent(text)) return cache;

    const words = text.split(/\s+/).filter(Boolean);
    if (words.length) {
      const avgLength = Math.round(words.reduce((sum, word) => sum + word.length, 0) / words.length);
      cache.sentenceLength = Math.round(((cache.sentenceLength || 14) + avgLength) / 2);
    }

    const punctuationHabits = cache.punctuationHabits || {};
    punctuationHabits.exclamation = (punctuationHabits.exclamation || 0) + (text.includes('!') ? 1 : 0);
    punctuationHabits.question = (punctuationHabits.question || 0) + (text.includes('?') ? 1 : 0);
    punctuationHabits.periods = (punctuationHabits.periods || 0) + (text.includes('.') ? 1 : 0);
    cache.punctuationHabits = punctuationHabits;

    const emojis = text.match(/([\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}])/gu) || [];
    if (emojis.length) {
      cache.frequentlyUsedEmojis = cache.frequentlyUsedEmojis || [];
      for (const emoji of emojis) {
        if (!cache.frequentlyUsedEmojis.includes(emoji)) cache.frequentlyUsedEmojis.push(emoji);
      }
      cache.emojiUsage = Math.min(1, (cache.emojiUsage || 0.5) + 0.05);
    }

    const greetings = text.match(/^(hi|hello|hey|morning|afternoon|evening|yo)\b/i);
    if (greetings) {
      const greeting = greetings[0].toLowerCase();
      cache.commonGreetings = cache.commonGreetings || [];
      if (!cache.commonGreetings.includes(greeting)) cache.commonGreetings.unshift(greeting);
      cache.commonGreetings = cache.commonGreetings.slice(0, 8);
    }

    if (/lol|haha|jk|lmao|hehe|omg|fr/i.test(text)) {
      cache.humourLevel = Math.min(1, (cache.humourLevel || 0.2) + 0.05);
    }

    if (/bro|yo|fr|tbh|ngl|pls|omg|vibes/i.test(text)) {
      cache.slangLevel = Math.min(1, (cache.slangLevel || 0.2) + 0.05);
    }

    if (text.length <= 20) {
      cache.responseSpeedPreference = 'fast';
    } else if (text.length >= 80) {
      cache.responseSpeedPreference = 'slow';
    } else {
      cache.responseSpeedPreference = 'medium';
    }

    if (text.includes('!')) {
      cache.writingTone = cache.writingTone === 'formal' ? 'formal' : 'energetic';
    } else if (/\b(please|thanks|thank you|sorry)\b/i.test(text)) {
      cache.writingTone = 'polite';
    } else {
      cache.writingTone = cache.writingTone || 'friendly';
    }

    if (text.includes('🙂') || text.includes('😊') || text.includes('😂')) {
      cache.greetingStyle = 'warm';
    }

    await autosave();
    return cache;
  } catch (error) {
    console.error('assistant personality learning failed', error);
    return cache;
  }
}

async function learnFromOutgoing(msg) {
  return learnFromMessage(msg);
}

async function train(text) {
  if (!cache) await ensure();
  const normalized = normalizeText(text);
  if (!normalized) return cache;
  if (hasSensitiveContent(normalized)) return cache;

  cache.favouriteExpressions = cache.favouriteExpressions || [];
  if (!cache.favouriteExpressions.includes(normalized)) {
    cache.favouriteExpressions.unshift(normalized);
    cache.favouriteExpressions = cache.favouriteExpressions.slice(0, 12);
  }

  const greetings = normalized.match(/^(hi|hello|hey|morning|afternoon|evening|yo)\b/i);
  if (greetings && !cache.commonGreetings.includes(greetings[0].toLowerCase())) {
    cache.commonGreetings.unshift(greetings[0].toLowerCase());
    cache.commonGreetings = cache.commonGreetings.slice(0, 8);
  }

  await autosave();
  return cache;
}

module.exports = {
  ensure,
  getProfile,
  autosave,
  learnFromMessage,
  learnFromOutgoing,
  train
};
