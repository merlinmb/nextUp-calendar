'use strict';

const express = require('express');
const path    = require('path');
const router  = express.Router();

// GET /login — serve the login form
router.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

// POST /login — check the passphrase
router.post('/', (req, res) => {
  const { passphrase } = req.body;
  const expected = process.env.UI_PASSPHRASE;

  if (!expected) {
    console.error('[login] UI_PASSPHRASE is not set');
    return res.status(500).send('Server not configured');
  }

  if (passphrase && passphrase === expected) {
    req.session.uiAuthed = true;
    const returnTo = req.session.returnTo || '/';
    delete req.session.returnTo;
    return res.redirect(returnTo);
  }

  res.redirect('/login?error=1');
});

// POST /logout — clear the session
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
