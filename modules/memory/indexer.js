/**
 * INDEXER MODULE - Creates and maintains searchable indexes
 */

const path = require('path');
const fs = require('fs-extra');

class Indexer {
  constructor(storage) {
    this.storage = storage;
    this.indexDir = storage.indexesDir;
    this.indexes = {
      users: {},
      keywords: {},
      dates: {},
      links: {},
      emails: {},
      phones: {},
      commands: {},
      hashtags: {},
      media: {},
      groups: {}
    };
  }

  /**
   * Initialize indexes from disk
   */
  async init() {
    try {
      await fs.ensureDir(this.indexDir);
      
      // Load existing indexes
      for (const indexName of Object.keys(this.indexes)) {
        const indexFile = path.join(this.indexDir, `${indexName}.json`);
        if (await fs.pathExists(indexFile)) {
          this.indexes[indexName] = await fs.readJson(indexFile, { throws: false }) || {};
        }
      }
    } catch (error) {
      throw new Error(`Failed to initialize indexes: ${error.message}`);
    }
  }

  /**
   * Index a message
   */
  async indexMessage(message, extractedData) {
    try {
      // Index user
      this._indexUser(message.sender, message.id);

      // Index keywords
      if (extractedData.text) {
        this._indexKeywords(extractedData.text, message.id);
      }

      // Index dates
      this._indexDate(new Date(message.timestamp).toISOString().split('T')[0], message.id);

      // Index links
      for (const link of extractedData.links) {
        this._indexLink(link, message.id);
      }

      // Index emails
      for (const email of extractedData.emails) {
        this._indexEmail(email, message.id);
      }

      // Index phones
      for (const phone of extractedData.phones) {
        this._indexPhone(phone, message.id);
      }

      // Index commands
      for (const cmd of extractedData.commands) {
        this._indexCommand(cmd, message.id);
      }

      // Index hashtags
      for (const tag of extractedData.hashtags) {
        this._indexHashtag(tag, message.id);
      }

      // Index media
      if (message.mediaType) {
        this._indexMedia(message.mediaType, message.id);
      }

      // Index groups
      if (message.groupId) {
        this._indexGroup(message.groupId, message.id);
      }

      // Save indexes periodically
      await this._saveIndexes();
    } catch (error) {
      throw new Error(`Failed to index message: ${error.message}`);
    }
  }

  /**
   * Search across all indexes
   */
  async search(query, options = {}) {
    const {
      type = 'all', // all, user, keyword, link, email, phone, command, hashtag, media, group
      limit = 100,
      offset = 0,
      startDate = null,
      endDate = null
    } = options;

    try {
      let results = [];

      if (type === 'all' || type === 'keyword') {
        results = [...results, ...this._searchKeywords(query)];
      }
      if (type === 'all' || type === 'user') {
        results = [...results, ...this._searchUsers(query)];
      }
      if (type === 'all' || type === 'link') {
        results = [...results, ...this._searchLinks(query)];
      }
      if (type === 'all' || type === 'email') {
        results = [...results, ...this._searchEmails(query)];
      }
      if (type === 'all' || type === 'phone') {
        results = [...results, ...this._searchPhones(query)];
      }
      if (type === 'all' || type === 'command') {
        results = [...results, ...this._searchCommands(query)];
      }
      if (type === 'all' || type === 'hashtag') {
        results = [...results, ...this._searchHashtags(query)];
      }
      if (type === 'all' || type === 'media') {
        results = [...results, ...this._searchMedia(query)];
      }
      if (type === 'all' || type === 'group') {
        results = [...results, ...this._searchGroups(query)];
      }

      // Remove duplicates
      results = [...new Set(results)];

      // Apply date filters if provided
      if (startDate || endDate) {
        results = await this._filterByDate(results, startDate, endDate);
      }

      // Apply pagination
      return results.slice(offset, offset + limit);
    } catch (error) {
      console.error('Search error:', error);
      return [];
    }
  }

  /**
   * Get all messages for a user
   */
  async getUserMessages(jid) {
    const phoneNumber = (jid || '').split('@')[0];
    return this.indexes.users[phoneNumber] || [];
  }

  /**
   * Remove user from indexes
   */
  async removeUser(jid) {
    try {
      const phoneNumber = (jid || '').split('@')[0];
      
      // Get all message IDs for this user
      const messageIds = this.indexes.users[phoneNumber] || [];
      
      // Remove from all indexes
      for (const indexName of Object.keys(this.indexes)) {
        const index = this.indexes[indexName];
        for (const key in index) {
          if (Array.isArray(index[key])) {
            index[key] = index[key].filter(id => !messageIds.includes(id));
            if (index[key].length === 0) {
              delete index[key];
            }
          }
        }
      }

      await this._saveIndexes();
    } catch (error) {
      throw new Error(`Failed to remove user from indexes: ${error.message}`);
    }
  }

  /**
   * Repair indexes from storage
   */
  async repair() {
    try {
      // Clear all indexes
      for (const key of Object.keys(this.indexes)) {
        this.indexes[key] = {};
      }

      // Rebuild from storage
      const usersDir = this.storage.usersDir;
      const dirs = await fs.readdir(usersDir);

      for (const userDir of dirs) {
        const messagesFile = path.join(usersDir, userDir, 'messages.json');
        if (await fs.pathExists(messagesFile)) {
          const messages = await fs.readJson(messagesFile, { throws: false }) || [];
          for (const message of messages) {
            // Rebuild basic indexes
            this._indexUser(message.sender, message.id);
            this._indexDate(new Date(message.timestamp).toISOString().split('T')[0], message.id);
            if (message.text) {
              this._indexKeywords(message.text, message.id);
            }
            if (message.links && Array.isArray(message.links)) {
              for (const link of message.links) {
                this._indexLink(link, message.id);
              }
            }
            if (message.emails && Array.isArray(message.emails)) {
              for (const email of message.emails) {
                this._indexEmail(email, message.id);
              }
            }
            if (message.phones && Array.isArray(message.phones)) {
              for (const phone of message.phones) {
                this._indexPhone(phone, message.id);
              }
            }
            if (message.hashtags && Array.isArray(message.hashtags)) {
              for (const tag of message.hashtags) {
                this._indexHashtag(tag, message.id);
              }
            }
            if (message.mediaType) {
              this._indexMedia(message.mediaType, message.id);
            }
            if (message.groupId) {
              this._indexGroup(message.groupId, message.id);
            }
          }
        }
      }

      await this._saveIndexes();
      return true;
    } catch (error) {
      throw new Error(`Failed to repair indexes: ${error.message}`);
    }
  }

  /**
   * Helper: Index user
   */
  _indexUser(jid, messageId) {
    const phoneNumber = (jid || '').split('@')[0];
    if (!this.indexes.users[phoneNumber]) {
      this.indexes.users[phoneNumber] = [];
    }
    if (!this.indexes.users[phoneNumber].includes(messageId)) {
      this.indexes.users[phoneNumber].push(messageId);
    }
  }

  /**
   * Helper: Index keywords
   */
  _indexKeywords(text, messageId) {
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    for (const word of words) {
      if (!this.indexes.keywords[word]) {
        this.indexes.keywords[word] = [];
      }
      if (!this.indexes.keywords[word].includes(messageId)) {
        this.indexes.keywords[word].push(messageId);
      }
    }
  }

  /**
   * Helper: Index date
   */
  _indexDate(date, messageId) {
    if (!this.indexes.dates[date]) {
      this.indexes.dates[date] = [];
    }
    if (!this.indexes.dates[date].includes(messageId)) {
      this.indexes.dates[date].push(messageId);
    }
  }

  /**
   * Helper: Index link
   */
  _indexLink(link, messageId) {
    const normalized = link.toLowerCase();
    if (!this.indexes.links[normalized]) {
      this.indexes.links[normalized] = [];
    }
    if (!this.indexes.links[normalized].includes(messageId)) {
      this.indexes.links[normalized].push(messageId);
    }
  }

  /**
   * Helper: Index email
   */
  _indexEmail(email, messageId) {
    const normalized = email.toLowerCase();
    if (!this.indexes.emails[normalized]) {
      this.indexes.emails[normalized] = [];
    }
    if (!this.indexes.emails[normalized].includes(messageId)) {
      this.indexes.emails[normalized].push(messageId);
    }
  }

  /**
   * Helper: Index phone
   */
  _indexPhone(phone, messageId) {
    const normalized = phone.replace(/\D/g, '');
    if (!this.indexes.phones[normalized]) {
      this.indexes.phones[normalized] = [];
    }
    if (!this.indexes.phones[normalized].includes(messageId)) {
      this.indexes.phones[normalized].push(messageId);
    }
  }

  /**
   * Helper: Index command
   */
  _indexCommand(command, messageId) {
    const normalized = command.toLowerCase();
    if (!this.indexes.commands[normalized]) {
      this.indexes.commands[normalized] = [];
    }
    if (!this.indexes.commands[normalized].includes(messageId)) {
      this.indexes.commands[normalized].push(messageId);
    }
  }

  /**
   * Helper: Index hashtag
   */
  _indexHashtag(tag, messageId) {
    const normalized = tag.toLowerCase();
    if (!this.indexes.hashtags[normalized]) {
      this.indexes.hashtags[normalized] = [];
    }
    if (!this.indexes.hashtags[normalized].includes(messageId)) {
      this.indexes.hashtags[normalized].push(messageId);
    }
  }

  /**
   * Helper: Index media
   */
  _indexMedia(mediaType, messageId) {
    if (!this.indexes.media[mediaType]) {
      this.indexes.media[mediaType] = [];
    }
    if (!this.indexes.media[mediaType].includes(messageId)) {
      this.indexes.media[mediaType].push(messageId);
    }
  }

  /**
   * Helper: Index group
   */
  _indexGroup(groupId, messageId) {
    if (!this.indexes.groups[groupId]) {
      this.indexes.groups[groupId] = [];
    }
    if (!this.indexes.groups[groupId].includes(messageId)) {
      this.indexes.groups[groupId].push(messageId);
    }
  }

  /**
   * Helper: Search users
   */
  _searchUsers(query) {
    const results = [];
    const normalized = query.toLowerCase().replace(/\D/g, '');
    for (const [user, messages] of Object.entries(this.indexes.users)) {
      if (user.includes(normalized)) {
        results.push(...messages);
      }
    }
    return results;
  }

  /**
   * Helper: Search keywords
   */
  _searchKeywords(query) {
    const results = [];
    const words = query.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (this.indexes.keywords[word]) {
        results.push(...this.indexes.keywords[word]);
      }
    }
    return results;
  }

  /**
   * Helper: Search links
   */
  _searchLinks(query) {
    const results = [];
    const normalized = query.toLowerCase();
    for (const [link, messages] of Object.entries(this.indexes.links)) {
      if (link.includes(normalized)) {
        results.push(...messages);
      }
    }
    return results;
  }

  /**
   * Helper: Search emails
   */
  _searchEmails(query) {
    const results = [];
    const normalized = query.toLowerCase();
    for (const [email, messages] of Object.entries(this.indexes.emails)) {
      if (email.includes(normalized)) {
        results.push(...messages);
      }
    }
    return results;
  }

  /**
   * Helper: Search phones
   */
  _searchPhones(query) {
    const results = [];
    const normalized = query.replace(/\D/g, '');
    for (const [phone, messages] of Object.entries(this.indexes.phones)) {
      if (phone.includes(normalized)) {
        results.push(...messages);
      }
    }
    return results;
  }

  /**
   * Helper: Search commands
   */
  _searchCommands(query) {
    const results = [];
    const normalized = query.toLowerCase();
    for (const [cmd, messages] of Object.entries(this.indexes.commands)) {
      if (cmd.includes(normalized)) {
        results.push(...messages);
      }
    }
    return results;
  }

  /**
   * Helper: Search hashtags
   */
  _searchHashtags(query) {
    const results = [];
    const normalized = query.toLowerCase();
    for (const [tag, messages] of Object.entries(this.indexes.hashtags)) {
      if (tag.includes(normalized)) {
        results.push(...messages);
      }
    }
    return results;
  }

  /**
   * Helper: Search media
   */
  _searchMedia(query) {
    const results = [];
    const normalized = query.toLowerCase();
    for (const [type, messages] of Object.entries(this.indexes.media)) {
      if (type.includes(normalized)) {
        results.push(...messages);
      }
    }
    return results;
  }

  /**
   * Helper: Search groups
   */
  _searchGroups(query) {
    const results = [];
    const normalized = query.toLowerCase();
    for (const [group, messages] of Object.entries(this.indexes.groups)) {
      if (group.includes(normalized)) {
        results.push(...messages);
      }
    }
    return results;
  }

  /**
   * Helper: Filter results by date
   */
  async _filterByDate(messageIds, startDate, endDate) {
    // This would need to fetch actual message data to filter by date
    // For now, return all results
    return messageIds;
  }

  /**
   * Helper: Save all indexes to disk
   */
  async _saveIndexes() {
    try {
      for (const [indexName, indexData] of Object.entries(this.indexes)) {
        const indexFile = path.join(this.indexDir, `${indexName}.json`);
        await fs.writeJson(indexFile, indexData, { spaces: 2 });
      }
    } catch (error) {
      console.error('Failed to save indexes:', error);
    }
  }
}

module.exports = Indexer;
