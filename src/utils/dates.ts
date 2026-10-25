import {
  addDays,
  endOfDay,
  format,
  isAfter,
  isBefore,
  isSameDay,
  parseISO,
  setHours,
  startOfDay,
} from 'date-fns';

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Due dates are calendar days, not moments, but they travel as ISO instants.
 * Every writer goes through here so the instant always sits at local *noon*
 * of the intended day. Noon rather than midnight because the row is read
 * back in whatever zone the device is in later: a midnight anchor crosses
 * into the previous day as soon as the user (or a restored backup) moves
 * one hour west, while noon tolerates a shift of up to twelve hours either
 * way. Readers only ever ask "which local day is this?" (isSameDay,
 * isToday, startOfDay), so rows written at midnight by earlier builds keep
 * working unchanged.
 */
export function toDueDateIso(day: Date): string {
  return setHours(startOfDay(day), 12).toISOString();
}

/** Today as a due date. */
export function todayDueIso(now: Date = new Date()): string {
  return toDueDateIso(now);
}

/**
 * Milliseconds until the next local midnight. Computed on calendar fields so
 * a 23- or 25-hour DST day still lands on 00:00 rather than 23:00 or 01:00.
 * A small cushion keeps the callback on the right side of the boundary when
 * timers fire a few milliseconds early.
 */
export function msUntilNextLocalMidnight(now: Date = new Date()): number {
  const next = addDays(startOfDay(now), 1);
  return Math.max(0, next.getTime() - now.getTime()) + 1000;
}

/**
 * Local calendar day as a half-open UTC instant range [start, end), for
 * filtering in SQL. All timestamps are written via toISOString (fixed-width
 * UTC Zulu), so lexicographic comparison in SQLite matches chronological
 * order and `col >= start AND col < end` is exactly isSameDay() in JS.
 */
export function localDayRangeIso(
  dayOffset = 0,
  now: Date = new Date()
): { start: string; end: string } {
  const start = startOfDay(addDays(now, dayOffset));
  return {
    start: start.toISOString(),
    end: addDays(start, 1).toISOString(),
  };
}

export function isToday(iso?: string): boolean {
  if (!iso) return false;
  return isSameDay(parseISO(iso), new Date());
}

export function isTomorrow(iso?: string): boolean {
  if (!iso) return false;
  return isSameDay(parseISO(iso), addDays(new Date(), 1));
}

export function isAfterTomorrow(iso?: string): boolean {
  if (!iso) return false;
  const tomorrowEnd = endOfDay(addDays(new Date(), 1));
  return isAfter(parseISO(iso), tomorrowEnd);
}

export function isCreatedToday(iso: string): boolean {
  return isSameDay(parseISO(iso), new Date());
}

export function isOverdue(iso?: string): boolean {
  if (!iso) return false;
  const due = parseISO(iso);
  return isBefore(endOfDay(due), startOfDay(new Date()));
}

export function formatDisplayDate(iso?: string): string {
  if (!iso) return '';
  const date = parseISO(iso);
  if (isToday(iso)) return 'Today';
  if (isTomorrow(iso)) return 'Tomorrow';
  return format(date, 'EEE, MMM d');
}

export function formatTime(iso?: string): string {
  if (!iso) return '';
  return format(parseISO(iso), 'h:mm a');
}

export function formatHeaderDate(): string {
  return format(new Date(), 'EEEE, MMMM d');
}
