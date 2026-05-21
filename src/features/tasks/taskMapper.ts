import { DEFAULT_RECURRENCE, type TaskRecurrence } from '@/types/recurrence';
import type { Task } from '@/types/task';

export function mapRowToTask(row: Record<string, unknown>): Task {
  const recurrence = (row.recurrence as TaskRecurrence | null) ?? DEFAULT_RECURRENCE;
  return {
    id: row.id as string,
    title: row.title as string,
    notes: (row.notes as string) ?? undefined,
    status: row.status as Task['status'],
    priority: row.priority as Task['priority'],
    color: (row.color as string) ?? undefined,
    dueDate: (row.dueDate as string) ?? undefined,
    reminderAt: (row.reminderAt as string) ?? undefined,
    recurrence,
    listId: (row.listId as string) ?? undefined,
    sortOrder: row.sortOrder as number,
    completedAt: (row.completedAt as string) ?? undefined,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
    deletedAt: (row.deletedAt as string) ?? undefined,
  };
}
