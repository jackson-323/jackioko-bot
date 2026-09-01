const fs = require('fs-extra');
const path = require('path');

const DB = path.join(__dirname, '..', '..', 'database');
const FILE = path.join(DB, 'memory.json');

let cache = {};
let saveTimer = null;

function createDefaultContact(jid) {
  return {
    jid,
    name: null,
    nickname: null,
    relationship: 'Unknown',
    lastConversation: null,
    importantFacts: [],
    birthday: null,
    location: null,
    likes: [],
    dislikes: [],
    ongoingTopics: [],
    lastInteractionTime: null,
    conversationSummary: '',
    conversationHistory: [],
    contactType: 'Unknown'
  };
}

function inferContactType(relationship, name, nickname) {
  const haystack = `${relationship || ''} ${name || ''} ${nickname || ''}`.toLowerCase();
  if (/family|mom|dad|sister|brother|wife|husband|mother|father|son|daughter|cousin|grand/i.test(haystack)) return 'Family';
  if (/friend|buddy|bestie|mate|bro|sis|homie/i.test(haystack)) return 'Friend';
  if (/customer|client|business|seller|buyer|support|shop|order|service/i.test(haystack)) return 'Customer';
  return 'Unknown';
}

function normalizeContact(contactInfo = {}) {
  const normalized = {};
  if (contactInfo.name) normalized.name = String(contactInfo.name);
  if (contactInfo.nickname) normalized.nickname = String(contactInfo.nickname);
  if (contactInfo.relationship) normalized.relationship = String(contactInfo.relationship);
  if (contactInfo.birthday) normalized.birthday = String(contactInfo.birthday);
  if (contactInfo.location) normalized.location = String(contactInfo.location);
  if (contactInfo.like) normalized.likes = [String(contactInfo.like)];
  if (contactInfo.dislike) normalized.dislikes = [String(contactInfo.dislike)];
  if (contactInfo.topic) normalized.ongoingTopics = [String(contactInfo.topic)];
  if (contactInfo.fact) normalized.importantFacts = [String(contactInfo.fact)];
  if (contactInfo.lastConversation || contactInfo.message) normalized.lastConversation = String(contactInfo.lastConversation || contactInfo.message || '');
  if (contactInfo.summary) normalized.conversationSummary = String(contactInfo.summary);
  if (contactInfo.conversation) normalized.conversationHistory = Array.isArray(contactInfo.conversation) ? contactInfo.conversation : [String(contactInfo.conversation)];
  if (contactInfo.lastInteractionTime) normalized.lastInteractionTime = contactInfo.lastInteractionTime;
  return normalized;
}

function mergeContact(existing, update) {
  const next = { ...existing, ...update };
  next.importantFacts = Array.from(new Set([...(existing.importantFacts || []), ...(update.importantFacts || [])]));
  next.likes = Array.from(new Set([...(existing.likes || []), ...(update.likes || [])]));
  next.dislikes = Array.from(new Set([...(existing.dislikes || []), ...(update.dislikes || [])]));
  next.ongoingTopics = Array.from(new Set([...(existing.ongoingTopics || []), ...(update.ongoingTopics || [])]));
  next.conversationHistory = [...(existing.conversationHistory || []), ...(update.conversationHistory || [])].slice(-20);
  next.contactType = update.contactType || existing.contactType || inferContactType(next.relationship, next.name, next.nickname);
  if (!next.relationship || next.relationship === 'contact') next.relationship = 'Unknown';
  return next;
}

async function ensure() {
  await fs.ensureDir(DB);
  if (!await fs.pathExists(FILE)) {
    await fs.writeJson(FILE, {}, { spaces: 2 });
  }
  const diskCache = await fs.readJson(FILE).catch(() => ({}));
  cache = { ...(diskCache || {}), ...(cache || {}) };
  return cache;
}

async function autosave() {
  if (!cache) return;
  try {
    await fs.writeJson(FILE, cache, { spaces: 2 });
  } catch (error) {
    console.error('assistant memory autosave failed', error);
  }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    autosave().catch(() => {});
  }, 400);
}

async function getContact(jid) {
  await ensure();
  const entry = cache[jid] || createDefaultContact(jid);
  return { ...entry };
}

async function remember(contactInfo = {}) {
  await ensure();
  const jid = contactInfo.jid || contactInfo.id || null;
  if (!jid) return null;
  const current = cache[jid] || createDefaultContact(jid);
  const update = normalizeContact(contactInfo);
  const merged = mergeContact(current, {
    ...update,
    contactType: update.contactType || inferContactType(update.relationship || current.relationship, update.name || current.name, update.nickname || current.nickname)
  });
  merged.lastInteractionTime = contactInfo.lastInteractionTime || Date.now();
  merged.lastConversation = contactInfo.lastConversation || update.lastConversation || current.lastConversation || null;
  if (!merged.conversationSummary) merged.conversationSummary = merged.lastConversation || '';
  cache[jid] = merged;
  scheduleSave();
  return merged;
}

async function recall(jid) {
  return await getContact(jid);
}

async function summarize(jid) {
  const entry = await getContact(jid);
  const summaryText = [
    entry.conversationSummary,
    entry.importantFacts?.join(', '),
    entry.ongoingTopics?.join(', ')
  ].filter(Boolean).join(' | ');
  return summaryText || `Memory for ${jid}`;
}

async function forget(jid) {
  await ensure();
  if (cache[jid]) delete cache[jid];
  scheduleSave();
  return true;
}

async function searchMemory(term) {
  await ensure();
  const query = String(term || '').toLowerCase();
  if (!query) return [];
  return Object.values(cache).filter((entry) => {
    const haystack = [
      entry.name,
      entry.nickname,
      entry.relationship,
      entry.lastConversation,
      entry.conversationSummary,
      entry.importantFacts || [],
      entry.likes || [],
      entry.dislikes || [],
      entry.ongoingTopics || []
    ].flat().join(' ').toLowerCase();
    return haystack.includes(query);
  });
}

async function updateConversation(jid, incoming, reply, extra = {}) {
  await ensure();
  const existing = cache[jid] || createDefaultContact(jid);
  const historyEntry = {
    at: Date.now(),
    incoming: String(incoming || ''),
    reply: String(reply || '')
  };
  const merged = mergeContact(existing, {
    lastConversation: String(incoming || ''),
    conversationHistory: [historyEntry],
    importantFacts: extra.fact ? [String(extra.fact)] : [],
    likes: extra.like ? [String(extra.like)] : [],
    dislikes: extra.dislike ? [String(extra.dislike)] : [],
    ongoingTopics: extra.topic ? [String(extra.topic)] : [],
    contactType: extra.contactType || inferContactType(extra.relationship || existing.relationship, extra.name || existing.name, extra.nickname || existing.nickname)
  });
  if (extra.contact) merged.name = String(extra.contact);
  if (extra.nickname) merged.nickname = String(extra.nickname);
  if (extra.relationship) merged.relationship = String(extra.relationship);
  if (extra.summary) merged.conversationSummary = String(extra.summary);
  merged.lastInteractionTime = Date.now();
  cache[jid] = merged;
  scheduleSave();
  return merged;
}

module.exports = {
  ensure,
  autosave,
  getContact,
  remember,
  recall,
  summarize,
  forget,
  searchMemory,
  updateConversation
};
