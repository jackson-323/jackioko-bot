try {
  require('./modules/assistant');
  require('./commands/assistant');
  console.log('assistant modules and commands loaded successfully');
  process.exit(0);
} catch (e) {
  console.error('load error', e);
  process.exit(2);
}
