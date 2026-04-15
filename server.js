'use strict';

require('dotenv').config();

const express = require('express');
const session = require('express-session');
const helmet  = require('helmet');
const path    = require('path');
const fs      = require('fs');

const authRoutes     = require('./routes/auth');
const calendarRoutes = require('./routes/calendar');
const settingsRoutes = require('./routes/settings');
const loginRoutes    = require('./routes/login');
const eventsRoutes   = require('./routes/events');
const cache          = require('./services/cache');
const { requireReadToken, requireWriteToken } = require('./middleware/auth');
const { requireUiAuth } = require('./middleware/uiAuth');

const app  = express();
const PORT = process.env.PORT || 3050;

// ── Ensure data directory ────────────────────────────────────
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// ── Security headers ─────────────────────────────────────────
// This app runs over plain HTTP on a local network (no TLS termination).
// upgrade-insecure-requests and COOP must be disabled to prevent the
// browser from trying to reload static assets over HTTPS.
const isHttps = process.env.HTTPS === 'true';

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
        // Only upgrade requests when actually serving HTTPS
        ...(isHttps ? {} : { upgradeInsecureRequests: null }),
      },
    },
    // COOP requires a trustworthy (HTTPS or localhost) origin; disable on HTTP
    crossOriginOpenerPolicy: isHttps ? { policy: 'same-origin' } : false,
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

// ── Public routes (no auth) ───────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', version: '1.0.0' }));
app.get('/openapi.yaml', (_req, res) =>
  res.sendFile(path.join(__dirname, 'openapi.yaml'))
);
app.use('/login', loginRoutes);

// ── Token-authenticated API routes ───────────────────────────
// POST /events — Power Automate write access
app.use('/events', requireWriteToken, eventsRoutes);

// GET /jsonCalendar — Electron widget read access
app.get('/jsonCalendar', requireReadToken, (req, res) => {
  const { timeframe } = req.query;

  if (!timeframe) {
    return res.status(400).json({ error: 'Missing timeframe parameter. Use format: 7d, 24h, 3m' });
  }

  const match = /^(\d+)([hdm])$/.exec(timeframe.trim());
  if (!match) {
    return res.status(400).json({ error: 'Invalid timeframe. Use format: 7d, 24h, 3m' });
  }

  const n    = parseInt(match[1], 10);
  const unit = match[2];

  if (n <= 0) {
    return res.status(400).json({ error: 'Timeframe value must be a positive integer' });
  }

  // Cap at 12 months
  const MAX_MS = 12 * 30 * 24 * 60 * 60 * 1000;

  let windowMs;
  if (unit === 'h')      windowMs = n * 60 * 60 * 1000;
  else if (unit === 'd') windowMs = n * 24 * 60 * 60 * 1000;
  else /* m */           windowMs = n * 30 * 24 * 60 * 60 * 1000;

  if (windowMs > MAX_MS) windowMs = MAX_MS;

  const now  = new Date();
  const from = now;
  const to   = new Date(now.getTime() + windowMs);

  const events = cache.getEvents()
    .filter((ev) => {
      const evStart = new Date(ev.isAllDay ? ev.start + 'T00:00:00' : ev.start);
      return evStart >= from && evStart < to;
    })
    .map((ev) => ({
      id:           ev.id,
      title:        ev.title,
      start:        ev.start,
      end:          ev.end,
      isAllDay:     ev.isAllDay,
      location:     ev.location || '',
      calendarName: ev.calendarName || '',
      source:       ev.source,
    }));

  res.json({
    generated: now.toISOString(),
    timeframe,
    from:  from.toISOString(),
    to:    to.toISOString(),
    count: events.length,
    events,
  });
});

// ── Static assets (CSS/JS) — public, needed by the login page ────────────
// Only expose the css/ and js/ subdirectories without auth, not index.html
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
app.use('/js',  express.static(path.join(__dirname, 'public', 'js')));

// ── UI-authenticated routes ───────────────────────────────────
// All remaining routes (including serving index.html) require the UI session
app.use(requireUiAuth);
app.use(express.static(path.join(__dirname, 'public')));
app.use('/auth',         authRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/settings', settingsRoutes);

// ── Start background cache sync ───────────────────────────────
cache.startScheduler();

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
