'use strict';

const express = require('express');
const router = express.Router();
const google = require('../services/google');
const microsoft = require('../services/microsoft');
const cache = require('../services/cache');

/**
 * GET /api/calendar/events?start=<ISO>&end=<ISO>
 *
 * Serves from the in-memory cache. Falls back to a live fetch when the
 * cache has not yet been populated (cold start after server restart).
 */
router.get('/events', async (req, res) => {
  const { start, end } = req.query;

  if (!start || !end) {
    return res
      .status(400)
      .json({ error: 'start and end query parameters are required' });
  }

  const startDate = new Date(start);
  const endDate   = new Date(end);

  if (isNaN(startDate) || isNaN(endDate)) {
    return res.status(400).json({ error: 'Invalid date format' });
  }

  const status = cache.getStatus();
  let events;

  if (status.lastSync === null && !status.syncing) {
    // Cold start: cache not yet populated, fetch live
    console.log('[calendar] cold-start live fetch');
    const [gResult, msResult] = await Promise.allSettled([
      google.getCalendarEvents(startDate.toISOString(), endDate.toISOString()),
      microsoft.getCalendarEvents(startDate.toISOString(), endDate.toISOString()),
    ]);
    events = [
      ...(gResult.status  === 'fulfilled' ? gResult.value  : []),
      ...(msResult.status === 'fulfilled' ? msResult.value : []),
    ].sort((a, b) => new Date(a.start) - new Date(b.start));
  } else {
    // Normal path: filter cache to requested window
    events = cache.getEvents().filter((ev) => {
      const evStart = new Date(ev.isAllDay ? ev.start + 'T00:00:00' : ev.start);
      return evStart >= startDate && evStart < endDate;
    });
  }

  res.json({ events, errors: null });
});

module.exports = router;
