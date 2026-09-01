/**
 * DYNAMIC MENU SYSTEM - Automatically scans and displays all registered commands
 * This menu updates automatically when new commands are added to the project.
 */

const CommandScanner = require('../lib/commandScanner');
const memory = require('../modules/memory');

module.exports = {
  name: 'menu',
  aliases: ['help', 'commands', 'menu'],
  category: 'utility',
  description: 'Display bot commands organized by category',
  run: async ({ message, args, commands, config, prefix, appState, sock }) => {
    try {
      // Scan commands dynamically
      const scanner = new CommandScanner(config);
      await scanner.scan(commands);
      
      const byCategory = scanner.getByCategory();
      const stats = scanner.getStats();

      // Get user info
      const user = message.senderNumber || (message.sender || '').split('@')[0] || 'User';
      const owner = config.ownerName || 'JACKIOKO TEC';
      const mode = config.mode || 'public';
      const runtimeSec = Math.floor(process.uptime());
      const runtime = new Date(runtimeSec * 1000).toISOString().substr(11, 8);
      const usedMemory = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + ' MB';
      const connectionStatus = (appState && appState.status === 'connected') ? '🟢' : '🔴';
      const botStatus = (appState && appState.status) || 'disconnected';

      // Memory system status
      const memoryStatus = memory.initialized ? (memory.enabled ? '✅' : '⏸️') : '❌';
      const totalUsers = memory.initialized ? await memory.storage._countUsers() : 0;
      const totalMessages = memory.initialized ? await memory.storage._countMessages() : 0;

      // Header with system info
      let body = '';
      body += '╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮\n';
      body += '┃  🤖 JACKIOKO TEC BOT\n';
      body += '┃  Smart • Secure • Intelligent\n';
      body += '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n';

      // System Status
      body += '📊 *SYSTEM STATUS*\n';
      body += `┃ ${connectionStatus} Connection: ${botStatus}\n`;
      body += `┃ 👤 User: ${user}\n`;
      body += `┃ 👑 Owner: ${owner}\n`;
      body += `┃ 📦 Commands: ${commands.size}\n`;
      body += `┃ 📂 Categories: ${Object.keys(byCategory).length}\n`;
      body += `┃ ⚡ Mode: ${mode}\n`;
      body += `┃ 🔣 Prefix: ${prefix}\n`;
      body += `┃ 🚀 Version: ${config.version}\n`;
      body += `┃ ⏱️  Runtime: ${runtime}\n`;
      body += `┃ 💾 RAM: ${usedMemory}\n`;
      body += `┃ 🧠 Memory: ${memoryStatus} (${totalUsers} users, ${totalMessages} messages)\n`;
      body += '\n';

      // Check if user wants specific category
      let selection = null;
      if (args && args[0] && /^\d+$/.test(args[0])) {
        selection = parseInt(args[0], 10);
      } else {
        const trimmed = (message.text || '').trim();
        if (message.quoted && /^\d+$/.test(trimmed)) {
          selection = parseInt(trimmed, 10);
        }
      }

      // Sort categories by name
      const sortedCategories = Object.keys(byCategory).sort();

      // Build sections
      const sections = [];
      for (let i = 0; i < sortedCategories.length; i++) {
        const category = sortedCategories[i];
        const categoryCommands = byCategory[category];
        const categoryStats = stats[category];

        let sectionText = `*${i + 1}. ${category}*\n`;
        sectionText += `   📌 ${categoryCommands.length} commands\n`;
        
        if (categoryStats.owner > 0) sectionText += `   👤 ${categoryStats.owner} owner-only\n`;
        if (categoryStats.admin > 0) sectionText += `   👨‍💼 ${categoryStats.admin} admin-only\n`;
        if (categoryStats.group > 0) sectionText += `   👥 ${categoryStats.group} group-only\n`;
        
        sectionText += '\n';

        // List commands in this category
        for (const cmd of categoryCommands) {
          const perms = [];
          if (cmd.owner) perms.push('owner');
          if (cmd.admin) perms.push('admin');
          if (cmd.group) perms.push('group');
          if (cmd.botAdmin) perms.push('botAdmin');
          
          const permStr = perms.length > 0 ? ` [${perms.join('/')}]` : '';
          const aliases = cmd.aliases && cmd.aliases.length > 0 ? ` (${cmd.aliases.join(', ')})` : '';
          
          sectionText += `   ${prefix}${cmd.name}${aliases}\n`;
          sectionText += `      ${cmd.description}\n`;
        }

        sections.push({
          index: i + 1,
          category,
          stats: categoryStats,
          text: sectionText
        });
      }

      // If user requested a specific category
      if (selection && selection >= 1 && selection <= sections.length) {
        const s = sections[selection - 1];
        body += s.text;
        body += '\n╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮\n';
        body += `┃ Category ${s.index}/${sections.length}: ${s.category}\n`;
        body += `┃ Total Commands: ${s.stats.count}\n`;
        body += '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n';
        return await message.reply(body);
      }

      // Full menu: show summary with all categories
      body += '📚 *COMMAND CATEGORIES*\n\n';
      
      for (const s of sections) {
        body += `${s.index}. ${s.category} (${s.stats.count})\n`;
      }

      body += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
      body += '💡 *HOW TO USE:*\n';
      body += `• Type \`${prefix}menu <number>\` to view a category\n`;
      body += `• Type \`${prefix}help <command>\` for command details\n`;
      body += `• Example: \`${prefix}menu 1\` shows Owner commands\n\n`;

      body += '╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮\n';
      body += '┃ JACKIOKO TEC v' + config.version + '\n';
      body += '┃ Building the Future\n';
      body += '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n';

      return await message.reply(body);
    } catch (error) {
      console.error('Menu command error:', error);
      return await message.reply(`Error generating menu: ${error.message}`);
    }
  }
};
