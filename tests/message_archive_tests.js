const assert = require('assert');
const { serializeMessage } = require('../lib/serialize');
const Storage = require('../modules/memory/storage');
const Extractor = require('../modules/memory/extractor');
const fs = require('fs-extra');
const path = require('path');

async function run() {
  const base = path.join(__dirname, '..', 'database');
  const storage = new Storage(base, console);
  await storage.init();
  const extractor = new Extractor();

  const samples = [
    { raw: { key: { id: 't1', remoteJid: '123@s.whatsapp.net' }, message: { conversation: 'ok' } }, expect: 'ok' },
    { raw: { key: { id: 't2', remoteJid: '123@s.whatsapp.net' }, message: { conversation: '.menu' } }, expect: '.menu' },
    { raw: { key: { id: 't3', remoteJid: '123@s.whatsapp.net' }, message: { extendedTextMessage: { text: 'a link https://example.com' } } }, expect: 'a link https://example.com' }
  ];

  for (const s of samples) {
    const msg = serializeMessage({ user: { id: 'me@s.whatsapp.net' } }, s.raw);
    assert(msg, 'serialize failed');
    const extracted = await extractor.extract(msg);
    const stored = await storage.storeMessage(msg, extracted);
    assert(stored, 'store failed');
    console.log('[TEST ARCHIVED]', stored.id);
  }

  console.log('Basic tests passed');
}

run().catch((e) => { console.error('Tests failed', e); process.exit(1); });
