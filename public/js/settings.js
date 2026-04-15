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

  function open() {
    load().then(() => {
      panel().classList.remove('hidden');
    });
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

    // OAuth URIs
    const base = s.appUrl || window.location.origin;
    document.getElementById('uri-google').textContent    = `${base}/auth/google/callback`;
    document.getElementById('uri-microsoft').textContent = `${base}/auth/microsoft/callback`;
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

  // ── Save ──────────────────────────────────────────────────────

  async function save() {
    const body = {
      view:      getSegment('setting-view')       || 'continuous',
      theme:     getSegment('setting-theme')       || 'dark',
      weekStart: getSegment('setting-week-start')  || 'monday',
      google: {
        clientId:     document.getElementById('g-client-id').value.trim(),
        clientSecret: document.getElementById('g-client-secret').value || undefined,
      },
      microsoft: {
        clientId:     document.getElementById('ms-client-id').value.trim(),
        tenantId:     document.getElementById('ms-tenant-id').value.trim() || 'common',
        clientSecret: document.getElementById('ms-client-secret').value || undefined,
      },
    };

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
