/**
 * MEMORY MODULE - Self-Learning Memory System for Jackioko Bot
 * 
 * Automatically captures, stores, and indexes all messages from WhatsApp
 * without interfering with existing commands or features.
 * 
 * Features:
 * - Auto-capture all incoming/outgoing messages
 * - User profiles with statistics
 * - Message indexing for fast search
 * - Media organization
 * - Group memory tracking
 * - Google Drive backup
 * - Daily statistics
 * - Owner-only access
 */

const path = require('path');
const fs = require('fs-extra');
const config = require('../../config');
const { logInfo, logError } = require('../../lib/logger');
const Storage = require('./storage');
const Indexer = require('./indexer');
const Extractor = require('./extractor');
const MemoryBackup = require('./backup');
const MemoryLogger = require('./logger');

class MemorySystem {
  constructor(options = {}) {
    this.baseDir = options.baseDir || config.databaseDir;
    this.memoryRoot = options.memoryRoot || path.join(this.baseDir, 'memory');    this.enabled = true;
    this.storage = null;
    this.indexer = null;
    this.extractor = null;
    this.backup = null;
    this.memoryLogger = null;
    this.config = {
      listenMessages: true,
      storeOwnMessages: true,
      storeMedia: true,
      storeDocuments: true,
      storeLinks: true,
      extractMetadata: true,
      googleDriveBackup: false,
      backupInterval: 30 * 60 * 1000, // 30 minutes
      maxLocalStorage: 500 * 1024 * 1024, // 500 MB
      compression: true,
      enableGroupMemory: true,
      enableUserProfiles: true,
      enableStatistics: true,
      cleanupInterval: 24 * 60 * 60 * 1000, // 24 hours
      archiveOldMessages: 30, // Archive messages older than 30 days
      ...this.loadConfig()
    };
    this.initialized = false;
    this.backupInterval = null;
    this.cleanupInterval = null;
    this.messageQueue = [];
    this.isProcessingQueue = false;
  }

  /**
   * Load configuration from memory/config.json
   */
  loadConfig() {
    try {
      const configFile = path.join(this.baseDir, 'memory_config.json');
      if (fs.pathExistsSync(configFile)) {
        return fs.readJsonSync(configFile, { throws: false }) || {};
      }
    } catch (error) {
      logError('Memory: Failed to load config', error);
    }
    return {};
  }

  /**
   * Save configuration to memory/config.json
   */
  saveConfig() {
    try {
      const configFile = path.join(this.baseDir, 'memory_config.json');
      fs.ensureDirSync(config.databaseDir);
      fs.writeJsonSync(configFile, this.config, { spaces: 2 });
    } catch (error) {
      logError('Memory: Failed to save config', error);
    }
  }

  /**
   * Initialize the memory system
   */
  async init() {
    if (this.initialized) return;

    try {
      this.memoryLogger = new MemoryLogger(
  path.join(this.memoryRoot, 'logs')
);

await this.memoryLogger.init();

this.storage = new Storage(
  this.baseDir,
  this.memoryLogger
);
      this.indexer = new Indexer(this.storage);
      this.extractor = new Extractor();
      this.backup = new MemoryBackup(this.storage, this.memoryLogger);

      await this.storage.init();
      await this.indexer.init();
      await this.backup.init();

      // Start periodic tasks
      this.startBackupSchedule();
      this.startCleanupSchedule();

      this.initialized = true;
      this.memoryLogger.log('memory', 'Memory system initialized successfully');
      logInfo('Memory system initialized');
    } catch (error) {
      logError('Memory: Initialization failed', error);
      this.enabled = false;
    }
  }

  /**
   * Process an incoming or outgoing message
   */
  async observe(sock, message) {
    if (!this.enabled || !this.initialized || !this.config.listenMessages) return;

    try {
      // Add to queue for async processing
      try { this.memoryLogger.log('memory', '[MESSAGE RECEIVED]', { id: message.id, chat: message.chat, sender: message.sender, type: message.type }); } catch {}
      this.messageQueue.push({ message, timestamp: Date.now() });
      // Ensure queue processing is awaited so writes are not fire-and-forget
      await this.processQueue();
    } catch (error) {
      this.memoryLogger.error('observe', error, { messageId: message.id });
    }
  }

  /**
   * Process message queue asynchronously
   */
  async processQueue() {
    if (this.isProcessingQueue || this.messageQueue.length === 0) return;

    this.isProcessingQueue = true;
    try {
      while (this.messageQueue.length > 0) {
        const { message } = this.messageQueue.shift();
        await this._processMessage(message);
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Internal message processing
   */
  async _processMessage(message) {
    try {
      // Skip bot messages initially (can be configured)
      if (message.fromMe && !this.config.storeOwnMessages) return;

      // Extract data from message
      const extractedData = await this.extractor.extract(message);

      // Store user profile
      if (this.config.enableUserProfiles) {
        await this.storage.updateUserProfile(message.sender, extractedData);
      }

      // Store message
      const storedMessage = await this.storage.storeMessage(message, extractedData);

      // Update indexes
      if (storedMessage) {
        await this.indexer.indexMessage(storedMessage, extractedData);
      }

      // Store group information
      if (message.isGroup && this.config.enableGroupMemory) {
        await this.storage.updateGroupInfo(message.chat, message);
      }

      // Store media if configured
      if (this.config.storeMedia && extractedData.mediaInfo) {
        await this.storage.logMediaReference(message.sender, extractedData.mediaInfo);
      }

      // Update statistics
      if (this.config.enableStatistics) {
        // storage.updateStatistics is already called inside storeMessage for new messages.
        // Avoid double-counting by not calling it here.
        // kept for backward-compatibility in case storage changes.
      }
    } catch (error) {
      this.memoryLogger.error('_processMessage', error, { messageId: message.id });
    }
  }

  /**
   * Start periodic backup
   */
  startBackupSchedule() {
    if (this.backupInterval) clearInterval(this.backupInterval);
    
    this.backupInterval = setInterval(async () => {
      try {
        if (this.config.googleDriveBackup) {
          await this.backup.uploadToGoogleDrive();
        }
      } catch (error) {
        this.memoryLogger.error('backup', error);
      }
    }, this.config.backupInterval);
  }

  /**
   * Start periodic cleanup and archiving
   */
  startCleanupSchedule() {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.storage.cleanup(this.config);
      } catch (error) {
        this.memoryLogger.error('cleanup', error);
      }
    }, this.config.cleanupInterval);
  }

  /**
   * Get user profile
   */
  async getUserProfile(jid) {
    if (!this.initialized) return null;
    return this.storage.getUserProfile(jid);
  }

  /**
   * Search messages
   */
  async search(query, options = {}) {
    if (!this.initialized) return [];
    return this.indexer.search(query, options);
  }

  /**
   * Get group information
   */
  async getGroupInfo(groupId) {
    if (!this.initialized) return null;
    return this.storage.getGroupInfo(groupId);
  }

  /**
   * Get statistics
   */
  async getStatistics(type = 'daily') {
    if (!this.initialized) return null;
    return this.storage.getStatistics(type);
  }

  /**
   * Manual backup trigger
   */
  async triggerBackup() {
    if (!this.initialized) return false;
    try {
      await this.backup.uploadToGoogleDrive();
      return true;
    } catch (error) {
      this.memoryLogger.error('triggerBackup', error);
      return false;
    }
  }

  /**
   * Repair indexes if corrupted
   */
  async repairIndexes() {
    if (!this.initialized) return false;
    try {
      await this.indexer.repair();
      return true;
    } catch (error) {
      this.memoryLogger.error('repairIndexes', error);
      return false;
    }
  }

  /**
   * Export memory data
   */
  async exportData(userJid = null, format = 'json') {
    if (!this.initialized) return null;
    try {
      const data = await this.storage.export(userJid);
      if (format === 'json') return data;
      // Additional format options can be added here
      return data;
    } catch (error) {
      this.memoryLogger.error('exportData', error);
      return null;
    }
  }

  /**
   * Delete memory data (owner-only)
   */
  async deleteUserMemory(userJid) {
    if (!this.initialized) return false;
    try {
      await this.storage.deleteUser(userJid);
      await this.indexer.removeUser(userJid);
      this.memoryLogger.log('memory', `Deleted memory for user ${userJid}`);
      return true;
    } catch (error) {
      this.memoryLogger.error('deleteUserMemory', error);
      return false;
    }
  }

  /**
   * Shutdown memory system
   */
  async shutdown() {
    if (this.backupInterval) clearInterval(this.backupInterval);
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    try {
      // Attempt to drain the message queue before shutdown (bounded wait)
      const maxWaitMs = 5000;
      const pollInterval = 100;
      const start = Date.now();
      // Trigger processing if not already running
      try { await this.processQueue(); } catch (e) {}
      while ((this.messageQueue.length > 0 || this.isProcessingQueue) && (Date.now() - start) < maxWaitMs) {
        // wait a bit for queue to drain
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, pollInterval));
      }
      if (this.messageQueue.length > 0) {
        this.memoryLogger.log('memory', `Shutdown: queue not empty after ${maxWaitMs}ms, ${this.messageQueue.length} messages remaining`);
      }
      await this.backup.flush();
      this.memoryLogger.log('memory', 'Memory system shutdown');
    } catch (error) {
      logError('Memory: Shutdown error', error);
    }
  }
}

// Keep the original singleton for the existing bot.
const defaultMemory = new MemorySystem();

// Create an independent memory system for a specific account/session.
defaultMemory.createInstance = function (options = {}) {
  return new MemorySystem(options);
};

module.exports = defaultMemory;