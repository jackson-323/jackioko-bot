const path = require('path');
const fs = require('fs-extra');
const config = require('../config');
const { logError, logInfo } = require('./logger');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(target);
    return entry.isFile() && entry.name.endsWith('.js') ? [target] : [];
  });
}

function normalize(command, file) {
  if (!command || typeof command !== 'object') throw new Error(`Invalid export in ${file}`);
  if (!command.name || typeof command.run !== 'function') throw new Error(`Command ${file} must export name and run()`);
  return {
    aliases: [],
    category: 'utility',
    description: 'No description provided.',
    usage: '',
    cooldown: 3,
    owner: false,
    group: false,
    private: false,
    admin: false,
    botAdmin: false,
    ...command,
    name: String(command.name).toLowerCase(),
    file
  };
}

function loadCommands() {
  const commands = new Map();
  const aliases = new Map();
  for (const file of walk(config.commandDir)) {
    try {
      delete require.cache[require.resolve(file)];
      const exported = require(file);
      const modules = Array.isArray(exported) ? exported : [exported];
      for (const item of modules) {
        const command = normalize(item, file);
        const key = command.name.toLowerCase();
        if (commands.has(key)) {
          logInfo(`Skipping duplicate command ${key} from ${file}`);
          continue;
        }
        let duplicateAlias = false;
        for (const alias of command.aliases || []) {
          const aliasKey = String(alias).toLowerCase();
          if (aliases.has(aliasKey) || aliasKey === key) {
            duplicateAlias = true;
            break;
          }
        }
        if (duplicateAlias) {
          logInfo(`Skipping duplicate alias for ${key} from ${file}`);
          continue;
        }
        commands.set(key, command);
        for (const alias of command.aliases || []) aliases.set(String(alias).toLowerCase(), command.name);
      }
    } catch (error) {
      logError(`Failed to load command ${file}`, error);
    }
  }
  logInfo(`Loaded ${commands.size} commands`);
  return { commands, aliases };
}

function watchCommands(onReload) {
  if (!fs.existsSync(config.commandDir)) return;
  let timer;
  try {
    fs.watch(config.commandDir, { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => onReload(loadCommands()), 500);
    });
  } catch {
    fs.watch(config.commandDir, () => {
      clearTimeout(timer);
      timer = setTimeout(() => onReload(loadCommands()), 500);
    });
  }
}

module.exports = { loadCommands, watchCommands };
