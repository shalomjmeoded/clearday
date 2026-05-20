import {
  addDays,
  endOfDay,
  format,
  isAfter,
  isBefore,
  isSameDay,
  parseISO,
  startOfDay,
} from 'date-fns';

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayRange(): { start: string; end: string } {
  const start = startOfDay(new Date());
  const end = endOfDay(new Date());
  return { start: start.toISOString(), end: end.toISOString() };
}

export function tomorrowRange(): { start: string; end: string } {
  const day = addDays(startOfDay(new Date()), 1);
  return {
    start: day.toISOString(),
    end: endOfDay(day).toISOString(),
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
