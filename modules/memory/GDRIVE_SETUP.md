# Google Drive Backup Setup Guide

This guide explains how to set up Google Drive backup for the Jackioko Bot Memory System.

## Prerequisites

- Google Cloud Platform account
- Basic knowledge of Google Cloud Console
- Bot owner access

## Option 1: Service Account (Recommended for Production)

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown at the top
3. Click "NEW PROJECT"
4. Enter project name: "Jackioko Bot Memory"
5. Click "CREATE"
6. Wait for project creation to complete

### Step 2: Enable Google Drive API

1. In the Google Cloud Console, go to "APIs & Services" > "Library"
2. Search for "Google Drive API"
3. Click on it and click "ENABLE"
4. Wait for enablement to complete

### Step 3: Create Service Account

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "Service Account"
3. Fill in the form:
   - Service account name: `jackioko-bot-memory`
   - Service account ID: (auto-filled)
   - Description: "Memory backup service for Jackioko Bot"
4. Click "CREATE AND CONTINUE"
5. Skip optional steps and click "DONE"

### Step 4: Create and Download Key

1. In the Credentials page, find your service account
2. Click on the service account name
3. Go to the "KEYS" tab
4. Click "Add Key" > "Create new key"
5. Select "JSON" and click "CREATE"
6. A JSON file downloads automatically
7. Save this file somewhere secure

### Step 5: Create Backup Folder in Google Drive

1. Go to [Google Drive](https://drive.google.com)
2. Create a new folder called "Jackioko Bot Backups"
3. Right-click the folder and select "Share"
4. Copy the folder ID from the URL: `https://drive.google.com/drive/folders/FOLDER_ID`

### Step 6: Grant Access to Service Account

1. In the share dialog, paste the service account email from the JSON file
2. Grant "Editor" permissions
3. Uncheck "Notify people" (service account doesn't need notifications)
4. Click "Share"

### Step 7: Configure Memory System

1. Copy the JSON key contents
2. Run this command in WhatsApp:
```
.memory config googleDrive <paste_entire_json>
```

Or manually create `database/memory/gdrive_config.json`:

```json
{
  "enabled": true,
  "folderId": "YOUR_FOLDER_ID",
  "credentialsType": "service_account",
  "serviceAccountEmail": "your-service-account@project.iam.gserviceaccount.com",
  "credentials": {
    "type": "service_account",
    "project_id": "your-project-id",
    "private_key_id": "key-id",
    "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
    "client_email": "service-account@project.iam.gserviceaccount.com",
    "client_id": "123456789",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/..."
  },
  "skipDuplicates": true,
  "autoResume": true,
  "retryCount": 3,
  "retryDelay": 5000
}
```

### Step 8: Enable Backup

In WhatsApp with the bot:
```
.memory config googleDriveBackup true
```

Verify it's working:
```
.memory status
```

## Option 2: OAuth 2.0 (For User Account)

### Step 1-2: Same as Service Account

Create project and enable Google Drive API as above.

### Step 3: Create OAuth 2.0 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. Choose "Desktop application"
4. Click "CREATE"
5. Download the JSON file

### Step 4: Configuration

Create `database/memory/gdrive_config.json`:

```json
{
  "enabled": true,
  "folderId": "YOUR_FOLDER_ID",
  "credentialsType": "oauth",
  "credentials": {
    "installed": {
      "client_id": "your-client-id.apps.googleusercontent.com",
      "project_id": "your-project-id",
      "auth_uri": "https://accounts.google.com/o/oauth2/auth",
      "token_uri": "https://oauth2.googleapis.com/token",
      "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
      "client_secret": "your-client-secret",
      "redirect_uris": ["http://localhost"]
    }
  },
  "skipDuplicates": true,
  "autoResume": true
}
```

### Step 5: First-Time Authentication

1. The bot will provide an authentication URL
2. Open the URL in a browser
3. Grant permissions
4. Copy the authorization code
5. Paste back into the bot

## Configuration Options

```json
{
  "enabled": true,                    // Enable/disable backups
  "folderId": "...",                 // Google Drive folder ID
  "credentialsType": "service_account", // or "oauth"
  "skipDuplicates": true,            // Skip already uploaded files
  "autoResume": true,                // Resume interrupted uploads
  "retryCount": 3,                   // Number of retry attempts
  "retryDelay": 5000                 // Delay between retries (ms)
}
```

## Troubleshooting

### "Authentication failed"
- Verify credentials JSON is valid
- Check service account has Editor access to folder
- Verify folder ID is correct

### "Upload timeout"
- Check internet connection
- Reduce backup size with `MEMORY_ARCHIVE_DAYS`
- Increase retry delay: `"retryDelay": 10000`

### "Folder not found"
- Verify folder ID in URL
- Ensure service account has access
- Check folder still exists

### "Drive quota exceeded"
- Delete old backups from Google Drive
- Reduce backup frequency: `MEMORY_BACKUP_INTERVAL=3600000` (1 hour)

## Monitoring Backups

Check backup status:
```
.memory status
```

View backup history:
```
database/memory/backup_history.json
```

View upload logs:
```
database/memory/logs/uploads_YYYY-MM-DD.json
```

## Security Best Practices

1. **Secure the JSON Key**
   - Never commit to git
   - Use `.gitignore` to exclude credentials
   - Store in secure location only

2. **Restrict Permissions**
   - Service account should only have access to backup folder
   - Disable if not using Google Drive backup

3. **Monitor Activity**
   - Check upload logs regularly
   - Verify backups are creating successfully

4. **Rotate Keys**
   - Generate new keys periodically
   - Delete old keys after rotation

## Disabling Google Drive Backup

To disable Google Drive backup:

```
.memory config googleDriveBackup false
```

Or delete `database/memory/gdrive_config.json`

Local backups will continue working.

## Testing Backup

To test your configuration:

```
.memory backup
```

Check:
1. No errors in logs
2. Backup appears in Google Drive folder
3. Backup history updated

## Restoring from Google Drive

To restore from a Google Drive backup:

1. Download the backup file from Google Drive
2. Stop the bot
3. Replace `database/memory/` contents
4. Restart bot

## Size Considerations

- Average backup: 5-50 MB per month (depends on message volume)
- Google Drive free tier: 15 GB
- Enterprise tier: Unlimited

For high-volume bots, consider:
- Increasing `MEMORY_ARCHIVE_DAYS`
- Compressing backups
- Upgrading Google Drive storage

## Advanced Configuration

### Custom Backup Interval

Set in `.env`:
```
MEMORY_BACKUP_INTERVAL=1800000  # 30 minutes
```

Or at runtime:
```
.memory config backupInterval 1800000
```

### Backup Retention Policy

Only last 10 backups are kept locally. Google Drive keeps all uploads by default. To manage:

1. Manually delete old backups from folder
2. Implement server-side retention policy
3. Use Google Drive storage lifecycle rules

## Support

For Google Drive API issues:
- Check [Google Drive API Documentation](https://developers.google.com/drive)
- Review error logs in `database/memory/logs/`
- Contact Google Cloud support

For Jackioko Bot memory system issues:
- Check main memory system documentation
- Run `.memory repair`
- Check system status: `.memory status`

---

**Note**: Google Drive backup is optional. Local backups work independently.
