'use strict';

const express          = require('express');
const router           = express.Router();
const cache            = require('../services/cache');
const { expandEvents } = require('../services/recurrence');

const REQUIRED_FIELDS = ['id', 'title', 'start', 'end'];

/**
 * POST /events
 * Body: { "events": [ ...eventObjects ] }
 * Auth: Bearer API_WRITE_TOKEN (applied in server.js)
 *
 * Replaces all previously pushed external events.
 * Events with a recurrence field are expanded into instances.
 * Returns: { accepted, expanded, stored }
 */
router.post('/', (req, res) => {
  const { events } = req.body;

  if (!Array.isArray(events)) {
    return res.status(400).json({ error: '"events" must be an array' });
  }

  if (events.length === 0) {
    cache.pushExternalEvents([]);
    return res.json({ accepted: 0, expanded: 0, stored: 0 });
  }

  // Validate each event
  const errors = [];
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (typeof ev !== 'object' || ev === null) {
      errors.push(`events[${i}]: must be an object`);
      continue;
    }
    for (const field of REQUIRED_FIELDS) {
      if (ev[field] == null || ev[field] === '') {
        errors.push(`events[${i}]: missing required field "${field}"`);
      }
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  // Count how many have recurrence rules before expansion
  const withRecurrence = events.filter(
    ev => ev.recurrence && typeof ev.recurrence === 'object'
  ).length;

  // Expand all events (those without recurrence return as single-element arrays)
  const expanded = expandEvents(events);

  cache.pushExternalEvents(expanded);

  res.json({
    accepted: events.length,
    expanded: withRecurrence,
    stored:   expanded.length,
  });
});

module.exports = router;
