const lastReplies = new Map();

function randomItem(array) {
  if (!Array.isArray(array) || array.length === 0) {
    return null;
  }

  return array[Math.floor(Math.random() * array.length)];
}

async function generate(category, data, user = {}) {
  if (!data || !Array.isArray(data.responses)) {
    return null;
  }

  const userId = user.id || user.jid || "global";
  const previous = lastReplies.get(userId);

  let reply = randomItem(data.responses);

  // Avoid sending the same reply twice in a row
  if (data.responses.length > 1) {
    let attempts = 0;

    while (reply === previous && attempts < 10) {
      reply = randomItem(data.responses);
      attempts++;
    }
  }

  lastReplies.set(userId, reply);

  return reply;
}

module.exports = {
  generate
};