'use strict';

const express = require('express');
const router = express.Router();
const { getSettings, saveSettings } = require('../services/store');

// GET /api/settings — returns settings, masking credential values
router.get('/', (req, res) => {
  const s = getSettings();
  res.json({
    view: s.view,
    theme: s.theme,
    weekStart: s.weekStart,
    showWeekends: s.showWeekends,
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
    appUrl: process.env.APP_URL || 'http://homebridge.local:3000',
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
  res.json({ ok: true });
});

module.exports = router;
