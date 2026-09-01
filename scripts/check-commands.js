const assert = require('assert');
const { loadCommands } = require('../lib/loader');
const assistant = require('../modules/assistant');

const loaded = loadCommands();
const commands = Array.from(loaded.commands.values());

assert.ok(loaded.commands.size > 0, 'No commands loaded');
for (const command of commands) {
  assert.ok(command.name, `Command missing name: ${command.file}`);
  assert.ok(command.description, `Command missing description: ${command.file}`);
  assert.ok(command.category, `Command missing category: ${command.file}`);
  assert.ok(typeof command.run === 'function', `Command missing run(): ${command.file}`);
}

assert.ok(typeof assistant.init === 'function', 'Assistant init() missing');
assert.ok(typeof assistant.observe === 'function', 'Assistant observe() missing');

console.log(`Validated ${commands.length} commands and assistant modules`);
