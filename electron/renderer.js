'use strict';

const REFRESH_MS = 15 * 60 * 1000; // 15 minutes

const bodyEl = document.getElementById('widget-body');
const syncEl = document.getElementById('sync-status');

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
  const serverUrl = window.electronAPI.serverUrl;
  try {
    const resp = await fetch(`${serverUrl}/jsonCalendar?timeframe=2d`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    renderEvents(data.events || []);

    lastSyncedAt = new Date();
    syncEl.className = 'widget-synced';
    syncEl.textContent = lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (err) {
    syncEl.className = 'widget-error';
    syncEl.textContent = 'unreachable';

    if (!lastSyncedAt) {
      bodyEl.innerHTML = '<div class="widget-status">Can\'t reach server</div>';
    }
  }
}

// ── Init ──────────────────────────────────────────────────────

fetchEvents();
setInterval(fetchEvents, REFRESH_MS);

// Refresh triggered by main process (on tray click show)
window.electronAPI.onRefresh(() => fetchEvents());
