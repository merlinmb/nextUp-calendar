'use strict';

/**
 * Middleware that protects web UI routes behind a session passphrase gate.
 * If the session is not authenticated, redirects to /login.
 */
function requireUiAuth(req, res, next) {
  if (req.session && req.session.uiAuthed) {
    return next();
  }
  // Store the original URL so we can redirect back after login
  req.session.returnTo = req.originalUrl;
  res.redirect('/login');
}

module.exports = { requireUiAuth };
