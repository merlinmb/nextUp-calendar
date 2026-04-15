'use strict';

const express = require('express');
const router = express.Router();
const { exchangeCode: googleExchange, getAuthUrl: googleAuthUrl } = require('../services/google');
const { exchangeCode: msExchange, getAuthUrl: msAuthUrl } = require('../services/microsoft');
const { removeToken, getTokens } = require('../services/store');

// ── Google ────────────────────────────────────────────────────

router.get('/google', (req, res) => {
  const url = googleAuthUrl();
  if (!url) {
    return res.redirect('/?auth_error=google_no_credentials');
  }
  res.redirect(url);
});

router.get('/google/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error || !code) {
    console.error('[auth/google] callback error:', error);
    return res.redirect('/?auth_error=google_denied');
  }

  try {
    await googleExchange(code);
    res.redirect('/?auth_success=google');
  } catch (err) {
    console.error('[auth/google] exchange error:', err.message);
    res.redirect('/?auth_error=google_exchange');
  }
});

router.post('/google/disconnect', (req, res) => {
  removeToken('google');
  res.json({ ok: true });
});

// ── Microsoft ─────────────────────────────────────────────────

router.get('/microsoft', (req, res) => {
  // Generate a CSRF state token stored in session
  const state = require('crypto').randomBytes(16).toString('hex');
  req.session.msOAuthState = state;

  const url = msAuthUrl(state);
  if (!url) {
    return res.redirect('/?auth_error=ms_no_credentials');
  }
  res.redirect(url);
});

router.get('/microsoft/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error || !code) {
    console.error('[auth/ms] callback error:', error);
    return res.redirect('/?auth_error=ms_denied');
  }

  // CSRF check
  if (state !== req.session.msOAuthState) {
    console.error('[auth/ms] state mismatch');
    return res.redirect('/?auth_error=ms_state');
  }

  delete req.session.msOAuthState;

  try {
    await msExchange(code);
    res.redirect('/?auth_success=microsoft');
  } catch (err) {
    console.error('[auth/ms] exchange error:', err.message);
    res.redirect('/?auth_error=ms_exchange');
  }
});

router.post('/microsoft/disconnect', (req, res) => {
  removeToken('microsoft');
  res.json({ ok: true });
});

// ── Status ────────────────────────────────────────────────────

router.get('/status', (req, res) => {
  const tokens = getTokens();
  res.json({
    google: !!(tokens.google?.access_token),
    microsoft: !!(tokens.microsoft?.access_token),
  });
});

module.exports = router;
