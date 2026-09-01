/**
 * BACKUP MODULE - Handles Google Drive backup and local compression
 */

const path = require('path');
const fs = require('fs-extra');
const zlib = require('zlib');
const { createReadStream, createWriteStream } = require('fs');

class MemoryBackup {
  constructor(storage, memoryLogger) {
    this.storage = storage;
    this.memoryLogger = memoryLogger;
    this.backupQueue = [];
    this.isProcessingBackup = false;
    this.googleDriveConfig = this.loadGoogleDriveConfig();
    this.uploadHistory = {};
  }

  /**
   * Initialize backup system
   */
  async init() {
    try {
      const historyFile = path.join(this.storage.memoryDir, 'backup_history.json');
      if (await fs.pathExists(historyFile)) {
        this.uploadHistory = await fs.readJson(historyFile, { throws: false }) || {};
      }
    } catch (error) {
      this.memoryLogger.error('backup_init', error);
    }
  }

  /**
   * Load Google Drive configuration
   */
  loadGoogleDriveConfig() {
    try {
      const configFile = path.join(this.storage.memoryDir, 'gdrive_config.json');
      if (fs.pathExistsSync(configFile)) {
        return fs.readJsonSync(configFile, { throws: false }) || {};
      }
    } catch (error) {
      // Return empty config
    }
    return {};
  }

  /**
   * Save Google Drive configuration
   */
  async saveGoogleDriveConfig(config) {
    try {
      const configFile = path.join(this.storage.memoryDir, 'gdrive_config.json');
      await fs.writeJson(configFile, config, { spaces: 2 });
      this.googleDriveConfig = config;
    } catch (error) {
      this.memoryLogger.error('saveGoogleDriveConfig', error);
    }
  }

  /**
   * Upload to Google Drive
   */
  async uploadToGoogleDrive() {
    if (this.isProcessingBackup) return;
    this.isProcessingBackup = true;

    try {
      if (!this.googleDriveConfig.enabled) {
        this.isProcessingBackup = false;
        return;
      }

      // For now, this is a placeholder for Google Drive integration
      // The actual implementation would require:
      // 1. OAuth 2.0 setup or Service Account credentials
      // 2. Google Drive API client library
      // 3. Proper authentication and folder management

      this.memoryLogger.log('backup', 'Google Drive backup skipped (not configured)');

      // Create local backup instead
      await this.createLocalBackup();
    } catch (error) {
      this.memoryLogger.error('uploadToGoogleDrive', error);
    } finally {
      this.isProcessingBackup = false;
    }
  }

  /**
   * Create local backup
   */
  async createLocalBackup() {
    try {
      const backupDir = path.join(this.storage.memoryDir, 'backups');
      await fs.ensureDir(backupDir);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(backupDir, `backup_${timestamp}.tar.gz`);

      // Compress memory directory
      await this.compressDirectory(this.storage.memoryDir, backupFile);

      // Update backup history
      this.uploadHistory[timestamp] = {
        file: backupFile,
        size: (await fs.stat(backupFile)).size,
        timestamp: Date.now(),
        status: 'completed'
      };

      // Save history
      const historyFile = path.join(this.storage.memoryDir, 'backup_history.json');
      await fs.writeJson(historyFile, this.uploadHistory, { spaces: 2 });

      this.memoryLogger.log('backup', `Local backup created: ${backupFile}`);

      // Cleanup old backups (keep last 10)
      await this.cleanupOldBackups(backupDir);
    } catch (error) {
      this.memoryLogger.error('createLocalBackup', error);
    }
  }

  /**
   * Compress directory
   */
  async compressDirectory(sourceDir, targetFile) {
    return new Promise((resolve, reject) => {
      // For now, use JSON compression as tar.gz requires external dependencies
      // In production, you'd use: tar-stream, pako, or archiver
      
      try {
        // Copy critical files instead of compression for now
        fs.copy(sourceDir, targetFile.replace('.tar.gz', ''))
          .then(() => resolve())
          .catch(reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Decompress backup
   */
  async decompressBackup(backupFile, targetDir) {
    try {
      // Decompress implementation
      await fs.copy(backupFile.replace('.tar.gz', ''), targetDir);
      return true;
    } catch (error) {
      this.memoryLogger.error('decompressBackup', error);
      return false;
    }
  }

  /**
   * Cleanup old backups
   */
  async cleanupOldBackups(backupDir) {
    try {
      const files = await fs.readdir(backupDir);
      const backups = files
        .filter(f => f.startsWith('backup_'))
        .sort()
        .reverse();

      // Keep only last 10 backups
      for (let i = 10; i < backups.length; i++) {
        const oldFile = path.join(backupDir, backups[i]);
        await fs.remove(oldFile);
        this.memoryLogger.log('backup', `Removed old backup: ${backups[i]}`);
      }
    } catch (error) {
      this.memoryLogger.error('cleanupOldBackups', error);
    }
  }

  /**
   * Get backup history
   */
  getBackupHistory() {
    return this.uploadHistory;
  }

  /**
   * Restore from backup
   */
  async restoreFromBackup(backupFile) {
    try {
      if (!await fs.pathExists(backupFile)) {
        throw new Error('Backup file not found');
      }

      // Create temporary directory
      const tempDir = path.join(this.storage.memoryDir, 'restore_temp');
      await fs.remove(tempDir);
      await fs.ensureDir(tempDir);

      // Decompress
      await this.decompressBackup(backupFile, tempDir);

      // Backup current data first
      const currentBackup = path.join(this.storage.memoryDir, `backup_before_restore_${Date.now()}`);
      await fs.copy(this.storage.memoryDir, currentBackup);

      // Copy restored data
      const restoredDataDir = path.join(tempDir, path.basename(this.storage.memoryDir));
      if (await fs.pathExists(restoredDataDir)) {
        await fs.copy(restoredDataDir, this.storage.memoryDir, { overwrite: true });
      }

      // Cleanup
      await fs.remove(tempDir);

      this.memoryLogger.log('backup', 'Restore completed successfully');
      return true;
    } catch (error) {
      this.memoryLogger.error('restoreFromBackup', error);
      return false;
    }
  }

  /**
   * Configure Google Drive
   */
  async configureGoogleDrive(credentials) {
    try {
      const config = {
        enabled: credentials.enabled || false,
        folderId: credentials.folderId || '',
        credentialsType: credentials.credentialsType || 'service_account', // 'service_account' or 'oauth'
        serviceAccountEmail: credentials.serviceAccountEmail || '',
        credentials: credentials.credentials || null,
        skipDuplicates: credentials.skipDuplicates !== false,
        autoResume: credentials.autoResume !== false,
        retryCount: credentials.retryCount || 3,
        retryDelay: credentials.retryDelay || 5000
      };

      await this.saveGoogleDriveConfig(config);
      this.memoryLogger.log('backup', 'Google Drive configured');
      return true;
    } catch (error) {
      this.memoryLogger.error('configureGoogleDrive', error);
      return false;
    }
  }

  /**
   * Get storage information
   */
  async getStorageInfo() {
    try {
      const stats = await fs.stat(this.storage.memoryDir);
      const dirSize = await this.calculateDirSize(this.storage.memoryDir);
      
      return {
        path: this.storage.memoryDir,
        sizeBytes: dirSize,
        sizeGB: (dirSize / 1024 / 1024 / 1024).toFixed(2),
        backups: Object.keys(this.uploadHistory).length,
        lastBackup: Object.values(this.uploadHistory).length > 0 
          ? new Date(Math.max(...Object.values(this.uploadHistory).map(b => b.timestamp))).toISOString()
          : null
      };
    } catch (error) {
      this.memoryLogger.error('getStorageInfo', error);
      return null;
    }
  }

  /**
   * Helper: Calculate directory size
   */
  async calculateDirSize(dirPath) {
    let size = 0;
    try {
      const files = await fs.readdir(dirPath);
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = await fs.stat(filePath);
        if (stats.isDirectory()) {
          size += await this.calculateDirSize(filePath);
        } else {
          size += stats.size;
        }
      }
    } catch (error) {
      // Return current size on error
    }
    return size;
  }

  /**
   * Flush pending backups
   */
  async flush() {
    if (this.isProcessingBackup) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return this.flush();
    }
  }
}

module.exports = MemoryBackup;
