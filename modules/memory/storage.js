/**
 * STORAGE MODULE - Handles all file I/O for memory system
 */

const path = require('path');
const fs = require('fs-extra');

// Simple helper to get ISO date for filenames
function isoDate(ts = Date.now()) {
  return new Date(ts).toISOString();
}

class Storage {
  constructor(baseDir, logger = console) {
    this.baseDir = baseDir;
    this.logger = logger;
    this.memoryDir = path.join(baseDir, 'memory');
    this.usersDir = path.join(this.memoryDir, 'users');
    this.groupsDir = path.join(this.memoryDir, 'groups');
    this.mediaDir = path.join(this.memoryDir, 'media');
    this.indexesDir = path.join(this.memoryDir, 'indexes');
    this.statsDir = path.join(this.memoryDir, 'statistics');
    this.logsDir = path.join(this.memoryDir, 'logs');
    this.readableDir = path.join(this.memoryDir, 'readable');
  }

  /**
   * Initialize storage directories
   */
  async init() {
    await fs.ensureDir(this.usersDir);
    await fs.ensureDir(this.groupsDir);
    await fs.ensureDir(this.mediaDir);
    await fs.ensureDir(this.indexesDir);
    await fs.ensureDir(this.statsDir);
    await fs.ensureDir(path.join(this.statsDir, 'daily'));
    await fs.ensureDir(this.logsDir);
    
    // Create subdirectories for media types
    await fs.ensureDir(path.join(this.mediaDir, 'images'));
    await fs.ensureDir(path.join(this.mediaDir, 'videos'));
    await fs.ensureDir(path.join(this.mediaDir, 'audio'));
    await fs.ensureDir(path.join(this.mediaDir, 'documents'));
    await fs.ensureDir(path.join(this.mediaDir, 'stickers'));
    await fs.ensureDir(this.readableDir);
    await fs.ensureDir(path.join(this.readableDir, 'daily'));
    await fs.ensureDir(path.join(this.readableDir, 'chats'));

    // Ensure human-readable daily summaries exist for existing stats
    try {
      const dailyStatsDir = path.join(this.statsDir, 'daily');
      const files = await fs.readdir(dailyStatsDir);
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        try {
          const full = path.join(dailyStatsDir, f);
          const raw = await fs.readJson(full, { throws: false }) || {};
          await this._writeReadableDaily(raw).catch(() => {});
        } catch (e) {}
      }
    } catch (e) {
      // ignore
    }
  }

  /**
   * Get or create user directory
   */
  _getUserDir(jid) {
    const phoneNumber = (jid || '').split('@')[0];
    return path.join(this.usersDir, phoneNumber);
  }

  /**
   * Update user profile with new data
   */
  async updateUserProfile(jid, extractedData) {
    try {
      const userDir = this._getUserDir(jid);
      await fs.ensureDir(userDir);

      const profileFile = path.join(userDir, 'profile.json');
      let profile = {};

      if (await fs.pathExists(profileFile)) {
        profile = await fs.readJson(profileFile, { throws: false }) || {};
      }

      // Update profile with extracted data
      profile = {
        ...profile,
        jid,
        phoneNumber: extractedData.phoneNumber,
        pushName: extractedData.pushName || profile.pushName,
        contactName: extractedData.contactName || profile.contactName,
        profilePicture: extractedData.profilePicture || profile.profilePicture,
        firstSeen: profile.firstSeen || extractedData.timestamp,
        lastSeen: extractedData.timestamp,
        totalMessages: (profile.totalMessages || 0) + 1,
        groups: [...new Set([...(profile.groups || []), ...extractedData.groups])],
        messageFrequency: this._calculateFrequency(profile.messageFrequency),
        favoriteWords: this._updateFavoriteWords(profile.favoriteWords, extractedData.text),
        languages: [...new Set([...(profile.languages || []), ...(extractedData.languages || [])])],
        isBot: extractedData.isBot || false,
        isBusiness: extractedData.isBusiness || false,
        status: {
          online: extractedData.isOnline,
          lastUpdated: extractedData.timestamp
        }
      };

      await fs.writeJson(profileFile, profile, { spaces: 2 });
      return profile;
    } catch (error) {
      try { this.logger.error && this.logger.error('updateUserProfile', error, { jid }); } catch {}
      throw new Error(`Failed to update user profile: ${error.message}`);
    }
  }

  /**
   * Get user profile
   */
  async getUserProfile(jid) {
    try {
      const profileFile = path.join(this._getUserDir(jid), 'profile.json');
      if (await fs.pathExists(profileFile)) {
        return await fs.readJson(profileFile);
      }
      return null;
    } catch (error) {
      try { this.logger.error && this.logger.error('getUserProfile', error, { jid }); } catch {}
      return null;
    }
  }

  /**
   * Store message
   */
  async storeMessage(message, extractedData) {
    try {
      const userDir = this._getUserDir(message.sender);
      await fs.ensureDir(userDir);

      const messagesFile = path.join(userDir, 'messages.json');
      let messages = [];

      if (await fs.pathExists(messagesFile)) {
        messages = await fs.readJson(messagesFile, { throws: false }) || [];
        // Keep only last 10000 messages in memory (older ones go to archive)
        if (messages.length >= 10000) {
          await this._archiveMessages(userDir, messages.slice(0, 5000));
          messages = messages.slice(5000);
        }
      }

      // Ensure deterministic ID fallback
      const id = message.id || `MSG_${message.chat}_${message.sender}_${extractedData.timestamp}`;

      // Prevent duplicates
      const existing = messages.find(m => m.id === id);
      if (existing) {
        try { this.logger.log && this.logger.log('memory', '[MESSAGE DUPLICATE]', { id, chat: message.chat, sender: message.sender }); } catch {}
        existing._isNew = false;
        return existing;
      }

      const storedMessage = {
        id,
        timestamp: extractedData.timestamp || Date.now(),
        sender: message.sender,
        chat: message.chat,
        groupId: message.isGroup ? message.chat : null,
        groupName: extractedData.groupName,
        messageType: message.type,
        text: extractedData.text,
        quotedMessage: extractedData.quotedMessage ? extractedData.quotedMessage.id : null,
        mentions: extractedData.mentions,
        links: extractedData.links,
        emails: extractedData.emails,
        phones: extractedData.phones,
        locations: extractedData.locations,
        dates: extractedData.dates,
        hashtags: extractedData.hashtags,
        commands: extractedData.commands,
        mediaType: extractedData.mediaInfo?.type,
        mediaInfo: extractedData.mediaInfo ? {
          type: extractedData.mediaInfo.type,
          size: extractedData.mediaInfo.size,
          mimetype: extractedData.mediaInfo.mimetype,
          url: extractedData.mediaInfo.url,
          filename: extractedData.mediaInfo.filename
        } : null,
        reactions: extractedData.reactions || [],
        edited: false,
        forwarded: extractedData.forwarded || false,
        fromMe: message.fromMe
      };

      messages.push(storedMessage);
      try {
        await fs.writeJson(messagesFile, messages, { spaces: 2 });
        try { this.logger.log && this.logger.log('memory', '[MESSAGE ARCHIVED]', { id: storedMessage.id, chat: message.chat, sender: message.sender }); } catch {}
      } catch (err) {
        try { this.logger.error && this.logger.error('storeMessage:write', err, { id: storedMessage.id }); } catch {}
        throw err;
      }

      // Store additional data types separately
      if (extractedData.links.length > 0) {
        await this._appendToFile(path.join(userDir, 'links.json'), {
          messageId: storedMessage.id,
          links: extractedData.links,
          timestamp: extractedData.timestamp
        });
      }

      if (extractedData.emails.length > 0) {
        await this._appendToFile(path.join(userDir, 'emails.json'), {
          messageId: storedMessage.id,
          emails: extractedData.emails,
          timestamp: extractedData.timestamp
        });
      }

      if (extractedData.phones.length > 0) {
        await this._appendToFile(path.join(userDir, 'contacts.json'), {
          messageId: storedMessage.id,
          phones: extractedData.phones,
          timestamp: extractedData.timestamp
        });
      }

      // Also append human-readable conversation line
      try {
        await this._appendReadable(userDir, storedMessage);
      } catch (e) {
        try { this.logger.error && this.logger.error('appendReadable', e, { id: storedMessage.id }); } catch {}
      }

      // Update daily and total statistics (only for new messages)
      try {
        storedMessage._isNew = true;
        await this.updateStatistics(storedMessage);
      } catch (e) {
        try { this.logger.error && this.logger.error('updateStatistics', e, { id: storedMessage.id }); } catch {}
      }

      return storedMessage;
    } catch (error) {
      try { this.logger.error && this.logger.error('storeMessage', error, { messageId: message.id }); } catch {}
      throw new Error(`Failed to store message: ${error.message}`);
    }
  }

  /**
   * Get messages for a user
   */
  async getUserMessages(jid, limit = 1000) {
    try {
      const messagesFile = path.join(this._getUserDir(jid), 'messages.json');
      if (await fs.pathExists(messagesFile)) {
        const messages = await fs.readJson(messagesFile, { throws: false }) || [];
        return messages.slice(-limit);
      }
      return [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Store media reference
   */
  async logMediaReference(jid, mediaInfo) {
    try {
      const userDir = this._getUserDir(jid);
      const mediaFile = path.join(userDir, 'media.json');
      
      await this._appendToFile(mediaFile, {
        type: mediaInfo.type,
        filename: mediaInfo.filename,
        size: mediaInfo.size,
        url: mediaInfo.url,
        timestamp: Date.now()
      });
    } catch (error) {
      // Log error but don't fail
    }
  }

  /**
   * Append a human-readable line to conversation file
   */
  async _appendReadable(userDir, storedMessage) {
    try {
      const phone = path.basename(userDir);
      const chatDir = path.join(this.readableDir, phone);
      await fs.ensureDir(chatDir);
      const fileName = `${new Date(storedMessage.timestamp).toISOString().split('T')[0]}.txt`;
      const filePath = path.join(chatDir, fileName);
      const time = new Date(storedMessage.timestamp).toTimeString().split(' ')[0];
      const who = storedMessage.fromMe ? 'Me' : storedMessage.sender.split('@')[0];
      const direction = storedMessage.fromMe ? 'OUTGOING' : 'INCOMING';
      const scope = storedMessage.groupId ? 'GROUP' : 'PRIVATE';
      const text = storedMessage.text || (storedMessage.mediaInfo?.caption || '') || (storedMessage.messageType || '');
      const header = `[${time}] ${who} | ${scope} | ${direction}`;
      const line = `${header}\n${text}\n\n`;
      await fs.appendFile(filePath, line, { encoding: 'utf8' });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update group information
   */
  async updateGroupInfo(groupId, message) {
    try {
      await fs.ensureDir(this.groupsDir);
      const groupFile = path.join(this.groupsDir, `${groupId.split('@')[0]}.json`);

      let groupData = {};
      if (await fs.pathExists(groupFile)) {
        groupData = await fs.readJson(groupFile, { throws: false }) || {};
      }

      groupData = {
        ...groupData,
        groupId,
        lastActivity: Date.now(),
        totalMessages: (groupData.totalMessages || 0) + 1,
        participants: [...new Set([...(groupData.participants || []), message.sender])],
        messageTimeline: (groupData.messageTimeline || []).slice(-100) // Keep last 100
      };

      groupData.messageTimeline.push({
        sender: message.sender,
        timestamp: Date.now(),
        text: message.text ? message.text.substring(0, 50) : ''
      });

      await fs.writeJson(groupFile, groupData, { spaces: 2 });
    } catch (error) {
      // Log error but don't fail
    }
  }

  /**
   * Get group information
   */
  async getGroupInfo(groupId) {
    try {
      const groupFile = path.join(this.groupsDir, `${groupId.split('@')[0]}.json`);
      if (await fs.pathExists(groupFile)) {
        return await fs.readJson(groupFile);
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Update statistics
   */
  async updateStatistics(message) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const statsFile = path.join(this.statsDir, 'daily', `${today}.json`);
      const totalFile = path.join(this.statsDir, 'total.json');

      let stats = {
        date: today,
        total: 0,
        incoming: 0,
        outgoing: 0,
        private: 0,
        groups: 0,
        types: {},
        uniqueUsers: new Set(),
        mediaMessages: 0,
        commands: 0
      };

      if (await fs.pathExists(statsFile)) {
        const raw = await fs.readJson(statsFile, { throws: false }) || {};
        stats = {
          ...raw,
          uniqueUsers: new Set(raw.uniqueUsers || [])
        };
      }

      // Only increment stats for newly stored messages
      if (message._isNew) {
        stats.total += 1;
        stats.uniqueUsers.add(message.sender);
        if (message.fromMe) stats.outgoing += 1; else stats.incoming += 1;
        if (message.isGroup) stats.groups += 1; else stats.private += 1;
        const t = message.messageType || (message.type || 'text');
        stats.types[t] = (stats.types[t] || 0) + 1;
        if (message.messageType && message.messageType !== 'conversation') stats.mediaMessages += 1;
      }

      const statsToSave = {
        ...stats,
        uniqueUsers: Array.from(stats.uniqueUsers)
      };

      await fs.writeJson(statsFile, statsToSave, { spaces: 2 });

      // Also write a human-readable daily summary
      try {
        await this._writeReadableDaily(statsToSave);
      } catch (e) {
        try { this.logger.error && this.logger.error('writeReadableDaily', e); } catch {}
      }

      // Update total summary atomically
      try {
        let total = { total: 0, incoming: 0, outgoing: 0, private: 0, groups: 0, types: {} };
        if (await fs.pathExists(totalFile)) {
          total = await fs.readJson(totalFile, { throws: false }) || total;
        }
        if (message._isNew) {
          total.total = (total.total || 0) + 1;
          if (message.fromMe) total.outgoing = (total.outgoing || 0) + 1; else total.incoming = (total.incoming || 0) + 1;
          if (message.isGroup) total.groups = (total.groups || 0) + 1; else total.private = (total.private || 0) + 1;
          const tt = message.messageType || (message.type || 'text');
          total.types[tt] = (total.types[tt] || 0) + 1;
        }
        await fs.writeJson(totalFile, total, { spaces: 2 });
      } catch (e) {
        try { this.logger.error && this.logger.error('updateStatistics:total', e); } catch {}
      }
    } catch (error) {
      // Log error but don't fail
    }
  }

  /**
   * Write a human-readable daily summary file
   */
  async _writeReadableDaily(stats) {
    try {
      const today = stats.date || new Date().toISOString().split('T')[0];
      const dir = path.join(this.readableDir, 'daily');
      await fs.ensureDir(dir);
      const file = path.join(dir, `${today}.txt`);
      let out = `Date: ${today}\n`;
      out += `Total messages: ${stats.total || 0}\n`;
      out += `Incoming: ${stats.incoming || 0}\n`;
      out += `Outgoing: ${stats.outgoing || 0}\n`;
      out += `Private: ${stats.private || 0}\n`;
      out += `Group: ${stats.groups || 0}\n`;
      out += `Unique users: ${(stats.uniqueUsers || []).length}\n`;
      out += `Media messages: ${stats.mediaMessages || 0}\n`;
      out += `Types:\n`;
      for (const [t, c] of Object.entries(stats.types || {})) {
        out += `  - ${t}: ${c}\n`;
      }
      out += '\n';
      await fs.writeFile(file, out, { encoding: 'utf8' });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get statistics
   */
  async getStatistics(type = 'daily', days = 7) {
    try {
      if (type === 'daily') {
        return await this._getDailyStats(days);
      } else if (type === 'summary') {
        return await this._getSummaryStat();
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Export user data
   */
  async export(userJid = null) {
    try {
      if (userJid) {
        // Export specific user
        const userDir = this._getUserDir(userJid);
        const exportData = {};

        if (await fs.pathExists(userDir)) {
          const files = await fs.readdir(userDir);
          for (const file of files) {
            if (file.endsWith('.json')) {
              const filePath = path.join(userDir, file);
              exportData[file] = await fs.readJson(filePath);
            }
          }
        }

        return exportData;
      } else {
        // Export all data summary
        return {
          totalUsers: await this._countUsers(),
          totalGroups: await this._countGroups(),
          totalMessages: await this._countMessages(),
          storagePath: this.memoryDir
        };
      }
    } catch (error) {
      throw new Error(`Export failed: ${error.message}`);
    }
  }

  /**
   * Delete user data
   */
  async deleteUser(jid) {
    try {
      const userDir = this._getUserDir(jid);
      if (await fs.pathExists(userDir)) {
        await fs.remove(userDir);
      }
    } catch (error) {
      throw new Error(`Delete failed: ${error.message}`);
    }
  }

  /**
   * Cleanup and archive old data
   */
  async cleanup(config) {
    try {
      const archiveThreshold = config.archiveOldMessages * 24 * 60 * 60 * 1000;
      const now = Date.now();

      const dirs = await fs.readdir(this.usersDir);
      for (const userDir of dirs) {
        const userPath = path.join(this.usersDir, userDir);
        const messagesFile = path.join(userPath, 'messages.json');

        if (await fs.pathExists(messagesFile)) {
          const messages = await fs.readJson(messagesFile, { throws: false }) || [];
          const oldMessages = messages.filter(m => (now - m.timestamp) > archiveThreshold);
          
          if (oldMessages.length > 0) {
            await this._archiveMessages(userPath, oldMessages);
            const recentMessages = messages.filter(m => (now - m.timestamp) <= archiveThreshold);
            await fs.writeJson(messagesFile, recentMessages, { spaces: 2 });
          }
        }
      }
    } catch (error) {
      // Log but don't fail
    }
  }

  /**
   * Helper: Archive messages to compressed file
   */
  async _archiveMessages(userDir, messages) {
    try {
      const archiveDir = path.join(userDir, 'archive');
      await fs.ensureDir(archiveDir);
      const timestamp = Date.now();
      const archiveFile = path.join(archiveDir, `messages_${timestamp}.json`);
      await fs.writeJson(archiveFile, messages, { spaces: 2 });
    } catch (error) {
      // Log but don't fail
    }
  }

  /**
   * Helper: Append to file (array of objects)
   */
  async _appendToFile(filePath, item) {
    try {
      let data = [];
      if (await fs.pathExists(filePath)) {
        data = await fs.readJson(filePath, { throws: false }) || [];
      }
      if (!Array.isArray(data)) data = [];
      data.push(item);
      await fs.writeJson(filePath, data, { spaces: 2 });
    } catch (error) {
      // Log but don't fail
    }
  }

  /**
   * Helper: Calculate message frequency
   */
  _calculateFrequency(existing = {}) {
    const now = new Date();
    const hour = now.getHours();
    return {
      ...existing,
      [hour]: (existing[hour] || 0) + 1
    };
  }

  /**
   * Helper: Update favorite words
   */
  _updateFavoriteWords(existing = {}, text = '') {
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const updated = { ...existing };
    for (const word of words) {
      updated[word] = (updated[word] || 0) + 1;
    }
    // Keep only top 100 words
    const sorted = Object.entries(updated).sort((a, b) => b[1] - a[1]);
    return Object.fromEntries(sorted.slice(0, 100));
  }

  /**
   * Helper: Count total users
   */
  async _countUsers() {
    try {
      const dirs = await fs.readdir(this.usersDir);
      return dirs.length;
    } catch {
      return 0;
    }
  }

  /**
   * Helper: Count total groups
   */
  async _countGroups() {
    try {
      const files = await fs.readdir(this.groupsDir);
      return files.length;
    } catch {
      return 0;
    }
  }

  /**
   * Helper: Count total messages
   */
  async _countMessages() {
    try {
      let total = 0;
      const dirs = await fs.readdir(this.usersDir);
      for (const userDir of dirs) {
        const messagesFile = path.join(this.usersDir, userDir, 'messages.json');
        if (await fs.pathExists(messagesFile)) {
          const messages = await fs.readJson(messagesFile, { throws: false }) || [];
          total += messages.length;
        }
      }
      return total;
    } catch {
      return 0;
    }
  }

  /**
   * Helper: Get daily statistics
   */
  async _getDailyStats(days) {
    try {
      const stats = [];
      const files = await fs.readdir(this.statsDir);
      const sorted = files.sort().reverse().slice(0, days);
      for (const file of sorted) {
        const filePath = path.join(this.statsDir, file);
        const data = await fs.readJson(filePath, { throws: false }) || {};
        stats.push(data);
      }
      return stats;
    } catch {
      return [];
    }
  }

  /**
   * Helper: Get summary statistics
   */
  async _getSummaryStats() {
    try {
      const stats = await this.getStatistics('daily', 30);
      return {
        totalMessages: stats.reduce((sum, s) => sum + (s.messagesReceived || 0) + (s.messagesSent || 0), 0),
        totalUsers: new Set(stats.flatMap(s => s.uniqueUsers || [])).size,
        avgMessagesPerDay: Math.floor(stats.reduce((sum, s) => sum + (s.messagesReceived || 0) + (s.messagesSent || 0), 0) / stats.length),
        period: '30 days'
      };
    } catch {
      return null;
    }
  }
}

module.exports = Storage;
