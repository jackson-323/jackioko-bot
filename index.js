require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const authRoutes = require('./web/routes/auth');
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

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Login sessions
  app.use(
    session({
      secret:
        process.env.SESSION_SECRET ||
        'techword-md-development-secret',

      resave: false,
      saveUninitialized: false,

      cookie: {
        httpOnly: true,
        secure: false,
        maxAge: 1000 * 60 * 60 * 24
      }
    })
  );

  // Authentication API
  app.use('/api/auth', authRoutes);

  // ================================
  // WhatsApp Pairing
  // ================================
  app.post('/api/whatsapp/pair', async (req, res) => {
    try {
      // User must be logged in
      if (!req.session.userId) {
        return res.status(401).json({
          success: false,
          message: 'You must be logged in.'
        });
      }

      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({
          success: false,
          message: 'WhatsApp phone number is required.'
        });
      }

      const number = String(phoneNumber).replace(/\D/g, '');

      if (number.length < 10 || number.length > 15) {
        return res.status(400).json({
          success: false,
          message:
            'Enter a valid WhatsApp phone number with country code.'
        });
      }

      // Make sure the bot socket exists
      if (!appState.socket) {
        return res.status(503).json({
          success: false,
          message: 'WhatsApp socket is not ready yet.'
        });
      }

      // Current WhatsApp session is already registered
      if (appState.socket.authState?.creds?.registered) {
        return res.status(409).json({
          success: false,
          message:
            'This WhatsApp session is already registered. A new number cannot be paired into the current session.'
        });
      }

      const code =
        await appState.socket.requestPairingCode(number);

      logInfo(
        `Pairing code requested by web user ${req.session.username}`
      );

      return res.json({
        success: true,
        pairingCode: code
      });

    } catch (error) {
      logError(
        'Web WhatsApp pairing failed',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Failed to generate WhatsApp pairing code.'
      });
    }
  });

  // ================================
  // WhatsApp Connection Status
  // ================================
  app.get('/api/whatsapp/status', (req, res) => {
    // User must be logged in
    if (!req.session.userId) {
      return res.status(401).json({
        success: false,
        message: 'You must be logged in.'
      });
    }

    const socket = appState.socket;

    return res.json({
      success: true,
      status: appState.status,
      connected: appState.status === 'connected',
      number:
        socket?.user?.id
          ?.split(':')[0]
          ?.split('@')[0] || null
    });
  });

  // ================================
  // Website
  // ================================
  app.use(
    express.static(
      path.join(__dirname, 'web', 'public')
    )
  );

  // ================================
  // Health Check
  // ================================
  app.get('/api/health', (req, res) => {
    return res.json({
      success: true,
      service: 'TECHWORD-MD Web',
      status: appState.status
    });
  });

  // ================================
  // Existing Bot Status
  // ================================
  app.get('/status', (req, res) => {
    const memoryUsage = process.memoryUsage();

    return res.json({
      ok: true,
      bot: config.botName,
      mode: config.mode,
      version: config.version,
      status: appState.status,
      startedAt:
        new Date(appState.startedAt).toISOString(),
      uptime: process.uptime(),
      reconnects: appState.reconnects,
      messages: appState.messages,
      commandsUsed: appState.commandsUsed,
      commandsLoaded: appState.commands.size,
      memory: memoryUsage
    });
  });

  // ================================
  // Ping
  // ================================
  app.get('/ping', (req, res) => {
    return res.json({
      ok: true,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

  // ================================
  // Start Web Server
  // ================================
  const port = Number(
    process.env.PORT ||
    process.env.WEB_PORT ||
    3000
  );

  app.listen(port, () => {
    logInfo(
      `TECHWORD-MD web/status server listening on ${port}`
    );
  });
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
