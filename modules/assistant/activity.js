const fs = require('fs-extra');
const path = require('path');

const DB = path.join(__dirname, '..', '..', 'database');
const FILE = path.join(DB, 'settings.json');
const config = require('../../config');

async function ensure(){
  await fs.ensureDir(DB);
  if (!await fs.pathExists(FILE)) {
    await fs.writeJson(FILE, { ownerId: config.ownerNumber || null, lastOwnerActivity: 0, assistant: { enabled: true, timeout: 15, trustedOnly: true } }, { spaces: 2 });
  }
}

async function touch(){
  const s = await fs.readJson(FILE);
  s.lastOwnerActivity = Date.now();
  await fs.writeJson(FILE, s, { spaces: 2 });
}

async function setOwner(ownerId){
  const s = await fs.readJson(FILE);
  s.ownerId = ownerId;
  await fs.writeJson(FILE, s, { spaces: 2 });
}

async function getOwnerId(){
  const s = await fs.readJson(FILE);
  return s.ownerId;
}

async function getLast(){
  const s = await fs.readJson(FILE);
  return s.lastOwnerActivity || 0;
}

async function getAssistantSettings(){
  const s = await fs.readJson(FILE);
  return s.assistant || { enabled: true, timeout: 15, trustedOnly: true };
}

async function setAssistantSettings(upd){
  const s = await fs.readJson(FILE);
  s.assistant = Object.assign(s.assistant || {}, upd);
  await fs.writeJson(FILE, s, { spaces: 2 });
}

async function isOwnerAway(timeoutMinutes){
  const last = await getLast();
  const now = Date.now();
  const timeoutMs = (parseInt(timeoutMinutes) || 15) * 60 * 1000;
  return (now - last) >= timeoutMs;
}

module.exports = { ensure, touch, setOwner, getOwnerId, getLast, getAssistantSettings, setAssistantSettings, isOwnerAway };
