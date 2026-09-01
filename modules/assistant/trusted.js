const fs = require('fs-extra');
const path = require('path');

const DB = path.join(__dirname, '..', '..', 'database');
const FILE = path.join(DB, 'trusted.json');

async function ensure(){
  await fs.ensureDir(DB);
  if (!await fs.pathExists(FILE)) {
    await fs.writeJson(FILE, [], { spaces: 2 });
  }
}

async function list(){
  return await fs.readJson(FILE).catch(()=>[]);
}

async function add(jid, meta){
  const arr = await list();
  if (!arr.find(x=>x.jid===jid)) arr.push(Object.assign({ jid }, meta || {}));
  await fs.writeJson(FILE, arr, { spaces: 2 });
}

async function remove(jid){
  let arr = await list();
  arr = arr.filter(x=>x.jid!==jid);
  await fs.writeJson(FILE, arr, { spaces: 2 });
}

async function isTrusted(jid){
  const arr = await list();
  return !!arr.find(x=>x.jid===jid);
}

module.exports = { ensure, list, add, remove, isTrusted };
