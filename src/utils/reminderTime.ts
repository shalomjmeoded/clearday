import {
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

export function parseTimeKey(key: string): { hours: number; minutes: number } {
  const [h, m] = key.split(':').map(Number);
  return { hours: h ?? 9, minutes: m ?? 0 };
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
    date = setMinutes(
      setHours(startOfDay(new Date(now.getTime() + 86400000)), hours),
      minutes
    );
  }
  return date.toISOString();
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
