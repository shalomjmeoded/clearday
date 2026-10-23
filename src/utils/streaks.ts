import { differenceInCalendarDays, parseISO, startOfDay } from 'date-fns';

import type { TaskRecurrence } from '@/types/recurrence';

export interface CompletionStats {
  /** Occurrences logged in total. */
  total: number;
  /** Consecutive occurrences ending at the most recent one, if it is current. */
  streak: number;
}

/**
 * Longest allowed gap (in days) between two consecutive completions for the
 * run to continue. Generous by one period so a task done a day late still
 * counts, which is how habit trackers usually behave.
 */
function maxGapDays(recurrence: TaskRecurrence): number {
  switch (recurrence) {
    case 'daily':
      return 2;
    case 'weekly':
      return 14;
    case 'biweekly':
      return 28;
    case 'monthly':
      return 62;
    case 'yearly':
      return 2 * 366;
    default:
      return 0;
  }
}

/**
 * Current streak from occurrence due dates (the day each repeat was for). The
 * run must reach up to the present: if the most recent occurrence is older
 * than one allowed gap, the streak is 0. Duplicate days count once.
 */
export function computeCompletionStats(
  occurrenceDueDates: (string | undefined)[],
  recurrence: TaskRecurrence,
  now: Date = new Date()
): CompletionStats {
  const days = [
    ...new Set(
      occurrenceDueDates
        .filter((iso): iso is string => Boolean(iso))
        .map((iso) => startOfDay(parseISO(iso)).getTime())
    ),
  ].sort((a, b) => b - a);

  const total = days.length;
  const gap = maxGapDays(recurrence);
  if (total === 0 || gap === 0) return { total, streak: 0 };

  const today = startOfDay(now);
  if (differenceInCalendarDays(today, days[0]) > gap) {
    return { total, streak: 0 };
  }

  let streak = 1;
  for (let i = 1; i < days.length; i++) {
    if (differenceInCalendarDays(days[i - 1], days[i]) > gap) break;
    streak += 1;
  }
  return { total, streak };
}

/** "Done 12 times · 5 in a row" — omits the streak when it is not notable. */
export function formatCompletionStats(stats: CompletionStats): string {
  if (stats.total === 0) return '';
  const times = stats.total === 1 ? 'once' : `${stats.total} times`;
  const run = stats.streak >= 2 ? ` · ${stats.streak} in a row` : '';
  return `Done ${times}${run}`;
}
