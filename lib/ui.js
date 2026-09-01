const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const config = require('../config');
const { readJson } = require('./database');
const { formatRuntime } = require('../utils/format');

const BRAND = 'JACKIOKO TEC';
const TAGLINE = 'Building the Future of WhatsApp Bots';
const RULE = '━━━━━━━━━━━━━━━━━━';

const categoryMeta = {
  utility: { title: 'GENERAL', icon: '📂', order: 10 },
  admin: { title: 'ADMIN', icon: '👑', order: 20 },
  ai: { title: 'AI', icon: '🤖', order: 30 },
  assistant: { title: 'ASSISTANT', icon: '🧠', order: 35 },
  downloader: { title: 'DOWNLOAD', icon: '🎵', order: 40 },
  download: { title: 'DOWNLOAD', icon: '🎵', order: 40 },
  search: { title: 'SEARCH', icon: '🔎', order: 50 },
  tools: { title: 'TOOLS', icon: '⚙', order: 60 },
  converter: { title: 'CONVERTER', icon: '🔁', order: 70 },
  media: { title: 'MEDIA', icon: '🎨', order: 80 },
  group: { title: 'GROUP', icon: '👥', order: 90 },
  fun: { title: 'FUN', icon: '🎭', order: 100 },
  games: { title: 'GAMES', icon: '🎮', order: 110 },
  education: { title: 'EDUCATION', icon: '🎓', order: 120 },
  owner: { title: 'OWNER', icon: '🛡', order: 130 },
  system: { title: 'SYSTEM', icon: '🧩', order: 140 }
};

function footer() {
  return `${RULE}\n\n*${BRAND}*\n\n${TAGLINE}\n\n${RULE}`;
}

function withFooter(text) {
  const body = String(text || '').trim();
  if (!body) return footer();
  if (body.includes(TAGLINE)) return body;
  return `${body}\n\n${footer()}`;
}

function box(lines) {
  return [
    '╭━━━━━━━━━━━━━━━━━━━━━━━╮',
    ...lines.map((line, index) => index === 1 ? `┃${line}` : `┃ ${line}`),
    '╰━━━━━━━━━━━━━━━━━━━━━━━╯'
  ].join('\n');
}

function status(type, text) {
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠',
    loading: '⏳',
    permission: '🔒',
    group: '👥',
    private: '💬',
    info: 'ℹ'
  };
  return `${icons[type] || icons.info} ${text}`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '0 MB';
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function nowParts() {
  const now = new Date();
  return {
    date: now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: config.timezone }),
    time: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: config.timezone })
  };
}

function getDisplayName(message) {
  return message.raw.pushName || message.senderNumber || 'Guest';
}

function getStats(commands, appState, prefix) {
  const users = Object.keys(readJson('users.json')).length;
  const groups = Object.keys(readJson('groups.json')).length;
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();
  const cpuMs = ((cpu.user + cpu.system) / 1000).toFixed(0);
  const { date, time } = nowParts();
  return {
    botName: BRAND,
    owner: BRAND,
    runtime: formatRuntime(process.uptime()),
    ram: `${formatBytes(memory.rss)} RSS`,
    cpu: `${cpuMs}ms`,
    ping: `${Math.max(1, Math.round(process.uptime() % 100))}ms`,
    platform: `${os.platform()} ${os.arch()}`,
    node: process.version,
    totalCommands: commands.size,
    users,
    groups,
    uptime: formatRuntime(process.uptime()),
    currentTime: time,
    currentDate: date,
    prefix,
    version: config.version,
    mode: config.mode,
    messages: appState.messages,
    commandsUsed: appState.commandsUsed
  };
}

function buildMenu(ctx) {
  const stats = getStats(ctx.commands, ctx.appState, ctx.prefix);
  const grouped = {};
  for (const command of ctx.commands.values()) {
    const key = String(command.category || 'utility').toLowerCase();
    grouped[key] ||= [];
    grouped[key].push(command);
  }

  const sections = Object.entries(grouped)
    .sort(([a], [b]) => (categoryMeta[a]?.order || 999) - (categoryMeta[b]?.order || 999) || a.localeCompare(b))
    .map(([category, commands]) => {
      const meta = categoryMeta[category] || { title: category.toUpperCase(), icon: '📁' };
      const body = [...new Set(commands.map((command) => command.name))].sort().map((name) => `• ${ctx.prefix}${name}`).join('\n');
      return `${meta.icon} *${meta.title}*\n\n${body}`;
    });

  const headerLines = [
    `🤖 *${BRAND}*`,
    `👤 Owner : ${stats.owner}`,
    `🧾 Bot : ${stats.botName}`,
    `🚀 Version : ${stats.version}`,
    `⏱ Runtime : ${stats.runtime}`,
    `📶 Ping : ${stats.ping}`,
    `💾 Memory : ${stats.ram}`,
    `🔣 Prefix : ${stats.prefix}`,
    `📦 Commands : ${stats.totalCommands}`,
    `📅 Date : ${stats.currentDate}`,
    `🕒 Time : ${stats.currentTime}`
  ];

  return [
    box(headerLines),
    '',
    sections.join(`\n\n${RULE}\n\n`),
    '',
    `💡 Reply with a command name to view help, or use ${ctx.prefix}help <command>.`,
    '',
    RULE
  ].join('\n');
}

function buildHelp(command, prefix) {
  return box([
    `🧩 *${BRAND} HELP*`,
    '┃━━━━━━━━━━━━━━━━━━━━━━━',
    `⚙ Command : ${prefix}${command.name}`,
    `📂 Category : ${command.category}`,
    `📝 About : ${command.description}`,
    `⌨ Usage : ${prefix}${command.usage || command.name}`,
    `⏱ Cooldown : ${command.cooldown}s`
  ]);
}

async function ensureMenuImage() {
  const pngTarget = path.join(config.mediaDir, 'jackioko-tec-menu.png');
  const svgTarget = path.join(config.mediaDir, 'jackioko-tec-menu.svg');
  if (await fs.pathExists(pngTarget)) return pngTarget;
  if (await fs.pathExists(svgTarget)) return svgTarget;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#07111f"/>
      <stop offset="0.48" stop-color="#123c69"/>
      <stop offset="1" stop-color="#0c7b68"/>
    </linearGradient>
    <linearGradient id="line" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#38f8ff"/>
      <stop offset="1" stop-color="#8fffce"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="675" fill="url(#bg)"/>
  <path d="M0 565 C260 475 420 680 720 575 C910 510 1010 460 1200 505 L1200 675 L0 675 Z" fill="#05101c" opacity="0.55"/>
  <rect x="78" y="78" width="1044" height="519" rx="34" fill="none" stroke="url(#line)" stroke-width="5"/>
  <text x="600" y="255" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="86" font-weight="800" fill="#ffffff">JACKIOKO TEC</text>
  <text x="600" y="340" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" fill="#c9fff3">Building the Future of WhatsApp Bots</text>
  <text x="600" y="430" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#9bd8ff">Premium WhatsApp Automation • Version 2.0</text>
  <circle cx="160" cy="150" r="10" fill="#8fffce"/><circle cx="1040" cy="525" r="10" fill="#38f8ff"/>
</svg>`;
  await fs.ensureDir(config.mediaDir);
  try {
    const sharp = require('sharp');
    await sharp(Buffer.from(svg)).png().toFile(pngTarget);
    return pngTarget;
  } catch {
    await fs.writeFile(svgTarget, svg);
    return svgTarget;
  }
}

async function sendMenu(ctx) {
  const caption = buildMenu(ctx);
  const imagePath = config.thumbnail || await ensureMenuImage();
  const payload = {
    image: { url: imagePath },
    caption,
    footer: BRAND,
    contextInfo: {
      externalAdReply: {
        title: BRAND,
        body: TAGLINE,
        mediaType: 1,
        renderLargerThumbnail: true,
        showAdAttribution: false,
        sourceUrl: 'https://wa.me/'
      }
    }
  };

  try {
    return await ctx.sock.sendMessage(ctx.message.chat, payload, { quoted: ctx.message.raw });
  } catch {
    return ctx.message.reply(caption);
  }
}

module.exports = {
  BRAND,
  TAGLINE,
  RULE,
  footer,
  withFooter,
  box,
  status,
  buildMenu,
  buildHelp,
  getStats,
  sendMenu
};
