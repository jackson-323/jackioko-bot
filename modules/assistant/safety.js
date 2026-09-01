const fs = require('fs-extra');
const path = require('path');

const DB = path.join(__dirname, '..', '..', 'database');
const FILE = path.join(DB, 'safety.json');

const SENSITIVE = ['money','bank','password','otp','medical','emergency','legal'];

async function ensure(){
  await fs.ensureDir(DB);
  if (!await fs.pathExists(FILE)) await fs.writeJson(FILE, { sensitiveKeywords: SENSITIVE }, { spaces: 2 });
}

function classify(text){
  if (!text) return 'normal';
  const t = text.toLowerCase();
  if (/\b(transfer|bank|account|iban|mpesa|pay|paybill|send money|withdraw)\b/.test(t)) return 'money';
  if (/\b(password|passcode|pin|login)\b/.test(t)) return 'password';
  if (/\b(otp|one time password|verification code)\b/.test(t)) return 'otp';
  if (/\b(doctor|hospital|symptom|prescription|pain|sick)\b/.test(t)) return 'medical';
  if (/\b(lawyer|sue|court|contract|agreement)\b/.test(t)) return 'legal';
  if (/\b(fire|help me|ambulance|danger|emergency)\b/.test(t)) return 'emergency';
  return 'normal';
}

function isSensitive(cat){
  return ['money','password','otp','medical','legal','emergency'].includes(cat);
}

module.exports = { ensure, classify, isSensitive };
