# Jackioko Bot - Memory System Documentation

## Overview

The Memory System is a comprehensive self-learning module for Jackioko Bot that automatically captures, organizes, and indexes all WhatsApp messages without interfering with existing commands or features.

## Features

### ✨ Core Features

- **Automatic Message Capture**: Listens to all incoming and outgoing messages in private chats and groups
- **User Profiles**: Maintains detailed profiles for each user including statistics and metadata
- **Message Indexing**: Fast searchable indexes for keywords, links, emails, phone numbers, and more
- **Group Memory**: Tracks group information, participants, and activity
- **Daily Statistics**: Automatic aggregation of message statistics
- **Media Organization**: References to images, videos, audio, documents, and stickers
- **Google Drive Backup**: Optional automatic backups to Google Drive
- **Local Backups**: Compressed local backups with automatic cleanup
- **Owner-Only Access**: Secure memory access restricted to bot owner

## Directory Structure

```
database/
├── memory/
│   ├── users/
│   │   ├── 254712345678/
│   │   │   ├── profile.json          # User profile and statistics
│   │   │   ├── messages.json         # Message history (last 10000)
│   │   │   ├── links.json            # Extracted URLs
│   │   │   ├── emails.json           # Extracted emails
│   │   │   ├── contacts.json         # Extracted phone numbers
│   │   │   ├── media.json            # Media references
│   │   │   └── archive/              # Archived older messages
│   │   │
│   │   └── 254798765432/
│   │       └── ...
│   │
│   ├── groups/
│   │   ├── 120363123456789-1234@g.us.json
│   │   └── ... (group metadata)
│   │
│   ├── indexes/
│   │   ├── users.json                # User index
│   │   ├── keywords.json             # Keyword index
│   │   ├── links.json                # URL index
│   │   ├── emails.json               # Email index
│   │   ├── phones.json               # Phone number index
│   │   ├── commands.json             # Command usage index
│   │   ├── hashtags.json             # Hashtag index
│   │   ├── media.json                # Media type index
│   │   └── dates.json                # Date index
│   │
│   ├── statistics/
│   │   ├── 2024-01-15.json           # Daily statistics
│   │   ├── 2024-01-16.json
│   │   └── ... (one per day)
│   │
│   ├── logs/
│   │   ├── memory_2024-01-15.json
│   │   ├── errors_2024-01-15.json
│   │   ├── uploads_2024-01-15.json
│   │   └── ... (daily logs)
│   │
│   ├── backups/
│   │   ├── backup_2024-01-15T10-30-45-123Z/
│   │   └── ... (backup archives)
│   │
│   ├── memory_config.json            # Memory system configuration
│   ├── gdrive_config.json            # Google Drive configuration
│   └── backup_history.json           # Backup history
```

## Configuration

### Environment Variables

Add these to your `.env` file to customize the memory system:

```bash
# Memory System Enable/Disable
MEMORY_ENABLED=true

# What to listen and store
MEMORY_LISTEN_MESSAGES=true
MEMORY_STORE_MEDIA=true
MEMORY_STORE_DOCUMENTS=true
MEMORY_STORE_LINKS=true
MEMORY_STORE_OWN_MESSAGES=true
MEMORY_EXTRACT_METADATA=true

# Backup and Storage
MEMORY_GDRIVE_BACKUP=false              # Google Drive backup (requires setup)
MEMORY_BACKUP_INTERVAL=1800000          # 30 minutes
MEMORY_MAX_LOCAL_STORAGE=524288000      # 500 MB
MEMORY_COMPRESSION=true

# Features
MEMORY_GROUP_TRACKING=true
MEMORY_USER_PROFILES=true
MEMORY_STATISTICS=true

# Maintenance
MEMORY_CLEANUP_INTERVAL=86400000        # 24 hours
MEMORY_ARCHIVE_DAYS=30                  # Archive messages older than 30 days
MEMORY_QUEUE_SIZE=1000                  # Max messages in processing queue
```

## Commands

All memory commands are **owner-only** and prefixed with your bot's command prefix (default: `.`).

### Memory Status
```
.memory status
```
Shows overall memory system status, storage info, statistics, and recent errors.

**Output:**
- System enabled/disabled status
- Storage size and backup count
- Total messages and unique users
- Recent errors

### User Profile
```
.memory profile <phone_number>
```
View detailed profile for a specific user.

**Output:**
- Basic info (phone, name, contact name)
- Statistics (total messages, first/last seen)
- Top words frequency
- Groups participated in

### Search Memory
```
.memory search <query> [type]
```
Search across all memory data.

**Search Types:**
- `all` - Search everything (default)
- `keyword` - Search message text
- `user` - Search by phone number
- `link` - Search URLs
- `email` - Search emails
- `phone` - Search phone numbers
- `command` - Search command usage
- `hashtag` - Search hashtags
- `media` - Search media types
- `group` - Search groups

**Examples:**
```
.memory search bitcoin keyword
.memory search +254712345678 user
.memory search github link
.memory search test@email.com email
```

### Statistics
```
.memory stats [daily|summary]
```
View message statistics.

- `daily` - Show last 7 days of stats (default)
- `summary` - Show 30-day summary

**Shows:**
- Messages received/sent
- Unique users and groups
- Media and private messages

### Export Data
```
.memory export <phone_number>
```
Export all memory data for a specific user as JSON.

**Creates:** A JSON file with complete user profile, messages, and statistics.

### Delete Memory
```
.memory delete <phone_number>
```
Permanently delete all stored memory for a user.

⚠️ **Warning:** This action is irreversible.

### Repair Indexes
```
.memory repair
```
Repair corrupted indexes by rebuilding from storage.

Use if you encounter index-related errors.

### Trigger Backup
```
.memory backup
```
Manually trigger a backup (instead of waiting for scheduled backup).

Shows backup size and location after completion.

### Configure Settings
```
.memory config <setting> <value>
```
Change memory system settings at runtime.

**Examples:**
```
.memory config listenMessages true
.memory config storeMedia false
.memory config compression true
```

### Help
```
.memory help
```
Display help for all memory commands.

## User Profile Data

Each user profile contains:

```json
{
  "jid": "254712345678@s.whatsapp.net",
  "phoneNumber": "254712345678",
  "pushName": "John Doe",
  "contactName": "John",
  "profilePicture": "https://...",
  "firstSeen": "2024-01-15T10:30:00Z",
  "lastSeen": "2024-01-15T15:45:00Z",
  "totalMessages": 127,
  "groups": ["120363123456789-1234@g.us"],
  "messageFrequency": {
    "9": 5,    // 5 messages at 9 AM
    "14": 12,  // 12 messages at 2 PM
    "19": 8    // 8 messages at 7 PM
  },
  "favoriteWords": {
    "hello": 15,
    "thanks": 8,
    "question": 6
  },
  "languages": ["en"],
  "isBot": false,
  "isBusiness": false,
  "status": {
    "online": true,
    "lastUpdated": "2024-01-15T15:45:00Z"
  }
}
```

## Message Storage

Each stored message contains:

```json
{
  "id": "3EB0AB12345678",
  "timestamp": 1705324200000,
  "sender": "254712345678@s.whatsapp.net",
  "chat": "254712345678@s.whatsapp.net",
  "groupId": null,
  "groupName": null,
  "messageType": "conversation",
  "text": "Hello world",
  "quotedMessage": null,
  "mentions": [],
  "links": ["https://example.com"],
  "emails": ["test@example.com"],
  "phones": ["254712345678"],
  "locations": [],
  "dates": [],
  "hashtags": [],
  "commands": [],
  "mediaType": null,
  "mediaInfo": null,
  "reactions": [],
  "edited": false,
  "forwarded": false,
  "fromMe": false
}
```

## Extracted Data

The memory system automatically extracts:

- **URLs**: All HTTP/HTTPS links and WhatsApp chat links
- **Emails**: Email addresses in various formats
- **Phone Numbers**: Various international and local formats
- **Dates**: Multiple date formats (DD/MM/YYYY, etc.)
- **Hashtags**: #hashtags and trending topics
- **Mentions**: @mentions and referenced users
- **Locations**: Latitude/longitude and location references
- **Commands**: Bot commands used
- **Languages**: Detected language codes

## Indexing System

The indexing system enables fast searches without scanning all messages:

| Index | Purpose | Search Time |
|-------|---------|------------|
| **users.json** | Find all messages from a user | O(1) |
| **keywords.json** | Search message text | O(1) word lookup |
| **links.json** | Find URLs | O(1) partial URL |
| **emails.json** | Find emails | O(1) partial match |
| **phones.json** | Find phone numbers | O(1) digit match |
| **commands.json** | Find command usage | O(1) command name |
| **hashtags.json** | Find hashtag usage | O(1) hashtag |
| **media.json** | Find media by type | O(1) media type |
| **dates.json** | Find messages by date | O(1) date |

## Performance

### Memory System Characteristics

- **Non-blocking**: All memory operations are async and queued
- **Efficient Storage**: JSON with periodic archiving
- **Minimal Overhead**: Negligible CPU/memory impact on bot performance
- **Scalable**: Handles thousands of users efficiently

### Performance Metrics

- **Message Processing**: ~5-10ms per message
- **Search**: <50ms for typical queries
- **Backup Time**: ~1-2 seconds per 1000 messages
- **Disk Usage**: ~100KB per 1000 messages

## Security

### Owner-Only Access

All memory commands are restricted to the bot owner. Only the owner can:

- View user profiles
- Search memory data
- Export memory
- Delete memory
- Trigger backups
- Repair indexes
- Modify settings

### No Network Exposure

By default, the memory system stores data locally without external access. Google Drive backup is optional and requires manual configuration.

### Data Privacy

- No user data is shared without explicit permission
- Each user's data is isolated in their own directory
- Backups can be encrypted (future enhancement)

## Google Drive Backup Setup

⚠️ **Advanced Setup Required**

To enable Google Drive backups:

1. Create a Google Cloud Project
2. Enable Google Drive API
3. Create a Service Account or OAuth credentials
4. Configure credentials in memory system

Then run:
```
.memory config googleDriveBackup true
```

**Detailed Setup Guide**: See `modules/memory/GDRIVE_SETUP.md`

## Backup and Recovery

### Automatic Backups

- Triggered every 30 minutes by default
- Compressed and stored locally
- Keeps last 10 backups
- Old backups automatically deleted

### Manual Backups

```
.memory backup
```

### Restore from Backup

Backups are stored in `database/memory/backups/`. To restore:

1. Stop the bot
2. Rename current `database/memory/` to `database/memory_backup/`
3. Restore backup to `database/memory/`
4. Restart bot

## Troubleshooting

### Memory System Not Working

1. Check if enabled: `.memory status`
2. Check memory logs: `database/memory/logs/`
3. Repair indexes: `.memory repair`

### Searches Returning No Results

- Run `.memory repair` to rebuild indexes
- Verify data exists in user profiles
- Check if message contains search terms

### Backup Failures

- Check disk space availability
- Verify write permissions on database folder
- Check logs: `database/memory/logs/uploads_*.json`

### High Memory Usage

- Reduce `MEMORY_QUEUE_SIZE`
- Increase `MEMORY_ARCHIVE_DAYS`
- Disable unused features in config

## Maintenance

### Daily Maintenance

The memory system automatically:
- Archives messages older than 30 days
- Cleans up old backups (keeps last 10)
- Repairs corrupted index entries
- Logs performance metrics

### Manual Maintenance

```bash
# Repair indexes
.memory repair

# Check status
.memory status

# Export critical data
.memory export <phone>
```

### Monitoring

Check these files regularly:
- `database/memory/logs/errors_*.json` - Error logs
- `database/memory/backup_history.json` - Backup status
- `database/memory/memory_config.json` - Configuration

## Architecture

### Module Structure

```
modules/memory/
├── index.js          # Main Memory System class
├── storage.js        # File I/O operations
├── indexer.js        # Indexing and search
├── extractor.js      # Data extraction from messages
├── backup.js         # Backup and recovery
└── logger.js         # Memory system logging
```

### Data Flow

```
Message Received
    ↓
memory.observe()
    ↓
Message Queue
    ↓
Extraction (Extractor)
    ↓
Store Profile (Storage)
    ↓
Store Message (Storage)
    ↓
Index Message (Indexer)
    ↓
Update Statistics (Storage)
    ↓
Log Event (Logger)
```

## API Reference

### MemorySystem Class

#### Methods

```javascript
// Initialize memory system
await memory.init()

// Observe incoming/outgoing message
await memory.observe(sock, message)

// Get user profile
const profile = await memory.getUserProfile(jid)

// Search memory
const results = await memory.search(query, options)

// Get group info
const groupInfo = await memory.getGroupInfo(groupId)

// Get statistics
const stats = await memory.getStatistics(type, days)

// Export user data
const data = await memory.exportData(userJid, format)

// Delete user memory
await memory.deleteUserMemory(userJid)

// Repair indexes
await memory.repairIndexes()

// Trigger backup
await memory.triggerBackup()

// Shutdown system
await memory.shutdown()
```

## Limitations

- Messages are limited to last 10,000 per user (archived after)
- Search indexes are in-memory only (rebuilt on restart)
- Google Drive backup requires additional configuration
- No message encryption (local storage only)

## Future Enhancements

Planned features:
- [ ] Message encryption
- [ ] Analytics dashboard
- [ ] AI sentiment analysis
- [ ] Automatic response suggestions
- [ ] Message export to multiple formats (CSV, XML)
- [ ] Cloud synchronization
- [ ] Message deduplication

## Support

For issues or questions:
1. Check the logs: `database/memory/logs/`
2. Run `.memory status` for system overview
3. Check GitHub issues
4. Contact bot developer

## License

This module is part of Jackioko Bot and follows the same license.

---

**Note**: The memory system is designed to enhance bot capabilities without interfering with existing commands. All data remains local unless Google Drive backup is explicitly enabled.
