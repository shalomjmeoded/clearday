import { DEFAULT_RECURRENCE } from '@/types/recurrence';
import type { Task, TaskPriority, TaskStatus } from '@/types/task';
import { isKnownRecurrence } from '@/utils/recurrence';

const STATUSES = new Set<string>(['active', 'completed', 'archived']);
const PRIORITIES = new Set<string>(['normal', 'important', 'must_do_today']);

/**
 * Enum-like columns are checked rather than cast: a damaged value must not
 * reach code that switches on it (an unknown recurrence, for one, would make
 * the next-date loop spin forever).
 */
export function mapRowToTask(row: Record<string, unknown>): Task {
  const status = row.status as string;
  const priority = row.priority as string;
  return {
    id: row.id as string,
    title: row.title as string,
    notes: (row.notes as string) ?? undefined,
    status: STATUSES.has(status) ? (status as TaskStatus) : 'active',
    priority: PRIORITIES.has(priority) ? (priority as TaskPriority) : 'normal',
    color: (row.color as string) ?? undefined,
    dueDate: (row.dueDate as string) ?? undefined,
    reminderAt: (row.reminderAt as string) ?? undefined,
    snoozedUntil: (row.snoozedUntil as string) ?? undefined,
    recurrence: isKnownRecurrence(row.recurrence) ? row.recurrence : DEFAULT_RECURRENCE,
    recurringTaskId: (row.recurringTaskId as string) ?? undefined,
    listId: (row.listId as string) ?? undefined,
    sortOrder: typeof row.sortOrder === 'number' ? row.sortOrder : 0,
    completedAt: (row.completedAt as string) ?? undefined,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
    deletedAt: (row.deletedAt as string) ?? undefined,
  };
}
