/* ─────────────────────────────────────────────────────────────
   search.js — fuzzy event search triggered on keypress
   ───────────────────────────────────────────────────────────── */

'use strict';

const Search = (() => {

  let fuse = null;
  let allEvents = [];
  let focusedIdx = -1;
  let results = [];

  const overlay  = () => document.getElementById('search-overlay');
  const input    = () => document.getElementById('search-input');
  const resultsEl= () => document.getElementById('search-results');
  const hintEl   = () => document.getElementById('search-hint');

  // ── Fuse.js config ────────────────────────────────────────────

  const FUSE_OPTIONS = {
    keys: [
      { name: 'title',        weight: 0.6 },
      { name: 'description',  weight: 0.2 },
      { name: 'location',     weight: 0.15 },
      { name: 'calendarName', weight: 0.05 },
    ],
    threshold: 0.4,
    includeScore: true,
    minMatchCharLength: 2,
    ignoreLocation: true,
  };

  function init(events) {
    allEvents = events;
    if (typeof Fuse !== 'undefined') {
      fuse = new Fuse(events, FUSE_OPTIONS);
    } else {
      // Fallback: simple substring match
      fuse = null;
    }
  }

  // ── Open / Close ──────────────────────────────────────────────

  function open() {
    overlay().classList.remove('hidden');
    input().value = '';
    resultsEl().innerHTML = '';
    hintEl().style.display = 'block';
    focusedIdx = -1;
    results = [];
    requestAnimationFrame(() => input().focus());

    // Backdrop click
    overlay().querySelector('.search-backdrop').onclick = close;
  }

  function close() {
    overlay().classList.add('hidden');
    input().value = '';
  }

  function isOpen() {
    return !overlay().classList.contains('hidden');
  }

  // ── Query ─────────────────────────────────────────────────────

  function query(text) {
    if (!text || text.trim().length < 1) {
      resultsEl().innerHTML = '';
      hintEl().style.display = 'block';
      results = [];
      focusedIdx = -1;
      return;
    }

    hintEl().style.display = 'none';

    if (fuse) {
      results = fuse.search(text.trim()).slice(0, 20).map(r => r.item);
    } else {
      const q = text.trim().toLowerCase();
      results = allEvents
        .filter(ev =>
          ev.title.toLowerCase().includes(q) ||
          (ev.description || '').toLowerCase().includes(q) ||
          (ev.location || '').toLowerCase().includes(q)
        )
        .slice(0, 20);
    }

    render(results);
    focusedIdx = results.length > 0 ? 0 : -1;
    updateFocus();
  }

  // ── Render results ────────────────────────────────────────────

  function render(items) {
    const el = resultsEl();
    el.innerHTML = '';

    if (items.length === 0) {
      el.innerHTML = '<div class="search-hint">No matching events found</div>';
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const ev = items[i];
      const item = buildResultItem(ev, i);
      el.appendChild(item);
    }
  }

  function buildResultItem(ev, idx) {
    const item = document.createElement('div');
    item.className = 'search-result-item';
    item.dataset.idx = idx;
    item.setAttribute('role', 'option');

    const bar = document.createElement('div');
    bar.className = `search-result-bar ${ev.source}`;

    const body = document.createElement('div');
    body.className = 'search-result-body';

    const title = document.createElement('div');
    title.className = 'search-result-title';
    title.textContent = ev.title;

    const meta = document.createElement('div');
    meta.className = 'search-result-meta';
    const start = ev.isAllDay
      ? new Date(ev.start + 'T00:00:00')
      : new Date(ev.start);
    meta.textContent = formatSearchDate(start, ev.isAllDay);

    body.appendChild(title);
    body.appendChild(meta);

    const src = document.createElement('span');
    src.className = `search-result-source ${ev.source}`;
    src.textContent = ev.source === 'google' ? 'Google' : 'Microsoft';

    item.appendChild(bar);
    item.appendChild(body);
    item.appendChild(src);

    item.addEventListener('click', () => selectResult(ev));
    item.addEventListener('mouseenter', () => {
      focusedIdx = idx;
      updateFocus();
    });

    return item;
  }

  function formatSearchDate(date, isAllDay) {
    const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun',
                    'Jul','Aug','Sep','Oct','Nov','Dec'];
    let s = `${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
    if (!isAllDay) {
      const h = date.getHours(), m = date.getMinutes();
      const ampm = h < 12 ? 'am' : 'pm';
      const h12 = h % 12 || 12;
      s += ' · ' + (m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2,'0')}${ampm}`);
    }
    return s;
  }

  function updateFocus() {
    const items = resultsEl().querySelectorAll('.search-result-item');
    items.forEach((item, i) => {
      item.classList.toggle('focused', i === focusedIdx);
    });
    if (focusedIdx >= 0 && items[focusedIdx]) {
      items[focusedIdx].scrollIntoView({ block: 'nearest' });
    }
  }

  function selectResult(ev) {
    close();
    document.dispatchEvent(new CustomEvent('search:select', { detail: ev }));
  }

  // ── Keyboard navigation ───────────────────────────────────────

  function handleKeydown(e) {
    if (!isOpen()) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusedIdx = Math.min(focusedIdx + 1, results.length - 1);
      updateFocus();
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusedIdx = Math.max(focusedIdx - 1, 0);
      updateFocus();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (focusedIdx >= 0 && results[focusedIdx]) {
        selectResult(results[focusedIdx]);
      }
      return;
    }
  }

  // ── Global keypress listener (opens search on any char key) ──

  function handleGlobalKeypress(e) {
    if (isOpen()) return;

    // Ignore if typing in an input/textarea/contenteditable
    const tag = e.target.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
    if (e.target.isContentEditable) return;

    // Ignore modifier-only, function keys, navigation keys
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length > 1 && e.key !== '/') return;

    // '/' is a common search shortcut; any printable char also opens search
    open();

    // If a printable char was pressed (not just /), seed the input
    if (e.key !== '/' && e.key.length === 1) {
      requestAnimationFrame(() => {
        input().value = e.key;
        query(e.key);
      });
    }
  }

  // ── Bind events ───────────────────────────────────────────────

  function bind() {
    // Input → query
    document.getElementById('search-input').addEventListener('input', (e) => {
      query(e.target.value);
    });

    // Keyboard nav inside overlay
    document.addEventListener('keydown', handleKeydown);

    // Global: open on keypress
    document.addEventListener('keypress', handleGlobalKeypress);

    // Search button in header
    document.getElementById('btn-search').addEventListener('click', open);
  }

  return { init, open, close, isOpen, bind };

})();
