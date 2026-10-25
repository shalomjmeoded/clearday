import {
  addDays,
  format,
  isSameDay,
  parseISO,
  setHours,
  setMinutes,
  startOfDay,
} from 'date-fns';

export function padTimeUnit(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatTimeKey(hours: number, minutes: number): string {
  return `${padTimeUnit(hours)}:${padTimeUnit(minutes)}`;
}

/** Parses "HH:mm"; anything malformed falls back to 09:00 rather than NaN. */
export function parseTimeKey(key: string): { hours: number; minutes: number } {
  const [h, m] = key.split(':').map(Number);
  const valid =
    Number.isInteger(h) && Number.isInteger(m) && h >= 0 && h < 24 && m >= 0 && m < 60;
  return valid ? { hours: h, minutes: m } : { hours: 9, minutes: 0 };
}

export function formatTimeKeyLabel(key: string): string {
  const { hours, minutes } = parseTimeKey(key);
  const sample = new Date();
  sample.setHours(hours, minutes, 0, 0);
  return format(sample, 'h:mm a');
}

export function getHoursMinutesFromIso(
  iso: string | undefined,
  fallbackKey: string
): { hours: number; minutes: number } {
  if (iso) {
    const date = parseISO(iso);
    return { hours: date.getHours(), minutes: date.getMinutes() };
  }
  return parseTimeKey(fallbackKey);
}

/**
 * Reminder ISO for a clock time. With a due date the reminder lands on that
 * day (even if already passed — callers decide how to surface that). Without
 * one it lands today, or tomorrow when the time has already passed.
 */
export function buildReminderIso(
  hours: number,
  minutes: number,
  dueDateIso?: string,
  now: Date = new Date()
): string {
  const base = dueDateIso ? startOfDay(parseISO(dueDateIso)) : startOfDay(now);
  let date = setMinutes(setHours(base, hours), minutes);
  if (!dueDateIso && date.getTime() <= now.getTime()) {
    // A calendar step, not +24h: on the 25-hour day when clocks fall back,
    // 24 hours after an early-morning "now" is still the same date, and the
    // reminder would be built in the past and silently never scheduled.
    date = setMinutes(setHours(addDays(startOfDay(now), 1), hours), minutes);
  }
  return date.toISOString();
}

/**
 * When the next alert actually fires. A snooze is a one-off override that
 * leaves the chosen reminder time alone, so a repeating "9:00" stays "9:00"
 * on its next date even after being pushed out an hour today.
 */
export function effectiveReminderAt(task: {
  reminderAt?: string;
  snoozedUntil?: string;
}): string | undefined {
  if (!task.reminderAt) return undefined;
  return task.snoozedUntil ?? task.reminderAt;
}

/** True when the reminder moment has already passed (nothing will fire). */
export function isReminderPast(iso?: string, now: Date = new Date()): boolean {
  if (!iso) return false;
  return parseISO(iso).getTime() <= now.getTime();
}

/** True when the reminder falls on a different calendar day than the due date. */
export function isReminderOnDifferentDay(
  reminderIso?: string,
  dueDateIso?: string
): boolean {
  if (!reminderIso || !dueDateIso) return false;
  return !isSameDay(parseISO(reminderIso), parseISO(dueDateIso));
}

export const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);
export const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => i);
