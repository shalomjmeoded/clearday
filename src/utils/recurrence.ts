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

/**
 * The n-th occurrence after `anchor`. Steps are always taken from the anchor
 * (not from the previous occurrence) so month-end and leap-day anchors do not
 * drift: Jan 31 → Feb 28 → Mar 31, and Feb 29 → Feb 28 → Feb 29.
 */
function occurrenceFromAnchor(
  anchor: Date,
  recurrence: TaskRecurrence,
  steps: number
): Date {
  switch (recurrence) {
    case 'daily':
      return addDays(anchor, steps);
    case 'weekly':
      return addWeeks(anchor, steps);
    case 'biweekly':
      return addWeeks(anchor, steps * 2);
    case 'monthly':
      return addMonths(anchor, steps);
    case 'yearly':
      return addYears(anchor, steps);
    default:
      return anchor;
  }
}

/**
 * Next due date strictly after today (or after the anchor if the anchor is in
 * the future). Overdue tasks catch up to the next future occurrence instead of
 * cycling through every missed one.
 */
export function getNextDueDate(
  anchorIso: string,
  recurrence: TaskRecurrence,
  now: Date = new Date()
): string {
  if (recurrence === 'none') return anchorIso;

  const anchor = startOfDay(parseISO(anchorIso));
  const today = startOfDay(now);

  let steps = 1;
  let next = occurrenceFromAnchor(anchor, recurrence, steps);
  while (next <= today) {
    steps += 1;
    next = occurrenceFromAnchor(anchor, recurrence, steps);
  }

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
