const NodeCache = require('node-cache');
const config = require('../config');

const buckets = new NodeCache({ stdTTL: 300, checkperiod: 60 });

function checkSpam(sender) {
  const now = Date.now();
  const key = `spam:${sender}`;
  const bucket = buckets.get(key) || { hits: [], blockedUntil: 0 };
  if (bucket.blockedUntil > now) return { blocked: true, remainingMs: bucket.blockedUntil - now };
  bucket.hits = bucket.hits.filter((time) => now - time <= config.spam.windowMs);
  bucket.hits.push(now);
  if (bucket.hits.length > config.spam.maxMessages) {
    bucket.blockedUntil = now + config.spam.blockMs;
    buckets.set(key, bucket, Math.ceil(config.spam.blockMs / 1000) + 10);
    return { blocked: true, remainingMs: config.spam.blockMs };
  }
  buckets.set(key, bucket, Math.ceil(config.spam.windowMs / 1000) + 10);
  return { blocked: false, remainingMs: 0 };
}

module.exports = { checkSpam };
