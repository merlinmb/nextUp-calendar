'use strict';

const express = require('express');
const router  = express.Router();
const { getSettings }                          = require('../services/store');
const { getSubscriptions, saveSubscription, removeSubscription } = require('../services/store');

// GET /api/notifications/vapid-public-key
router.get('/vapid-public-key', (req, res) => {
  const settings = getSettings();
  if (!settings.vapidPublicKey) {
    return res.status(503).json({ error: 'Push notifications not yet initialised — restart the server' });
  }
  res.json({ publicKey: settings.vapidPublicKey });
});

// POST /api/notifications/subscribe
// Body: full PushSubscription JSON { endpoint, keys: { p256dh, auth } }
router.post('/subscribe', (req, res) => {
  const sub = req.body;
  if (!sub || !sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return res.status(400).json({ error: 'Invalid subscription object' });
  }
  saveSubscription(sub);
  res.status(201).json({ ok: true });
});

// DELETE /api/notifications/unsubscribe
// Body: { endpoint }
router.delete('/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) {
    return res.status(400).json({ error: 'Missing endpoint' });
  }
  removeSubscription(endpoint);
  res.status(204).end();
});

module.exports = router;
