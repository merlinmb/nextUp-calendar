/* ─────────────────────────────────────────────────────────────
   app.js — main application controller
   ───────────────────────────────────────────────────────────── */

'use strict';

const App = (() => {

  // ── State ─────────────────────────────────────────────────────

  const state = {
    view:       'continuous',
    currentDate: new Date(),
    events:     [],
    settings:   {},
    loading:    false,
  };

  // ── DOM refs ──────────────────────────────────────────────────

  const calRoot    = () => document.getElementById('calendar-root');
  const rangeEl    = () => document.getElementById('hd-range');
  const loadingEl  = () => document.getElementById('loading-overlay');
  const emptyEl    = () => document.getElementById('empty-state');

  // ── Init ──────────────────────────────────────────────────────

  async function init() {
    // Load settings first
    await loadSettings();

    // Bind UI
    bindNav();
    bindViewTabs();
    bindTheme();
    Search.bind();
    SettingsPanel.bind();

    // Update auth status dots
    await SettingsPanel.updateAuthStatus();

    // Check for OAuth callback result in URL
    handleOAuthCallback();

    // Initial render
    await fetchAndRender();

    // Listen for calendar events dispatched by sub-modules
    document.addEventListener('calendar:show-event', (e) => showEventPopover(e.detail));
    document.addEventListener('calendar:goto-day',   (e) => gotoDay(e.detail));
    document.addEventListener('search:select',       (e) => navigateToEvent(e.detail));

    // Close popover on outside click
    document.addEventListener('click', (e) => {
      const pop = document.getElementById('event-popover');
      if (!pop.classList.contains('hidden') && !pop.contains(e.target)) {
        pop.classList.add('hidden');
      }
    });
    document.getElementById('popover-close')
      .addEventListener('click', () => {
        document.getElementById('event-popover').classList.add('hidden');
      });
  }

  // ── Load settings ─────────────────────────────────────────────

  async function loadSettings() {
    try {
      const resp = await fetch('/api/settings');
      if (!resp.ok) return;
      state.settings = await resp.json();

      state.view = state.settings.view || 'continuous';
      applyTheme(state.settings.theme || 'dark');
      updateViewTabs(state.view);
    } catch {}
  }

  // ── Theme ─────────────────────────────────────────────────────

  function applyTheme(theme) {
    const html = document.documentElement;
    if (theme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      html.dataset.theme = prefersDark ? 'dark' : 'light';
    } else {
      html.dataset.theme = theme;
    }

    // Update icon
    const isDark = html.dataset.theme === 'dark';
    document.getElementById('theme-icon-dark').style.display  = isDark ? 'block' : 'none';
    document.getElementById('theme-icon-light').style.display = isDark ? 'none'  : 'block';

    state.settings.theme = theme;
  }

  function bindTheme() {
    // Apply initial icon state
    const isDark = document.documentElement.dataset.theme === 'dark';
    document.getElementById('theme-icon-dark').style.display  = isDark ? 'block' : 'none';
    document.getElementById('theme-icon-light').style.display = isDark ? 'none'  : 'block';

    document.getElementById('btn-theme').addEventListener('click', () => {
      const current = document.documentElement.dataset.theme;
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      // Persist
      fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: next }),
      }).catch(() => {});
    });

    // Auto theme: watch system preference
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (state.settings.theme === 'auto') applyTheme('auto');
    });
  }

  // ── Navigation ────────────────────────────────────────────────

  function bindNav() {
    document.getElementById('btn-prev').addEventListener('click', () => navigate(-1));
    document.getElementById('btn-next').addEventListener('click', () => navigate(1));
    document.getElementById('btn-today').addEventListener('click', goToday);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (Search.isOpen()) return;
      const inInput = ['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)
        || e.target.isContentEditable;
      if (inInput) return;

      if (e.key === 'ArrowLeft'  && !e.shiftKey) { e.preventDefault(); navigate(-1); }
      if (e.key === 'ArrowRight' && !e.shiftKey) { e.preventDefault(); navigate(1); }
      if (e.key.toLowerCase() === 't') goToday();
    });
  }

  function navigate(dir) {
    state.currentDate = CalendarRenderer.navigate(
      state.view,
      state.currentDate,
      dir,
      state.settings.weekStart
    );
    fetchAndRender();
  }

  function goToday() {
    state.currentDate = new Date();
    fetchAndRender();
  }

  function gotoDay(date) {
    state.view = 'day';
    state.currentDate = new Date(date);
    updateViewTabs('day');
    fetchAndRender();
  }

  // ── View tabs ─────────────────────────────────────────────────

  function bindViewTabs() {
    document.getElementById('view-tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('.view-tab');
      if (!btn) return;
      const view = btn.dataset.view;
      state.view = view;
      updateViewTabs(view);
      fetchAndRender();
    });
  }

  function updateViewTabs(view) {
    document.querySelectorAll('.view-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
  }

  // ── Settings update callback ──────────────────────────────────

  function applySettings(s) {
    if (s.view)             { state.view = s.view; updateViewTabs(s.view); }
    if (s.weekStart)        { state.settings.weekStart = s.weekStart; }
    if (s.continuousDays != null)  { state.settings.continuousDays = s.continuousDays; }
    if (s.monthMaxEvents != null)  { state.settings.monthMaxEvents = s.monthMaxEvents; }
    fetchAndRender();
  }

  // ── Event fetching ────────────────────────────────────────────

  async function fetchAndRender() {
    if (state.loading) return;
    state.loading = true;
    showLoading(true);

    const range = CalendarRenderer.getDateRange(
      state.view,
      state.currentDate,
      state.settings.weekStart,
      state.settings
    );

    // Update header range label
    rangeEl().textContent = CalendarRenderer.getRangeLabel(
      state.view,
      state.currentDate,
      state.settings.weekStart
    );

    try {
      const url = `/api/calendar/events?start=${range.start.toISOString()}&end=${range.end.toISOString()}`;
      const resp = await fetch(url);

      if (!resp.ok) throw new Error('Calendar fetch failed');

      const data = await resp.json();
      state.events = data.events || [];

      // Feed events to search index
      Search.init(state.events);

    } catch (e) {
      console.error('[app] fetch error:', e);
      state.events = [];
    }

    await SettingsPanel.updateAuthStatus();
    render();
    state.loading = false;
    showLoading(false);
  }

  // ── Render ────────────────────────────────────────────────────

  function render() {
    const container = calRoot();
    const auth = {
      google:    document.querySelector('.conn-dot[data-source="google"]')?.classList.contains('connected'),
      microsoft: document.querySelector('.conn-dot[data-source="microsoft"]')?.classList.contains('connected'),
    };

    const hasAccounts = auth.google || auth.microsoft;

    if (!hasAccounts && state.events.length === 0) {
      emptyEl().classList.remove('hidden');
      container.innerHTML = '';
      return;
    }

    emptyEl().classList.add('hidden');
    const ws = state.settings.weekStart || 'monday';

    switch (state.view) {
      case 'day':
        CalendarRenderer.renderDay(container, state.events, state.currentDate);
        break;
      case 'week':
        CalendarRenderer.renderWeek(container, state.events, state.currentDate, ws);
        break;
      case 'month':
        CalendarRenderer.renderMonth(container, state.events, state.currentDate, ws, state.settings.monthMaxEvents ?? 3);
        break;
      default:
        CalendarRenderer.renderContinuous(container, state.events, state.currentDate, state.settings);
    }
  }

  // ── Loading state ─────────────────────────────────────────────

  function showLoading(on) {
    loadingEl().classList.toggle('hidden', !on);
  }

  // ── Event popover ─────────────────────────────────────────────

  function showEventPopover(ev, anchorEl) {
    const pop = document.getElementById('event-popover');

    document.getElementById('popover-source').textContent =
      ev.source === 'google' ? 'Google Calendar' : 'Microsoft Calendar';
    document.getElementById('popover-source').className =
      `popover-source ${ev.source}`;

    document.getElementById('popover-title').textContent = ev.title;

    // Time display
    const startDate = ev.isAllDay
      ? new Date(ev.start + 'T00:00:00')
      : new Date(ev.start);
    const endDate = ev.isAllDay
      ? new Date(ev.end + 'T00:00:00')
      : new Date(ev.end);

    const timeEl = document.getElementById('popover-time');
    if (ev.isAllDay) {
      timeEl.textContent = 'All day · ' + formatPopoverDate(startDate);
    } else {
      timeEl.textContent =
        formatPopoverDate(startDate) + ' · ' +
        CalendarRenderer.formatTime(startDate) + ' – ' +
        CalendarRenderer.formatTime(endDate);
    }

    const locEl = document.getElementById('popover-location');
    locEl.textContent = ev.location || '';
    locEl.style.display = ev.location ? 'block' : 'none';

    const descEl = document.getElementById('popover-desc');
    descEl.textContent = (ev.description || '').replace(/\s+/g, ' ').trim();
    descEl.style.display = ev.description ? 'block' : 'none';

    const linkEl = document.getElementById('popover-link');
    if (ev.htmlLink) {
      linkEl.href = ev.htmlLink;
      linkEl.classList.remove('hidden');
    } else {
      linkEl.classList.add('hidden');
    }

    // Position: center of viewport, or near a click target if available
    pop.classList.remove('hidden');
    const vw = window.innerWidth, vh = window.innerHeight;
    const pw = pop.offsetWidth  || 300;
    const ph = pop.offsetHeight || 200;
    const left = Math.max(16, Math.min(vw - pw - 16, (vw - pw) / 2));
    const top  = Math.max(60, Math.min(vh - ph - 16, (vh - ph) / 3));
    pop.style.left = `${left}px`;
    pop.style.top  = `${top}px`;
  }

  function formatPopoverDate(d) {
    const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  }

  // ── Navigate to event (from search result) ────────────────────

  function navigateToEvent(ev) {
    const startDate = ev.isAllDay
      ? new Date(ev.start + 'T00:00:00')
      : new Date(ev.start);

    state.currentDate = startDate;

    if (state.view !== 'continuous' && state.view !== 'month') {
      // Keep current view, just navigate date
    }

    fetchAndRender().then(() => {
      showEventPopover(ev);
    });
  }

  // ── OAuth callback notification ───────────────────────────────

  function handleOAuthCallback() {
    const params = new URLSearchParams(window.location.search);
    const success = params.get('auth_success');
    const error   = params.get('auth_error');

    if (success) {
      const name = success === 'google' ? 'Google' : 'Microsoft';
      toast(`${name} Calendar connected`, 'success');
    }
    if (error) {
      const msgs = {
        google_no_credentials: 'Configure Google credentials in Settings first',
        google_denied:  'Google authorisation was denied',
        google_exchange:'Failed to exchange Google authorisation code',
        ms_no_credentials: 'Configure Microsoft credentials in Settings first',
        ms_denied:  'Microsoft authorisation was denied',
        ms_exchange:'Failed to exchange Microsoft authorisation code',
        ms_state:   'Security check failed — please try again',
      };
      toast(msgs[error] || `Auth error: ${error}`, 'error');
    }

    // Clean URL
    if (success || error) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  // ── Toast notifications ───────────────────────────────────────

  function toast(message, type = 'success') {
    const container = document.getElementById('toasts');

    const el = document.createElement('div');
    el.className = `toast ${type}`;

    const dot = document.createElement('div');
    dot.className = 'toast-dot';

    const text = document.createElement('span');
    text.textContent = message;

    el.appendChild(dot);
    el.appendChild(text);
    container.appendChild(el);

    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(4px)';
      el.style.transition = 'all 0.3s ease';
      setTimeout(() => el.remove(), 300);
    }, 4000);
  }

  // ── Public API ────────────────────────────────────────────────

  return { init, applyTheme, applySettings, toast };

})();

// ── Bootstrap ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => App.init());
