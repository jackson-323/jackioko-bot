const path = require('path');
const fs = require('fs-extra');
const config = require('../config');

const defaults = {
  'users.json': {},
  'groups.json': {},
  'settings.json': {
    prefix: config.prefix,
    mode: config.mode,
    autoRead: config.autoRead,
    autoReact: config.autoReact,
    autoTyping: config.autoTyping,
    autoRecording: config.autoRecording,
    autoViewStatus: config.autoViewStatus,
    autoLikeStatus: config.autoLikeStatus,
    autoBackup: true,
    commandsUsed: 0
  }
};

function filePath(file) {
  return path.join(config.databaseDir, file);
}

async function ensureDatabase() {
  await fs.ensureDir(config.databaseDir);
  await fs.ensureDir(config.logsDir);
  await fs.ensureDir(config.mediaDir);
  await fs.ensureDir(config.authDir);
  for (const [file, value] of Object.entries(defaults)) {
    const target = filePath(file);
    if (!await fs.pathExists(target)) {
      await fs.writeJson(target, value, { spaces: 2 });
    }
  }
}

function readJson(file) {
  const target = filePath(file);
  fs.ensureFileSync(target);
  try {
    const data = fs.readJsonSync(target, { throws: false });
    return data && typeof data === 'object' ? data : structuredClone(defaults[file] || {});
  } catch {
    return structuredClone(defaults[file] || {});
  }
}

function writeJson(file, data) {
  fs.ensureDirSync(config.databaseDir);
  fs.writeJsonSync(filePath(file), data, { spaces: 2 });
}

function updateJson(file, updater) {
  const current = readJson(file);
  const next = updater(current) || current;
  writeJson(file, next);
  return next;
}

module.exports = { ensureDatabase, readJson, writeJson, updateJson, filePath };
