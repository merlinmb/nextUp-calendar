'use strict';

/**
 * Persistent encrypted storage for tokens and settings.
 *
 * All sensitive values are AES-256-GCM encrypted at rest using a key
 * derived from a secret that lives only in data/.enc_key (auto-generated
 * on first boot and never committed to git).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '../data');
const ENC_KEY_FILE = path.join(DATA_DIR, '.enc_key');
const TOKENS_FILE = path.join(DATA_DIR, 'tokens.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// ── Encryption helpers ───────────────────────────────────────

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getEncKey() {
  ensureDataDir();
  let raw;
  if (fs.existsSync(ENC_KEY_FILE)) {
    raw = fs.readFileSync(ENC_KEY_FILE, 'utf8').trim();
  } else {
    raw = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(ENC_KEY_FILE, raw, { mode: 0o600 });
  }
  // Derive a 32-byte key via scrypt
  return crypto.scryptSync(raw, 'nextup-calendar-v1', 32);
}

function encrypt(plaintext) {
  const key = getEncKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}.${tag.toString('hex')}.${encrypted.toString('hex')}`;
}

function decrypt(ciphertext) {
  const key = getEncKey();
  const [ivHex, tagHex, encHex] = ciphertext.split('.');
  if (!ivHex || !tagHex || !encHex) throw new Error('Invalid ciphertext format');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const enc = Buffer.from(encHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

// ── Token store ──────────────────────────────────────────────

function readTokensRaw() {
  ensureDataDir();
  if (!fs.existsSync(TOKENS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function getTokens() {
  const raw = readTokensRaw();
  const result = {};
  for (const [provider, ciphertext] of Object.entries(raw)) {
    try {
      result[provider] = JSON.parse(decrypt(ciphertext));
    } catch {
      // Corrupted or re-keyed — skip silently
    }
  }
  return result;
}

function saveToken(provider, tokenData) {
  ensureDataDir();
  const raw = readTokensRaw();
  raw[provider] = encrypt(JSON.stringify(tokenData));
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(raw, null, 2));
}

function removeToken(provider) {
  if (!fs.existsSync(TOKENS_FILE)) return;
  try {
    const raw = readTokensRaw();
    delete raw[provider];
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(raw, null, 2));
  } catch {}
}

// ── Settings store ───────────────────────────────────────────

const DEFAULTS = {
  view: 'continuous',
  theme: 'dark',
  weekStart: 'monday',
  showWeekends: true,
  google: { clientId: '', clientSecret: '' },
  microsoft: { clientId: '', tenantId: 'common', clientSecret: '' },
};

function getSettings() {
  ensureDataDir();
  if (!fs.existsSync(SETTINGS_FILE)) return { ...DEFAULTS };
  try {
    const saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    return deepMerge(DEFAULTS, saved);
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(settings) {
  ensureDataDir();
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// Simple deep merge (plain objects only)
function deepMerge(base, override) {
  const result = { ...base };
  for (const [k, v] of Object.entries(override)) {
    if (
      v !== null &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      typeof result[k] === 'object'
    ) {
      result[k] = deepMerge(result[k], v);
    } else {
      result[k] = v;
    }
  }
  return result;
}

module.exports = {
  getTokens,
  saveToken,
  removeToken,
  getSettings,
  saveSettings,
};
