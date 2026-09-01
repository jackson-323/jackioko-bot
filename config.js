const path = require('path');
require('dotenv').config();

const numberList = (value = '') => value.split(',').map((item) => item.replace(/\D/g, '')).filter(Boolean);
const bool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

module.exports = {
  botName: process.env.BOT_NAME || 'JACKIOKO TEC',
  ownerName: process.env.OWNER_NAME || 'JACKIOKO TEC',
  ownerNumber: (process.env.OWNER_NUMBER || '').replace(/\D/g, ''),
  prefix: process.env.PREFIX || '.',
  timezone: process.env.TIMEZONE || 'Africa/Nairobi',
  packname: process.env.PACKNAME || 'JACKIOKO TEC',
  author: process.env.AUTHOR || 'JACKIOKO TEC',
  footer: process.env.FOOTER || 'JACKIOKO TEC\n\nBuilding the Future of WhatsApp Bots',
  thumbnail: process.env.THUMBNAIL || '',
  version: '2.0',
  mode: process.env.MODE || 'public',
  loginMethod: (process.env.LOGIN_METHOD || 'qr').toLowerCase(),
  pairingNumber: process.env.PAIRING_NUMBER || process.env.OWNER_NUMBER || '',
  authDir: path.join(__dirname, 'auth_info_baileys'),
  commandDir: path.join(__dirname, 'commands'),
  databaseDir: path.join(__dirname, 'database'),
  logsDir: path.join(__dirname, 'logs'),
  mediaDir: path.join(__dirname, 'media'),
  admins: numberList(process.env.ADMINS || process.env.OWNER_NUMBER || ''),
  autoRead: bool(process.env.AUTO_READ, true),
  autoReact: bool(process.env.AUTO_REACT, false),
  autoTyping: bool(process.env.AUTO_TYPING, false),
  autoRecording: bool(process.env.AUTO_RECORDING, false),
  autoViewStatus: bool(process.env.AUTO_VIEW_STATUS, true),
  autoLikeStatus: bool(process.env.AUTO_LIKE_STATUS, false),
  autoSaveContacts: bool(process.env.AUTO_SAVE_CONTACTS, false),
  backupIntervalMs: Number(process.env.BACKUP_INTERVAL_MS || 15 * 60 * 1000),
  cooldownMs: Number(process.env.DEFAULT_COOLDOWN_MS || 3000),
  spam: {
    windowMs: Number(process.env.SPAM_WINDOW_MS || 10000),
    maxMessages: Number(process.env.SPAM_MAX_MESSAGES || 8),
    blockMs: Number(process.env.SPAM_BLOCK_MS || 30000)
  },
  apiKeys: {
    openai: process.env.OPENAI_API_KEY || '',
    weather: process.env.WEATHER_API_KEY || '',
    news: process.env.NEWS_API_KEY || '',
    bitly: process.env.BITLY_TOKEN || ''
  },
  // Memory System Configuration
  memory: {
    enabled: bool(process.env.MEMORY_ENABLED, true),
    listenMessages: bool(process.env.MEMORY_LISTEN_MESSAGES, true),
    storeMedia: bool(process.env.MEMORY_STORE_MEDIA, true),
    storeDocuments: bool(process.env.MEMORY_STORE_DOCUMENTS, true),
    storeLinks: bool(process.env.MEMORY_STORE_LINKS, true),
    storeOwnMessages: bool(process.env.MEMORY_STORE_OWN_MESSAGES, true),
    extractMetadata: bool(process.env.MEMORY_EXTRACT_METADATA, true),
    googleDriveBackup: bool(process.env.MEMORY_GDRIVE_BACKUP, false),
    backupInterval: Number(process.env.MEMORY_BACKUP_INTERVAL || 30 * 60 * 1000), // 30 minutes
    maxLocalStorage: Number(process.env.MEMORY_MAX_LOCAL_STORAGE || 500 * 1024 * 1024), // 500 MB
    compression: bool(process.env.MEMORY_COMPRESSION, true),
    enableGroupMemory: bool(process.env.MEMORY_GROUP_TRACKING, true),
    enableUserProfiles: bool(process.env.MEMORY_USER_PROFILES, true),
    enableStatistics: bool(process.env.MEMORY_STATISTICS, true),
    cleanupInterval: Number(process.env.MEMORY_CLEANUP_INTERVAL || 24 * 60 * 60 * 1000), // 24 hours
    archiveOldMessages: Number(process.env.MEMORY_ARCHIVE_DAYS || 30), // Archive messages older than 30 days
    maxMemoryQueueSize: Number(process.env.MEMORY_QUEUE_SIZE || 1000)
  }
};
