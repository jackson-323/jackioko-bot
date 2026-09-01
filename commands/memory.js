/**
 * Memory System Commands
 * Owner-only commands for viewing, searching, and managing memory
 */

const memory = require('../modules/memory');
const { status } = require('../lib/ui');

module.exports = {
  name: 'memory',
  category: 'owner',
  description: 'View and manage bot memory system',
  cooldown: 5,
  ownerOnly: true,

  run: async (context) => {
    const { args, message, config, sock } = context;
    const subcommand = args[0]?.toLowerCase() || 'help';

    try {
      switch (subcommand) {
        case 'status':
          await handleStatus(sock, message, context);
          break;
        case 'profile':
          await handleProfile(sock, message, args.slice(1), context);
          break;
        case 'search':
          await handleSearch(sock, message, args.slice(1), context);
          break;
        case 'stats':
          await handleStats(sock, message, args.slice(1), context);
          break;
        case 'statschat':
          await handleStatsChat(sock, message, args.slice(1), context);
          break;
        case 'export':
          await handleExport(sock, message, args.slice(1), context);
          break;
        case 'delete':
          await handleDelete(sock, message, args.slice(1), context);
          break;
        case 'repair':
          await handleRepair(sock, message, context);
          break;
        case 'backup':
          await handleBackup(sock, message, context);
          break;
        case 'config':
          await handleConfig(sock, message, args.slice(1), context);
          break;
        case 'help':
        default:
          await handleHelp(sock, message, context);
      }
    } catch (error) {
      await message.reply(status('error', `Memory command error: ${error.message}`));
    }
  }
};

/**
 * Show memory system status
 */
async function handleStatus(sock, message, context) {
  try {
    if (!memory.initialized) {
      return message.reply(status('warning', 'Memory system not initialized'));
    }

    const storageInfo = await memory.backup.getStorageInfo();
    const stats = await memory.getStatistics('summary');
    const logs = memory.memoryLogger.getRecentErrors(5);

    let response = status('info', 'Memory System Status\n\n');
    response += `✓ Status: ${memory.enabled ? 'Enabled' : 'Disabled'}\n`;
    response += `✓ Initialized: ${memory.initialized}\n\n`;

    if (storageInfo) {
      response += `📁 Storage Information:\n`;
      response += `  • Path: ${storageInfo.path}\n`;
      response += `  • Size: ${storageInfo.sizeGB} GB\n`;
      response += `  • Backups: ${storageInfo.backups}\n`;
      response += `  • Last Backup: ${storageInfo.lastBackup || 'Never'}\n\n`;
    }

    if (stats) {
      response += `📊 Statistics:\n`;
      response += `  • Total Messages: ${stats.totalMessages}\n`;
      response += `  • Total Users: ${stats.totalUsers}\n`;
      response += `  • Avg/Day: ${stats.avgMessagesPerDay}\n\n`;
    }

    if (logs.length > 0) {
      response += `⚠️ Recent Errors (${logs.length}):\n`;
      for (const error of logs.slice(0, 3)) {
        response += `  • ${error.message}\n`;
      }
    }

    await message.reply(response);
  } catch (error) {
    await message.reply(status('error', `Status error: ${error.message}`));
  }
}

/**
 * Get user profile
 */
async function handleProfile(sock, message, args, context) {
  try {
    if (args.length === 0) {
      return message.reply(status('error', 'Usage: .memory profile <phone_number>'));
    }

    const jid = args[0].replace(/\D/g, '') + '@s.whatsapp.net';
    const profile = await memory.getUserProfile(jid);

    if (!profile) {
      return message.reply(status('warning', 'User profile not found'));
    }

    let response = status('info', `Profile for ${profile.phoneNumber}\n\n`);
    response += `👤 Basic Info:\n`;
    response += `  • Phone: ${profile.phoneNumber}\n`;
    response += `  • Name: ${profile.pushName || 'Unknown'}\n`;
    response += `  • Contact: ${profile.contactName || 'Unknown'}\n\n`;

    response += `📊 Statistics:\n`;
    response += `  • Total Messages: ${profile.totalMessages}\n`;
    response += `  • First Seen: ${new Date(profile.firstSeen).toLocaleString()}\n`;
    response += `  • Last Seen: ${new Date(profile.lastSeen).toLocaleString()}\n`;
    response += `  • Groups: ${profile.groups.length}\n\n`;

    if (profile.favoriteWords && Object.keys(profile.favoriteWords).length > 0) {
      response += `💬 Top Words:\n`;
      const topWords = Object.entries(profile.favoriteWords)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      for (const [word, count] of topWords) {
        response += `  • ${word}: ${count}x\n`;
      }
    }

    await message.reply(response);
  } catch (error) {
    await message.reply(status('error', `Profile error: ${error.message}`));
  }
}

/**
 * Search memory
 */
async function handleSearch(sock, message, args, context) {
  try {
    if (args.length === 0) {
      return message.reply(status('error', 'Usage: .memory search <query> [type]'));
    }

    const query = args.slice(0, -1).join(' ') || args[0];
    const type = args[args.length - 1];
    const validTypes = ['all', 'user', 'keyword', 'link', 'email', 'phone', 'command', 'hashtag', 'media', 'group'];

    const results = await memory.search(query, {
      type: validTypes.includes(type) ? type : 'all',
      limit: 50
    });

    if (results.length === 0) {
      return message.reply(status('warning', 'No results found'));
    }

    let response = status('info', `Search Results for "${query}"\n\n`);
    response += `Found ${results.length} result(s)\n\n`;
    response += results.slice(0, 10).join('\n');

    if (results.length > 10) {
      response += `\n\n... and ${results.length - 10} more`;
    }

    await message.reply(response);
  } catch (error) {
    await message.reply(status('error', `Search error: ${error.message}`));
  }
}

/**
 * View statistics
 */
async function handleStats(sock, message, args, context) {
  try {
    const type = args[0]?.toLowerCase() || 'daily';
    // If owner requests overall stats, read total.json
    let stats;
    if (type === 'total' || type === 'summary') {
      const storage = memory.storage;
      const totalFile = require('path').join(storage.statsDir, 'total.json');
      if (await require('fs-extra').pathExists(totalFile)) {
        stats = await require('fs-extra').readJson(totalFile);
      } else {
        stats = await memory.getStatistics('summary');
      }
    } else {
      stats = await memory.getStatistics(type, type === 'daily' ? 7 : undefined);
    }

    if (!stats) {
      return message.reply(status('warning', 'Statistics not available'));
    }

    let response = status('info', `Memory Statistics (${type})\n\n`);

    if (Array.isArray(stats)) {
      for (const stat of stats) {
        response += `📅 ${stat.date || 'Unknown Date'}\n`;
        response += `  • Received: ${stat.messagesReceived || 0}\n`;
        response += `  • Sent: ${stat.messagesSent || 0}\n`;
        response += `  • Total: ${(stat.messagesReceived || 0) + (stat.messagesSent || 0)}\n`;
        response += `  • Unique Users: ${stat.uniqueUsers?.length || 0}\n`;
        response += `  • Groups: ${stat.groupMessages || 0}\n`;
        response += `  • Private: ${stat.privateMessages || 0}\n\n`;
      }
    } else {
      response += `Total Messages: ${stats.totalMessages}\n`;
      response += `Total Users: ${stats.totalUsers}\n`;
      response += `Avg/Day: ${stats.avgMessagesPerDay}\n`;
      response += `Period: ${stats.period}\n`;
    }

    await message.reply(response);
  } catch (error) {
    await message.reply(status('error', `Stats error: ${error.message}`));
  }
}

/**
 * Export user memory
 */
async function handleExport(sock, message, args, context) {
  try {
    if (args.length === 0) {
      return message.reply(status('error', 'Usage: .memory export <phone_number>'));
    }

    const jid = args[0].replace(/\D/g, '') + '@s.whatsapp.net';
    const data = await memory.exportData(jid, 'json');

    if (!data) {
      return message.reply(status('warning', 'No data to export'));
    }

    const exportJson = JSON.stringify(data, null, 2);
    const fileName = `memory_export_${Date.now()}.json`;

    // Save to file and send
    const fs = require('fs-extra');
    const path = require('path');
    const exportFile = path.join(context.config.mediaDir, fileName);
    
    await fs.writeFile(exportFile, exportJson);
    await message.reply(status('success', `Memory exported. File: ${fileName}`));

    // Cleanup after sending
    setTimeout(() => fs.remove(exportFile).catch(() => {}), 5000);
  } catch (error) {
    await message.reply(status('error', `Export error: ${error.message}`));
  }
}

/**
 * Delete user memory
 */
async function handleDelete(sock, message, args, context) {
  try {
    if (args.length === 0) {
      return message.reply(status('error', 'Usage: .memory delete <phone_number>'));
    }

    const jid = args[0].replace(/\D/g, '') + '@s.whatsapp.net';
    const success = await memory.deleteUserMemory(jid);

    if (success) {
      await message.reply(status('success', `Memory deleted for ${args[0]}`));
    } else {
      await message.reply(status('warning', 'Failed to delete memory'));
    }
  } catch (error) {
    await message.reply(status('error', `Delete error: ${error.message}`));
  }
}

/**
 * Repair indexes
 */
async function handleRepair(sock, message, context) {
  try {
    await message.reply(status('info', 'Repairing indexes... Please wait'));
    const success = await memory.repairIndexes();

    if (success) {
      await message.reply(status('success', 'Indexes repaired successfully'));
    } else {
      await message.reply(status('error', 'Index repair failed'));
    }
  } catch (error) {
    await message.reply(status('error', `Repair error: ${error.message}`));
  }
}

/**
 * Trigger backup
 */
async function handleBackup(sock, message, context) {
  try {
    await message.reply(status('info', 'Starting backup... Please wait'));
    const success = await memory.triggerBackup();

    if (success) {
      const storageInfo = await memory.backup.getStorageInfo();
      await message.reply(status('success', `Backup completed\nSize: ${storageInfo?.sizeGB || 0} GB`));
    } else {
      await message.reply(status('warning', 'Backup completed with warnings'));
    }
  } catch (error) {
    await message.reply(status('error', `Backup error: ${error.message}`));
  }
}

/**
 * Configure memory settings
 */
async function handleConfig(sock, message, args, context) {
  try {
    if (args.length < 2) {
      return message.reply(status('error', 'Usage: .memory config <setting> <value>'));
    }

    const setting = args[0].toLowerCase();
    const value = args[1].toLowerCase();

    if (!memory.config.hasOwnProperty(setting)) {
      return message.reply(status('error', `Unknown setting: ${setting}`));
    }

    // Update config
    if (value === 'true' || value === '1') {
      memory.config[setting] = true;
    } else if (value === 'false' || value === '0') {
      memory.config[setting] = false;
    } else {
      memory.config[setting] = value;
    }

    memory.saveConfig();
    await message.reply(status('success', `Config updated: ${setting} = ${memory.config[setting]}`));
  } catch (error) {
    await message.reply(status('error', `Config error: ${error.message}`));
  }
}

/**
 * Show help
 */
async function handleHelp(sock, message, context) {
  const helpText = status('info', 'Memory System Commands\n\n') +
    `.memory status - Show memory system status\n` +
    `.memory profile <phone> - View user profile\n` +
    `.memory search <query> [type] - Search memory\n` +
    `.memory stats [daily|summary] - View statistics\n` +
    `.memory export <phone> - Export user memory\n` +
    `.memory delete <phone> - Delete user memory\n` +
    `.memory repair - Repair indexes\n` +
    `.memory backup - Trigger backup\n` +
    `.memory config <setting> <value> - Configure settings\n` +
    `.memory help - Show this help\n\n` +
    `⚠️ Memory system is OWNER-ONLY`;

  await message.reply(helpText);
}

/**
 * Show per-chat statistics
 */
async function handleStatsChat(sock, message, args, context) {
  try {
    if (args.length === 0) return message.reply(status('error', 'Usage: .memory statschat <phone_number>'));
    const phone = args[0].replace(/\D/g, '');
    const jid = `${phone}@s.whatsapp.net`;
    const storage = require('../modules/memory').storage;
    if (!storage) return message.reply(status('warning', 'Storage not initialized'));
    const messages = await storage.getUserMessages(jid, 10000);
    if (!messages || messages.length === 0) return message.reply(status('warning', 'No messages for this chat'));

    const total = messages.length;
    const incoming = messages.filter(m => !m.fromMe).length;
    const outgoing = messages.filter(m => m.fromMe).length;
    const groups = messages.filter(m => m.groupId).length;
    const priv = total - groups;
    const types = {};
    for (const m of messages) {
      const t = m.messageType || m.type || 'text';
      types[t] = (types[t] || 0) + 1;
    }

    let resp = status('info', `Stats for ${phone}\n\n`);
    resp += `Total: ${total}\n`;
    resp += `Incoming: ${incoming}\n`;
    resp += `Outgoing: ${outgoing}\n`;
    resp += `Private: ${priv}\n`;
    resp += `Group: ${groups}\n`;
    resp += `Types:\n`;
    for (const [k, v] of Object.entries(types)) resp += `  • ${k}: ${v}\n`;

    await message.reply(resp);
  } catch (error) {
    await message.reply(status('error', `StatsChat error: ${error.message}`));
  }
}
