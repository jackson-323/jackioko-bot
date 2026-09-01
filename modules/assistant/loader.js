const assistant = require('./index');

async function start() {
  try {
    await assistant.init();
    console.log('[assistant] initialized');
  } catch (e) {
    console.error('[assistant] loader init error', e);
  }
}

start().catch(()=>{});

module.exports = start;
