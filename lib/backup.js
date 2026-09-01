const path = require('path');
const fs = require('fs-extra');
const config = require('../config');

async function backupDatabase() {
  const backupDir = path.join(config.databaseDir, 'backups');
  await fs.ensureDir(backupDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const file of ['users.json', 'groups.json', 'settings.json']) {
    const source = path.join(config.databaseDir, file);
    if (await fs.pathExists(source)) {
      await fs.copy(source, path.join(backupDir, `${stamp}-${file}`));
    }
  }
}

module.exports = { backupDatabase };
