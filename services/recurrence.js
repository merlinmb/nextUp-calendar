'use strict';

const MAX_OCCURRENCES = 365;

/**
 * Given an event object, returns an array of event instances.
 * If the event has no recurrence field, returns [event] unchanged (source set to "external").
 * If it does, expands into N instances with id suffixed _0, _1, ...
 * The recurrence field is stripped from each instance.
 * Each instance gets source: "external".
 */
function expandEvent(event) {
  const { recurrence, ...base } = event;

  if (!recurrence || typeof recurrence !== 'object') {
    return [{ ...base, source: 'external' }];
  }

  const { frequency, daysOfWeek, interval = 1, count, until } = recurrence;

  if (!frequency) {
    return [{ ...base, source: 'external' }];
  }

  const validFrequencies = ['daily', 'weekly', 'monthly', 'yearly'];
  if (!validFrequencies.includes(frequency)) {
    return [{ ...base, source: 'external' }];
  }

  // Parse start/end — preserve original duration
  const startMs    = new Date(base.start).getTime();
  const endMs      = new Date(base.end).getTime();
  const durationMs = endMs - startMs;

  const untilMs  = until ? new Date(until).getTime() : null;
  const maxCount = Math.min(count != null ? count : MAX_OCCURRENCES, MAX_OCCURRENCES);

  const DAY_NAMES  = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const allowedDays = Array.isArray(daysOfWeek)
    ? daysOfWeek.map(d => DAY_NAMES.indexOf(d.toLowerCase())).filter(i => i !== -1)
    : null;

  const instances = [];

  if (frequency === 'weekly' && allowedDays && allowedDays.length > 0) {
    // Walk forward day-by-day, emit on matching days.
    // interval > 1 means skip (interval-1) full weeks after each 7-day cycle.
    let cursor        = new Date(startMs);
    let instanceIndex = 0;
    let dayInCycle    = 0; // tracks position within the current 7-day week cycle

    while (instances.length < maxCount) {
      const dow = cursor.getDay();
      if (allowedDays.includes(dow)) {
        const instStartMs = cursor.getTime();
        if (untilMs !== null && instStartMs > untilMs) break;

        const instStartDate = new Date(instStartMs);
        const instEndDate   = new Date(instStartMs + durationMs);

        instances.push({
          ...base,
          id:     `${base.id}_${instanceIndex}`,
          start:  base.isAllDay ? toDateStr(instStartDate) : instStartDate.toISOString(),
          end:    base.isAllDay ? toDateStr(instEndDate)   : instEndDate.toISOString(),
          source: 'external',
        });
        instanceIndex++;
      }

      // Advance one day
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
      dayInCycle++;

      // After completing a full 7-day cycle, skip (interval-1) weeks
      if (dayInCycle === 7) {
        dayInCycle = 0;
        if (interval > 1) {
          cursor = new Date(cursor.getTime() + (interval - 1) * 7 * 24 * 60 * 60 * 1000);
        }
      }
    }
  } else {
    // daily, weekly (no daysOfWeek), monthly, yearly
    for (let i = 0; i < maxCount; i++) {
      const instStart = advanceDate(new Date(startMs), frequency, interval, i);
      if (untilMs !== null && instStart.getTime() > untilMs) break;

      const instEnd = new Date(instStart.getTime() + durationMs);

      instances.push({
        ...base,
        id:     `${base.id}_${i}`,
        start:  base.isAllDay ? toDateStr(instStart) : instStart.toISOString(),
        end:    base.isAllDay ? toDateStr(instEnd)   : instEnd.toISOString(),
        source: 'external',
      });
    }
  }

  return instances;
}

/**
 * Advance a Date by `n * interval` steps of `frequency`.
 * Returns a new Date.
 */
function advanceDate(base, frequency, interval, n) {
  const d    = new Date(base);
  const step = n * interval;

  if (frequency === 'daily') {
    d.setDate(d.getDate() + step);
  } else if (frequency === 'weekly') {
    d.setDate(d.getDate() + step * 7);
  } else if (frequency === 'monthly') {
    const targetMonth = d.getMonth() + step;
    const targetYear  = d.getFullYear() + Math.floor(targetMonth / 12);
    const month       = ((targetMonth % 12) + 12) % 12;
    const day         = d.getDate();
    // Clamp to last day of target month
    const lastDay = new Date(targetYear, month + 1, 0).getDate();
    d.setFullYear(targetYear, month, Math.min(day, lastDay));
  } else if (frequency === 'yearly') {
    d.setFullYear(d.getFullYear() + step);
  }

  return d;
}

function toDateStr(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/**
 * Expand an array of events, expanding any that carry a recurrence rule.
 * Returns a flat array of instances.
 */
function expandEvents(events) {
  return events.flatMap(expandEvent);
}

module.exports = { expandEvents, expandEvent };
