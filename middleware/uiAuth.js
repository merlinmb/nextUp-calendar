'use strict';

/**
 * Middleware that protects web UI routes behind a session passphrase gate.
 * If the session is not authenticated, redirects to /login.
 */
function requireUiAuth(req, res, next) {
  if (req.session && req.session.uiAuthed) {
    return next();
  }
  // Only save returnTo for real page navigations, not asset fetches
  const url = req.originalUrl.split('?')[0];
  const isAsset = /\.(ico|png|svg|webp|jpg|jpeg|gif|css|js|woff2?|ttf)$/i.test(url);
  if (!isAsset) {
    req.session.returnTo = req.originalUrl;
  }
  res.redirect('/login');
}

module.exports = { requireUiAuth };
