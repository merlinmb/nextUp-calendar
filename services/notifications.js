'use strict';

/**
 * Notification scheduler — checks for upcoming events every minute
 * and sends web push notifications to all subscribed devices.
 *
 * Deduplication is in-memory: on server restart notifications may
 * re-fire for events within the current minute window.
 */

const webpush = require('web-push');
const cache   = require('./cache');
const store   = require('./store');

// In-memory dedup: "eventId:type" where type is 'timed' or 'allday'
const sent = new Set();

let intervalId    = null;
let lastCheckTime = Date.now();

// ── Helpers ───────────────────────────────────────────────────

/**
 * Parse "HH:MM" into { hours, minutes }.
 */
function parseTime(str) {
  const [h, m] = (str || '08:00').split(':').map(Number);
  return { hours: isNaN(h) ? 8 : h, minutes: isNaN(m) ? 0 : m };
}

/**
 * Build a local-midnight Date for a date string "YYYY-MM-DD" offset by
 * `daysBefore` days, then set the clock to `timeStr` ("HH:MM").
 */
function allDayTrigger(dateStr, daysBefore, timeStr) {
  // Parse YYYY-MM-DD as local date
  const [yr, mo, dy] = dateStr.split('-').map(Number);
  const d = new Date(yr, mo - 1, dy);           // local midnight of event day
  d.setDate(d.getDate() - daysBefore);          // subtract notification lead days
  const { hours, minutes } = parseTime(timeStr);
  d.setHours(hours, minutes, 0, 0);             // set notification time
  return d;
}

/**
 * Format a notification body for a timed event.
 * e.g. "Today at 3:00 PM" or "Mon 2 Jul at 9:30 AM"
 */
function formatTimedBody(start) {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());

  const timeStr = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (eventDay.getTime() === today.getTime()) {
    return `Today at ${timeStr}`;
  }

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (eventDay.getTime() === tomorrow.getTime()) {
    return `Tomorrow at ${timeStr}`;
  }

  return start.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
    + ` at ${timeStr}`;
}

/**
 * Format a notification body for an all-day event.
 * e.g. "Tomorrow" or "Mon 2 Jul"
 */
function formatAllDayBody(eventDateStr) {
  const [yr, mo, dy] = eventDateStr.split('-').map(Number);
  const eventDay = new Date(yr, mo - 1, dy);
  const now      = new Date();
  const today    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (eventDay.getTime() === today.getTime())     return 'All day today';
  if (eventDay.getTime() === tomorrow.getTime())  return 'All day tomorrow';

  return 'All day · ' + eventDay.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

// ── Push sender ───────────────────────────────────────────────

async function sendToAll(payload) {
  const subs = store.getSubscriptions();
  if (!subs.length) return;

  const payloadStr = JSON.stringify(payload);

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, payloadStr);
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Subscription is no longer valid — remove it
          store.removeSubscription(sub.endpoint);
        } else {
          console.error('[notifications] push send error:', err.message);
        }
      }
    })
  );
}

// ── Core check ────────────────────────────────────────────────

async function checkAndSend() {
  const settings = store.getSettings();
  const notif    = settings.notifications || {};

  if (!notif.enabled) return;

  const minutesBefore    = typeof notif.minutesBefore    === 'number' ? notif.minutesBefore    : 10;
  const allDayTime       = notif.allDayTime       || '08:00';
  const allDayDaysBefore = typeof notif.allDayDaysBefore === 'number' ? notif.allDayDaysBefore : 1;

  const now  = Date.now();
  const from = lastCheckTime;
  lastCheckTime = now;

  const events = cache.getEvents();

  for (const ev of events) {
    if (ev.isAllDay) {
      const key = `${ev.id}:allday`;
      if (sent.has(key)) continue;

      const trigger = allDayTrigger(ev.start, allDayDaysBefore, allDayTime);
      if (trigger.getTime() > from && trigger.getTime() <= now) {
        sent.add(key);
        await sendToAll({
          title:   ev.title,
          body:    formatAllDayBody(ev.start),
          eventId: ev.id,
          url:     '/',
        });
      }
    } else {
      const key = `${ev.id}:timed`;
      if (sent.has(key)) continue;

      const eventStart  = new Date(ev.start).getTime();
      const triggerTime = eventStart - minutesBefore * 60 * 1000;

      if (triggerTime > from && triggerTime <= now) {
        sent.add(key);
        await sendToAll({
          title:   ev.title,
          body:    formatTimedBody(new Date(ev.start)),
          eventId: ev.id,
          url:     '/',
        });
      }
    }
  }
}

// ── Lifecycle ─────────────────────────────────────────────────

function start() {
  if (intervalId) return;
  lastCheckTime = Date.now();
  // Run immediately, then every 60 seconds
  checkAndSend().catch((err) => console.error('[notifications] scheduler error:', err));
  intervalId = setInterval(() => {
    checkAndSend().catch((err) => console.error('[notifications] scheduler error:', err));
  }, 60 * 1000);
  console.log('[notifications] scheduler started');
}

function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

module.exports = { start, stop };
