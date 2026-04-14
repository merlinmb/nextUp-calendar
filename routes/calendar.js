'use strict';

const express = require('express');
const router = express.Router();
const google = require('../services/google');
const microsoft = require('../services/microsoft');

/**
 * GET /api/calendar/events?start=<ISO>&end=<ISO>
 *
 * Returns merged events from all connected accounts sorted by start time.
 */
router.get('/events', async (req, res) => {
  const { start, end } = req.query;

  if (!start || !end) {
    return res
      .status(400)
      .json({ error: 'start and end query parameters are required' });
  }

  const startDate = new Date(start);
  const endDate = new Date(end);

  if (isNaN(startDate) || isNaN(endDate)) {
    return res.status(400).json({ error: 'Invalid date format' });
  }

  const [gResult, msResult] = await Promise.allSettled([
    google.getCalendarEvents(startDate.toISOString(), endDate.toISOString()),
    microsoft.getCalendarEvents(startDate.toISOString(), endDate.toISOString()),
  ]);

  const events = [
    ...(gResult.status === 'fulfilled' ? gResult.value : []),
    ...(msResult.status === 'fulfilled' ? msResult.value : []),
  ].sort((a, b) => new Date(a.start) - new Date(b.start));

  const errors = {};
  if (gResult.status === 'rejected') {
    errors.google = gResult.reason?.message || 'Unknown error';
    console.error('[calendar] Google error:', gResult.reason?.message);
  }
  if (msResult.status === 'rejected') {
    errors.microsoft = msResult.reason?.message || 'Unknown error';
    console.error('[calendar] Microsoft error:', msResult.reason?.message);
  }

  res.json({ events, errors: Object.keys(errors).length ? errors : null });
});

module.exports = router;
