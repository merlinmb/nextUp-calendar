/* ─────────────────────────────────────────────────────────────
   settings.js — settings drawer: load, render, save
   ───────────────────────────────────────────────────────────── */

'use strict';

const SettingsPanel = (() => {

  let current = {};

  // ── DOM refs ──────────────────────────────────────────────────

  const panel       = () => document.getElementById('settings-panel');
  const scrim       = () => document.getElementById('settings-scrim');
  const closeBtn    = () => document.getElementById('close-settings');
  const saveBtn     = () => document.getElementById('btn-save-settings');

  // ── Open / Close ──────────────────────────────────────────────

  async function open() {
    try {
      await updateAuthStatus();
      await load();
      panel().classList.remove('hidden');
    } catch (e) {
      console.error('[settings] open error:', e);
    }
  }

  function close() {
    panel().classList.add('hidden');
  }

  // ── Load from API ─────────────────────────────────────────────

  async function load() {
    try {
      const resp = await fetch('/api/settings');
      if (!resp.ok) return;
      current = await resp.json();
      render(current);
    } catch (e) {
      console.error('[settings] load error:', e);
    }
  }

  // ── Calendar checklists ───────────────────────────────────────

  async function loadCalendarList(provider, containerId, disabledIds) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '<span class="cal-checklist-loading">Loading…</span>';

    try {
      const resp = await fetch(`/api/calendars/${provider}`);
      if (!resp.ok) throw new Error(`calendars API ${resp.status}`);
      const calendars = await resp.json();
      const shouldEnableSingleGoogleCalendar =
        provider === 'google' &&
        calendars.length === 1 &&
        disabledIds.includes(calendars[0].id);
      const effectiveDisabledIds = shouldEnableSingleGoogleCalendar ? [] : disabledIds;

      if (!Array.isArray(calendars) || calendars.length === 0) {
        container.innerHTML = '<span class="cal-checklist-error">No calendars found</span>';
        return;
      }

      container.innerHTML = '';
      calendars.forEach((cal) => {
        const checked = !effectiveDisabledIds.includes(cal.id);
        const row = document.createElement('label');
        row.className = 'cal-check-row';

        const cb = document.createElement('input');
        cb.type    = 'checkbox';
        cb.checked = checked;
        cb.dataset.calId = cal.id;
        cb.addEventListener('change', () => saveCalendarSelection(provider));

        const name = document.createElement('span');
        name.className = 'cal-check-name';
        name.textContent = cal.name;

        row.appendChild(cb);
        row.appendChild(name);
        container.appendChild(row);
      });

      if (shouldEnableSingleGoogleCalendar) {
        await saveCalendarSelection(provider);
      }
    } catch {
      container.innerHTML = '<span class="cal-checklist-error">Could not load calendars</span>';
    }
  }

  async function saveCalendarSelection(provider) {
    const containerId = provider === 'google' ? 'g-cal-items' : 'ms-cal-items';
    const container   = document.getElementById(containerId);
    if (!container) return;

    const disabled = Array.from(container.querySelectorAll('input[type="checkbox"]'))
      .filter((cb) => !cb.checked)
      .map((cb) => cb.dataset.calId);

    const key = provider === 'google' ? 'googleDisabledCalendars' : 'microsoftDisabledCalendars';

    try {
      const resp = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: disabled }),
      });
      if (!resp.ok) throw new Error('Server rejected calendar selection');
      current[key] = disabled;
    } catch {
      App.toast('Failed to save calendar selection', 'error');
    }
  }

  // ── Render ────────────────────────────────────────────────────

  function render(s) {
    // Google
    setVal('g-client-id', s.google?.clientId || '');
    setPlaceholder('g-client-secret',
      s.google?.hasClientSecret ? '••••••  (saved — paste to replace)' : 'GOCSPX-…');

    // Microsoft
    setVal('ms-client-id', s.microsoft?.clientId || '');
    setVal('ms-tenant-id', s.microsoft?.tenantId || 'common');
    setPlaceholder('ms-client-secret',
      s.microsoft?.hasClientSecret ? '••••••  (saved — paste to replace)' : 'Secret value from Azure');

    // Segmented controls
    setSegment('setting-view', s.view || 'continuous');
    setSegment('setting-theme', s.theme || 'dark');
    setSegment('setting-week-start', s.weekStart || 'monday');

    // Server URL
    setVal('app-url', s.appUrl || '');

    // Number inputs
    const cdEl = document.getElementById('setting-continuous-days');
    if (cdEl) cdEl.value = s.continuousDays ?? 60;
    const mmEl = document.getElementById('setting-month-max-events');
    if (mmEl) mmEl.value = s.monthMaxEvents ?? 3;

    // OAuth URIs (live-update as user types)
    const base = s.appUrl || window.location.origin;
    document.getElementById('uri-google').textContent    = `${base}/auth/google/callback`;
    document.getElementById('uri-microsoft').textContent = `${base}/auth/microsoft/callback`;

    // Update redirect URI preview whenever the field changes
    document.getElementById('app-url').oninput = (e) => {
      const val = e.target.value.trim() || window.location.origin;
      document.getElementById('uri-google').textContent    = `${val}/auth/google/callback`;
      document.getElementById('uri-microsoft').textContent = `${val}/auth/microsoft/callback`;
    };

    // Calendar checklists — show only when connected
    const gWrap  = document.getElementById('g-cal-checklist');
    const msWrap = document.getElementById('ms-cal-checklist');

    if (gWrap) {
      const isConn = document.getElementById('g-conn-badge')?.classList.contains('connected');
      gWrap.style.display = isConn ? '' : 'none';
      if (isConn) {
        loadCalendarList('google', 'g-cal-items', s.googleDisabledCalendars || []);
      }
    }

    if (msWrap) {
      const isConn = document.getElementById('ms-conn-badge')?.classList.contains('connected');
      msWrap.style.display = isConn ? '' : 'none';
      if (isConn) {
        loadCalendarList('microsoft', 'ms-cal-items', s.microsoftDisabledCalendars || []);
      }
    }

    // Notification settings
    renderNotificationSettings(s);
  }

  function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }

  function setPlaceholder(id, text) {
    const el = document.getElementById(id);
    if (el) el.placeholder = text;
  }

  function setSegment(groupId, value) {
    const group = document.getElementById(groupId);
    if (!group) return;
    group.querySelectorAll('.seg-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.val === value);
    });
  }

  function getSegment(groupId) {
    const group = document.getElementById(groupId);
    if (!group) return null;
    const active = group.querySelector('.seg-btn.active');
    return active?.dataset.val ?? null;
  }

  // ── Notification settings ─────────────────────────────────────

  function renderNotificationSettings(s) {
    const n = s.notifications || {};
    const mbEl   = document.getElementById('notif-minutes-before');
    const atEl   = document.getElementById('notif-allday-time');
    const adEl   = document.getElementById('notif-allday-days');

    if (mbEl) mbEl.value = n.minutesBefore   ?? 10;
    if (atEl) atEl.value = n.allDayTime       || '08:00';
    if (adEl) adEl.value = n.allDayDaysBefore ?? 1;

    refreshNotifStatus();
  }

  /**
   * Convert a base64url VAPID public key to a Uint8Array that
   * pushManager.subscribe() expects as applicationServerKey.
   */
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw     = atob(base64);
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  }

  async function refreshNotifStatus() {
    const badge      = document.getElementById('notif-status-badge');
    const unsupEl    = document.getElementById('notif-unsupported');
    const actionsEl  = document.getElementById('notif-actions');
    const enableBtn  = document.getElementById('btn-notif-enable');
    const disableBtn = document.getElementById('btn-notif-disable');

    if (!badge) return;

    const supported = ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);

    if (!supported) {
      badge.textContent = 'Not supported';
      badge.className   = 'notif-status-badge notif-badge--unsupported';
      unsupEl?.classList.remove('hidden');
      actionsEl?.classList.add('hidden');
      return;
    }

    unsupEl?.classList.add('hidden');
    actionsEl?.classList.remove('hidden');

    const permission = Notification.permission;

    if (permission === 'denied') {
      badge.textContent = 'Blocked';
      badge.className   = 'notif-status-badge notif-badge--denied';
      enableBtn?.classList.add('hidden');
      disableBtn?.classList.add('hidden');
      return;
    }

    // Check whether we have an active push subscription
    try {
      const swReg = App.getSwRegistration();
      if (!swReg) {
        badge.textContent = 'Not enabled';
        badge.className   = 'notif-status-badge notif-badge--off';
        enableBtn?.classList.remove('hidden');
        disableBtn?.classList.add('hidden');
        return;
      }

      const sub = await swReg.pushManager.getSubscription();
      if (sub) {
        badge.textContent = 'Enabled';
        badge.className   = 'notif-status-badge notif-badge--on';
        enableBtn?.classList.add('hidden');
        disableBtn?.classList.remove('hidden');
      } else {
        badge.textContent = 'Not enabled';
        badge.className   = 'notif-status-badge notif-badge--off';
        enableBtn?.classList.remove('hidden');
        disableBtn?.classList.add('hidden');
      }
    } catch {
      badge.textContent = 'Not enabled';
      badge.className   = 'notif-status-badge notif-badge--off';
      enableBtn?.classList.remove('hidden');
      disableBtn?.classList.add('hidden');
    }
  }

  async function enableNotifications() {
    const enableBtn  = document.getElementById('btn-notif-enable');
    if (enableBtn) enableBtn.disabled = true;

    try {
      // 1. Fetch VAPID public key
      const keyResp = await fetch('/api/notifications/vapid-public-key');
      if (!keyResp.ok) throw new Error('Could not retrieve VAPID key');
      const { publicKey } = await keyResp.json();

      // 2. Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        App.toast('Notification permission was not granted', 'error');
        return;
      }

      // 3. Subscribe via push manager
      const swReg = App.getSwRegistration();
      if (!swReg) throw new Error('Service worker not ready — try reloading the page');

      const sub = await swReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // 4. Send subscription to server
      const subResp = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!subResp.ok) throw new Error('Failed to register subscription');

      App.toast('Notifications enabled', 'success');
    } catch (err) {
      App.toast(err.message || 'Failed to enable notifications', 'error');
    } finally {
      if (enableBtn) enableBtn.disabled = false;
      refreshNotifStatus();
    }
  }

  async function disableNotifications() {
    try {
      const swReg = App.getSwRegistration();
      if (!swReg) return;

      const sub = await swReg.pushManager.getSubscription();
      if (!sub) { await refreshNotifStatus(); return; }

      // Unsubscribe at browser level
      const endpoint = sub.endpoint;
      await sub.unsubscribe();

      // Remove from server
      await fetch('/api/notifications/unsubscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      });

      App.toast('Notifications disabled', 'success');
    } catch (err) {
      App.toast(err.message || 'Failed to disable notifications', 'error');
    } finally {
      refreshNotifStatus();
    }
  }

  // ── Save ──────────────────────────────────────────────────────

  async function save() {
    const cdRaw = parseInt(document.getElementById('setting-continuous-days').value, 10);
    const mmRaw = parseInt(document.getElementById('setting-month-max-events').value, 10);
    const mbRaw = parseInt(document.getElementById('notif-minutes-before')?.value || '10', 10);
    const adRaw = parseInt(document.getElementById('notif-allday-days')?.value || '1',  10);

    const body = {
      view:      getSegment('setting-view')       || 'continuous',
      theme:     getSegment('setting-theme')       || 'dark',
      weekStart: getSegment('setting-week-start')  || 'monday',
      appUrl:    document.getElementById('app-url').value.trim(),
      google: {
        clientId:     document.getElementById('g-client-id').value.trim(),
        clientSecret: document.getElementById('g-client-secret').value || undefined,
      },
      microsoft: {
        clientId:     document.getElementById('ms-client-id').value.trim(),
        tenantId:     document.getElementById('ms-tenant-id').value.trim() || 'common',
        clientSecret: document.getElementById('ms-client-secret').value || undefined,
      },
      notifications: {
        allDayTime: document.getElementById('notif-allday-time')?.value || '08:00',
      },
    };

    if (!Number.isNaN(cdRaw)) body.continuousDays = cdRaw;
    if (!Number.isNaN(mmRaw)) body.monthMaxEvents  = mmRaw;
    if (!Number.isNaN(mbRaw)) body.notifications.minutesBefore    = mbRaw;
    if (!Number.isNaN(adRaw)) body.notifications.allDayDaysBefore = adRaw;

    try {
      const resp = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error('Save failed');
      current = { ...current, ...body };
      App.applyTheme(body.theme);
      App.applySettings(body);
      close();
      App.toast('Settings saved', 'success');
    } catch (e) {
      App.toast('Failed to save settings', 'error');
    }
  }

  // ── Auth status ───────────────────────────────────────────────

  async function updateAuthStatus() {
    try {
      const resp = await fetch('/auth/status');
      if (!resp.ok) return;
      const { google, microsoft } = await resp.json();

      updateBadge('g-conn-badge', 'google', google);
      updateBadge('ms-conn-badge', 'microsoft', microsoft);

      // Update header dots
      const gDot  = document.querySelector('.conn-dot[data-source="google"]');
      const msDot = document.querySelector('.conn-dot[data-source="microsoft"]');
      if (gDot)  gDot.classList.toggle('connected', google);
      if (msDot) msDot.classList.toggle('connected', microsoft);
    } catch {}
  }

  function updateBadge(id, source, connected) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = connected ? 'Connected' : 'Not connected';
    el.className = `conn-badge${connected ? ` ${source} connected` : ''}`;
  }

  // ── Segmented controls ─────────────────────────────────────────

  function bindSegmentedControls() {
    document.querySelectorAll('.seg-ctrl').forEach(ctrl => {
      ctrl.addEventListener('click', (e) => {
        const btn = e.target.closest('.seg-btn');
        if (!btn) return;
        ctrl.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  // ── Connect / Disconnect ──────────────────────────────────────

  async function saveCredentialsAndRedirect(provider) {
    // Save credentials first, then initiate OAuth
    const saveBody = {};

    if (provider === 'google') {
      const clientId     = document.getElementById('g-client-id').value.trim();
      const clientSecret = document.getElementById('g-client-secret').value;
      if (!clientId) {
        App.toast('Enter a Client ID first', 'error');
        return;
      }
      saveBody.google = { clientId, clientSecret: clientSecret || undefined };
    } else {
      const clientId     = document.getElementById('ms-client-id').value.trim();
      const tenantId     = document.getElementById('ms-tenant-id').value.trim() || 'common';
      const clientSecret = document.getElementById('ms-client-secret').value;
      if (!clientId) {
        App.toast('Enter a Client ID first', 'error');
        return;
      }
      saveBody.microsoft = { clientId, tenantId, clientSecret: clientSecret || undefined };
    }

    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(saveBody),
      });
      window.location.href = `/auth/${provider}`;
    } catch {
      App.toast('Failed to save credentials', 'error');
    }
  }

  async function disconnect(provider) {
    try {
      await fetch(`/auth/${provider}/disconnect`, { method: 'POST' });
      await updateAuthStatus();
      App.toast(`${provider === 'google' ? 'Google' : 'Microsoft'} disconnected`, 'success');
    } catch {
      App.toast('Disconnect failed', 'error');
    }
  }

  // ── Bind ──────────────────────────────────────────────────────

  function bind() {
    document.getElementById('btn-settings').addEventListener('click', open);
    document.getElementById('empty-open-settings')?.addEventListener('click', open);
    closeBtn().addEventListener('click', close);
    scrim().addEventListener('click', close);
    saveBtn().addEventListener('click', save);

    // Connect / disconnect
    document.getElementById('btn-connect-google')
      .addEventListener('click', () => saveCredentialsAndRedirect('google'));
    document.getElementById('btn-disconnect-google')
      .addEventListener('click', () => disconnect('google'));
    document.getElementById('btn-connect-microsoft')
      .addEventListener('click', () => saveCredentialsAndRedirect('microsoft'));
    document.getElementById('btn-disconnect-microsoft')
      .addEventListener('click', () => disconnect('microsoft'));

    // Notification enable / disable
    document.getElementById('btn-notif-enable')
      ?.addEventListener('click', enableNotifications);
    document.getElementById('btn-notif-disable')
      ?.addEventListener('click', disableNotifications);

    bindSegmentedControls();

    // ESC to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !panel().classList.contains('hidden')) {
        close();
      }
    });
  }

  return { bind, open, close, load, updateAuthStatus };

})();
