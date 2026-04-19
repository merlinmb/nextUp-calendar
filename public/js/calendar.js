/* ─────────────────────────────────────────────────────────────
   calendar.js — pure rendering functions for each view type
   ───────────────────────────────────────────────────────────── */

'use strict';

const CalendarRenderer = (() => {

  // ── Date helpers ──────────────────────────────────────────────

  const DAYS_LONG  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MONTHS_LONG  = ['January','February','March','April','May','June',
                        'July','August','September','October','November','December'];
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun',
                        'Jul','Aug','Sep','Oct','Nov','Dec'];

  function today() {
    const d = new Date();
    d.setHours(0,0,0,0);
    return d;
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth()    === b.getMonth()    &&
           a.getDate()     === b.getDate();
  }

  function startOfDay(d) {
    const c = new Date(d);
    c.setHours(0,0,0,0);
    return c;
  }

  function addDays(d, n) {
    const c = new Date(d);
    c.setDate(c.getDate() + n);
    return c;
  }

  function formatTime(date) {
    const h = date.getHours();
    const m = date.getMinutes();
    const ampm = h < 12 ? 'am' : 'pm';
    const h12 = h % 12 || 12;
    return m === 0
      ? `${h12}${ampm}`
      : `${h12}:${String(m).padStart(2,'0')}${ampm}`;
  }

  function formatDate(d, opts = {}) {
    const { weekday = false, year = false } = opts;
    const thisYear = new Date().getFullYear();
    let s = `${DAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
    if (year && d.getFullYear() !== thisYear) s += ` ${d.getFullYear()}`;
    if (!weekday) s = `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${year && d.getFullYear() !== thisYear ? ' '+d.getFullYear() : ''}`;
    return s;
  }

  function eventStartDate(ev) {
    return ev.isAllDay ? new Date(ev.start + 'T00:00:00') : new Date(ev.start);
  }

  function eventEndDate(ev) {
    return ev.isAllDay ? new Date(ev.end + 'T00:00:00') : new Date(ev.end);
  }

  // Minutes since midnight
  function minutesOf(d) {
    return d.getHours() * 60 + d.getMinutes();
  }

  // ── Event popover trigger (shared) ─────────────────────────────

  function attachEventClick(el, ev) {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      document.dispatchEvent(new CustomEvent('calendar:show-event', { detail: ev }));
    });
  }

  // ── Continuous view ──────────────────────────────────────────

  function renderContinuous(container, events, currentDate, settings) {
    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'view-continuous';

    // Build map: dateKey → { allDay: [], timed: [] }
    const map = new Map();

    for (const ev of events) {
      const start = eventStartDate(ev);
      const key = start.toDateString();
      if (!map.has(key)) map.set(key, { date: start, allDay: [], timed: [] });
      if (ev.isAllDay) map.get(key).allDay.push(ev);
      else map.get(key).timed.push(ev);
    }

    // Fill in days with no events that fall in the window (optional: show skeleton days)
    // Sort keys chronologically
    const days = [...map.values()].sort((a, b) => a.date - b.date);

    const todayDate = today();

    if (days.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'text-align:center;padding:48px 0;color:var(--text-3);font-size:var(--fs-sm)';
      empty.textContent = 'No events in this period';
      wrap.appendChild(empty);
      container.appendChild(wrap);
      return;
    }

    let todayGroup = null;

    // Find the most recent past day — it will be shown greyed; all others are hidden
    const pastDays = days.filter(({ date }) => date < todayDate && !sameDay(date, todayDate));
    const lastPastDate = pastDays.length > 0 ? pastDays[pastDays.length - 1].date : null;

    for (const { date, allDay, timed } of days) {
      const isToday = sameDay(date, todayDate);
      const isPast  = date < todayDate && !isToday;
      // Hide past days except the most recent one
      const isHiddenPast = isPast && !(lastPastDate && sameDay(date, lastPastDate));

      const group = document.createElement('div');
      group.className = 'day-group' + (isToday ? ' is-today' : '') + (isPast ? ' is-past' : '');
      group.dataset.date = date.toISOString();

      // For hidden past days: only show if they have all-day events, and only show those
      if (isHiddenPast) {
        if (allDay.length === 0) continue; // skip entirely if no all-day events
        // Show the group but hide timed events — mark as hidden-past for styling
        group.classList.add('is-hidden-past');
      }

      // Header
      const header = document.createElement('div');
      header.className = 'day-group-header';

      const weekdayEl = document.createElement('span');
      weekdayEl.className = 'day-weekday';
      weekdayEl.textContent = DAYS_SHORT[date.getDay()];

      const dateChip = document.createElement('span');
      dateChip.className = 'day-date-chip';
      dateChip.textContent = `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;

      const rule = document.createElement('div');
      rule.className = 'day-rule';

      header.appendChild(weekdayEl);
      header.appendChild(dateChip);
      header.appendChild(rule);
      group.appendChild(header);

      // All-day events
      if (allDay.length > 0) {
        const strip = document.createElement('div');
        strip.className = 'allday-strip';
        for (const ev of allDay) {
          const chip = document.createElement('span');
          chip.className = `allday-chip ${ev.source}`;
          chip.textContent = ev.title;
          chip.title = ev.title;
          attachEventClick(chip, ev);
          strip.appendChild(chip);
        }
        group.appendChild(strip);
      }

      // Timed events (skip for hidden past days — only all-day events shown there)
      if (isHiddenPast) {
        wrap.appendChild(group);
        continue;
      }

      for (const ev of timed) {
        const start = eventStartDate(ev);
        const row = document.createElement('div');
        row.className = 'event-row';
        row.tabIndex = 0;
        row.setAttribute('role', 'button');
        row.setAttribute('aria-label', ev.title);

        const timeEl = document.createElement('div');
        timeEl.className = 'event-row-time';
        timeEl.textContent = formatTime(start);

        const bar = document.createElement('div');
        bar.className = `event-row-bar ${ev.source}`;

        const body = document.createElement('div');
        body.className = 'event-row-body';

        const title = document.createElement('div');
        title.className = 'event-row-title';
        title.textContent = ev.title;

        body.appendChild(title);

        if (ev.location || ev.calendarName) {
          const meta = document.createElement('div');
          meta.className = 'event-row-meta';
          meta.textContent = [ev.calendarName, ev.location].filter(Boolean).join(' · ');
          body.appendChild(meta);
        }

        row.appendChild(timeEl);
        row.appendChild(bar);
        row.appendChild(body);

        attachEventClick(row, ev);

        // Keyboard support
        row.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            row.click();
          }
        });

        group.appendChild(row);
      }

      wrap.appendChild(group);
      if (isToday) todayGroup = group;
    }

    container.appendChild(wrap);

    // Scroll to today
    if (todayGroup) {
      requestAnimationFrame(() => {
        todayGroup.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  // ── Day view ──────────────────────────────────────────────────

  function renderDay(container, events, currentDate) {
    container.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'view-day';

    const dayEvents = events.filter(ev => sameDay(eventStartDate(ev), currentDate));
    const allDay = dayEvents.filter(ev => ev.isAllDay);
    const timed  = dayEvents.filter(ev => !ev.isAllDay);

    // All-day row
    if (allDay.length > 0) {
      const row = buildAlldayRow([allDay], 1);
      wrap.appendChild(row);
    }

    // Time grid
    const gridWrap = document.createElement('div');
    gridWrap.className = 'time-grid-wrap';

    const grid = document.createElement('div');
    grid.className = 'time-grid';
    grid.style.gridTemplateColumns = `${getComputedStyle(document.documentElement).getPropertyValue('--time-col-w').trim()} 1fr`;

    // Hour labels
    const hoursCol = buildHourLabels();
    grid.appendChild(hoursCol);

    // Day column
    const col = document.createElement('div');
    col.className = 'time-grid-col';

    // Hour lines
    for (let h = 0; h < 24; h++) {
      const line = document.createElement('div');
      line.className = 'hour-line';
      line.style.top = `${h * 64}px`;
      col.appendChild(line);
      // Half-hour dashed line
      const half = document.createElement('div');
      half.className = 'hour-line half';
      half.style.top = `${h * 64 + 32}px`;
      col.appendChild(half);
    }

    // Place events
    const cols = computeEventColumns(timed);
    for (const { ev, col: colIdx, totalCols } of cols) {
      placeEventInColumn(col, ev, colIdx, totalCols);
    }

    // Now indicator
    if (sameDay(currentDate, today())) {
      col.appendChild(buildNowIndicator());
    }

    grid.appendChild(col);
    gridWrap.appendChild(grid);
    wrap.appendChild(gridWrap);
    container.appendChild(wrap);

    // Scroll to current time (or 8am)
    requestAnimationFrame(() => {
      const nowMin = minutesOf(new Date());
      const scrollTo = Math.max(0, (nowMin - 60) * (64 / 60));
      gridWrap.scrollTop = sameDay(currentDate, today()) ? scrollTo : 8 * 64;
    });
  }

  // ── Week view ─────────────────────────────────────────────────

  function renderWeek(container, events, currentDate, weekStart = 'monday') {
    container.innerHTML = '';

    const startOffset = weekStart === 'monday' ? 1 : 0;
    const dow = currentDate.getDay();
    const diff = (dow - startOffset + 7) % 7;
    const weekStartDate = addDays(currentDate, -diff);
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i));

    const wrap = document.createElement('div');
    wrap.className = 'view-week';

    // Week header (day labels)
    const header = document.createElement('div');
    header.className = 'week-header';

    const spacer = document.createElement('div');
    spacer.className = 'week-header-spacer';
    header.appendChild(spacer);

    for (const d of days) {
      const cell = document.createElement('div');
      cell.className = 'week-header-day' + (sameDay(d, today()) ? ' is-today' : '');

      const name = document.createElement('div');
      name.className = 'week-day-name';
      name.textContent = DAYS_SHORT[d.getDay()];

      const num = document.createElement('div');
      num.className = 'week-day-num';
      num.textContent = d.getDate();

      cell.appendChild(name);
      cell.appendChild(num);
      header.appendChild(cell);
    }
    wrap.appendChild(header);

    // All-day row
    const alldayEventsPerDay = days.map(d =>
      events.filter(ev => ev.isAllDay && sameDay(eventStartDate(ev), d))
    );
    if (alldayEventsPerDay.some(a => a.length > 0)) {
      wrap.appendChild(buildAlldayRow(alldayEventsPerDay, 7));
    }

    // Time grid
    const gridWrap = document.createElement('div');
    gridWrap.className = 'time-grid-wrap';

    const grid = document.createElement('div');
    grid.className = 'time-grid';
    const timeColW = getComputedStyle(document.documentElement).getPropertyValue('--time-col-w').trim();
    grid.style.gridTemplateColumns = `${timeColW} repeat(7, 1fr)`;

    grid.appendChild(buildHourLabels());

    for (const d of days) {
      const col = document.createElement('div');
      col.className = 'time-grid-col';

      for (let h = 0; h < 24; h++) {
        const line = document.createElement('div');
        line.className = 'hour-line';
        line.style.top = `${h * 64}px`;
        col.appendChild(line);
        const half = document.createElement('div');
        half.className = 'hour-line half';
        half.style.top = `${h * 64 + 32}px`;
        col.appendChild(half);
      }

      const dayEvents = events.filter(ev => !ev.isAllDay && sameDay(eventStartDate(ev), d));
      const positioned = computeEventColumns(dayEvents);
      for (const { ev, col: colIdx, totalCols } of positioned) {
        placeEventInColumn(col, ev, colIdx, totalCols);
      }

      if (sameDay(d, today())) {
        col.appendChild(buildNowIndicator());
      }

      grid.appendChild(col);
    }

    gridWrap.appendChild(grid);
    wrap.appendChild(gridWrap);
    container.appendChild(wrap);

    requestAnimationFrame(() => {
      const nowMin = minutesOf(new Date());
      gridWrap.scrollTop = Math.max(0, (nowMin - 60) * (64 / 60));
    });
  }

  // ── Month view ────────────────────────────────────────────────

  function renderMonth(container, events, currentDate, weekStart = 'monday', maxVisible = 3) {
    container.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'view-month';

    const startOffset = weekStart === 'monday' ? 1 : 0;
    const DAYS_ORDERED = weekStart === 'monday'
      ? ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
      : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    // Day-of-week header
    const dowHeader = document.createElement('div');
    dowHeader.className = 'month-header';
    for (const d of DAYS_ORDERED) {
      const cell = document.createElement('div');
      cell.className = 'month-dow';
      cell.textContent = d;
      dowHeader.appendChild(cell);
    }
    wrap.appendChild(dowHeader);

    // Calculate grid start/end
    const firstOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const lastOfMonth  = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

    const startDow = firstOfMonth.getDay();
    const cellStart = addDays(firstOfMonth, -((startDow - startOffset + 7) % 7));

    // Always 6 weeks
    const grid = document.createElement('div');
    grid.className = 'month-grid';

    const todayDate = today();

    for (let i = 0; i < 42; i++) {
      const cellDate = addDays(cellStart, i);
      const inMonth = cellDate.getMonth() === currentDate.getMonth();
      const isToday = sameDay(cellDate, todayDate);

      const cell = document.createElement('div');
      cell.className = 'month-cell'
        + (inMonth ? '' : ' other-month')
        + (isToday ? ' is-today' : '');

      const numEl = document.createElement('div');
      numEl.className = 'month-cell-num';
      numEl.textContent = cellDate.getDate();
      cell.appendChild(numEl);

      // Events for this day
      const dayEvs = events.filter(ev => sameDay(eventStartDate(ev), cellDate));
      dayEvs.sort((a, b) => {
        if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1;
        return new Date(a.start) - new Date(b.start);
      });

      const visible = dayEvs.slice(0, maxVisible);
      const overflow = dayEvs.length - maxVisible;

      for (const ev of visible) {
        const pill = document.createElement('div');
        pill.className = `month-event-pill ${ev.source}`;

        if (!ev.isAllDay) {
          const t = document.createElement('span');
          t.style.cssText = 'font-family:var(--font-mono);font-size:10px;flex-shrink:0';
          t.textContent = formatTime(eventStartDate(ev)) + ' ';
          pill.appendChild(t);
        }

        const titleSpan = document.createElement('span');
        titleSpan.textContent = ev.title;
        titleSpan.style.overflow = 'hidden';
        titleSpan.style.textOverflow = 'ellipsis';
        pill.appendChild(titleSpan);

        attachEventClick(pill, ev);
        cell.appendChild(pill);
      }

      if (overflow > 0) {
        const more = document.createElement('div');
        more.className = 'month-more';
        more.textContent = `+${overflow} more`;
        cell.appendChild(more);
      }

      // Click empty cell → switch to day view
      cell.addEventListener('click', (e) => {
        if (e.target === cell || e.target === numEl) {
          document.dispatchEvent(new CustomEvent('calendar:goto-day', { detail: cellDate }));
        }
      });

      grid.appendChild(cell);
    }

    wrap.appendChild(grid);
    container.appendChild(wrap);
  }

  // ── Shared helpers ─────────────────────────────────────────────

  function buildHourLabels() {
    const col = document.createElement('div');
    col.className = 'time-grid-hours';
    col.style.cssText = 'display:flex;flex-direction:column';
    for (let h = 0; h < 24; h++) {
      const label = document.createElement('div');
      label.className = 'hour-label';
      label.textContent = h === 0 ? '' : (h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h-12}pm`);
      col.appendChild(label);
    }
    return col;
  }

  function buildAlldayRow(alldayPerDay, colCount) {
    const row = document.createElement('div');
    row.className = 'allday-row';

    const label = document.createElement('div');
    label.className = 'allday-row-label';
    label.textContent = 'all-day';
    row.appendChild(label);

    for (let i = 0; i < colCount; i++) {
      const cell = document.createElement('div');
      cell.className = 'allday-row-col';
      for (const ev of (alldayPerDay[i] || [])) {
        const chip = document.createElement('span');
        chip.className = `allday-chip ${ev.source}`;
        chip.style.cssText = 'font-size:11px;border-radius:3px;padding:1px 6px';
        chip.textContent = ev.title;
        attachEventClick(chip, ev);
        cell.appendChild(chip);
      }
      row.appendChild(cell);
    }

    return row;
  }

  function buildNowIndicator() {
    const HOUR_H = 64;
    const now = new Date();
    const top = minutesOf(now) * (HOUR_H / 60);

    const el = document.createElement('div');
    el.className = 'now-indicator';
    el.style.top = `${top}px`;
    return el;
  }

  // Compute overlapping event layout columns
  function computeEventColumns(events) {
    const sorted = [...events].sort((a, b) => new Date(a.start) - new Date(b.start));
    const result = [];
    const groups = [];

    for (const ev of sorted) {
      const start = eventStartDate(ev).getTime();
      const end   = eventEndDate(ev).getTime();
      let placed = false;

      for (const group of groups) {
        const lastEnd = Math.max(...group.map(e => eventEndDate(e.ev).getTime()));
        if (start < lastEnd) {
          group.push({ ev, start, end });
          placed = true;
          break;
        }
      }
      if (!placed) groups.push([{ ev, start, end }]);
    }

    for (const group of groups) {
      const cols = [];
      for (const item of group) {
        let placed = false;
        for (let c = 0; c < cols.length; c++) {
          const colEnd = Math.max(...cols[c].map(i => i.end));
          if (item.start >= colEnd) {
            cols[c].push(item);
            item.colIdx = c;
            placed = true;
            break;
          }
        }
        if (!placed) {
          item.colIdx = cols.length;
          cols.push([item]);
        }
      }
      for (const item of group) {
        result.push({ ev: item.ev, col: item.colIdx, totalCols: cols.length });
      }
    }

    return result;
  }

  function placeEventInColumn(colEl, ev, colIdx, totalCols) {
    const HOUR_H = 64;
    const start = eventStartDate(ev);
    const end   = eventEndDate(ev);

    const startMin = minutesOf(start);
    const endMin   = minutesOf(end);
    const duration = Math.max(endMin - startMin, 20); // minimum 20min height

    const top    = startMin  * (HOUR_H / 60);
    const height = duration  * (HOUR_H / 60);

    const pct  = 100 / totalCols;
    const left = colIdx * pct;

    const el = document.createElement('div');
    el.className = `grid-event ${ev.source}`;
    el.style.top    = `${top}px`;
    el.style.height = `${height}px`;
    el.style.left   = `calc(${left}% + 4px)`;
    el.style.right  = `calc(${100 - left - pct}% + 4px)`;
    el.style.width  = 'auto';

    const titleEl = document.createElement('div');
    titleEl.className = 'grid-event-title';
    titleEl.textContent = ev.title;
    el.appendChild(titleEl);

    if (height > 32) {
      const timeEl = document.createElement('div');
      timeEl.className = 'grid-event-time';
      timeEl.textContent = formatTime(start);
      el.appendChild(timeEl);
    }

    attachEventClick(el, ev);
    colEl.appendChild(el);
  }

  // ── Public: date range calculator ────────────────────────────

  function getDateRange(view, currentDate, weekStart = 'monday', settings = {}) {
    const startOffset = weekStart === 'monday' ? 1 : 0;

    if (view === 'day') {
      const s = startOfDay(currentDate);
      const e = addDays(s, 1);
      return { start: s, end: e };
    }

    if (view === 'week') {
      const dow  = currentDate.getDay();
      const diff = (dow - startOffset + 7) % 7;
      const s = addDays(startOfDay(currentDate), -diff);
      const e = addDays(s, 7);
      return { start: s, end: e };
    }

    if (view === 'month') {
      const s = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const e = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
      return { start: s, end: e };
    }

    // Continuous
    const lookahead = settings.continuousDays ?? 60;
    const s = addDays(startOfDay(currentDate), -3);
    const e = addDays(startOfDay(currentDate), lookahead);
    return { start: s, end: e };
  }

  // ── Public: range label ───────────────────────────────────────

  function getRangeLabel(view, currentDate, weekStart = 'monday') {
    const startOffset = weekStart === 'monday' ? 1 : 0;
    const now = currentDate;

    if (view === 'day') {
      const opts = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
      return new Intl.DateTimeFormat(undefined, opts).format(now);
    }

    if (view === 'week') {
      const dow  = now.getDay();
      const diff = (dow - startOffset + 7) % 7;
      const s = addDays(now, -diff);
      const e = addDays(s, 6);
      if (s.getMonth() === e.getMonth()) {
        return `${MONTHS_LONG[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
      }
      return `${MONTHS_SHORT[s.getMonth()]} ${s.getDate()} – ${MONTHS_SHORT[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
    }

    if (view === 'month') {
      return `${MONTHS_LONG[now.getMonth()]} ${now.getFullYear()}`;
    }

    // Continuous
    return `${MONTHS_LONG[now.getMonth()]} ${now.getFullYear()}`;
  }

  // ── Public: navigation ─────────────────────────────────────────

  function navigate(view, currentDate, direction, weekStart = 'monday') {
    const d = new Date(currentDate);
    const startOffset = weekStart === 'monday' ? 1 : 0;

    if (view === 'day') {
      d.setDate(d.getDate() + direction);
    } else if (view === 'week') {
      d.setDate(d.getDate() + direction * 7);
    } else if (view === 'month') {
      d.setMonth(d.getMonth() + direction);
      d.setDate(1);
    } else {
      // Continuous: advance by 2 weeks
      d.setDate(d.getDate() + direction * 14);
    }
    return d;
  }

  // ── Exposed API ───────────────────────────────────────────────

  return {
    renderContinuous,
    renderDay,
    renderWeek,
    renderMonth,
    getDateRange,
    getRangeLabel,
    navigate,
    today,
    sameDay,
    eventStartDate,
    formatTime,
  };

})();
