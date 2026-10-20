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

// Same file-naming transformation Baileys uses internally in useMultiFileAuthState
const fixFileName = (file) => file?.replace(/\//g, '__')?.replace(/:/g, '-');

class WhatsAppSessionManager {
    constructor() {
        this.sessions = new Map(); // userId -> Map(numberId -> session)
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

        this.MAX_BATCH_SIZE = 400; // Strictly under Firestore 500 limit
        this.SYNC_DEBOUNCE_MS = 1500;
    }

    setCommandState(appState) {
        this.commandState = appState;
    }

    async init() {
        await fs.ensureDir(this.sessionsDir);
        await fs.ensureDir(this.memoryDir);

        logInfo('WhatsApp multi-number session manager initialized');

        // Auto-restore any previously registered sessions from Firestore
        await this.autoRestoreSessions();
    }

    // ----------------------------------------------------
    // Firestore Path and Safety Helpers
    // ----------------------------------------------------

    getSafeId(id) {
        return encodeURIComponent(String(id || '').trim());
    }

    encodeFilename(filename) {
        return encodeURIComponent(String(filename || '').trim());
    }

    decodeFilename(docId) {
        try {
            return decodeURIComponent(String(docId || ''));
        } catch {
            return String(docId || '');
        }
    }

    getSessionDocRef(userId, numberId) {
        const safeUserId = this.getSafeId(userId);
        const safeNumberId = this.getSafeId(numberId);
        return db
            .collection('whatsapp_sessions')
            .doc(`${safeUserId}_${safeNumberId}`);
    }

    getAuthFilesCollection(userId, numberId) {
        const safeUserId = this.getSafeId(userId);
        const safeNumberId = this.getSafeId(numberId);

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

    // ----------------------------------------------------
    // Firestore Registry Tracking
    // ----------------------------------------------------

    async updateSessionRegistry(userId, numberId, patch = {}) {
        try {
            const docRef = this.getSessionDocRef(userId, numberId);
            await docRef.set(
                {
                    userId: String(userId),
                    numberId: String(numberId),
                    updatedAt: new Date(),
                    ...patch
                },
                { merge: true }
            );
        } catch (error) {
            logError(
                `Failed to update WhatsApp session registry for ${userId}/${numberId}`,
                error
            );
        }
    }

    async deleteSessionRegistry(userId, numberId) {
        try {
            const docRef = this.getSessionDocRef(userId, numberId);
            await docRef.delete();
        } catch (error) {
            logError(
                `Failed to delete WhatsApp session registry for ${userId}/${numberId}`,
                error
            );
        }
    }

    // ----------------------------------------------------
    // Targeted Dirty File Tracking & Debounced Sync
    // ----------------------------------------------------

    queueDirtyFile(session, filename, action = 'write') {
        if (!session || session.stopping) {
            return;
        }

        if (!session.dirtyFiles) {
            session.dirtyFiles = new Map();
        }

        session.dirtyFiles.set(filename, action);

        if (!session.syncTimer && !session.stopping) {
            session.syncTimer = setTimeout(() => {
                session.syncTimer = null;
                this.flushSessionDirtyFiles(session).catch((error) => {
                    logError(
                        `Error in debounced sync for ${session.userId}/${session.numberId}`,
                        error
                    );
                });
            }, this.SYNC_DEBOUNCE_MS);
        }
    }

    async flushSessionDirtyFiles(session, { force = false } = {}) {
        if (!session || (!force && session.stopping) || session.isSyncing) {
            return;
        }

        if (!session.dirtyFiles || session.dirtyFiles.size === 0) {
            return;
        }

        session.isSyncing = true;

        try {
            while (session.dirtyFiles && session.dirtyFiles.size > 0) {
                if (!force && session.stopping) {
                    session.dirtyFiles.clear();
                    break;
                }

                const pending = Array.from(session.dirtyFiles.entries());
                session.dirtyFiles.clear();

                const operations = [];

                for (const [filename, action] of pending) {
                    if (!this.isSafeAuthFilename(filename)) {
                        continue;
                    }

                    const filePath = this.getSafeAuthFilePath(
                        session.authDir,
                        filename
                    );

                    if (!filePath) {
                        continue;
                    }

                    if (action === 'delete') {
                        operations.push({ filename, action: 'delete' });
                    } else {
                        try {
                            if (await fs.pathExists(filePath)) {
                                const contents = await fs.readFile(
                                    filePath,
                                    'utf8'
                                );
                                operations.push({
                                    filename,
                                    action: 'write',
                                    contents
                                });
                            } else {
                                operations.push({
                                    filename,
                                    action: 'delete'
                                });
                            }
                        } catch (readError) {
                            logError(
                                `Failed to read auth file ${filename} for ${session.userId}/${session.numberId}`,
                                readError
                            );
                        }
                    }
                }

                if (operations.length === 0) {
                    continue;
                }

                const collection = this.getAuthFilesCollection(
                    session.userId,
                    session.numberId
                );

                for (
                    let i = 0;
                    i < operations.length;
                    i += this.MAX_BATCH_SIZE
                ) {
                    const chunk = operations.slice(
                        i,
                        i + this.MAX_BATCH_SIZE
                    );
                    const batch = db.batch();

                    for (const op of chunk) {
                        const docRef = collection.doc(
                            this.encodeFilename(op.filename)
                        );

                        if (op.action === 'write') {
                            batch.set(docRef, {
                                originalFilename: op.filename,
                                contents: op.contents,
                                updatedAt: new Date()
                            });
                        } else {
                            batch.delete(docRef);
                        }
                    }

                    try {
                        await batch.commit();
                    } catch (commitError) {
                        logError(
                            `Firestore batch write failed for ${session.userId}/${session.numberId} (${chunk.length} items)`,
                            commitError
                        );

                        // Retain uncommitted operations in dirty queue so they retry
                        for (const failedOp of chunk) {
                            session.dirtyFiles.set(
                                failedOp.filename,
                                failedOp.action
                            );
                        }

                        // Schedule retry after 5 seconds if not stopping and not already scheduled
                        if (!session.syncTimer && !session.stopping) {
                            session.syncTimer = setTimeout(() => {
                                session.syncTimer = null;
                                this.flushSessionDirtyFiles(session).catch((error) => {
                                    logError(
                                        `Error in retry sync for ${session.userId}/${session.numberId}`,
                                        error
                                    );
                                });
                            }, 5000);
                        }
                        break;
                    }
                }
            }
        } catch (error) {
            logError(
                `Sync flush error for ${session.userId}/${session.numberId}`,
                error
            );
        } finally {
            session.isSyncing = false;
        }
    }

    async flushAllPendingSync() {
        const promises = [];

        for (const sessions of this.sessions.values()) {
            for (const session of sessions.values()) {
                if (session.syncTimer) {
                    clearTimeout(session.syncTimer);
                    session.syncTimer = null;
                }
                promises.push(
                    this.flushSessionDirtyFiles(session, { force: true }).catch((err) =>
                        logError(
                            `Shutdown flush error for ${session.userId}/${session.numberId}`,
                            err
                        )
                    )
                );
            }
        }

        await Promise.allSettled(promises);
    }

    // ----------------------------------------------------
    // Restore & Cleanup Helpers
    // ----------------------------------------------------

    async restoreAuthFiles(session) {
        try {
            await fs.ensureDir(session.authDir);

            const snapshot = await this.getAuthFilesCollection(
                session.userId,
                session.numberId
            ).get();

            if (snapshot.empty) {
                return;
            }

            for (const document of snapshot.docs) {
                const data = document.data();
                const filename =
                    data?.originalFilename ||
                    this.decodeFilename(document.id);

                const filePath = this.getSafeAuthFilePath(
                    session.authDir,
                    filename
                );
                const contents = data?.contents;

                if (!filePath || typeof contents !== 'string') {
                    continue;
                }

                await fs.writeFile(filePath, contents, 'utf8');
            }

            logInfo(
                `Restored ${snapshot.size} WhatsApp auth file(s) from Firestore for ${session.userId}/${session.numberId}`
            );
        } catch (error) {
            logError(
                `Failed to restore WhatsApp auth files for ${session.userId}/${session.numberId}`,
                error
            );
        }
    }

    async deletePersistedAuthFiles(session) {
        try {
            const collection = this.getAuthFilesCollection(
                session.userId,
                session.numberId
            );
            const snapshot = await collection.get();

            if (snapshot.empty) {
                return;
            }

            for (
                let i = 0;
                i < snapshot.docs.length;
                i += this.MAX_BATCH_SIZE
            ) {
                const chunk = snapshot.docs.slice(
                    i,
                    i + this.MAX_BATCH_SIZE
                );
                const batch = db.batch();

                for (const document of chunk) {
                    batch.delete(document.ref);
                }

                await batch.commit();
            }

            logInfo(
                `Deleted ${snapshot.size} persisted WhatsApp auth file(s) for ${session.userId}/${session.numberId}`
            );
        } catch (error) {
            logError(
                `Failed to delete persisted WhatsApp auth files for ${session.userId}/${session.numberId}`,
                error
            );
        }
    }

    async autoRestoreSessions() {
        try {
            logInfo('Checking Firestore for existing registered WhatsApp sessions...');
            const snapshot = await db
                .collection('whatsapp_sessions')
                .where('registered', '==', true)
                .get();

            if (snapshot.empty) {
                logInfo('No registered WhatsApp sessions found in Firestore.');
                return;
            }

            logInfo(
                `Found ${snapshot.size} registered WhatsApp session(s) in Firestore. Auto-restoring...`
            );

            for (const document of snapshot.docs) {
                const data = document.data();
                const userId = data?.userId;
                const numberId = data?.numberId;

                if (!userId || !numberId || data.status === 'logged_out') {
                    continue;
                }

                logInfo(
                    `Auto-restoring WhatsApp session for user ${userId} (number: ${data.number || numberId})...`
                );

                try {
                    await this.createSession(userId, numberId, { isAutoRestore: true });
                } catch (sessionError) {
                    logError(
                        `Failed to auto-restore session ${userId}/${numberId}`,
                        sessionError
                    );
                }
            }
        } catch (error) {
            logError(
                'Failed to query registered WhatsApp sessions from Firestore',
                error
            );
        }
    }

    // ----------------------------------------------------
    // Session State Queries
    // ----------------------------------------------------

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
        const incomplete = hasMe && !hasAccount;

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

    scheduleReconnect(userId, numberId, delayMs = 3000) {
        const session = this.getSession(userId, numberId);

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

            this.connectSession(userId, numberId).catch((error) => {
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

        const session = this.getSession(userId, numberId);

        if (!session || session.stopping) {
            return null;
        }

        await this.destroySocket(session);

        // 1. Restore auth files from Firestore if available
        await this.restoreAuthFiles(session);

        // 2. Sanitize incomplete auth AFTER restore has written files to disk
        await this.sanitizeIncompleteAuth(session.authDir);

        // 3. Initialize useMultiFileAuthState with completely restored and sanitized files
        const { state, saveCreds } = await useMultiFileAuthState(
            session.authDir
        );

        // Wrap saveCreds to queue creds.json into dirty sync
        session.saveCreds = async (...args) => {
            const result = await saveCreds(...args);
            this.queueDirtyFile(session, 'creds.json', 'write');
            return result;
        };

        // Wrap state.keys.set to track specific dirty keys using Baileys' exact fixFileName
        const originalKeysSet = state.keys.set.bind(state.keys);
        state.keys.set = async (data) => {
            const result = await originalKeysSet(data);
            if (data && typeof data === 'object') {
                for (const category in data) {
                    for (const id in data[category]) {
                        const value = data[category][id];
                        const filename = fixFileName(`${category}-${id}.json`);
                        this.queueDirtyFile(
                            session,
                            filename,
                            value ? 'write' : 'delete'
                        );
                    }
                }
            }
            return result;
        };

        session.registered = Boolean(state.creds?.registered);
        session.status = session.registered ? 'connecting' : 'waiting';
        session.qr = null;

        // Update registry with evaluated registration status
        await this.updateSessionRegistry(userId, numberId, {
            status: session.status,
            registered: session.registered
        });

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
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            }
        });

        session.socket = sock;

        sock.ev.on('creds.update', session.saveCreds);

        sock.ev.on('connection.update', async (update) => {
            await this.handleConnectionUpdate(
                userId,
                numberId,
                session,
                sock,
                update
            );
        });

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
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

                    const message = serializeMessage(sock, raw);

                    if (!message) {
                        continue;
                    }

                    message.userId = userId;
                    message.numberId = numberId;

                    logInfo(
                        `[WEB WA MESSAGE] userId=${userId} ` +
                        `numberId=${numberId} jid=${message.chat}`
                    );

                    await session.memory.observe(sock, message);

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

                    await handleMessage(sock, message, this.commandState);

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
        });

        // Queue creds.json initially
        this.queueDirtyFile(session, 'creds.json', 'write');

        return session;
    }

    async handleConnectionUpdate(
        userId,
        numberId,
        session,
        sock,
        update
    ) {
        if (session.socket !== sock && !session.stopping) {
            return;
        }

        const { connection, lastDisconnect, qr, isNewLogin } = update;

        if (isNewLogin) {
            session.status = 'connecting';
            session.qr = null;

            logInfo(
                `WhatsApp pairing completed for ${userId}/${numberId}`
            );

            await this.updateSessionRegistry(userId, numberId, {
                status: 'connecting'
            });
        }

        if (qr) {
            try {
                session.qr = await QRCode.toDataURL(qr);
                session.status = 'qr';

                logInfo(
                    `QR generated for WhatsApp ${userId}/${numberId}`
                );

                await this.updateSessionRegistry(userId, numberId, {
                    status: 'qr'
                });
            } catch (error) {
                logError(
                    `Failed to generate QR for ${userId}/${numberId}`,
                    error
                );
            }
        }

        if (connection === 'connecting') {
            session.status = 'connecting';
            await this.updateSessionRegistry(userId, numberId, {
                status: 'connecting'
            });
        }

        if (connection === 'open') {
            session.status = 'connected';
            session.registered = true;
            session.qr = null;
            session.hadSuccessfulConnection = true;

            session.number =
                sock.user?.id
                    ?.split(':')[0]
                    ?.split('@')[0] || null;

            logInfo(
                `WhatsApp ${session.number || numberId} connected for web user ${userId}`
            );

            await this.updateSessionRegistry(userId, numberId, {
                status: 'connected',
                registered: true,
                number: session.number,
                lastConnectedAt: new Date()
            });

            // Immediately flush initial authenticated state to Firestore
            await this.flushSessionDirtyFiles(session);
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
            lastDisconnect?.error?.output?.statusCode ||
            lastDisconnect?.error?.statusCode;

        const disconnectMessage =
            lastDisconnect?.error?.message || 'unknown';

        logError(
            `WhatsApp session closed for ${userId}/${numberId}. ` +
            `Code: ${statusCode || 'unknown'}. ` +
            `Message: ${disconnectMessage}`
        );

        if (statusCode === DisconnectReason.restartRequired) {
            this.scheduleReconnect(userId, numberId, 1500);
            return;
        }

        if (
            statusCode === DisconnectReason.loggedOut &&
            !session.hadSuccessfulConnection
        ) {
            session.status = 'waiting';

            await this.destroySocket(session);
            await this.clearAuthDir(session.authDir);

            this.scheduleReconnect(userId, numberId, 2000);
            return;
        }

        if (statusCode === DisconnectReason.loggedOut) {
            session.status = 'logged_out';
            session.registered = false;

            await this.updateSessionRegistry(userId, numberId, {
                status: 'logged_out',
                registered: false
            });

            await this.destroySocket(session);
            await this.clearAuthDir(session.authDir);

            logInfo(`WhatsApp ${userId}/${numberId} logged out`);
            return;
        }

        if (
            statusCode === DisconnectReason.connectionClosed ||
            statusCode === DisconnectReason.connectionLost ||
            statusCode === DisconnectReason.timedOut ||
            statusCode === DisconnectReason.unavailable
        ) {
            session.status = 'connecting';
            await this.updateSessionRegistry(userId, numberId, {
                status: 'connecting'
            });

            this.scheduleReconnect(userId, numberId, 3000);
            return;
        }

        if (
            statusCode === DisconnectReason.badSession ||
            statusCode === DisconnectReason.forbidden
        ) {
            session.status = 'logged_out';
            session.registered = false;

            await this.updateSessionRegistry(userId, numberId, {
                status: 'logged_out',
                registered: false
            });

            await this.destroySocket(session);
            await this.clearAuthDir(session.authDir);
            return;
        }

        session.status = 'disconnected';
        await this.updateSessionRegistry(userId, numberId, {
            status: 'disconnected'
        });
    }

    async createSession(userId, numberId = 'default', { isAutoRestore = false } = {}) {
        userId = String(userId);
        numberId = String(numberId);

        const sessions = this.getUserSessions(userId);
        const existing = sessions.get(numberId);

        if (existing) {
            if (ACTIVE_STATUSES.has(existing.status)) {
                return existing;
            }

            if (existing.status === 'logged_out') {
                await this.destroySocket(existing);
                await this.clearAuthDir(existing.authDir);
                sessions.delete(numberId);
            } else if (existing.status === 'disconnected') {
                await this.destroySocket(existing);
                sessions.delete(numberId);
            }
        }

        const creationKey = `${userId}:${numberId}`;

        if (this.creatingSessions.has(creationKey)) {
            return sessions.get(numberId) || null;
        }

        this.creatingSessions.add(creationKey);

        try {
            const sessionDir = path.join(
                this.sessionsDir,
                userId,
                numberId
            );

            const authDir = path.join(sessionDir, 'auth');
            const accountMemoryDir = path.join(
                this.memoryDir,
                userId,
                numberId
            );

            await fs.ensureDir(authDir);
            await fs.ensureDir(accountMemoryDir);

            const accountMemory = memory.createInstance({
                baseDir: accountMemoryDir
            });

            await accountMemory.init();

            const session = {
                userId,
                numberId,

                status: isAutoRestore ? 'connecting' : 'waiting',
                registered: Boolean(isAutoRestore),
                stopping: false,
                hadSuccessfulConnection: false,

                number: null,
                qr: null,
                socket: null,

                memory: accountMemory,
                authDir,

                saveCreds: null,
                reconnectTimer: null,

                dirtyFiles: new Map(),
                syncTimer: null,
                isSyncing: false
            };

            sessions.set(numberId, session);

            // Record initial session in Firestore registry ONLY if genuinely new
            if (!isAutoRestore) {
                const credsPath = path.join(authDir, 'creds.json');
                let alreadyRegistered = false;
                if (await fs.pathExists(credsPath)) {
                    try {
                        const credsData = await fs.readJson(credsPath);
                        alreadyRegistered = Boolean(credsData?.registered);
                    } catch {}
                }

                if (!alreadyRegistered) {
                    await this.updateSessionRegistry(userId, numberId, {
                        status: 'waiting',
                        registered: false
                    });
                }
            }

            await this.connectSession(userId, numberId);

            return session;
        } finally {
            this.creatingSessions.delete(creationKey);
        }
    }

    async requestPairingCode(userId, numberId, phoneNumber) {
        const session = this.getSession(userId, numberId);

        if (!session) {
            throw new Error('WhatsApp session does not exist.');
        }

        if (!session.socket) {
            throw new Error('WhatsApp socket is not ready.');
        }

        const cleanNumber = String(phoneNumber || '').replace(/\D/g, '');

        if (!cleanNumber) {
            throw new Error('Valid WhatsApp phone number is required.');
        }

        if (session.registered) {
            throw new Error('This WhatsApp session is already registered.');
        }

        await session.socket.waitForSocketOpen();

        if (
            session.socket !==
            this.getSession(userId, numberId)?.socket
        ) {
            throw new Error('WhatsApp socket was replaced before pairing.');
        }

        const code = await session.socket.requestPairingCode(cleanNumber);

        session.status = 'connecting';
        session.qr = null;

        await this.updateSessionRegistry(userId, numberId, {
            status: 'connecting'
        });

        return code;
    }

    async disconnectSession(userId, numberId = 'default') {
        userId = String(userId);
        numberId = String(numberId);

        const sessions = this.getUserSessions(userId);
        const session = sessions.get(numberId);

        if (!session) {
            return false;
        }

        // 1. Mark session stopping to block any new queueing or flushing
        session.stopping = true;

        // 2. Clear timers and pending dirty files so no sync can recreate Firestore files
        if (session.reconnectTimer) {
            clearTimeout(session.reconnectTimer);
            session.reconnectTimer = null;
        }

        if (session.syncTimer) {
            clearTimeout(session.syncTimer);
            session.syncTimer = null;
        }

        if (session.dirtyFiles) {
            session.dirtyFiles.clear();
        }

        // 3. Destroy socket with logout
        await this.destroySocket(session, { logout: true });

        // 4. Shutdown session memory
        try {
            await session.memory?.shutdown();
        } catch {}

        // 5. Delete Firestore auth files and session registry
        await this.deletePersistedAuthFiles(session);
        await this.deleteSessionRegistry(userId, numberId);

        // 6. Clear local auth directory
        await this.clearAuthDir(session.authDir);

        session.status = 'logged_out';
        sessions.delete(numberId);

        if (sessions.size === 0) {
            this.sessions.delete(userId);
        }

        return true;
    }

    async shutdown() {
        for (const [userId, sessions] of this.sessions) {
            for (const [numberId, session] of sessions) {
                session.stopping = true;

                if (session.reconnectTimer) {
                    clearTimeout(session.reconnectTimer);
                    session.reconnectTimer = null;
                }
            }
        }

        // Flush all pending dirty files to Firestore before exit
        await this.flushAllPendingSync();

        for (const [userId, sessions] of this.sessions) {
            for (const [numberId, session] of sessions) {
                await this.destroySocket(session);

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

module.exports = new WhatsAppSessionManager();
