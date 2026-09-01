require('dotenv').config();

const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');

const DB = path.join(__dirname, '..', '..', 'database');
const FILE = path.join(DB, 'assistant.json');
const DEFAULT_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'qwen2.5:3b';
const TIMEOUT_MS = 120000;
const MAX_RETRIES = 1;

const IDENTITY = {
  name: 'JACKIOKO AI',
  developer: 'JACKIOKO TEC',
  description: 'A personal AI assistant that represents its owner while they are away. It learns communication style, remembers previous conversations and responds naturally.'
};

let httpClient = null;

function getHttpClient() {
  if (!httpClient) {
    httpClient = axios.create({
      baseURL: DEFAULT_BASE_URL,
      timeout: TIMEOUT_MS,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  return httpClient;
}

function getModel() {
  return DEFAULT_MODEL;
}

function getBaseUrl() {
  return DEFAULT_BASE_URL;
}

function getIdentity() {
  return { ...IDENTITY };
}

function getSystemIdentityPrompt() {
  const identity = getIdentity();
  return [
    `You are ${identity.name}.`,
    `Developer: ${identity.developer}.`,
    `Description: ${identity.description}`,
    'Speak as JACKIOKO AI and represent the owner naturally while remaining safe and helpful.',
    'Never present yourself as Qwen, Alibaba, Gemini, Google AI, or OpenAI unless the user explicitly asks about the underlying model.',
    'If the user asks for money, passwords, verification codes, legal agreements, medical advice, or other sensitive actions, politely defer and avoid making promises.'
  ].join(' ');
}

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function buildLocalReply({ incomingMessage, contact, profile, awayMode }) {
  const text = normalizeText(incomingMessage || '');
  const greetingSeed = (profile?.commonGreetings || [])[0] || 'hey';
  const relationship = contact?.relationship || 'Unknown';
  const shortReply = awayMode
    ? [
        "I'm currently away but I'll get back to you.",
        "Not around right now 😊",
        "I'm away at the moment, but I’ll reply soon."
      ][Math.floor(Math.random() * 3)]
    : "I'm here and ready to help.";

  if (!text) return shortReply;
  if (text.length < 12) return shortReply;
  const tail = relationShip => {
    if (!relationShip || relationShip === 'Unknown') return 'I’ll get back soon.';
    if (relationShip === 'Family') return 'I’ll get back to you soon.';
    if (relationShip === 'Customer') return 'I’ll follow up shortly.';
    return 'I’ll reply soon.';
  };
  const base = `${greetingSeed.charAt(0).toUpperCase() + greetingSeed.slice(1)}! ${shortReply}`;
  return `${base} ${tail(relationship)}`;
}

async function ensure() {
  await fs.ensureDir(DB);
  if (!await fs.pathExists(FILE)) {
    await fs.writeJson(FILE, { enabled: true, awayMode: true, timeout: 15, learning: true, trustedOnly: true, notifyOwner: true }, { spaces: 2 });
  }
}

async function getState() {
  await ensure();
  return await fs.readJson(FILE).catch(() => ({ enabled: true, awayMode: true, timeout: 15, learning: true, trustedOnly: true, notifyOwner: true }));
}

async function saveState(state) {
  await ensure();
  await fs.writeJson(FILE, state, { spaces: 2 }).catch(() => {});
}

async function requestJson(endpoint, payload, options = {}) {
  const client = getHttpClient();
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await client.post(endpoint, payload, { timeout: TIMEOUT_MS, ...options });
      return { ok: true, data: response.data };
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_RETRIES) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }

  const status = lastError?.response?.status;
  const message = lastError?.response?.data?.error || lastError?.message || 'Unknown Ollama error.';
  const normalizedMessage = /timeout|aborted|socket hang up|ECONNREFUSED|ENOTFOUND|ECONNRESET/i.test(message) ? 'Ollama server offline' : message;
  return {
    ok: false,
    error: normalizedMessage,
    status,
    details: lastError?.response?.data || null
  };
}

async function health() {
  try {
    const response = await getHttpClient().get('/api/tags');
    return { ok: true, data: response.data };
  } catch (error) {
    return {
      ok: false,
      error: error?.response?.data?.error || error?.message || 'Ollama server offline',
      status: error?.response?.status || null
    };
  }
}

async function initialize() {
  await ensure();
  return health();
}

async function chat(messages) {
  const model = getModel();
  const result = await requestJson('/api/chat', {
    model,
    messages,
    stream: false
  });

  if (!result.ok) {
    const errorMessage = result.error || 'Unknown Ollama error.';
    if (/model/i.test(errorMessage) && /not found|missing|pull/i.test(errorMessage)) {
      return { ok: false, error: 'Run: ollama pull qwen2.5:3b', code: 'MODEL_MISSING' };
    }
    if (/Ollama server offline/i.test(errorMessage)) {
      return { ok: false, error: 'Ollama server offline', code: 'SERVER_OFFLINE' };
    }
    return { ok: false, error: errorMessage, code: 'CHAT_FAILED' };
  }

  const text = result.data?.message?.content || '';
  return { ok: true, text, model };
}

function buildPrompt({ personality = {}, contact = {}, recentConversation = [], incomingMessage = '', awayMode = true }) {
  const identity = getIdentity();
  const recent = (recentConversation || []).slice(-4).map((item) => `${item.role || 'user'}: ${item.content || item.text || ''}`).join('\n');
  const contactName = contact?.name || contact?.nickname || contact?.jid || 'this contact';
  const relationship = contact?.relationship || 'Unknown';
  return [
    getSystemIdentityPrompt(),
    `Personality profile: ${JSON.stringify(personality || {})}`,
    `Contact memory: ${JSON.stringify(contact || {})}`,
    `Recent conversation:\n${recent || 'No recent conversation.'}`,
    `Current message: ${incomingMessage}`,
    `Away mode state: ${awayMode ? 'enabled' : 'disabled'}`,
    `Contact type: ${contact?.contactType || relationship}`,
    'Reply naturally as JACKIOKO AI, using the learned personality and memory. Keep replies concise, warm, and safe. Avoid inventing facts. If the user asks for sensitive commitments, politely defer.'
  ].join('\n');
}

async function generateReply({ message, contact, profile, recentMessages = [], memorySnapshot = {}, awayMode = true }) {
  const incomingMessage = normalizeText(message?.text || message?.content || message || '');
  const prompt = buildPrompt({
    personality: profile || {},
    contact: { ...memorySnapshot, ...contact },
    recentConversation: recentMessages,
    incomingMessage,
    awayMode
  });

  const result = await chat([
    { role: 'system', content: prompt },
    { role: 'user', content: incomingMessage }
  ]);

  if (!result.ok) {
    return { ok: true, text: buildLocalReply({ incomingMessage, contact: { ...memorySnapshot, ...contact }, profile, awayMode }), model: getModel(), fallback: true };
  }

  const text = normalizeText(result.text || '').replace(/^\s*(assistant|jackioko ai)\s*[:>-]?\s*/i, '');
  return { ok: true, text, model: result.model || getModel(), fallback: false };
}

async function reply(personality, memory, history, incomingMessage) {
  const prompt = buildPrompt({
    personality: personality || {},
    contact: memory || {},
    recentConversation: history || [],
    incomingMessage: normalizeText(incomingMessage || ''),
    awayMode: true
  });
  const result = await chat([
    { role: 'system', content: prompt },
    { role: 'user', content: normalizeText(incomingMessage || '') }
  ]);
  if (!result.ok) {
    return { ok: true, text: buildLocalReply({ incomingMessage, contact: memory || {}, profile: personality || {}, awayMode: true }), model: getModel(), fallback: true };
  }
  return { ok: true, text: normalizeText(result.text || ''), model: result.model || getModel(), fallback: false };
}

async function summarize(messages) {
  const result = await chat([{ role: 'user', content: `Summarize the following conversation as JACKIOKO AI:\n${messages.map((m) => `${m.role}: ${m.content}`).join('\n')}` }]);
  return result;
}

async function classify(message) {
  const result = await chat([{ role: 'user', content: `Classify this message as one of: normal, sensitive, greeting, request. Respond with only the category.\n${message}` }]);
  return result.ok ? { ok: true, category: String(result.text || '').trim().toLowerCase() } : result;
}

async function testConnection(prompt = 'Hello from JACKIOKO TEC') {
  const model = getModel();
  const healthCheck = await health();
  if (!healthCheck.ok) {
    return { ok: false, error: 'Ollama server offline', code: 'SERVER_OFFLINE' };
  }

  const result = await chat([{ role: 'user', content: prompt }]);
  if (!result.ok) {
    return { ok: false, error: result.error || 'Unable to reach Ollama.', code: result.code || 'CHAT_FAILED' };
  }

  return { ok: true, model, response: result.text };
}

module.exports = {
  initialize,
  chat,
  reply,
  summarize,
  classify,
  health,
  testConnection,
  getBaseUrl,
  getModel,
  ensure,
  getState,
  saveState,
  getIdentity,
  buildPrompt,
  generateReply
};
