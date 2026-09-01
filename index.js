require('dotenv').config();

const express = require('express');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const NodeCache = require('node-cache');
const {
  default: makeWASocket,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState
} = require('@whiskeysockets/baileys');

const config = require('./config');
const { ensureDatabase, readJson, writeJson, updateJson } = require('./lib/database');
const { loadCommands, watchCommands } = require('./lib/loader');
const { handleMessage } = require('./lib/handler');
const { logInfo, logError } = require('./lib/logger');
const { serializeMessage } = require('./lib/serialize');
const { backupDatabase } = require('./lib/backup');
const assistant = require('./modules/assistant');
const memory = require('./modules/memory');

const appState = {
  socket: null,
  commands: new Map(),
  aliases: new Map(),
  startedAt: Date.now(),
  status: 'starting',
  lastDisconnect: null,
  reconnects: 0,
  messages: 0,
  commandsUsed: 0
};

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'production' ? undefined : {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'SYS:standard' }
  }
});

const retryCounterCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

async function startHttpServer() {
  const app = express();
  app.disable('x-powered-by');

  app.get('/', (req, res) => {
    res.type('text').send(`${config.botName} is ${appState.status}. Uptime: ${process.uptime().toFixed(0)}s`);
  });

  app.get('/ping', (req, res) => {
    res.json({ ok: true, uptime: process.uptime(), timestamp: new Date().toISOString() });
  });

  app.get('/status', (req, res) => {
    const memory = process.memoryUsage();
    res.json({
      ok: true,
      bot: config.botName,
      mode: config.mode,
      version: config.version,
      status: appState.status,
      startedAt: new Date(appState.startedAt).toISOString(),
      uptime: process.uptime(),
      reconnects: appState.reconnects,
      messages: appState.messages,
      commandsUsed: appState.commandsUsed,
      commandsLoaded: appState.commands.size,
      memory
    });
  });

  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => logInfo(`Express status server listening on ${port}`));
}

async function startBot() {
  await ensureDatabase();

  // Initialize memory system if enabled
  if (config.memory.enabled) {
    try {
      await memory.init();
      logInfo('Memory system initialized');
    } catch (error) {
      logError('Memory system initialization failed', error);
    }
  }

  const settings = readJson('settings.json');
  writeJson('settings.json', { ...settings, startedAt: new Date().toISOString() });

  const loaded = loadCommands();
  appState.commands = loaded.commands;
  appState.aliases = loaded.aliases;
  watchCommands((next) => {
    appState.commands = next.commands;
    appState.aliases = next.aliases;
    logInfo(`Hot reload complete: ${next.commands.size} commands`);
  });

  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    browser: Browsers.ubuntu(config.botName),
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    msgRetryCounterCache: retryCounterCache,
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    shouldIgnoreJid: (jid) => jid?.endsWith('@newsletter')
  });

  appState.socket = sock;

  // initialize assistant with socket (non-blocking)
  try { assistant.init(sock).catch(()=>{}); } catch(e){}

  if (!sock.authState.creds.registered && config.loginMethod === 'pair') {
    const phoneNumber = config.pairingNumber.replace(/\D/g, '');
    if (!phoneNumber) {
      logInfo('PAIRING_NUMBER is empty; falling back to QR login.');
    } else {
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(phoneNumber);
          logInfo(`Pair code for ${phoneNumber}: ${code}`);
        } catch (error) {
          logError('Failed to request pair code', error);
        }
      }, 2500);
    }
  }

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && config.loginMethod !== 'pair') {
      logInfo('Scan this QR code with WhatsApp Linked Devices:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      appState.status = 'connected';
      appState.reconnects = 0;
      logInfo(`${config.botName} connected as ${sock.user?.id || 'unknown'}`);
    }

    if (connection === 'close') {
      appState.status = 'disconnected';
      appState.lastDisconnect = new Date().toISOString();
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      logError(`Connection closed (${statusCode || 'unknown'}). Reconnect: ${shouldReconnect}`, lastDisconnect?.error);

      if (shouldReconnect) {
        appState.reconnects += 1;
        const delay = Math.min(30000, 3000 * appState.reconnects);
        setTimeout(startBot, delay);
      } else {
        logInfo('Session logged out. Delete auth_info_baileys and login again.');
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const raw of messages) {
      const message = serializeMessage(sock, raw);
      if (!message) continue;
      appState.messages += 1;
      try { await memory.observe(sock, message); } catch(e){}
      try { await assistant.observe(sock, message); } catch(e){}
      await handleMessage(sock, message, appState);
    }
  });

  sock.ev.on('group-participants.update', async (event) => {
    const { handleGroupParticipantsUpdate } = require('./events/groupParticipants');
    await handleGroupParticipantsUpdate(sock, event);
  });

  sock.ev.on('messages.update', async (events) => {
    const { handleMessageUpdate } = require('./events/messageUpdate');
    for (const event of events) await handleMessageUpdate(sock, event);
  });

  setInterval(() => backupDatabase().catch((error) => logError('Database backup failed', error)), config.backupIntervalMs);
}

process.on('uncaughtException', (error) => {
  logError('Uncaught exception', error);
});

process.on('unhandledRejection', (error) => {
  logError('Unhandled rejection', error);
});

process.on('SIGINT', async () => {
  logInfo('Shutting down gracefully');
  try {
    await memory.shutdown();
  } catch (error) {
    logError('Memory shutdown error', error);
  }
  process.exit(0);
});

startHttpServer().catch((error) => logError('HTTP server failed', error));
startBot().catch((error) => logError('Bot startup failed', error));
