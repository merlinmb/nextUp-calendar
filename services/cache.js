'use strict';

const google    = require('./google');
const microsoft = require('./microsoft');

// ── In-memory state ───────────────────────────────────────────
const state = {
  events:         [],   // Google + Microsoft (replaced every sync)
  externalEvents: [],   // Power Automate (replaced only by pushExternalEvents())
  lastSync:       null, // Date or null
  syncing:        false,
  error:          null, // string or null
};

// Sync window: -3 days to +90 days from now
const WINDOW_PAST_MS   = 3  * 24 * 60 * 60 * 1000;
const WINDOW_FUTURE_MS = 90 * 24 * 60 * 60 * 1000;

// ── Core sync ────────────────────────────────────────────────
async function sync() {
  if (state.syncing) return;
  state.syncing = true;

  const now   = Date.now();
  const start = new Date(now - WINDOW_PAST_MS).toISOString();
  const end   = new Date(now + WINDOW_FUTURE_MS).toISOString();

  try {
    const [gResult, msResult] = await Promise.allSettled([
      google.getCalendarEvents(start, end),
      microsoft.getCalendarEvents(start, end),
    ]);

    const events = [
      ...(gResult.status  === 'fulfilled' ? gResult.value  : []),
      ...(msResult.status === 'fulfilled' ? msResult.value : []),
    ].sort((a, b) => new Date(a.start) - new Date(b.start));

    state.events   = events;
    state.lastSync = new Date();
    state.error    = null;

    console.log(`[cache] sync complete — ${events.length} events`);
  } catch (err) {
    state.error = err.message || 'Unknown sync error';
    console.error('[cache] sync error:', state.error);
  } finally {
    state.syncing = false;
  }
}

// ── Scheduler ────────────────────────────────────────────────
const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

function startScheduler() {
  sync();
  setInterval(sync, INTERVAL_MS);
}

// ── Public API ───────────────────────────────────────────────

/**
 * Returns the merged, date-sorted union of Google/Microsoft events
 * and any externally pushed events.
 */
function getEvents() {
  return [...state.events, ...state.externalEvents]
    .sort((a, b) => new Date(a.start) - new Date(b.start));
}

function getStatus() {
  return {
    lastSync: state.lastSync,
    syncing:  state.syncing,
    error:    state.error,
  };
}

/**
 * Atomically replace all externally pushed events.
 * Called by POST /events — the background sync never touches externalEvents.
 */
function pushExternalEvents(events) {
  state.externalEvents = events;
  console.log(`[cache] external events updated — ${events.length} stored`);
}

module.exports = { startScheduler, getEvents, getStatus, sync, pushExternalEvents };
