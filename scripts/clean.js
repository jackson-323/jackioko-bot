const fs = require('fs-extra');
const path = require('path');
const root = path.join(__dirname, '..');
for (const dir of ['logs']) fs.emptyDirSync(path.join(root, dir));
console.log('Cleaned generated logs.');
