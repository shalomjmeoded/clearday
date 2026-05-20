import { format, parseISO, setHours, setMinutes, startOfDay } from 'date-fns';

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

export function buildReminderIso(
  hours: number,
  minutes: number,
  dueDateIso?: string
): string {
  const base = dueDateIso ? startOfDay(parseISO(dueDateIso)) : startOfDay(new Date());
  let date = setMinutes(setHours(base, hours), minutes);
  if (!dueDateIso && date.getTime() <= Date.now()) {
    date = setMinutes(setHours(startOfDay(new Date(Date.now() + 86400000)), hours), minutes);
  }
  return date.toISOString();
}

export const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);
export const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => i);
