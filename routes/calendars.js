'use strict';

const express   = require('express');
const router    = express.Router();
const google    = require('../services/google');
const microsoft = require('../services/microsoft');

// GET /api/calendars/google
router.get('/google', async (req, res) => {
  if (!google.isConnected()) return res.json([]);
  try {
    const calendars = await google.listCalendars();
    res.json(calendars);
  } catch (err) {
    console.error('[calendars/google] listCalendars error:', err.message);
    res.status(502).json({ error: 'Could not load calendars' });
  }
});

// GET /api/calendars/microsoft
router.get('/microsoft', async (req, res) => {
  if (!microsoft.isConnected()) return res.json([]);
  try {
    const calendars = await microsoft.listCalendars();
    res.json(calendars);
  } catch (err) {
    console.error('[calendars/microsoft] listCalendars error:', err.message);
    res.status(502).json({ error: 'Could not load calendars' });
  }
});

module.exports = router;
