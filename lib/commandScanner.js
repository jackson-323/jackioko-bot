/**
 * COMMAND SCANNER - Dynamically scans and organizes all registered commands
 * 
 * This module automatically detects all commands in the project and organizes them
 * by category without requiring manual maintenance.
 */

const path = require('path');
const fs = require('fs-extra');

class CommandScanner {
  constructor(config) {
    this.config = config;
    this.commands = new Map();
    this.categories = new Map();
    this.lastScanned = null;
  }

  /**
   * Scan and organize all commands from the registry
   */
  async scan(commandRegistry) {
    try {
      this.commands.clear();
      this.categories.clear();

      // Get all commands from registry
      const cmdList = Array.from(commandRegistry.values());

      // Organize by category
      for (const cmd of cmdList) {
        const category = this._inferCategory(cmd);
        
        if (!this.categories.has(category)) {
          this.categories.set(category, []);
        }

        this.categories.get(category).push(cmd);
        this.commands.set(cmd.name, { ...cmd, category });
      }

      // Sort commands within each category
      for (const [category, cmds] of this.categories) {
        cmds.sort((a, b) => a.name.localeCompare(b.name));
      }

      this.lastScanned = Date.now();
      return {
        totalCommands: this.commands.size,
        totalCategories: this.categories.size,
        lastScanned: this.lastScanned
      };
    } catch (error) {
      throw new Error(`Failed to scan commands: ${error.message}`);
    }
  }

  /**
   * Get commands organized by category
   */
  getByCategory() {
    const result = {};
    for (const [category, commands] of this.categories) {
      result[category] = commands.map(cmd => ({
        name: cmd.name,
        aliases: cmd.aliases || [],
        description: cmd.description || 'No description',
        category: cmd.category || 'Utility',
        usage: cmd.usage || '',
        cooldown: cmd.cooldown || 3,
        owner: cmd.owner || false,
        group: cmd.group || false,
        private: cmd.private || false,
        admin: cmd.admin || false,
        botAdmin: cmd.botAdmin || false
      }));
    }
    return result;
  }

  /**
   * Get flat list of all commands
   */
  getAll() {
    return Array.from(this.commands.values()).map(cmd => ({
      name: cmd.name,
      aliases: cmd.aliases || [],
      description: cmd.description || 'No description',
      category: cmd.category || 'Utility',
      usage: cmd.usage || '',
      cooldown: cmd.cooldown || 3,
      owner: cmd.owner || false,
      group: cmd.group || false,
      private: cmd.private || false,
      admin: cmd.admin || false,
      botAdmin: cmd.botAdmin || false
    }));
  }

  /**
   * Get specific command details
   */
  getCommand(name) {
    const cmd = this.commands.get(name.toLowerCase());
    if (!cmd) return null;
    
    return {
      name: cmd.name,
      aliases: cmd.aliases || [],
      description: cmd.description || 'No description',
      category: cmd.category || 'Utility',
      usage: cmd.usage || '',
      cooldown: cmd.cooldown || 3,
      owner: cmd.owner || false,
      group: cmd.group || false,
      private: cmd.private || false,
      admin: cmd.admin || false,
      botAdmin: cmd.botAdmin || false
    };
  }

  /**
   * Get category info
   */
  getCategory(category) {
    const cmds = this.categories.get(category);
    if (!cmds) return null;
    return cmds.map(cmd => ({
      name: cmd.name,
      aliases: cmd.aliases || [],
      description: cmd.description || 'No description',
      cooldown: cmd.cooldown || 3
    }));
  }

  /**
   * Get category statistics
   */
  getStats() {
    const stats = {};
    for (const [category, cmds] of this.categories) {
      stats[category] = {
        count: cmds.length,
        owner: cmds.filter(c => c.owner).length,
        admin: cmds.filter(c => c.admin).length,
        group: cmds.filter(c => c.group).length,
        private: cmds.filter(c => c.private).length
      };
    }
    return stats;
  }

  /**
   * Search commands by keyword
   */
  search(keyword) {
    const query = keyword.toLowerCase();
    return Array.from(this.commands.values())
      .filter(cmd => 
        cmd.name.includes(query) ||
        (cmd.description || '').toLowerCase().includes(query) ||
        (cmd.aliases || []).some(a => a.toLowerCase().includes(query))
      )
      .map(cmd => ({
        name: cmd.name,
        aliases: cmd.aliases || [],
        description: cmd.description || 'No description',
        category: cmd.category || 'Utility'
      }));
  }

  /**
   * Infer category from command metadata
   */
  _inferCategory(cmd) {
    // Check if explicitly set
    if (cmd.category) {
      return this._normalizeCategory(cmd.category);
    }

    // Infer from filename or directory
    if (cmd.file) {
      const parts = cmd.file.split(path.sep);
      const dirIndex = parts.indexOf('commands');
      if (dirIndex >= 0 && dirIndex < parts.length - 1) {
        const dirName = parts[dirIndex + 1];
        return this._normalizeCategory(dirName);
      }
    }

    // Default
    return 'Utilities';
  }

  /**
   * Normalize category names
   */
  _normalizeCategory(cat) {
    const categoryMap = {
      'owner': '👤 Owner',
      'admin': '👨‍💼 Admin',
      'group': '👥 Group',
      'ai': '🤖 AI Assistant',
      'assistant': '🤖 AI Assistant',
      'system': '⚙️ System',
      'tools': '🛠️ Tools',
      'utility': 'ℹ️ Information',
      'utilities': 'ℹ️ Information',
      'fun': '🎮 Fun',
      'games': '🎮 Fun',
      'media': '📁 Media',
      'download': '⬇️ Downloads',
      'downloads': '⬇️ Downloads',
      'education': '📚 Education',
      'internet': '🌐 Internet',
      'search': '🔍 Search',
      'memory': '🧠 Memory System',
      'security': '🔐 Security'
    };

    const normalized = cat.toLowerCase().replace(/\s+/g, '');
    return categoryMap[normalized] || `📌 ${cat}`;
  }
}

module.exports = CommandScanner;
