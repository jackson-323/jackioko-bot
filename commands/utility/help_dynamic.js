/**
 * HELP COMMAND - Dynamic command help system
 * Shows detailed information about any command
 */

const CommandScanner = require('../../lib/commandScanner');
const ui = require('../../lib/ui');
const memory = require('../../modules/memory');

module.exports = {
  name: 'help',
  aliases: ['h', 'info', 'cmd'],
  category: 'utility',
  description: 'Show help for commands',
  usage: 'help [command_name]',
  run: async ({ message, args, commands, config, prefix, appState }) => {
    try {
      // If no command specified, show general help
      if (!args || args.length === 0) {
        return await message.reply(
          ui.status('info', 
            `${prefix}help <command> - Get help for a specific command\n\n` +
            `Examples:\n` +
            `${prefix}help ping\n` +
            `${prefix}help memory\n` +
            `${prefix}help search\n\n` +
            `Use ${prefix}menu to see all commands`
          )
        );
      }

      const commandName = args[0].toLowerCase();
      
      // Scan commands
      const scanner = new CommandScanner(config);
      await scanner.scan(commands);
      
      const cmd = scanner.getCommand(commandName);
      
      if (!cmd) {
        // Try to find similar commands
        const searchResults = scanner.search(commandName);
        if (searchResults.length > 0) {
          let response = ui.status('warning', `Command "${commandName}" not found. Similar commands:\n\n`);
          for (const result of searchResults.slice(0, 5)) {
            response += `${prefix}${result.name} - ${result.description}\n`;
          }
          return await message.reply(response);
        }
        return await message.reply(ui.status('error', `Command "${commandName}" not found`));
      }

      // Build detailed help
      const lines = [
        `🧩 *${config.botName} COMMAND HELP*`,
        '┃━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        `📋 Command: ${prefix}${cmd.name}`,
        `📂 Category: ${cmd.category}`,
        `📝 Description: ${cmd.description}`,
        `⌨️  Usage: ${prefix}${cmd.usage || cmd.name}`,
        `⏱️  Cooldown: ${cmd.cooldown}s`
      ];

      // Add aliases if available
      if (cmd.aliases && cmd.aliases.length > 0) {
        lines.push(`🔗 Aliases: ${cmd.aliases.map(a => prefix + a).join(', ')}`);
      }

      // Add permissions
      const perms = [];
      if (cmd.owner) perms.push('Owner only');
      if (cmd.admin) perms.push('Admin only');
      if (cmd.group) perms.push('Groups only');
      if (cmd.botAdmin) perms.push('Bot Admin required');
      if (cmd.private) perms.push('Private chat only');
      
      if (perms.length > 0) {
        lines.push(`🔐 Permissions: ${perms.join(', ')}`);
      } else {
        lines.push(`🔓 Permissions: Public`);
      }

      // Special help for memory commands
      if (cmd.name === 'memory') {
        lines.push('');
        lines.push('📚 *Memory System Subcommands:*');
        lines.push('  memory status - System status');
        lines.push('  memory profile <phone> - View user');
        lines.push('  memory search <query> - Search messages');
        lines.push('  memory stats - View statistics');
        lines.push('  memory backup - Trigger backup');
        lines.push('  memory help - Full help');
      }

      const helpText = ui.box(lines);
      await message.reply(helpText);

      // If this is memory system related, show additional info
      if (cmd.category.toLowerCase().includes('memory')) {
        if (memory.initialized) {
          const storageInfo = await memory.backup.getStorageInfo();
          let memoryInfo = `\n🧠 *Memory System Status:*\n`;
          memoryInfo += `  • Status: ${memory.enabled ? '✅ Enabled' : '⏸️  Disabled'}\n`;
          memoryInfo += `  • Storage: ${storageInfo?.sizeGB || 0} GB\n`;
          memoryInfo += `  • Users tracked: ${await memory.storage._countUsers()}\n`;
          memoryInfo += `  • Messages stored: ${await memory.storage._countMessages()}\n`;
          await message.reply(memoryInfo);
        }
      }

    } catch (error) {
      await message.reply(ui.status('error', `Error: ${error.message}`));
    }
    }
  }
};
