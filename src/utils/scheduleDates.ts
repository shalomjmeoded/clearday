import { addDays, format, startOfDay } from 'date-fns';

export function tomorrowIso(): string {
  return startOfDay(addDays(new Date(), 1)).toISOString();
}

export function dayIso(daysFromToday: number): string {
  return startOfDay(addDays(new Date(), daysFromToday)).toISOString();
}

export type DayOption = { iso: string; label: string };

/** Upcoming days for Pro date picker (starts tomorrow). */
export function getUpcomingDayOptions(count = 90): DayOption[] {
  const options: DayOption[] = [];
  for (let i = 1; i <= count; i++) {
    const date = addDays(new Date(), i);
    options.push({
      iso: startOfDay(date).toISOString(),
      label: format(date, 'EEE, MMM d, yyyy'),
    });
  }
  return options;
}
