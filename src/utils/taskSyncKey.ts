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

export function mergeTasksPreservingOrder(current: Task[], next: Task[]): Task[] {
  const nextKey = next.map(taskSyncKey).join('|');
  const currentKey = current.map(taskSyncKey).join('|');
  if (currentKey === nextKey) return current;

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
