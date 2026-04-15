'use strict';

require('dotenv').config();

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const calendarRoutes = require('./routes/calendar');
const settingsRoutes = require('./routes/settings');

const app = express();
const PORT = process.env.PORT || 3050;

// ── Ensure data directory ────────────────────────────────────
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// ── Security headers ─────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'fonts.googleapis.com',
          'fonts.gstatic.com',
        ],
        fontSrc: ["'self'", 'fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// ── Body parsing ─────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Session ──────────────────────────────────────────────────
// Load or generate a stable session secret persisted in data/
const secretFile = path.join(dataDir, '.session_secret');
let sessionSecret;
if (fs.existsSync(secretFile)) {
  sessionSecret = fs.readFileSync(secretFile, 'utf8').trim();
} else {
  const { randomBytes } = require('crypto');
  sessionSecret = randomBytes(48).toString('hex');
  fs.writeFileSync(secretFile, sessionSecret, { mode: 0o600 });
}

app.use(
  session({
    secret: process.env.SESSION_SECRET || sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure:
        process.env.NODE_ENV === 'production' && process.env.HTTPS === 'true',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  })
);

// ── Static files ─────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Routes ───────────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/settings', settingsRoutes);

// ── Health check ─────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', version: '1.0.0' }));

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  const appUrl = process.env.APP_URL || `http://homebridge.local:${PORT}`;
  console.log('\n  ┌─────────────────────────────────┐');
  console.log('  │        nextUp Calendar          │');
  console.log('  ├─────────────────────────────────┤');
  console.log(`  │  URL  : ${appUrl.padEnd(23)} │`);
  console.log(`  │  Port : ${String(PORT).padEnd(23)} │`);
  console.log('  └─────────────────────────────────┘\n');
});
