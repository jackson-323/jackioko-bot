const express = require('express');
const fs = require('fs-extra');
const path = require('path');

const whatsappSessionManager = require('../whatsapp/session-manager');

const router = express.Router();

const accountsRoot = path.resolve(
  process.cwd(),
  'database',
  'memory',
  'accounts'
);
const maxMessageLimit = 100;
const maxPage = 100;
const maxRetainedMessages = 10000;
const maxJsonFileBytes = 50 * 1024 * 1024;
const safeIdentifierPattern = /^[A-Za-z0-9_-]{1,128}$/;

function isContainedPath(parentPath, childPath) {
  const relativePath = path.relative(parentPath, childPath);
  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
  );
}

function isSafeIdentifier(value) {
  return typeof value === 'string' && safeIdentifierPattern.test(value);
}

function requireAuthentication(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({
      success: false,
      error: 'You must be logged in.'
    });
  }

  return next();
}

function getUserAccountsRoot(userId) {
  const userRoot = path.resolve(accountsRoot, String(userId));

  if (!isContainedPath(accountsRoot, userRoot)) {
    return null;
  }

  return userRoot;
}

async function resolveOwnedNumber(userId, numberId) {
  if (!isSafeIdentifier(numberId)) {
    return null;
  }

  const userRoot = getUserAccountsRoot(userId);
  if (!userRoot) {
    return null;
  }

  const activeSession = whatsappSessionManager.getSession(userId, numberId);
  const numberRoot = path.resolve(userRoot, numberId);
  const memoryRoot = path.resolve(numberRoot, 'memory');

  if (!isContainedPath(userRoot, numberRoot) || !isContainedPath(numberRoot, memoryRoot)) {
    return null;
  }

  if (activeSession) {
    if (!(await fs.pathExists(memoryRoot))) {
      return null;
    }
  }

  if (!(await fs.pathExists(memoryRoot))) {
    return null;
  }

  const realAccountsRoot = await fs.realpath(accountsRoot);
  const realUserRoot = await fs.realpath(userRoot);
  const realNumberRoot = await fs.realpath(numberRoot);
  const realMemoryRoot = await fs.realpath(memoryRoot);

  if (
    !isContainedPath(realAccountsRoot, realUserRoot) ||
    !isContainedPath(realUserRoot, realNumberRoot) ||
    !isContainedPath(realNumberRoot, realMemoryRoot)
  ) {
    return null;
  }

  return {
    numberId,
    numberRoot: realNumberRoot,
    memoryRoot: realMemoryRoot,
    session: activeSession || null
  };
}

async function getDirectoryEntries(directoryPath) {
  try {
    return await fs.readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function readJsonFile(filePath) {
  const fileStats = await fs.stat(filePath);
  if (fileStats.size > maxJsonFileBytes) {
    return null;
  }

  const data = await fs.readJson(filePath, { throws: false });
  return Array.isArray(data) ? data : null;
}

function parseTimestamp(value, fieldName) {
  if (value === undefined) {
    return null;
  }

  const timestamp = /^\d+$/.test(String(value))
    ? Number(value)
    : Date.parse(String(value));

  if (!Number.isFinite(timestamp)) {
    const error = new Error(`${fieldName} must be a valid date or timestamp.`);
    error.statusCode = 400;
    throw error;
  }

  return timestamp;
}

function messageMatches(message, filters) {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const messageText = String(message.text || '').toLowerCase();
  if (filters.search && !messageText.includes(filters.search)) {
    return false;
  }
  if (filters.sender && String(message.sender || '') !== filters.sender) {
    return false;
  }
  if (filters.chat && String(message.chat || '') !== filters.chat) {
    return false;
  }

  const timestamp = Number(message.timestamp);
  if (!Number.isFinite(timestamp)) {
    return false;
  }
  if (filters.from !== null && timestamp < filters.from) {
    return false;
  }
  if (filters.to !== null && timestamp > filters.to) {
    return false;
  }

  return true;
}

function retainNewestMessages(messages, candidates) {
  for (const message of messages) {
    if (messageMatches(message, candidates.filters)) {
      candidates.messages.push(message);
    }
  }

  candidates.messages.sort((left, right) => {
    const timestampDifference = Number(right.timestamp) - Number(left.timestamp);
    if (timestampDifference !== 0) {
      return timestampDifference;
    }
    return String(right.id || '').localeCompare(String(left.id || ''));
  });

  if (candidates.messages.length > maxRetainedMessages) {
    candidates.messages.length = maxRetainedMessages;
  }
}

async function collectMessages(memoryRoot, filters) {
  const usersRoot = path.resolve(memoryRoot, 'users');
  const candidates = { filters, messages: [] };
  const userEntries = await getDirectoryEntries(usersRoot);

  for (const userEntry of userEntries) {
    if (!userEntry.isDirectory()) {
      continue;
    }

    const userRoot = path.resolve(usersRoot, userEntry.name);
    if (!isContainedPath(usersRoot, userRoot)) {
      continue;
    }

    const messageFile = path.resolve(userRoot, 'messages.json');
    if (isContainedPath(userRoot, messageFile) && await fs.pathExists(messageFile)) {
      const messages = await readJsonFile(messageFile);
      if (messages) {
        retainNewestMessages(messages, candidates);
      }
    }

    const archiveRoot = path.resolve(userRoot, 'archive');
    if (!isContainedPath(userRoot, archiveRoot)) {
      continue;
    }

    const archiveEntries = await getDirectoryEntries(archiveRoot);
    for (const archiveEntry of archiveEntries) {
      if (!archiveEntry.isFile() || !/^messages_[A-Za-z0-9_-]+\.json$/.test(archiveEntry.name)) {
        continue;
      }

      const archiveFile = path.resolve(archiveRoot, archiveEntry.name);
      if (!isContainedPath(archiveRoot, archiveFile)) {
        continue;
      }

      const messages = await readJsonFile(archiveFile);
      if (messages) {
        retainNewestMessages(messages, candidates);
      }
    }
  }

  return candidates.messages;
}

async function getMessageCount(memoryRoot) {
  const totalFile = path.resolve(memoryRoot, 'statistics', 'total.json');
  if (!isContainedPath(memoryRoot, totalFile) || !(await fs.pathExists(totalFile))) {
    return null;
  }

  const stats = await fs.readJson(totalFile, { throws: false });
  return Number.isFinite(stats?.total) ? stats.total : null;
}

router.use(requireAuthentication);

router.get('/numbers', async (req, res) => {
  try {
    const userId = String(req.session.userId);
    const userRoot = getUserAccountsRoot(userId);
    const numbers = new Map();
    const sessions = whatsappSessionManager.getAllSessionStatuses(userId);

    for (const session of sessions) {
      if (isSafeIdentifier(String(session.numberId))) {
        numbers.set(String(session.numberId), session);
      }
    }

    if (userRoot && await fs.pathExists(userRoot)) {
      const entries = await getDirectoryEntries(userRoot);
      for (const entry of entries) {
        if (!entry.isDirectory() || !isSafeIdentifier(entry.name)) {
          continue;
        }

        const ownedNumber = await resolveOwnedNumber(userId, entry.name);
        if (ownedNumber && !numbers.has(entry.name)) {
          numbers.set(entry.name, {
            numberId: entry.name,
            status: 'disconnected',
            connected: false,
            number: null,
            registered: false
          });
        }
      }
    }

    const data = [];
    for (const [numberId, session] of numbers) {
      const ownedNumber = await resolveOwnedNumber(userId, numberId);
      if (!ownedNumber) {
        continue;
      }

      data.push({
        numberId,
        number: session.number || ownedNumber.session?.number || null,
        status: session.status || ownedNumber.session?.status || 'disconnected',
        registered: Boolean(session.registered || ownedNumber.session?.registered),
        connected: Boolean(session.connected || ownedNumber.session?.status === 'connected'),
        messageCount: await getMessageCount(ownedNumber.memoryRoot)
      });
    }

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to load archive numbers.' });
  }
});

router.get('/:numberId/messages', async (req, res) => {
  try {
    const numberId = String(req.params.numberId);
    const ownedNumber = await resolveOwnedNumber(req.session.userId, numberId);
    if (!ownedNumber) {
      return res.status(404).json({ success: false, error: 'Archive number not found.' });
    }

    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 50);
    if (!Number.isInteger(page) || page < 1 || page > maxPage) {
      return res.status(400).json({ success: false, error: `page must be an integer from 1 to ${maxPage}.` });
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > maxMessageLimit) {
      return res.status(400).json({ success: false, error: `limit must be an integer from 1 to ${maxMessageLimit}.` });
    }

    const filters = {
      search: String(req.query.search || '').trim().toLowerCase(),
      sender: req.query.sender ? String(req.query.sender) : null,
      chat: req.query.chat ? String(req.query.chat) : null,
      from: parseTimestamp(req.query.from, 'from'),
      to: parseTimestamp(req.query.to, 'to')
    };

    const messages = await collectMessages(ownedNumber.memoryRoot, filters);
    const start = (page - 1) * limit;
    const data = messages.slice(start, start + limit);

    return res.json({
      success: true,
      data: {
        numberId,
        messages: data,
        page,
        limit,
        hasMore: start + data.length < messages.length
      }
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      error: statusCode === 500 ? 'Failed to load archive messages.' : error.message
    });
  }
});

router.get('/:numberId/stats', async (req, res) => {
  try {
    const numberId = String(req.params.numberId);
    const ownedNumber = await resolveOwnedNumber(req.session.userId, numberId);
    if (!ownedNumber) {
      return res.status(404).json({ success: false, error: 'Archive number not found.' });
    }

    const statisticsRoot = path.resolve(ownedNumber.memoryRoot, 'statistics');
    const totalFile = path.resolve(statisticsRoot, 'total.json');
    const dailyRoot = path.resolve(statisticsRoot, 'daily');
    const total = isContainedPath(statisticsRoot, totalFile) && await fs.pathExists(totalFile)
      ? await fs.readJson(totalFile, { throws: false })
      : null;
    const daily = [];
    const dailyEntries = await getDirectoryEntries(dailyRoot);

    for (const entry of dailyEntries
      .filter((item) => item.isFile() && /^\d{4}-\d{2}-\d{2}\.json$/.test(item.name))
      .sort((left, right) => right.name.localeCompare(left.name))
      .slice(0, 30)) {
      const dailyFile = path.resolve(dailyRoot, entry.name);
      if (isContainedPath(dailyRoot, dailyFile)) {
        const stats = await fs.readJson(dailyFile, { throws: false });
        if (stats && typeof stats === 'object' && !Array.isArray(stats)) {
          daily.push({ date: entry.name.slice(0, 10), ...stats });
        }
      }
    }

    return res.json({ success: true, data: { numberId, total, daily } });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to load archive statistics.' });
  }
});

module.exports = router;