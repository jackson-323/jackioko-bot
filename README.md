# JACKIOKO TEC WhatsApp Bot

JACKIOKO TEC is a premium 2026 WhatsApp chatbot built with Node.js 22, CommonJS, Baileys v7, Express, Axios, dotenv, pino, fs-extra, qrcode-terminal, and node-cache.

This project contains no loader, relay server, ZIP extraction bootstrap, or concealed off-project runtime. All runtime code lives in this directory.

## Features

- QR login and pair-code login
- Multi-file Baileys authentication in `auth_info_baileys/`
- Automatic reconnect and crash-safe error handlers
- Modular command loader with hot reload for `commands/`
- Prefix, owner, permission, cooldown, and anti-spam systems
- JSON database helpers for users, groups, and settings
- JACKIOKO TEC branded message logging, command timing, memory/status metrics
- Express status routes: `/`, `/ping`, `/status`
- Auto read, react, typing, recording, contact save, welcome, goodbye, anti-delete, anti-link, anti-bot, and database backup controls

## Installation

```bash
npm install
cp .env.example .env
npm start
```

Edit `.env` before starting in production:

```env
OWNER_NUMBER=254700000000
OWNER_NAME=JACKIOKO TEC
PREFIX=.
LOGIN_METHOD=qr
```

## Login

### QR Login

Set:

```env
LOGIN_METHOD=qr
```

Run:

```bash
npm start
```

Scan the QR code printed in the terminal with WhatsApp Linked Devices.

### Pair Code Login

Set:

```env
LOGIN_METHOD=pair
PAIRING_NUMBER=254700000000
```

Run:

```bash
npm start
```

The pair code is printed in the terminal. Enter it in WhatsApp Linked Devices.

## Commands

Commands are discovered recursively from `commands/`. Each command exports `name`, `aliases`, `category`, `description`, `usage`, `cooldown`, `owner`, `group`, `private`, and `run()`.

Installed categories include Admin, AI, Downloader, Fun, Games, Group, Media, Owner, Search, Tools, Utility, Converter, Education, and System.

## Development

```bash
npm run dev
npm run lint
npm run clean
```

Add a command by creating a new `.js` file anywhere under `commands/`. The bot reloads command files automatically.

## Deployment

### Docker

```bash
docker build -t jackioko-tec-bot .
docker run --env-file .env -p 3000:3000 -v "%cd%/auth_info_baileys:/app/auth_info_baileys" jackioko-tec-bot
```

### Railway

Create a Railway service from this folder, set the variables from `.env.example`, and use:

```bash
npm start
```

### Render

Use a Web Service or Background Worker with Node 22. Set environment variables in the Render dashboard and start with:

```bash
npm start
```

### Heroku

This repository includes `app.json`, `heroku.yml`, and a Dockerfile.

```bash
heroku stack:set container
heroku config:set OWNER_NUMBER=254700000000 LOGIN_METHOD=qr
git push heroku main
```

### Ubuntu VPS

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs ffmpeg
npm install
npm start
```

### Windows

Install Node.js 22 or newer, open PowerShell in the project folder, then run:

```powershell
npm install
npm start
```

### Termux

```bash
pkg update
pkg install nodejs ffmpeg
npm install
npm start
```

### PM2

```bash
npm install -g pm2
pm2 start index.js --name whatsapp-bot
pm2 save
pm2 startup
```

## Status API

- `GET /` returns a plain-text bot status.
- `GET /ping` returns uptime JSON.
- `GET /status` returns detailed runtime JSON.

## Data

JSON database files live in `database/`. Backups are written to `database/backups/`. Session files live in `auth_info_baileys/`; keep them private.

## Branding

All menus, help cards, info cards, owner responses, welcome and goodbye messages, sticker metadata, logs, and default footers are branded as JACKIOKO TEC.

Every WhatsApp reply ends with:

```text
━━━━━━━━━━━━━━━━━━

JACKIOKO TEC

Building the Future of WhatsApp Bots

━━━━━━━━━━━━━━━━━━
```
