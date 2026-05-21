import { parseISO } from 'date-fns';

import { isToday, isTomorrow } from '@/utils/dates';

/** Compact left-column date label for task rows (local timezone). */
export function formatTaskSideDate(dueDate?: string): string {
  if (!dueDate) return '';
  if (isToday(dueDate)) return '';
  if (isTomorrow(dueDate)) return 'Tom.';
  const date = parseISO(dueDate);
  return `${date.getMonth() + 1}.${date.getDate()}`;
}
