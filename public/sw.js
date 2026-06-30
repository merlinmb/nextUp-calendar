/* ─────────────────────────────────────────────────────────────
   sw.js — service worker for push notifications
   ───────────────────────────────────────────────────────────── */

'use strict';

// ── Push event ────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'nextUp', body: event.data ? event.data.text() : '' };
  }

  const title   = data.title   || 'nextUp';
  const options = {
    body:    data.body    || '',
    icon:    '/favicon.svg',
    badge:   '/favicon.svg',
    tag:     data.eventId || 'nextup-notification',
    // Prevent duplicate notifications for the same event
    renotify: false,
    data: { url: data.url || '/' },
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ── Notification click ────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus an existing window if one is open
      for (const client of windowClients) {
        if (new URL(client.url).pathname === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// ── Install / Activate (no caching — server-rendered app) ─────

self.addEventListener('install', () => {
  // Skip waiting so the new SW activates immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});
