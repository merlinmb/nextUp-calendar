'use strict';

const DEFAULT_REFRESH_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_SERVER_URL = normalizeServerUrl(window.electronAPI.serverUrl);

// Runtime values — may be overridden by user-config.json
let activeServerUrl = DEFAULT_SERVER_URL;
let activeReadToken = window.electronAPI.readToken;
let activeRefreshMs = DEFAULT_REFRESH_MS;
let refreshTimer    = null;

const bodyEl       = document.getElementById('widget-body');
const settingsEl   = document.getElementById('settings-panel');
const gearBtn      = document.getElementById('gear-btn');
const serverInput  = document.getElementById('cfg-server');
const tokenInput   = document.getElementById('cfg-token');
const revealBtn    = document.getElementById('cfg-token-reveal');
const refreshInput = document.getElementById('cfg-refresh');
const cancelBtn    = document.getElementById('cfg-cancel');
const saveBtn      = document.getElementById('cfg-save');
const statusEl     = document.getElementById('cfg-status');

// ── Date helpers ──────────────────────────────────────────────

// Returns local date string YYYY-MM-DD for a Date object
function localDateStr(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function eventDateStr(ev) {
  if (ev.isAllDay) return ev.start; // already YYYY-MM-DD
  return localDateStr(new Date(ev.start));
}

function formatTime(isoStr) {
  const d = new Date(isoStr);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 || 12;
  return m === 0
    ? `${h12}${ampm}`
    : `${h12}:${String(m).padStart(2, '0')}${ampm}`;
}

function formatHeaderDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const days   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

function normalizeServerUrl(value, baseServerUrl = window.electronAPI.serverUrl) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';

  const baseUrl = new URL(baseServerUrl);
  let parsedUrl;

  if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(raw)) {
    parsedUrl = new URL(raw);
  } else if (raw.includes('/')) {
    parsedUrl = new URL(`${baseUrl.protocol}//${raw}`);
  } else {
    parsedUrl = new URL(baseServerUrl);
    parsedUrl.host = raw;
  }

  if (!/^https?:$/.test(parsedUrl.protocol)) {
    throw new Error('Server must use http or https');
  }

  const normalizedPath = parsedUrl.pathname === '/'
    ? ''
    : parsedUrl.pathname.replace(/\/+$/, '');

  return `${parsedUrl.origin}${normalizedPath}`;
}

// ── Render ────────────────────────────────────────────────────

function renderDay(dateStr, events, isToday) {
  const section = document.createElement('div');
  section.className = 'day-section';

  // Header
  const header = document.createElement('div');
  header.className = 'day-section-header';

  const label = document.createElement('span');
  label.className = 'day-label' + (isToday ? ' is-today' : '');
  label.textContent = isToday ? 'TODAY' : 'TOMORROW';

  const dateEl = document.createElement('span');
  dateEl.className = 'day-date';
  dateEl.textContent = formatHeaderDate(dateStr);

  header.appendChild(label);
  header.appendChild(dateEl);
  section.appendChild(header);

  const allDay = events.filter(ev => ev.isAllDay);
  const timed  = events.filter(ev => !ev.isAllDay);

  // All-day chips
  if (allDay.length > 0) {
    const strip = document.createElement('div');
    strip.className = 'allday-strip';
    for (const ev of allDay) {
      const chip = document.createElement('span');
      chip.className = `allday-chip ${ev.source}`;
      chip.textContent = ev.title;
      chip.title = ev.title;
      strip.appendChild(chip);
    }
    section.appendChild(strip);
  }

  // Timed events
  for (const ev of timed) {
    const row = document.createElement('div');
    row.className = 'event-row';

    const timeEl = document.createElement('div');
    timeEl.className = 'event-row-time';
    timeEl.textContent = formatTime(ev.start);

    const bar = document.createElement('div');
    bar.className = `event-row-bar ${ev.source}`;

    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'event-row-body';

    const titleEl = document.createElement('div');
    titleEl.className = 'event-row-title';
    titleEl.textContent = ev.title;
    bodyDiv.appendChild(titleEl);

    if (ev.calendarName) {
      const meta = document.createElement('div');
      meta.className = 'event-row-meta';
      meta.textContent = ev.calendarName;
      bodyDiv.appendChild(meta);
    }

    row.appendChild(timeEl);
    row.appendChild(bar);
    row.appendChild(bodyDiv);
    section.appendChild(row);
  }

  // Empty state
  if (allDay.length === 0 && timed.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'day-empty';
    empty.textContent = 'No events';
    section.appendChild(empty);
  }

  return section;
}

function renderEvents(events) {
  const todayStr    = localDateStr(new Date());
  const tomorrowStr = localDateStr(new Date(Date.now() + 24 * 60 * 60 * 1000));

  const todayEvs    = events.filter(ev => eventDateStr(ev) === todayStr);
  const tomorrowEvs = events.filter(ev => eventDateStr(ev) === tomorrowStr);

  bodyEl.innerHTML = '';
  bodyEl.appendChild(renderDay(todayStr,    todayEvs,    true));
  bodyEl.appendChild(renderDay(tomorrowStr, tomorrowEvs, false));
}

// ── Fetch ─────────────────────────────────────────────────────

let lastSyncedAt = null;

async function fetchEvents() {
  const serverUrl = activeServerUrl;
  const readToken = activeReadToken;
  const url = `${serverUrl}/jsonCalendar?timeframe=2d`;
  console.log(`[fetch] GET ${url}`);
  try {
    const resp = await fetch(url, {
      headers: readToken ? { 'Authorization': `Bearer ${readToken}` } : {},
    });
    console.log(`[fetch] response status=${resp.status} ok=${resp.ok}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    console.log(`[fetch] received ${(data.events || []).length} events`);

    renderEvents(data.events || []);

    lastSyncedAt = new Date();
  } catch (err) {
    console.error(`[fetch] failed: ${err.message}`);

    if (!lastSyncedAt) {
      bodyEl.innerHTML = '<div class="widget-status">Can\'t reach server</div>';
    }
  }
}

// ── Background clock ──────────────────────────────────────────

const clockEl = document.getElementById('bg-clock');

function tickClock() {
  const now  = new Date();
  const h    = String(now.getHours()).padStart(2, '0');
  const m    = String(now.getMinutes()).padStart(2, '0');
  clockEl.textContent = `${h}:${m}`;
}

tickClock();
setInterval(tickClock, 5000); // update every 5 s — no need for per-second redraws

// ── Settings panel ────────────────────────────────────────────

function showSettings() {
  // Populate fields with current active values
  serverInput.value  = activeServerUrl !== DEFAULT_SERVER_URL ? activeServerUrl : '';
  serverInput.placeholder = DEFAULT_SERVER_URL;
  tokenInput.value   = activeReadToken !== window.electronAPI.readToken
    ? activeReadToken   // show override if one is set
    : '';               // blank = "using default"
  tokenInput.type        = 'password';
  revealBtn.textContent  = '\u{1F441}';
  refreshInput.value = Math.round(activeRefreshMs / 60000);
  statusEl.textContent = '';
  statusEl.className   = 'settings-status';

  bodyEl.hidden     = true;
  settingsEl.hidden = false;
}

function hideSettings() {
  settingsEl.hidden = true;
  bodyEl.hidden     = false;
}

function startRefreshTimer() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(fetchEvents, activeRefreshMs);
}

gearBtn.addEventListener('click', showSettings);
cancelBtn.addEventListener('click', hideSettings);

revealBtn.addEventListener('click', () => {
  const isPassword = tokenInput.type === 'password';
  tokenInput.type = isPassword ? 'text' : 'password';
  revealBtn.textContent = isPassword ? '\u{1F648}' : '\u{1F441}';
});

saveBtn.addEventListener('click', async () => {
  saveBtn.disabled = true;
  statusEl.textContent = 'Saving\u2026';
  statusEl.className   = 'settings-status';

  const serverVal  = serverInput.value.trim();
  const tokenVal   = tokenInput.value.trim();
  const refreshVal = parseInt(refreshInput.value, 10);
  let normalizedServerUrl = '';

  if (serverVal) {
    try {
      normalizedServerUrl = normalizeServerUrl(serverVal, DEFAULT_SERVER_URL);
    } catch (err) {
      statusEl.textContent = 'Server must be a valid hostname or http(s) URL.';
      statusEl.className   = 'settings-status error';
      saveBtn.disabled = false;
      return;
    }
  }

  if (refreshInput.value !== '' && (isNaN(refreshVal) || refreshVal < 1 || refreshVal > 60)) {
    statusEl.textContent = 'Refresh must be 1\u201360 minutes.';
    statusEl.className   = 'settings-status error';
    saveBtn.disabled = false;
    return;
  }

  const overrides = {};
  if (normalizedServerUrl) overrides.serverUrl = normalizedServerUrl;
  // Only save non-empty token overrides
  if (tokenVal) overrides.readToken = tokenVal;
  if (!isNaN(refreshVal) && refreshVal >= 1) overrides.refreshMs = refreshVal * 60 * 1000;

  try {
    const result = await window.electronAPI.saveConfig(overrides);
    if (!result.ok) throw new Error(result.error || 'Save failed');

    // Apply overrides live; empty token reverts to compiled default
    activeServerUrl = normalizedServerUrl || DEFAULT_SERVER_URL;
    activeReadToken = tokenVal || window.electronAPI.readToken;
    if (typeof overrides.refreshMs === 'number') {
      activeRefreshMs = overrides.refreshMs;
      startRefreshTimer();
    }

    saveBtn.disabled = false;
    hideSettings();
    fetchEvents();
  } catch (err) {
    console.error('[settings] save failed:', err);
    statusEl.textContent = 'Save failed. Check logs.';
    statusEl.className   = 'settings-status error';
    saveBtn.disabled = false;
  }
});

// ── Init ──────────────────────────────────────────────────────

async function init() {
  console.log(`[init] defaultServerUrl=${DEFAULT_SERVER_URL}`);

  // Load persisted overrides before first fetch
  try {
    const saved = await window.electronAPI.loadConfig();
    if (saved.serverUrl)  activeServerUrl = normalizeServerUrl(saved.serverUrl, DEFAULT_SERVER_URL);
    if (saved.readToken)  activeReadToken = saved.readToken;
    if (saved.refreshMs)  activeRefreshMs = saved.refreshMs;
    console.log(`[init] loaded user-config: serverUrl=${saved.serverUrl || 'default'} token=${saved.readToken ? 'set' : 'default'} refreshMs=${saved.refreshMs || 'default'}`);
  } catch (err) {
    console.warn('[init] could not load user-config:', err.message);
  }

  fetchEvents();
  startRefreshTimer();
}

// Refresh triggered by main process (on tray click show)
window.electronAPI.onRefresh(() => fetchEvents());

init();
