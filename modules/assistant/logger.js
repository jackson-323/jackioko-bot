const fs = require('fs-extra');
const path = require('path');

const DB = path.join(__dirname, '..', '..', 'database');
const LOG = path.join(DB, 'assistant_log.json');

async function ensure(){
  await fs.ensureDir(DB);
  if (!await fs.pathExists(LOG)) await fs.writeJson(LOG, [], { spaces: 2 });
}

async function logAutoReply(entry){
  const arr = await fs.readJson(LOG).catch(()=>[]);
  arr.unshift(Object.assign({ at: Date.now() }, entry));
  await fs.writeJson(LOG, arr.slice(0, 1000), { spaces: 2 });
}

async function notifyOwner(details){
  await logAutoReply(details).catch(()=>{});
}

module.exports = { ensure, logAutoReply, notifyOwner };
