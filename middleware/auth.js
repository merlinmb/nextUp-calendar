'use strict';

/**
 * Bearer-token auth middleware.
 *
 * Reads Authorization: Bearer <token> from the request header.
 * Returns 401 JSON on missing or mismatched token.
 */

function makeTokenMiddleware(envVar, label) {
  return function (req, res, next) {
    const expected = process.env[envVar];
    if (!expected) {
      console.error(`[auth] ${envVar} is not set — rejecting ${label} request`);
      return res.status(500).json({ error: 'Server auth not configured' });
    }

    const header = req.headers['authorization'] || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token || token !== expected) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
  };
}

const requireReadToken  = makeTokenMiddleware('API_READ_TOKEN',  'read');
const requireWriteToken = makeTokenMiddleware('API_WRITE_TOKEN', 'write');

module.exports = { requireReadToken, requireWriteToken };
