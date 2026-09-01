const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });

function checkCooldown(user, command, seconds) {
  const key = `${user}:${command}`;
  const now = Date.now();
  const expires = cache.get(key) || 0;
  if (expires > now) return Math.ceil((expires - now) / 1000);
  cache.set(key, now + seconds * 1000, seconds + 5);
  return 0;
}

module.exports = { checkCooldown };
