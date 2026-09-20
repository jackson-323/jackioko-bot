const path = require('path');
const fs = require('fs-extra');
const QRCode = require('qrcode');

const {
    default: makeWASocket,
    DisconnectReason,
    Browsers,
    fetchLatestBaileysVersion,
    fetchLatestWaWebVersion,
    makeCacheableSignalKeyStore,
    useMultiFileAuthState
} = require('@whiskeysockets/baileys');

const pino = require('pino');

const memory = require('../../modules/memory');
const { serializeMessage } = require('../../lib/serialize');
const { logInfo, logError } = require('../../lib/logger');

const ACTIVE_STATUSES = new Set([
    'waiting',
    'qr',
    'connecting',
    'connected'
]);

class WhatsAppSessionManager {
    constructor() {
        this.sessions = new Map();
        this.creatingUsers = new Set();

        this.sessionsDir = path.join(
            process.cwd(),
            'database',
            'whatsapp_sessions'
        );

        this.memoryDir = path.join(
            process.cwd(),
            'database',
            'memory',
            'accounts'
        );
    }

    async init() {
        await fs.ensureDir(this.sessionsDir);
        await fs.ensureDir(this.memoryDir);

        logInfo(
            'WhatsApp multi-user session manager initialized'
        );
    }

    getSession(userId) {
        return this.sessions.get(String(userId)) || null;
    }

    getSessionStatus(userId) {
        const session =
            this.sessions.get(String(userId)) || null;

        if (!session) {
            return {
                exists: false,
                status: 'disconnected',
                connected: false,
                number: null,
                qr: null
            };
        }

        return {
            exists: true,
            status: session.status,
            connected: session.status === 'connected',
            number: session.number || null,
            qr: session.qr || null
        };
    }

    async resolveWaVersion() {
        try {
            const result = await fetchLatestWaWebVersion();

            if (result?.version) {
                logInfo(
                    `Using WhatsApp Web version ${result.version.join('.')}`
                );

                return result.version;
            }
        } catch (error) {
            logError(
                'Failed to fetch WhatsApp Web version, falling back to Baileys default',
                error
            );
        }

        const fallback = await fetchLatestBaileysVersion();

        logInfo(
            `Using Baileys fallback version ${fallback.version.join('.')}`
        );

        return fallback.version;
    }

    async sanitizeIncompleteAuth(authDir) {
        const credsPath = path.join(authDir, 'creds.json');

        if (!(await fs.pathExists(credsPath))) {
            return false;
        }

        let creds;

        try {
            creds = await fs.readJson(credsPath);
        } catch (error) {
            logError(
                'Unreadable web WhatsApp creds file; clearing auth directory',
                error
            );

            await fs.emptyDir(authDir);

            return true;
        }

        const hasMe = Boolean(creds?.me?.id);
        const hasAccount = Boolean(creds?.account);
        const hasPairingCode = Boolean(creds?.pairingCode);

        const incomplete =
            hasPairingCode ||
            (hasMe && !hasAccount);

        if (!incomplete) {
            return false;
        }

        logInfo(
            'Clearing incomplete web WhatsApp auth state for fresh QR login'
        );

        await fs.emptyDir(authDir);

        return true;
    }

    async clearAuthDir(authDir) {
        await fs.ensureDir(authDir);
        await fs.emptyDir(authDir);
    }

    async destroySocket(session, { logout = false } = {}) {
        if (!session?.socket) {
            return;
        }

        const socket = session.socket;

        session.socket = null;

        try {
            socket.ev.removeAllListeners('connection.update');
            socket.ev.removeAllListeners('creds.update');
            socket.ev.removeAllListeners('messages.upsert');
        } catch {}

        try {
            if (logout) {
                await socket.logout();
            } else {
                await socket.ws?.close();
            }
        } catch {}
    }

    scheduleReconnect(userId, delayMs = 3000) {
        const session = this.sessions.get(String(userId));

        if (!session || session.stopping) {
            return;
        }

        if (session.reconnectTimer) {
            clearTimeout(session.reconnectTimer);
        }

        session.status = 'connecting';
        session.qr = null;

        session.reconnectTimer = setTimeout(() => {
            session.reconnectTimer = null;

            this.connectSession(userId).catch((error) => {
                logError(
                    `Failed to reconnect WhatsApp session for ${userId}`,
                    error
                );
            });
        }, delayMs);
    }

    async connectSession(userId) {
        userId = String(userId);

        const session = this.sessions.get(userId);

        if (!session || session.stopping) {
            return null;
        }

        await this.destroySocket(session);

        const {
            state,
            saveCreds
        } = await useMultiFileAuthState(session.authDir);

        session.saveCreds = saveCreds;
        session.registered = Boolean(state.creds.registered || state.creds.account);
        session.status = session.registered ? 'connecting' : 'waiting';
        session.qr = null;

        const version = await this.resolveWaVersion();

        const logger = pino({
            level: process.env.WEB_WA_LOG_LEVEL || 'warn'
        });

        const sock = makeWASocket({
            version,
            logger,
            browser: Browsers.windows('Chrome'),
            printQRInTerminal: false,
            markOnlineOnConnect: false,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(
                    state.keys,
                    logger
                )
            }
        });

        session.socket = sock;

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            await this.handleConnectionUpdate(
                userId,
                session,
                sock,
                update
            );
        });

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') {
                return;
            }

            for (const raw of messages) {
                try {
                    const message = serializeMessage(sock, raw);

                    if (!message) {
                        continue;
                    }

                    await session.memory.observe(sock, message);
                } catch (error) {
                    logError(
                        `Archive error for web user ${userId}`,
                        error
                    );
                }
            }
        });

        return session;
    }

    async handleConnectionUpdate(userId, session, sock, update) {
        const {
            connection,
            lastDisconnect,
            qr,
            isNewLogin
        } = update;

        if (isNewLogin) {
            session.status = 'connecting';
            session.qr = null;

            logInfo(
                `WhatsApp pairing completed for web user ${userId}; waiting for reconnect`
            );
        }

        if (qr) {
            try {
                session.qr = await QRCode.toDataURL(qr);
                session.status = 'qr';

                logInfo(
                    `QR code generated for web user ${userId}`
                );
            } catch (error) {
                logError(
                    `Failed to generate QR image for ${userId}`,
                    error
                );
            }
        }

        if (connection === 'connecting') {
            session.status = 'connecting';
        }

        if (connection === 'open') {
            session.status = 'connected';
            session.registered = true;
            session.qr = null;
            session.hadSuccessfulConnection = true;

            session.number =
                sock.user?.id
                    ?.split(':')[0]
                    ?.split('@')[0] ||
                null;

            logInfo(
                `WhatsApp session connected for web user ${userId}`
            );

            return;
        }

        if (connection !== 'close') {
            return;
        }

        session.qr = null;

        if (session.stopping) {
            session.status = 'disconnected';
            return;
        }

        const statusCode =
            lastDisconnect?.error?.output?.statusCode;

        const disconnectMessage =
            lastDisconnect?.error?.message ||
            'unknown';

        logError(
            `WhatsApp session closed for web user ${userId}. ` +
            `Code: ${statusCode || 'unknown'}. ` +
            `Message: ${disconnectMessage}`
        );

        if (statusCode === DisconnectReason.restartRequired) {
            this.scheduleReconnect(userId, 1500);
            return;
        }

        if (
            statusCode === DisconnectReason.loggedOut &&
            !session.hadSuccessfulConnection
        ) {
            session.status = 'waiting';

            await this.destroySocket(session);
            await this.clearAuthDir(session.authDir);
            this.scheduleReconnect(userId, 2000);

            return;
        }

        if (statusCode === DisconnectReason.loggedOut) {
            session.status = 'logged_out';
            session.registered = false;

            await this.destroySocket(session);
            await this.clearAuthDir(session.authDir);

            logInfo(
                `WhatsApp session logged out for web user ${userId}; fresh QR required`
            );

            return;
        }

        if (
            statusCode === DisconnectReason.connectionClosed ||
            statusCode === DisconnectReason.connectionLost ||
            statusCode === DisconnectReason.timedOut
        ) {
            session.status = 'connecting';
            this.scheduleReconnect(userId, 3000);

            return;
        }

        if (
            statusCode === DisconnectReason.badSession ||
            statusCode === DisconnectReason.forbidden
        ) {
            session.status = 'logged_out';
            session.registered = false;

            await this.destroySocket(session);
            await this.clearAuthDir(session.authDir);

            return;
        }

        session.status = 'disconnected';
    }

    async createSession(userId) {
        userId = String(userId);

        const existing = this.sessions.get(userId);

        if (existing) {
            if (ACTIVE_STATUSES.has(existing.status)) {
                return existing;
            }

            if (existing.status === 'logged_out') {
                await this.destroySocket(existing);
                await this.clearAuthDir(existing.authDir);
                this.sessions.delete(userId);
            } else if (existing.status === 'disconnected') {
                await this.destroySocket(existing);
                this.sessions.delete(userId);
            }
        }

        if (this.creatingUsers.has(userId)) {
            return this.sessions.get(userId) || null;
        }

        this.creatingUsers.add(userId);

        try {
            const sessionDir = path.join(
                this.sessionsDir,
                userId
            );

            const authDir = path.join(
                sessionDir,
                'auth'
            );

            const accountMemoryDir = path.join(
                this.memoryDir,
                userId
            );

            await fs.ensureDir(authDir);
            await fs.ensureDir(accountMemoryDir);
            await this.sanitizeIncompleteAuth(authDir);

            const accountMemory =
                memory.createInstance({
                    baseDir: accountMemoryDir
                });

            await accountMemory.init();

            const session = {
                userId,
                status: 'waiting',
                registered: false,
                stopping: false,
                hadSuccessfulConnection: false,
                number: null,
                qr: null,
                socket: null,
                memory: accountMemory,
                authDir,
                saveCreds: null,
                reconnectTimer: null
            };

            this.sessions.set(userId, session);

            await this.connectSession(userId);

            return session;
        } finally {
            this.creatingUsers.delete(userId);
        }
    }

    async requestPairingCode(userId, phoneNumber) {
        throw new Error(
            'Pairing code is temporarily disabled. Use QR code to connect WhatsApp.'
        );
    }

    async disconnectSession(userId) {
        userId = String(userId);

        const session = this.getSession(userId);

        if (!session) {
            return false;
        }

        session.stopping = true;

        if (session.reconnectTimer) {
            clearTimeout(session.reconnectTimer);
            session.reconnectTimer = null;
        }

        await this.destroySocket(session, { logout: true });

        try {
            await session.memory?.shutdown();
        } catch {}

        await this.clearAuthDir(session.authDir);

        session.status = 'logged_out';
        this.sessions.delete(userId);

        return true;
    }

    async shutdown() {
        for (const [userId, session] of this.sessions) {
            session.stopping = true;

            if (session.reconnectTimer) {
                clearTimeout(session.reconnectTimer);
                session.reconnectTimer = null;
            }

            await this.destroySocket(session);

            try {
                await session.memory?.shutdown();
            } catch {}

            logInfo(
                `WhatsApp session stopped for web user ${userId}`
            );
        }

        this.sessions.clear();
        this.creatingUsers.clear();
    }
}

module.exports = new WhatsAppSessionManager();
