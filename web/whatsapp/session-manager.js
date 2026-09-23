const path = require('path');
const fs = require('fs-extra');
const QRCode = require('qrcode');

const {
default: makeWASocket,
DisconnectReason,
Browsers,
fetchLatestBaileysVersion,
makeCacheableSignalKeyStore,
useMultiFileAuthState
} = require('@whiskeysockets/baileys');

const pino = require('pino');

const memory = require('../../modules/memory');
const { serializeMessage } = require('../../lib/serialize');
const { handleMessage } = require('../../lib/handler');
const { readJson } = require('../../lib/database');
const config = require('../../config');
const { logInfo, logError } = require('../../lib/logger');
const { db } = require('../firebase-admin');

const ACTIVE_STATUSES = new Set([
'waiting',
'qr',
'connecting',
'connected'
]);

class WhatsAppSessionManager {
constructor() {
/*
* sessions:
*
                const localStats = await fs.lstat(filePath);

                if (localStats.isSymbolicLink()) {
                    continue;
                }
*
* This allows one web user to connect multiple
* independent WhatsApp numbers.
*/
this.sessions = new Map();
    this.commandState = null;

    this.creatingSessions = new Set();

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

setCommandState(appState) {
    this.commandState = appState;
}

async init() {
    await fs.ensureDir(this.sessionsDir);
    await fs.ensureDir(this.memoryDir);

    logInfo(
        'WhatsApp multi-number session manager initialized'
    );
}

getUserSessions(userId) {
    userId = String(userId);

    if (!this.sessions.has(userId)) {
        this.sessions.set(userId, new Map());
    }

    return this.sessions.get(userId);
}

getSession(userId, numberId = 'default') {
    userId = String(userId);
    numberId = String(numberId);

    return (
        this.sessions.get(userId)?.get(numberId) ||
        null
    );
}

getSessionStatus(userId, numberId = 'default') {
    const session = this.getSession(userId, numberId);

    if (!session) {
        return {
            exists: false,
            numberId: String(numberId),
            status: 'disconnected',
            connected: false,
            number: null,
            qr: null
        };
    }

    return {
        exists: true,
        numberId: session.numberId,
        status: session.status,
        connected: session.status === 'connected',
        number: session.number || null,
        qr: session.qr || null
    };
}

getAllSessionStatuses(userId) {
    const sessions = this.getUserSessions(userId);

    return Array.from(sessions.values()).map((session) => ({
        numberId: session.numberId,
        status: session.status,
        connected: session.status === 'connected',
        number: session.number || null,
        qr: session.qr || null
    }));
}

async resolveWaVersion() {
    try {
        const result = await fetchLatestBaileysVersion();

        if (result?.version) {
            logInfo(
    'Using Baileys WhatsApp Web version ' +
    result.version.join('.')
);

            return result.version;
        }
    } catch (error) {
        logError(
            'Failed to fetch Baileys WhatsApp Web version',
            error
        );
    }

    return undefined;
}

async sanitizeIncompleteAuth(authDir) {
    const credsPath = path.join(
        authDir,
        'creds.json'
    );

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
    const incomplete =
        (hasMe && !hasAccount);

    if (!incomplete) {
        return false;
    }

    logInfo(
        `Clearing incomplete WhatsApp auth state: ${authDir}`
    );

    await fs.emptyDir(authDir);

    return true;
}

async clearAuthDir(authDir) {
    await fs.ensureDir(authDir);
    await fs.emptyDir(authDir);
}

getAuthFilesCollection(userId, numberId) {
    const safeUserId = encodeURIComponent(String(userId));
    const safeNumberId = encodeURIComponent(String(numberId));

    return db
        .collection('whatsapp_auth')
        .doc(safeUserId)
        .collection('numbers')
        .doc(safeNumberId)
        .collection('files');
}

isSafeAuthFilename(filename) {
    return (
        typeof filename === 'string' &&
        filename.length > 0 &&
        filename === path.basename(filename) &&
        filename !== '.' &&
        filename !== '..'
    );
}

getSafeAuthFilePath(authDir, filename) {
    if (!this.isSafeAuthFilename(filename)) {
        return null;
    }

    const authRoot = path.resolve(authDir);
    const filePath = path.resolve(authRoot, filename);

    if (
        filePath !== authRoot &&
        !filePath.startsWith(`${authRoot}${path.sep}`)
    ) {
        return null;
    }

    return filePath;
}

async restoreAuthFiles(session) {
    try {
        await fs.ensureDir(session.authDir);

        const snapshot =
            await this.getAuthFilesCollection(
                session.userId,
                session.numberId
            ).get();

        for (const document of snapshot.docs) {
            const filename = document.id;
            const filePath = this.getSafeAuthFilePath(
                session.authDir,
                filename
            );
            const contents = document.data()?.contents;

            if (!filePath || typeof contents !== 'string') {
                continue;
            }

            const persistedAt =
                document.data()?.updatedAt;
            const persistedTime =
                typeof persistedAt?.toMillis === 'function'
                    ? persistedAt.toMillis()
                    : new Date(persistedAt || 0).getTime();

            if (await fs.pathExists(filePath)) {
                const localStats = await fs.lstat(filePath);

                if (localStats.isSymbolicLink()) {
                    continue;
                }

                if (
                    persistedTime &&
                    localStats.mtimeMs >= persistedTime
                ) {
                    continue;
                }
            }

            await fs.writeFile(
                filePath,
                contents,
                'utf8'
            );
        }
    } catch (error) {
        logError(
            `Failed to restore WhatsApp auth files for ${session.userId}/${session.numberId}`,
            error
        );
    }
}

async syncAuthFiles(session) {
    try {
        await fs.ensureDir(session.authDir);

        const filenames =
            await fs.readdir(session.authDir);
        const files = [];

        for (const filename of filenames) {
            const filePath = this.getSafeAuthFilePath(
                session.authDir,
                filename
            );

            if (!filePath) {
                continue;
            }

            const stats = await fs.lstat(filePath);

            if (stats.isFile() && !stats.isSymbolicLink()) {
                files.push({
                    filename,
                    contents: await fs.readFile(
                        filePath,
                        'utf8'
                    )
                });
            }
        }

        const collection =
            this.getAuthFilesCollection(
                session.userId,
                session.numberId
            );
        const snapshot = await collection.get();
        const currentFiles = new Set(
            files.map(({ filename }) => filename)
        );
        const batch = db.batch();

        for (const document of snapshot.docs) {
            if (!currentFiles.has(document.id)) {
                batch.delete(document.ref);
            }
        }

        for (const file of files) {
            batch.set(
                collection.doc(file.filename),
                {
                    contents: file.contents,
                    updatedAt: new Date()
                }
            );
        }

        if (snapshot.size > 0 || files.length > 0) {
            await batch.commit();
        }
    } catch (error) {
        logError(
            `Failed to persist WhatsApp auth files for ${session.userId}/${session.numberId}`,
            error
        );
    }
}

async deletePersistedAuthFiles(session) {
    try {
        const snapshot =
            await this.getAuthFilesCollection(
                session.userId,
                session.numberId
            ).get();
        const batch = db.batch();

        for (const document of snapshot.docs) {
            batch.delete(document.ref);
        }

        if (snapshot.size > 0) {
            await batch.commit();
        }
    } catch (error) {
        logError(
            `Failed to delete WhatsApp auth files for ${session.userId}/${session.numberId}`,
            error
        );
    }
}

async destroySocket(session, { logout = false } = {}) {
    if (!session?.socket) {
        return;
    }

    const socket = session.socket;

    session.socket = null;

    try {
        socket.ev.removeAllListeners(
            'connection.update'
        );

        socket.ev.removeAllListeners(
            'creds.update'
        );

        socket.ev.removeAllListeners(
            'messages.upsert'
        );
    } catch {}

    try {
        if (logout) {
            await socket.logout();
        } else {
            await socket.ws?.close();
        }
    } catch {}
}

scheduleReconnect(
    userId,
    numberId,
    delayMs = 3000
) {
    const session = this.getSession(
        userId,
        numberId
    );

    if (!session || session.stopping) {
        return;
    }

    if (session.reconnectTimer) {
        clearTimeout(
            session.reconnectTimer
        );
    }

    session.status = 'connecting';
    session.qr = null;

    session.reconnectTimer = setTimeout(() => {
        session.reconnectTimer = null;

        this.connectSession(
            userId,
            numberId
        ).catch((error) => {
            logError(
                `Failed to reconnect WhatsApp session for ${userId}/${numberId}`,
                error
            );
        });
    }, delayMs);
}

async connectSession(userId, numberId) {
    userId = String(userId);
    numberId = String(numberId);

    const session = this.getSession(
        userId,
        numberId
    );

    if (!session || session.stopping) {
        return null;
    }

    await this.destroySocket(session);

    await this.restoreAuthFiles(session);

    const {
        state,
        saveCreds
    } = await useMultiFileAuthState(
        session.authDir
    );

    session.saveCreds = async (...args) => {
        const result = await saveCreds(...args);

        await this.syncAuthFiles(session);

        return result;
    };

    const originalKeysSet =
        state.keys.set.bind(state.keys);

    state.keys.set = async (...args) => {
        const result = await originalKeysSet(...args);

        await this.syncAuthFiles(session);

        return result;
    };

    session.registered = Boolean(
        state.creds.registered
    );

    session.status =
        session.registered
            ? 'connecting'
            : 'waiting';

    session.qr = null;

    const version =
        await this.resolveWaVersion();

    const logger = pino({
        level:
            process.env.WEB_WA_LOG_LEVEL ||
            'warn'
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
            keys:
                makeCacheableSignalKeyStore(
                    state.keys,
                    logger
                )
        }
    });

    session.socket = sock;

    await this.syncAuthFiles(session);

    sock.ev.on(
        'creds.update',
        saveCreds
    );

    sock.ev.on(
        'connection.update',
        async (update) => {
            await this.handleConnectionUpdate(
                userId,
                numberId,
                session,
                sock,
                update
            );
        }
    );

    sock.ev.on(
        'messages.upsert',
        async ({ messages, type }) => {
            if (
                type !== 'notify' ||
                session.socket !== sock ||
                session.stopping
            ) {
                return;
            }

            for (const raw of messages) {
                try {
                    if (
                        session.socket !== sock ||
                        session.stopping
                    ) {
                        return;
                    }

                    const message =
                        serializeMessage(
                            sock,
                            raw
                        );

                    if (!message) {
                        continue;
                    }

                    message.userId = userId;
                    message.numberId = numberId;

                    logInfo(
                        `[WEB WA MESSAGE] userId=${userId} ` +
                        `numberId=${numberId} jid=${message.chat}`
                    );

                    await session.memory.observe(
                        sock,
                        message
                    );

                    if (
                        session.socket !== sock ||
                        session.stopping
                    ) {
                        return;
                    }

                    if (!this.commandState) {
                        logError(
                            `[WEB WA HANDLER] command state unavailable ` +
                            `for userId=${userId} numberId=${numberId}`
                        );
                        continue;
                    }

                    logInfo(
                        `[WEB WA HANDLER] processing message ` +
                        `userId=${userId} numberId=${numberId}`
                    );

                    const prefix = String(
                        readJson('settings.json').prefix || config.prefix
                    );
                    const commandName = message.text.startsWith(prefix)
                        ? message.text
                            .slice(prefix.length)
                            .trim()
                            .split(/\s+/)[0]
                            .toLowerCase()
                        : '';

                    if (commandName) {
                        logInfo(
                            `[WEB WA COMMAND] command=${commandName} ` +
                            `userId=${userId} numberId=${numberId}`
                        );
                    }

                    await handleMessage(
                        sock,
                        message,
                        this.commandState
                    );

                    logInfo(
                        `[WEB WA REPLY] handler completed ` +
                        `userId=${userId} numberId=${numberId}`
                    );
                } catch (error) {
                    logError(
                        `Message handling error for web user ${userId}/${numberId}`,
                        error
                    );
                }
            }
        }
    );

    return session;
}

async handleConnectionUpdate(
    userId,
    numberId,
    session,
    sock,
    update
) {
    if (
        session.socket !== sock &&
        !session.stopping
    ) {
        return;
    }

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
            `WhatsApp pairing completed for ${userId}/${numberId}`
        );
    }

    if (qr) {
        try {
            session.qr =
                await QRCode.toDataURL(qr);

            session.status = 'qr';

            logInfo(
                `QR generated for WhatsApp ${userId}/${numberId}`
            );
        } catch (error) {
            logError(
                `Failed to generate QR for ${userId}/${numberId}`,
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
            `WhatsApp ${session.number || numberId} connected for web user ${userId}`
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
        lastDisconnect
            ?.error
            ?.output
            ?.statusCode ||
        lastDisconnect
            ?.error
            ?.statusCode;

    const disconnectMessage =
        lastDisconnect
            ?.error
            ?.message ||
        'unknown';

    logError(
        `WhatsApp session closed for ${userId}/${numberId}. ` +
        `Code: ${statusCode || 'unknown'}. ` +
        `Message: ${disconnectMessage}`
    );

    if (
        statusCode ===
        DisconnectReason.restartRequired
    ) {
        this.scheduleReconnect(
            userId,
            numberId,
            1500
        );

        return;
    }

    if (
        statusCode ===
            DisconnectReason.loggedOut &&
        !session.hadSuccessfulConnection
    ) {
        session.status = 'waiting';

        await this.destroySocket(
            session
        );

        await this.clearAuthDir(
            session.authDir
        );

        this.scheduleReconnect(
            userId,
            numberId,
            2000
        );

        return;
    }

    if (
        statusCode ===
        DisconnectReason.loggedOut
    ) {
        session.status = 'logged_out';
        session.registered = false;

        await this.destroySocket(
            session
        );

        await this.clearAuthDir(
            session.authDir
        );

        logInfo(
            `WhatsApp ${userId}/${numberId} logged out`
        );

        return;
    }

    if (
        statusCode ===
            DisconnectReason.connectionClosed ||
        statusCode ===
            DisconnectReason.connectionLost ||
        statusCode ===
            DisconnectReason.timedOut ||
        statusCode ===
            DisconnectReason.unavailable
    ) {
        session.status = 'connecting';

        this.scheduleReconnect(
            userId,
            numberId,
            3000
        );

        return;
    }

    if (
        statusCode ===
            DisconnectReason.badSession ||
        statusCode ===
            DisconnectReason.forbidden
    ) {
        session.status = 'logged_out';
        session.registered = false;

        await this.destroySocket(
            session
        );

        await this.clearAuthDir(
            session.authDir
        );

        return;
    }

    session.status = 'disconnected';
}

async createSession(
    userId,
    numberId = 'default'
) {
    userId = String(userId);
    numberId = String(numberId);

    const sessions =
        this.getUserSessions(userId);

    const existing =
        sessions.get(numberId);

    if (existing) {
        if (
            ACTIVE_STATUSES.has(
                existing.status
            )
        ) {
            return existing;
        }

        if (
            existing.status ===
            'logged_out'
        ) {
            await this.destroySocket(
                existing
            );

            await this.clearAuthDir(
                existing.authDir
            );

            sessions.delete(numberId);
        } else if (
            existing.status ===
            'disconnected'
        ) {
            await this.destroySocket(
                existing
            );

            sessions.delete(numberId);
        }
    }

    const creationKey =
        `${userId}:${numberId}`;

    if (
        this.creatingSessions.has(
            creationKey
        )
    ) {
        return (
            sessions.get(numberId) ||
            null
        );
    }

    this.creatingSessions.add(
        creationKey
    );

    try {
        const sessionDir =
            path.join(
                this.sessionsDir,
                userId,
                numberId
            );

        const authDir =
            path.join(
                sessionDir,
                'auth'
            );

        const accountMemoryDir =
            path.join(
                this.memoryDir,
                userId,
                numberId
            );

        await fs.ensureDir(
            authDir
        );

        await fs.ensureDir(
            accountMemoryDir
        );

        await this.sanitizeIncompleteAuth(
            authDir
        );

        const accountMemory =
            memory.createInstance({
                baseDir:
                    accountMemoryDir
            });

        await accountMemory.init();

        const session = {
            userId,
            numberId,

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

        sessions.set(
            numberId,
            session
        );

        await this.connectSession(
            userId,
            numberId
        );

        return session;
    } finally {
        this.creatingSessions.delete(
            creationKey
        );
    }
}

async requestPairingCode(
    userId,
    numberId,
    phoneNumber
) {
    const session =
        this.getSession(
            userId,
            numberId
        );

    if (!session) {
        throw new Error(
            'WhatsApp session does not exist.'
        );
    }

    if (!session.socket) {
        throw new Error(
            'WhatsApp socket is not ready.'
        );
    }

    const cleanNumber =
        String(phoneNumber || '')
            .replace(/\D/g, '');

    if (!cleanNumber) {
        throw new Error(
            'Valid WhatsApp phone number is required.'
        );
    }

    if (
        session.registered
    ) {
        throw new Error(
            'This WhatsApp session is already registered.'
        );
    }

    await session.socket.waitForSocketOpen();

    if (
        session.socket !== this.getSession(
            userId,
            numberId
        )?.socket
    ) {
        throw new Error(
            'WhatsApp socket was replaced before pairing.'
        );
    }

    const code =
        await session.socket
            .requestPairingCode(
                cleanNumber
            );

    session.status = 'connecting';
    session.qr = null;

    return code;
}

async disconnectSession(
    userId,
    numberId = 'default'
) {
    userId = String(userId);
    numberId = String(numberId);

    const sessions =
        this.getUserSessions(userId);

    const session =
        sessions.get(numberId);

    if (!session) {
        return false;
    }

    session.stopping = true;

    if (session.reconnectTimer) {
        clearTimeout(
            session.reconnectTimer
        );

        session.reconnectTimer = null;
    }

    await this.destroySocket(
        session,
        { logout: true }
    );

    try {
        await session.memory?.shutdown();
    } catch {}

    await this.clearAuthDir(
        session.authDir
    );

    await this.deletePersistedAuthFiles(
        session
    );

    session.status =
        'logged_out';

    sessions.delete(numberId);

    if (sessions.size === 0) {
        this.sessions.delete(
            userId
        );
    }

    return true;
}

async shutdown() {
    for (
        const [userId, sessions]
        of this.sessions
    ) {
        for (
            const [
                numberId,
                session
            ] of sessions
        ) {
            session.stopping = true;

            if (
                session.reconnectTimer
            ) {
                clearTimeout(
                    session.reconnectTimer
                );

                session.reconnectTimer =
                    null;
            }

            await this.destroySocket(
                session
            );

            try {
                await session.memory?.shutdown();
            } catch {}

            logInfo(
                `WhatsApp session stopped for ${userId}/${numberId}`
            );
        }
    }

    this.sessions.clear();
    this.creatingSessions.clear();
}

}

module.exports =
new WhatsAppSessionManager();
