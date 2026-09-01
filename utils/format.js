function formatRuntime(seconds) {
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600) % 24;
  const d = Math.floor(seconds / 86400);
  return `${d}d ${h}h ${m}m ${s}s`;
}

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function toBinary(text) {
  return [...text].map((char) => char.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
}

function fromBinary(binary) {
  return binary.split(/\s+/).map((bin) => String.fromCharCode(parseInt(bin, 2))).join('');
}

module.exports = { formatRuntime, pick, randomInt, toBinary, fromBinary };
