import type { Task } from '@/types/task';

/** Fingerprint for detecting task field changes without list membership changes. */
export function taskSyncKey(task: Task): string {
  return [
    task.id,
    task.sortOrder,
    task.status,
    task.priority,
    task.recurrence ?? 'none',
    task.dueDate ?? '',
    task.completedAt ?? '',
    task.title,
    task.color ?? '',
    task.reminderAt ?? '',
    task.updatedAt,
  ].join(':');
}

/**
 * Keeps the on-screen order while the store catches up with a drag, but
 * only while the two lists hold the same tasks. When `next` brings tasks
 * `current` lacks — a filter or search was just cleared, a task was
 * reopened — the persisted order in `next` wins outright. Preserving the
 * narrowed order and appending the rest used to float the previously
 * visible rows to the top of the list.
 */
export function mergeTasksPreservingOrder(current: Task[], next: Task[]): Task[] {
  const nextKey = next.map(taskSyncKey).join('|');
  const currentKey = current.map(taskSyncKey).join('|');
  if (currentKey === nextKey) return current;

  const currentIds = new Set(current.map((task) => task.id));
  if (next.some((task) => !currentIds.has(task.id))) return next;

  const nextById = new Map(next.map((task) => [task.id, task]));
  const seen = new Set<string>();
  const merged: Task[] = [];

  for (const task of current) {
    const updated = nextById.get(task.id);
    if (updated) {
      merged.push(updated);
      seen.add(task.id);
    }
  }

  for (const task of next) {
    if (!seen.has(task.id)) merged.push(task);
  }

  return merged;
}
