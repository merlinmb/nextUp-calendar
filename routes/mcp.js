'use strict';

const express = require('express');
const router = express.Router();
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');
const cache = require('../services/cache');

const MAX_MS = 12 * 30 * 24 * 60 * 60 * 1000; // 12 months

function parseTimeframe(timeframe) {
  const match = /^(\d+)([hdm])$/.exec(String(timeframe).trim());
  if (!match) return null;

  const n = parseInt(match[1], 10);
  const unit = match[2];
  if (n <= 0) return null;

  let windowMs;
  if (unit === 'h') windowMs = n * 60 * 60 * 1000;
  else if (unit === 'd') windowMs = n * 24 * 60 * 60 * 1000;
  else windowMs = n * 30 * 24 * 60 * 60 * 1000;

  return Math.min(windowMs, MAX_MS);
}

function getCalendarEvents(timeframe) {
  const windowMs = parseTimeframe(timeframe);
  if (windowMs == null) {
    throw new Error('Invalid timeframe. Use format: 7d, 24h, 3m');
  }

  const now = new Date();
  const from = now;
  const to = new Date(now.getTime() + windowMs);

  const events = cache.getEvents()
    .filter((ev) => {
      const evStart = new Date(ev.isAllDay ? ev.start + 'T00:00:00' : ev.start);
      return evStart >= from && evStart < to;
    })
    .map((ev) => ({
      id: ev.id,
      title: ev.title,
      start: ev.start,
      end: ev.end,
      isAllDay: ev.isAllDay,
      location: ev.location || '',
      calendarName: ev.calendarName || '',
      source: ev.source,
    }));

  return { generated: now.toISOString(), timeframe, from: from.toISOString(), to: to.toISOString(), count: events.length, events };
}

function buildServer() {
  const server = new McpServer({ name: 'nextup-calendar', version: '1.0.0' });

  server.registerTool(
    'get_calendar_events',
    {
      title: 'Get calendar events',
      description: 'Fetch upcoming calendar events from the unified Google + Microsoft calendar feed within a given timeframe.',
      inputSchema: {
        timeframe: z
          .string()
          .describe('Look-ahead window from now, e.g. "24h", "7d", "3m" (hours/days/months). Capped at 12 months.'),
      },
    },
    async ({ timeframe }) => {
      try {
        const result = getCalendarEvents(timeframe);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: err.message }], isError: true };
      }
    }
  );

  return server;
}

// Stateless: a fresh server + transport per request, per MCP SDK's recommended
// pattern for simple deployments that don't need session resumption.
router.post('/', async (req, res) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on('close', () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('[mcp] request error:', err);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  }
});

router.get('/', (_req, res) => {
  res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed. Use POST.' }, id: null });
});

module.exports = router;
