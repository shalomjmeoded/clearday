import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  parseISO,
  setHours,
  setMinutes,
  startOfDay,
} from 'date-fns';

import type { TaskRecurrence } from '@/types/recurrence';

export const RECURRENCE_OPTIONS: { key: TaskRecurrence; label: string }[] = [
  { key: 'none', label: 'Never' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'biweekly', label: 'Every 2 weeks' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
];

export function formatRecurrenceLabel(recurrence: TaskRecurrence): string {
  return RECURRENCE_OPTIONS.find((o) => o.key === recurrence)?.label ?? 'Never';
}

export function isRecurring(recurrence: TaskRecurrence): boolean {
  return recurrence !== 'none';
}

function stepRecurrence(date: Date, recurrence: TaskRecurrence): Date {
  switch (recurrence) {
    case 'daily':
      return addDays(date, 1);
    case 'weekly':
      return addWeeks(date, 1);
    case 'biweekly':
      return addWeeks(date, 2);
    case 'monthly':
      return addMonths(date, 1);
    case 'yearly':
      return addYears(date, 1);
    default:
      return date;
  }
}

/** Next due date strictly after today (or after anchor if anchor is in the future). */
export function getNextDueDate(
  anchorIso: string,
  recurrence: TaskRecurrence
): string {
  if (recurrence === 'none') return anchorIso;

  let next = startOfDay(parseISO(anchorIso));
  const today = startOfDay(new Date());

  do {
    next = stepRecurrence(next, recurrence);
  } while (next <= today);

  return next.toISOString();
}

/** Move reminder to the same clock time on the new due day. */
export function shiftReminderToDueDate(
  reminderIso: string,
  dueDateIso: string
): string {
  const reminder = parseISO(reminderIso);
  const due = startOfDay(parseISO(dueDateIso));
  return setMinutes(
    setHours(due, reminder.getHours()),
    reminder.getMinutes()
  ).toISOString();
}
