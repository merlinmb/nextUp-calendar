'use strict';

const express = require('express');
const router = express.Router();
const { getSettings, saveSettings } = require('../services/store');
const cache = require('../services/cache');

// GET /api/settings — returns settings, masking credential values
router.get('/', (req, res) => {
  const s = getSettings();
  res.json({
    view: s.view,
    theme: s.theme,
    weekStart: s.weekStart,
    showWeekends: s.showWeekends,
    continuousDays: s.continuousDays,
    monthMaxEvents: s.monthMaxEvents,
    googleDisabledCalendars:    s.googleDisabledCalendars    || [],
    microsoftDisabledCalendars: s.microsoftDisabledCalendars || [],
    google: {
      clientId: s.google?.clientId || '',
      // Never expose the secret — only signal whether it is set
      hasClientSecret: !!(s.google?.clientSecret),
    },
    microsoft: {
      clientId: s.microsoft?.clientId || '',
      tenantId: s.microsoft?.tenantId || 'common',
      hasClientSecret: !!(s.microsoft?.clientSecret),
    },
    // Effective URL: saved setting takes priority over env var
    appUrl: s.appUrl || process.env.APP_URL || 'http://homebridge.local:3050',
  });
});

// POST /api/settings — partial update (credentials only overwritten when provided)
router.post('/', (req, res) => {
  const current = getSettings();
  const body = req.body;

  // Display preferences
  const updated = {
    view: body.view ?? current.view,
    theme: body.theme ?? current.theme,
    weekStart: body.weekStart ?? current.weekStart,
    showWeekends: body.showWeekends ?? current.showWeekends,
    continuousDays: (Number.isInteger(body.continuousDays) && body.continuousDays >= 7)
      ? body.continuousDays : current.continuousDays,
    monthMaxEvents: (Number.isInteger(body.monthMaxEvents) && body.monthMaxEvents >= 1)
      ? body.monthMaxEvents : current.monthMaxEvents,
    googleDisabledCalendars: Array.isArray(body.googleDisabledCalendars)
      ? body.googleDisabledCalendars
      : (current.googleDisabledCalendars || []),
    microsoftDisabledCalendars: Array.isArray(body.microsoftDisabledCalendars)
      ? body.microsoftDisabledCalendars
      : (current.microsoftDisabledCalendars || []),
    appUrl: body.appUrl !== undefined ? body.appUrl.trim() : current.appUrl,
    google: { ...current.google },
    microsoft: { ...current.microsoft },
  };

  // Only update credential fields when the caller actually sends them
  if (body.google) {
    if (body.google.clientId !== undefined)
      updated.google.clientId = body.google.clientId.trim();
    if (body.google.clientSecret && body.google.clientSecret !== '')
      updated.google.clientSecret = body.google.clientSecret;
  }

  if (body.microsoft) {
    if (body.microsoft.clientId !== undefined)
      updated.microsoft.clientId = body.microsoft.clientId.trim();
    if (body.microsoft.tenantId !== undefined)
      updated.microsoft.tenantId = body.microsoft.tenantId.trim() || 'common';
    if (body.microsoft.clientSecret && body.microsoft.clientSecret !== '')
      updated.microsoft.clientSecret = body.microsoft.clientSecret;
  }

  saveSettings(updated);

  // Refresh cache immediately if calendar selection changed
  const gChanged  = JSON.stringify(updated.googleDisabledCalendars)   !== JSON.stringify(current.googleDisabledCalendars   || []);
  const msChanged = JSON.stringify(updated.microsoftDisabledCalendars) !== JSON.stringify(current.microsoftDisabledCalendars || []);
  if (gChanged || msChanged) {
    cache.sync().catch(() => {});
  }

  res.json({ ok: true });
});

module.exports = router;
