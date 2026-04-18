'use strict';

/**
 * Microsoft Calendar service.
 *
 * Uses the Microsoft identity platform OAuth 2.0 authorization code flow
 * directly (no MSAL dependency) and the Microsoft Graph REST API.
 * 2FA is handled transparently by the Microsoft login page during the
 * browser redirect — we only deal with the resulting tokens.
 */

const { getTokens, saveToken, getSettings } = require('./store');

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const MS_SCOPES =
  'https://graph.microsoft.com/Calendars.Read offline_access User.Read';

// ── Auth URL ──────────────────────────────────────────────────
function getAuthUrl(state) {
  const settings = getSettings();
  const { clientId, tenantId } = settings.microsoft || {};
  if (!clientId) return null;

  const tenant = tenantId || 'common';
  const appUrl = settings.appUrl || process.env.APP_URL || 'http://homebridge.local:3050';
  const redirectUri = `${appUrl}/auth/microsoft/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: MS_SCOPES,
    state,
    // prompt: 'select_account' — optionally uncomment to always show account picker
  });

  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}`;
}

// ── Exchange code for tokens ──────────────────────────────────
async function exchangeCode(code) {
  const settings = getSettings();
  const { clientId, clientSecret, tenantId } = settings.microsoft || {};
  if (!clientId || !clientSecret) throw new Error('Microsoft credentials not configured');

  const tenant = tenantId || 'common';
  const appUrl = settings.appUrl || process.env.APP_URL || 'http://homebridge.local:3050';
  const redirectUri = `${appUrl}/auth/microsoft/callback`;

  const resp = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    }
  );

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Token exchange failed: ${body}`);
  }

  const data = await resp.json();
  const tokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  };

  saveToken('microsoft', tokenData);
  return tokenData;
}

// ── Token refresh ─────────────────────────────────────────────
async function refreshTokens() {
  const tokens = getTokens();
  const ms = tokens.microsoft;
  if (!ms?.refresh_token) return null;

  const settings = getSettings();
  const { clientId, clientSecret, tenantId } = settings.microsoft || {};
  if (!clientId || !clientSecret) return null;

  const tenant = tenantId || 'common';

  const resp = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: ms.refresh_token,
        grant_type: 'refresh_token',
        scope: MS_SCOPES,
      }).toString(),
    }
  );

  if (!resp.ok) return null;

  const data = await resp.json();
  const updated = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || ms.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  };

  saveToken('microsoft', updated);
  return updated.access_token;
}

// ── Valid access token (auto-refresh) ────────────────────────
async function getValidAccessToken() {
  const tokens = getTokens();
  const ms = tokens.microsoft;
  if (!ms) return null;

  // Refresh if expiry within 5 minutes
  if (ms.expires_at && Date.now() < ms.expires_at - 5 * 60 * 1000) {
    return ms.access_token;
  }

  return refreshTokens();
}

// ── Graph API helper ──────────────────────────────────────────
async function graphGet(path, token) {
  const resp = await fetch(`${GRAPH_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (resp.status === 401) {
    // One retry after token refresh
    const newToken = await refreshTokens();
    if (!newToken) return null;
    const retry = await fetch(`${GRAPH_BASE}${path}`, {
      headers: { Authorization: `Bearer ${newToken}` },
    });
    if (!retry.ok) return null;
    return retry.json();
  }

  if (!resp.ok) return null;
  return resp.json();
}

// ── Fetch calendar events ────────────────────────────────────
async function getCalendarEvents(startISO, endISO) {
  const token = await getValidAccessToken();
  if (!token) return [];

  const start = new Date(startISO).toISOString();
  const end = new Date(endISO).toISOString();

  // Get all calendars first
  const calListData = await graphGet('/me/calendars?$top=50', token);
  const calendars = calListData?.value || [];

  if (calendars.length === 0) {
    // Fallback: just use the primary calendar
    calendars.push({ id: null, name: 'Calendar' });
  }

  const results = await Promise.allSettled(
    calendars.map(async (cal) => {
      const calPath = cal.id
        ? `/me/calendars/${cal.id}/calendarView`
        : '/me/calendarView';

      const url =
        `${calPath}?startDateTime=${encodeURIComponent(start)}` +
        `&endDateTime=${encodeURIComponent(end)}` +
        `&$select=id,subject,start,end,isAllDay,body,location,organizer,webLink` +
        `&$orderby=start/dateTime` +
        `&$top=500`;

      const data = await graphGet(url, token);
      return (data?.value || []).map((ev) =>
        normaliseEvent(ev, cal.name || 'Calendar')
      );
    })
  );

  const events = results.flatMap((r) =>
    r.status === 'fulfilled' ? r.value : []
  );

  return events.sort((a, b) => new Date(a.start) - new Date(b.start));
}

function normaliseEvent(ev, calName) {
  const isAllDay = ev.isAllDay === true;
  const start = isAllDay
    ? (ev.start.date || ev.start.dateTime?.substring(0, 10))
    : new Date(ev.start.dateTime).toISOString();
  const end = isAllDay
    ? (ev.end.date || ev.end.dateTime?.substring(0, 10))
    : new Date(ev.end.dateTime).toISOString();

  return {
    id: `ms_${ev.id}`,
    title: ev.subject || '(No title)',
    start,
    end,
    isAllDay,
    description: ev.body?.content
      ? ev.body.content.replace(/<[^>]*>/g, ' ').trim()
      : '',
    location: ev.location?.displayName || '',
    source: 'microsoft',
    calendarName: calName,
    organizer: ev.organizer?.emailAddress?.name || '',
    htmlLink: ev.webLink || null,
  };
}

// ── Connection status ─────────────────────────────────────────
function isConnected() {
  const tokens = getTokens();
  return !!(tokens.microsoft?.access_token);
}

module.exports = { getAuthUrl, exchangeCode, getCalendarEvents, isConnected };
