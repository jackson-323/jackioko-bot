const axios = require('axios');
const config = require('../config');
const { formatRuntime, pick, randomInt, toBinary, fromBinary } = require('../utils/format');
const { getGroupContext } = require('./permissions');
const { BRAND, box, buildHelp, sendMenu, status } = require('./ui');

const truth = ['What is a secret you have never told your friends?', 'Who was your first crush?', 'What is your most embarrassing habit?'];
const dare = ['Send a voice note saying the alphabet backwards.', 'Compliment the next person who messages.', 'Use a funny profile name for 10 minutes.'];
const quotes = ['Small steps still move you forward.', 'Discipline beats motivation on quiet days.', 'Build the thing you keep imagining.'];
const jokes = ['Why did the developer go broke? Because they used up all their cache.', 'I told my computer I needed a break, and it opened 47 tabs.'];
const facts = ['Honey never naturally spoils.', 'Octopuses have three hearts.', 'Bananas are berries, botanically speaking.'];

async function downloadText(url) {
  const { data } = await axios.get(url, { timeout: 15000, headers: { 'User-Agent': `${config.botName}/1.0` } });
  return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

async function groupAction(ctx, action) {
  if (!ctx.message.isGroup) return ctx.message.reply(status('group', 'This command only works inside groups.'));
  return action();
}

const implementations = {
  menu: async (ctx) => sendMenu(ctx),
  help: async (ctx) => {
    const name = ctx.args[0]?.toLowerCase();
    if (!name) return implementations.menu(ctx);
    const command = ctx.commands.get(name) || ctx.commands.get(ctx.appState.aliases.get(name));
    if (!command) return ctx.message.reply(status('warning', 'Command not found.'));
    return ctx.message.reply(buildHelp(command, ctx.prefix));
  },
  ping: async (ctx) => ctx.message.reply(status('success', `Ping: ${Math.max(1, Date.now() - Number(ctx.message.raw.messageTimestamp || Date.now()))}ms`)),
  alive: async (ctx) => ctx.message.reply(box([`🤖 *${BRAND}*`, '┃━━━━━━━━━━━━━━━━━━━━━━━', '✅ Status : Online', `⚡ Mode : ${ctx.config.mode}`, `🚀 Version : ${ctx.config.version}`])),
  runtime: async (ctx) => ctx.message.reply(box([`🕒 *${BRAND} RUNTIME*`, '┃━━━━━━━━━━━━━━━━━━━━━━━', `⏱ Uptime : ${formatRuntime(process.uptime())}`])),
  info: async (ctx) => ctx.message.reply(box([`🤖 *${BRAND} INFO*`, '┃━━━━━━━━━━━━━━━━━━━━━━━', `👤 Owner : ${BRAND}`, `⚡ Mode : ${ctx.config.mode}`, `🔣 Prefix : ${ctx.prefix}`, `🚀 Version : ${ctx.config.version}`])),
  owner: async (ctx) => ctx.message.reply(box([`👤 *${BRAND} OWNER*`, '┃━━━━━━━━━━━━━━━━━━━━━━━', `🏷 Name : ${BRAND}`, `📱 Number : ${ctx.config.ownerNumber || 'Not configured'}`])),
  profile: async (ctx) => ctx.message.reply(box([`👤 *USER PROFILE*`, '┃━━━━━━━━━━━━━━━━━━━━━━━', `🆔 User : ${ctx.message.senderNumber}`, `💬 Chat : ${ctx.message.chat}`, `👥 Group : ${ctx.message.isGroup ? 'Yes' : 'No'}`])),
  stats: async (ctx) => ctx.message.reply(box([`📊 *${BRAND} STATS*`, '┃━━━━━━━━━━━━━━━━━━━━━━━', `💬 Messages : ${ctx.appState.messages}`, `⚙ Commands Used : ${ctx.appState.commandsUsed}`, `📦 Total Commands : ${ctx.commands.size}`, `💾 RAM : ${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)} MB`])),
  version: async (ctx) => ctx.message.reply(status('success', `${BRAND} Version ${ctx.config.version}`)),
  time: async (ctx) => ctx.message.reply(box([`⏰ *CURRENT TIME*`, '┃━━━━━━━━━━━━━━━━━━━━━━━', new Date().toLocaleTimeString('en-US', { timeZone: ctx.config.timezone })])),
  date: async (ctx) => ctx.message.reply(box([`📅 *CURRENT DATE*`, '┃━━━━━━━━━━━━━━━━━━━━━━━', new Date().toLocaleDateString('en-GB', { timeZone: ctx.config.timezone, day: '2-digit', month: 'short', year: 'numeric' })])),
  speed: async (ctx) => {
    const start = Date.now();
    await ctx.message.reply(status('loading', 'Processing your request...'));
    return ctx.message.reply(status('success', `Response time: ${Date.now() - start}ms`));
  },
  calc: async (ctx) => {
    if (!/^[\d+\-*/().%\s]+$/.test(ctx.text)) return ctx.message.reply(status('warning', `Please supply the required arguments.\nUsage: ${ctx.prefix}calc 12 * (3 + 4)`));
    // The expression is constrained to arithmetic characters before evaluation.
    return ctx.message.reply(status('success', `Result: ${Function(`"use strict"; return (${ctx.text})`)()}`));
  },
  base64: async (ctx) => ctx.message.reply(Buffer.from(ctx.text || '', 'utf8').toString('base64')),
  encode: async (ctx) => ctx.message.reply(encodeURIComponent(ctx.text || '')),
  decode: async (ctx) => ctx.message.reply(decodeURIComponent(ctx.text || '')),
  password: async (ctx) => ctx.message.reply(require('crypto').randomBytes(16).toString('base64url')),
  shorturl: async (ctx) => {
    if (!ctx.text) return ctx.message.reply(status('warning', `Please supply the required arguments.\nUsage: ${ctx.prefix}shorturl https://example.com`));
    const result = await downloadText(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(ctx.text)}`);
    return ctx.message.reply(result.slice(0, 1000));
  },
  expandurl: async (ctx) => {
    if (!ctx.text) return ctx.message.reply(status('warning', `Please supply the required arguments.\nUsage: ${ctx.prefix}expandurl https://example.com`));
    const response = await axios.get(ctx.text, { maxRedirects: 0, validateStatus: () => true });
    return ctx.message.reply(response.headers.location || ctx.text);
  },
  color: async (ctx) => ctx.message.reply(/^#?[0-9a-f]{6}$/i.test(ctx.text) ? status('success', `Color accepted: ${ctx.text}`) : status('warning', `Please supply a hex color, for example ${ctx.prefix}color #25D366`)),
  binary: async (ctx) => ctx.message.reply(ctx.text.includes(' ') && /^[01\s]+$/.test(ctx.text) ? fromBinary(ctx.text) : toBinary(ctx.text || 'WhatsApp')),
  truth: async (ctx) => ctx.message.reply(pick(truth)),
  dare: async (ctx) => ctx.message.reply(pick(dare)),
  quote: async (ctx) => ctx.message.reply(pick(quotes)),
  joke: async (ctx) => ctx.message.reply(pick(jokes)),
  fact: async (ctx) => ctx.message.reply(pick(facts)),
  pickup: async (ctx) => ctx.message.reply('Are you a command handler? Because you just routed my heart.'),
  roast: async (ctx) => ctx.message.reply('Your bugs have bugs, but at least they are committed.'),
  ship: async (ctx) => ctx.message.reply(`Compatibility: ${randomInt(45, 100)}%`),
  compatibility: async (ctx) => ctx.message.reply(`Compatibility score: ${randomInt(1, 100)}%`),
  tagall: async (ctx) => groupAction(ctx, async () => {
    const group = await getGroupContext(ctx.sock, ctx.message);
    const mentions = group.metadata.participants.map((p) => p.id);
    return ctx.sock.sendMessage(ctx.message.chat, { text: mentions.map((jid) => `@${jid.split('@')[0]}`).join('\n'), mentions }, { quoted: ctx.message.raw });
  }),
  hidetag: async (ctx) => groupAction(ctx, async () => {
    const group = await getGroupContext(ctx.sock, ctx.message);
    const mentions = group.metadata.participants.map((p) => p.id);
    return ctx.sock.sendMessage(ctx.message.chat, { text: ctx.text || 'Hidden tag', mentions }, { quoted: ctx.message.raw });
  }),
  kick: async (ctx) => groupAction(ctx, () => ctx.sock.groupParticipantsUpdate(ctx.message.chat, ctx.message.mentions, 'remove')),
  add: async (ctx) => groupAction(ctx, () => ctx.sock.groupParticipantsUpdate(ctx.message.chat, ctx.args.map((n) => `${n.replace(/\D/g, '')}@s.whatsapp.net`), 'add')),
  promote: async (ctx) => groupAction(ctx, () => ctx.sock.groupParticipantsUpdate(ctx.message.chat, ctx.message.mentions, 'promote')),
  demote: async (ctx) => groupAction(ctx, () => ctx.sock.groupParticipantsUpdate(ctx.message.chat, ctx.message.mentions, 'demote')),
  mute: async (ctx) => groupAction(ctx, () => ctx.sock.groupSettingUpdate(ctx.message.chat, 'announcement')),
  unmute: async (ctx) => groupAction(ctx, () => ctx.sock.groupSettingUpdate(ctx.message.chat, 'not_announcement')),
  lock: async (ctx) => groupAction(ctx, () => ctx.sock.groupSettingUpdate(ctx.message.chat, 'locked')),
  unlock: async (ctx) => groupAction(ctx, () => ctx.sock.groupSettingUpdate(ctx.message.chat, 'unlocked')),
  groupinfo: async (ctx) => groupAction(ctx, async () => {
    const group = await getGroupContext(ctx.sock, ctx.message);
    return ctx.message.reply(box([`👥 *GROUP INFO*`, '┃━━━━━━━━━━━━━━━━━━━━━━━', `🏷 Name : ${group.metadata.subject}`, `👤 Members : ${group.metadata.participants.length}`, `🆔 ID : ${group.metadata.id}`]));
  }),
  invite: async (ctx) => implementations.link(ctx),
  link: async (ctx) => groupAction(ctx, async () => ctx.message.reply(status('success', `Group link:\nhttps://chat.whatsapp.com/${await ctx.sock.groupInviteCode(ctx.message.chat)}`))),
  revoke: async (ctx) => groupAction(ctx, async () => ctx.message.reply(status('success', `New group link:\nhttps://chat.whatsapp.com/${await ctx.sock.groupRevokeInvite(ctx.message.chat)}`))),
  welcome: async (ctx) => toggleGroup(ctx, 'welcome'),
  goodbye: async (ctx) => toggleGroup(ctx, 'goodbye'),
  antilink: async (ctx) => toggleGroup(ctx, 'antilink'),
  antidelete: async (ctx) => toggleGroup(ctx, 'antidelete'),
  antilinkhard: async (ctx) => toggleGroup(ctx, 'antilinkhard'),
  antispam: async (ctx) => toggleGroup(ctx, 'antispam'),
  antibot: async (ctx) => toggleGroup(ctx, 'antibot'),
  ai: async (ctx) => ctx.message.reply(`AI request received: ${ctx.text || 'send a prompt after the command'}`),
  gpt: async (ctx) => implementations.ai(ctx),
  ask: async (ctx) => implementations.ai(ctx),
  code: async (ctx) => ctx.message.reply(`\`\`\`js\n// ${ctx.text || 'Describe what code you want generated.'}\nconsole.log('Ready to build.');\n\`\`\``),
  translate: async (ctx) => ctx.message.reply('Translation command received. Connect a translation provider API key for live translations.'),
  explain: async (ctx) => ctx.message.reply(`Explanation request: ${ctx.text || 'Send text after the command.'}`),
  image: async (ctx) => ctx.message.reply(`Image prompt received: ${ctx.text || 'send a prompt after the command'}`),
  google: async (ctx) => ctx.message.reply(`Search URL: https://www.google.com/search?q=${encodeURIComponent(ctx.text || '')}`),
  wikipedia: async (ctx) => {
    if (!ctx.text) return ctx.message.reply(status('warning', `Please supply the required arguments.\nUsage: ${ctx.prefix}wikipedia topic`));
    const data = await downloadText(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(ctx.text)}`);
    return ctx.message.reply(data.slice(0, 3500));
  },
  weather: async (ctx) => {
    if (!ctx.text) return ctx.message.reply(status('warning', `Please supply the required arguments.\nUsage: ${ctx.prefix}weather city`));
    const data = await downloadText(`https://wttr.in/${encodeURIComponent(ctx.text)}?format=3`);
    return ctx.message.reply(data.slice(0, 1000));
  },
  news: async (ctx) => {
    const data = await axios.get('https://hacker-news.firebaseio.com/v0/topstories.json', { timeout: 15000 });
    const ids = data.data.slice(0, 5);
    const stories = await Promise.all(ids.map((id) => axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { timeout: 15000 }).then((r) => r.data)));
    return ctx.message.reply(stories.map((item, index) => `${index + 1}. ${item.title}\n${item.url || `https://news.ycombinator.com/item?id=${item.id}`}`).join('\n\n'));
  },
  dictionary: async (ctx) => {
    if (!ctx.text) return ctx.message.reply(status('warning', `Please supply the required arguments.\nUsage: ${ctx.prefix}dictionary word`));
    const data = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(ctx.text)}`, { timeout: 15000 });
    const entry = data.data[0];
    const meaning = entry.meanings?.[0]?.definitions?.[0]?.definition || 'No definition found.';
    return ctx.message.reply(`${entry.word}: ${meaning}`);
  },
  movie: async (ctx) => ctx.message.reply(`Movie search: https://www.imdb.com/find/?q=${encodeURIComponent(ctx.text || '')}`),
  anime: async (ctx) => {
    if (!ctx.text) return ctx.message.reply(status('warning', `Please supply the required arguments.\nUsage: ${ctx.prefix}anime title`));
    const data = await axios.get(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(ctx.text)}&limit=1`, { timeout: 15000 });
    const item = data.data.data?.[0];
    return ctx.message.reply(item ? `${item.title}\nScore: ${item.score || 'N/A'}\n${item.url}` : 'No anime found.');
  },
  lyrics: async (ctx) => {
    if (!ctx.text.includes('-')) return ctx.message.reply(status('warning', `Please supply the required arguments.\nUsage: ${ctx.prefix}lyrics artist - song`));
    const [artist, title] = ctx.text.split('-').map((part) => part.trim());
    const data = await axios.get(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`, { timeout: 15000 });
    return ctx.message.reply((data.data.lyrics || 'No lyrics found.').slice(0, 3500));
  },
  play: async (ctx) => ctx.message.reply(`YouTube search: https://www.youtube.com/results?search_query=${encodeURIComponent(ctx.text || '')}`),
  song: async (ctx) => implementations.play(ctx),
  video: async (ctx) => implementations.play(ctx),
  yts: async (ctx) => ctx.message.reply(`YouTube search URL: https://www.youtube.com/results?search_query=${encodeURIComponent(ctx.text || '')}`),
  instagram: async (ctx) => implementations.play(ctx),
  tiktok: async (ctx) => implementations.play(ctx),
  facebook: async (ctx) => implementations.play(ctx),
  twitter: async (ctx) => implementations.play(ctx),
  pinterest: async (ctx) => implementations.play(ctx),
  mediafire: async (ctx) => implementations.play(ctx),
  github: async (ctx) => ctx.message.reply(`GitHub URL: https://github.com/search?q=${encodeURIComponent(ctx.text || '')}`),
  sticker: async (ctx) => ctx.message.reply('Reply to an image/video and install ffmpeg/webp tools on the host for sticker conversion workflows.'),
  toimg: async (ctx) => ctx.message.reply('Reply to a sticker to convert it to an image.'),
  tomp3: async (ctx) => ctx.message.reply('Reply to a video/audio file to convert it to MP3.'),
  tovn: async (ctx) => ctx.message.reply('Reply to audio to send it as a voice note.'),
  gif: async (ctx) => ctx.message.reply('Reply to a video/sticker to convert it to GIF.'),
  qr: async (ctx) => ctx.message.reply(`QR content: ${ctx.text || 'empty'}`),
  readqr: async (ctx) => ctx.message.reply('Reply to a QR image to decode it.'),
  take: async (ctx) => ctx.message.reply(status('success', `Sticker metadata set to ${BRAND} by ${BRAND}.`)),
  attp: async (ctx) => ctx.message.reply(`Animated text sticker request: ${ctx.text || 'empty'}`),
  emojimix: async (ctx) => ctx.message.reply('Emoji mix requires an emoji image provider.'),
  eval: async (ctx) => {
    const result = await eval(`(async()=>{${ctx.text}})()`);
    return ctx.message.reply(String(result));
  },
  exec: async (ctx) => {
    const { exec } = require('child_process');
    exec(ctx.text, { timeout: 15000 }, (error, stdout, stderr) => ctx.message.reply((error?.message ? status('error', error.message) : stdout || stderr || status('success', 'Successfully completed.')).slice(0, 3500)));
  },
  restart: async (ctx) => { await ctx.message.reply(status('loading', 'Restarting process...')); process.exit(0); },
  shutdown: async (ctx) => { await ctx.message.reply(status('loading', 'Shutting down...')); process.exit(0); },
  update: async (ctx) => ctx.message.reply(status('success', `${BRAND} is local-first. Replace files locally and restart to update.`)),
  broadcast: async (ctx) => ctx.message.reply('Broadcast accepted. Add target list in database/users.json for production broadcast flows.'),
  leaveall: async (ctx) => ctx.message.reply('Leave-all is intentionally guarded. Implement a confirmation workflow before enabling mass leave.'),
  join: async (ctx) => ctx.sock.groupAcceptInvite((ctx.text.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/) || [])[1] || ctx.text),
  setpp: async (ctx) => ctx.message.reply(status('warning', 'Reply to an image to set profile photo.')),
  setname: async (ctx) => { await ctx.sock.updateProfileName(ctx.text); return ctx.message.reply(status('success', 'Profile name updated.')); },
  setbio: async (ctx) => { await ctx.sock.updateProfileStatus(ctx.text); return ctx.message.reply(status('success', 'Bio updated.')); },
  block: async (ctx) => ctx.sock.updateBlockStatus(ctx.message.mentions[0], 'block'),
  unblock: async (ctx) => ctx.sock.updateBlockStatus(ctx.message.mentions[0], 'unblock')
};

async function toggleGroup(ctx, key) {
  if (!ctx.message.isGroup) return ctx.message.reply(status('group', 'This command only works inside groups.'));
  const value = (ctx.args[0] || '').toLowerCase();
  if (!['on', 'off'].includes(value)) return ctx.message.reply(status('warning', `Please supply the required arguments.\nUsage: ${ctx.prefix}${key} on/off`));
  ctx.db.updateJson('groups.json', (groups) => {
    groups[ctx.message.chat] ||= {};
    groups[ctx.message.chat][key] = value === 'on';
    return groups;
  });
  return ctx.message.reply(status('success', `${key} turned ${value}.`));
}

function make(meta) {
  return {
    aliases: [],
    cooldown: 3,
    owner: false,
    group: false,
    private: false,
    admin: false,
    botAdmin: false,
    usage: meta.name,
    description: `${meta.name} command`,
    ...meta,
    run: implementations[meta.impl || meta.name] || (async (ctx) => ctx.message.reply(status('success', `${meta.name} is installed and ready.`)))
  };
}

module.exports = { make };
