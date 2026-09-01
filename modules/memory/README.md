# Memory Module - README

This directory contains the self-learning memory system for Jackioko Bot.

## Files

- **index.js** - Main MemorySystem class that orchestrates all modules
- **storage.js** - Handles all file I/O and data persistence
- **indexer.js** - Creates and maintains searchable indexes
- **extractor.js** - Extracts metadata from messages
- **backup.js** - Handles local and Google Drive backups
- **logger.js** - Specialized logging for memory system
- **GDRIVE_SETUP.md** - Google Drive backup configuration guide

## Quick Start

The memory system is automatically initialized when the bot starts (if enabled).

### Enable in .env

```bash
MEMORY_ENABLED=true
```

### Commands

```
.memory help              # Show all commands
.memory status            # System status
.memory profile <phone>   # View user profile
.memory search <query>    # Search messages
.memory stats             # View statistics
.memory backup            # Trigger backup
```

## Configuration

See main [MEMORY_SYSTEM.md](../../MEMORY_SYSTEM.md) for complete documentation.

## Architecture

### Data Flow
```
Message → observe() → Extract → Store → Index → Log
```

### Module Interaction
```
MemorySystem (index.js)
├── Storage (storage.js)        - Persists data to disk
├── Indexer (indexer.js)        - Maintains search indexes
├── Extractor (extractor.js)    - Extracts message data
├── Backup (backup.js)          - Handles backups
└── Logger (logger.js)          - Logs events
```

## Performance

- Message processing: ~5-10ms per message
- Search: <50ms for typical queries
- Non-blocking: All operations are async

## Security

- Owner-only access to all commands
- Data stored locally by default
- No external access without explicit configuration

## Troubleshooting

### Not working?
```
.memory status              # Check status
.memory repair              # Repair indexes
```

### Check logs
```
database/memory/logs/
```

## Documentation

- Main docs: [MEMORY_SYSTEM.md](../../MEMORY_SYSTEM.md)
- Google Drive setup: [GDRIVE_SETUP.md](./GDRIVE_SETUP.md)

---

See parent documentation for complete details.
