import { addDays, format } from 'date-fns';

import { toDueDateIso } from '@/utils/dates';

export function tomorrowIso(): string {
  return toDueDateIso(addDays(new Date(), 1));
}

export function dayIso(daysFromToday: number): string {
  return toDueDateIso(addDays(new Date(), daysFromToday));
}

export type DayOption = { iso: string; label: string };

/** Upcoming days for Pro date picker (starts tomorrow). */
export function getUpcomingDayOptions(count = 90): DayOption[] {
  const options: DayOption[] = [];
  for (let i = 1; i <= count; i++) {
    const date = addDays(new Date(), i);
    options.push({
      iso: toDueDateIso(date),
      label: format(date, 'EEE, MMM d, yyyy'),
    });
  }
  return options;
}
