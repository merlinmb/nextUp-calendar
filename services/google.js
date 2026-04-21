'use strict';

const { google } = require('googleapis');
const { getTokens, saveToken, getSettings } = require('./store');

// ── OAuth2 client factory ─────────────────────────────────────
function createOAuth2Client() {
  const settings = getSettings();
  const { clientId, clientSecret } = settings.google || {};
  if (!clientId || !clientSecret) return null;

  const appUrl = settings.appUrl || process.env.APP_URL || 'http://homebridge.local:3050';
  const redirectUri = `${appUrl}/auth/google/callback`;

  const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const tokens = getTokens();
  if (tokens.google) {
    client.setCredentials(tokens.google);

    // Persist any automatically refreshed tokens
    client.on('tokens', (refreshed) => {
      const current = getTokens().google || {};
      const merged = { ...current, ...refreshed };
      saveToken('google', merged);
      client.setCredentials(merged);
    });
  }

  return client;
}

// ── Auth URL ──────────────────────────────────────────────────
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

function getAuthUrl() {
  const client = createOAuth2Client();
  if (!client) return null;
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Always request refresh token
  });
}

// ── Exchange code for tokens ──────────────────────────────────
async function exchangeCode(code) {
  const client = createOAuth2Client();
  if (!client) throw new Error('Google credentials not configured');
  const { tokens } = await client.getToken(code);
  saveToken('google', tokens);
  return tokens;
}

// ── Fetch calendar events ────────────────────────────────────
async function getCalendarEvents(startISO, endISO) {
  const tokens = getTokens();
  if (!tokens.google?.access_token) return [];

  const client = createOAuth2Client();
  if (!client) return [];

  const calendarApi = google.calendar({ version: 'v3', auth: client });

  // Fetch all calendars the user has access to
  let calendarList;
  try {
    const resp = await calendarApi.calendarList.list({ minAccessRole: 'reader' });
    calendarList = resp.data.items || [];
  } catch (err) {
    console.error('[google] calendarList error:', err.message);
    return [];
  }

  // Skip calendars the user has disabled
  const disabled = getSettings().googleDisabledCalendars || [];
  if (disabled.length > 0) {
    calendarList = calendarList.filter((cal) => !disabled.includes(cal.id));
  }

  const results = await Promise.allSettled(
    calendarList.map((cal) =>
      calendarApi.events
        .list({
          calendarId: cal.id,
          timeMin: new Date(startISO).toISOString(),
          timeMax: new Date(endISO).toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 500,
        })
        .then((r) =>
          (r.data.items || []).map((ev) =>
            normaliseEvent(ev, cal.summary, cal.backgroundColor)
          )
        )
    )
  );

  const events = results.flatMap((r) =>
    r.status === 'fulfilled' ? r.value : []
  );

  return events.sort((a, b) => new Date(a.start) - new Date(b.start));
}

// ── List calendars ───────────────────────────────────────────
async function listCalendars() {
  const tokens = getTokens();
  if (!tokens.google?.access_token) return [];

  const client = createOAuth2Client();
  if (!client) return [];

  const calendarApi = google.calendar({ version: 'v3', auth: client });

  const resp = await calendarApi.calendarList.list({ minAccessRole: 'reader' });
  return (resp.data.items || []).map((cal) => ({
    id: cal.id,
    name: cal.summary || cal.id,
    color: cal.backgroundColor || null,
  }));
}

function normaliseEvent(ev, calName, calColor) {
  const isAllDay = Boolean(ev.start.date && !ev.start.dateTime);
  const start = isAllDay
    ? ev.start.date
    : new Date(ev.start.dateTime).toISOString();
  const end = isAllDay
    ? ev.end.date
    : new Date(ev.end.dateTime).toISOString();

  return {
    id: `g_${ev.id}`,
    title: ev.summary || '(No title)',
    start,
    end,
    isAllDay,
    description: ev.description || '',
    location: ev.location || '',
    source: 'google',
    calendarName: calName || 'Google Calendar',
    calendarColor: calColor || null,
    organizer: ev.organizer?.displayName || ev.organizer?.email || '',
    htmlLink: ev.htmlLink || null,
  };
}

// ── Connection status ─────────────────────────────────────────
function isConnected() {
  const tokens = getTokens();
  return !!(tokens.google?.access_token);
}

module.exports = { createOAuth2Client, getAuthUrl, exchangeCode, getCalendarEvents, listCalendars, isConnected };
