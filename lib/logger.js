const path = require('path');
const fs = require('fs-extra');
const config = require('../config');
const { BRAND } = require('./ui');

function line(level, message, meta) {
  const timestamp = new Date().toISOString();
  const text = `[${timestamp}] [${level}] [${BRAND}] ${message}${meta ? ` ${JSON.stringify(meta)}` : ''}`;
  console[level === 'ERROR' ? 'error' : 'log'](text);
  fs.ensureDirSync(config.logsDir);
  fs.appendFileSync(path.join(config.logsDir, 'bot.log'), `${text}\n`);
}

function logInfo(message, meta) {
  line('INFO', message, meta);
}

function logError(message, error) {
  const meta = error ? {
    name: error.name,
    message: error.message || String(error),
    stack: error.stack
  } : undefined;
  line('ERROR', message, meta);
}

function logCommand({ command, sender, chat, group, executionMs }) {
  line('INFO', 'Command used', { command, sender, chat, group, executionMs });
}

module.exports = { logInfo, logError, logCommand };
