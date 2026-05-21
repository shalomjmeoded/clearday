import { INBOX_LIST_ID } from '@/db/constants';
import { getDb } from '@/db/client';
import { mapRowToTask } from '@/features/tasks/taskMapper';
import { DEFAULT_RECURRENCE } from '@/types/recurrence';
import type { CreateTaskInput, Task, UpdateTaskInput } from '@/types/task';
import { createId } from '@/utils/id';
import { nowIso, todayRange } from '@/utils/dates';
import {
  getNextDueDate,
  isRecurring,
  shiftReminderToDueDate,
} from '@/utils/recurrence';
import { tomorrowIso } from '@/utils/scheduleDates';

import {
  cancelReminderForTask,
  scheduleReminderForTask,
} from '../reminders/reminderService';

async function nextSortOrder(listId: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ maxOrder: number | null }>(
    'SELECT MAX(sortOrder) as maxOrder FROM tasks WHERE listId = ? AND deletedAt IS NULL',
    [listId]
  );
  return (row?.maxOrder ?? -1) + 1;
}

function resolveDueDateForRecurrence(
  dueDate: string | undefined,
  recurrence: Task['recurrence']
): string | undefined {
  if (!isRecurring(recurrence)) return dueDate;
  if (dueDate) return dueDate;
  return todayRange().start;
}

export const taskRepository = {
  async getById(id: string): Promise<Task | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM tasks WHERE id = ? AND deletedAt IS NULL',
      [id]
    );
    return row ? mapRowToTask(row) : null;
  },

  async create(input: CreateTaskInput): Promise<Task> {
    const db = await getDb();
    const now = nowIso();
    const listId = input.listId ?? INBOX_LIST_ID;
    const sortOrder =
      input.sortOrder ?? (await nextSortOrder(listId));
    const recurrence = input.recurrence ?? DEFAULT_RECURRENCE;
    const dueDate = resolveDueDateForRecurrence(input.dueDate, recurrence);

    const task: Task = {
      id: createId(),
      title: input.title.trim(),
      notes: input.notes,
      status: 'active',
      priority: input.priority ?? 'normal',
      color: input.color,
      dueDate,
      reminderAt: input.reminderAt,
      recurrence,
      listId,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    };

    await db.runAsync(
      `INSERT INTO tasks (id, title, notes, status, priority, color, dueDate, reminderAt, recurrence, listId, sortOrder, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.id,
        task.title,
        task.notes ?? null,
        task.status,
        task.priority,
        task.color ?? null,
        task.dueDate ?? null,
        task.reminderAt ?? null,
        task.recurrence,
        task.listId ?? INBOX_LIST_ID,
        task.sortOrder,
        task.createdAt,
        task.updatedAt,
      ]
    );

    if (task.reminderAt) {
      await scheduleReminderForTask(task);
    }

    return task;
  },

  async update(id: string, input: UpdateTaskInput): Promise<Task | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const recurrence = input.recurrence ?? existing.recurrence;
    let dueDate =
      'dueDate' in input ? input.dueDate : existing.dueDate;
    if (isRecurring(recurrence) && !dueDate) {
      dueDate = todayRange().start;
    }

    const db = await getDb();
    const now = nowIso();
    const updated: Task = {
      ...existing,
      ...input,
      recurrence,
      dueDate,
      updatedAt: now,
    };
    if ('reminderAt' in input) {
      updated.reminderAt = input.reminderAt;
    }

    await db.runAsync(
      `UPDATE tasks SET title = ?, notes = ?, status = ?, priority = ?, color = ?, dueDate = ?, reminderAt = ?,
        recurrence = ?, listId = ?, sortOrder = ?, completedAt = ?, updatedAt = ?, deletedAt = ?
       WHERE id = ?`,
      [
        updated.title,
        updated.notes ?? null,
        updated.status,
        updated.priority,
        updated.color ?? null,
        updated.dueDate ?? null,
        updated.reminderAt ?? null,
        updated.recurrence,
        updated.listId ?? INBOX_LIST_ID,
        updated.sortOrder,
        updated.completedAt ?? null,
        updated.updatedAt,
        updated.deletedAt ?? null,
        id,
      ]
    );

    if (updated.reminderAt && updated.status === 'active') {
      await scheduleReminderForTask(updated);
    } else {
      await cancelReminderForTask(id);
    }

    return updated;
  },

  async complete(id: string): Promise<Task | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    if (isRecurring(existing.recurrence)) {
      const anchor = existing.dueDate ?? todayRange().start;
      const nextDue = getNextDueDate(anchor, existing.recurrence);
      let reminderAt = existing.reminderAt;
      if (reminderAt) {
        reminderAt = shiftReminderToDueDate(reminderAt, nextDue);
      }
      const priority =
        existing.priority === 'must_do_today' ? 'normal' : existing.priority;

      return this.update(id, {
        status: 'active',
        completedAt: undefined,
        dueDate: nextDue,
        reminderAt,
        priority,
      });
    }

    const now = nowIso();
    return this.update(id, {
      status: 'completed',
      completedAt: now,
      reminderAt: undefined,
    });
  },

  async uncomplete(id: string): Promise<Task | null> {
    return this.update(id, {
      status: 'active',
      completedAt: undefined,
    });
  },

  async archive(id: string): Promise<Task | null> {
    await cancelReminderForTask(id);
    return this.update(id, { status: 'archived', reminderAt: undefined });
  },

  async deletePermanent(id: string): Promise<void> {
    await cancelReminderForTask(id);
    const db = await getDb();
    await db.runAsync('DELETE FROM reminders WHERE taskId = ?', [id]);
    await db.runAsync('DELETE FROM tasks WHERE id = ?', [id]);
  },

  async moveToTomorrow(id: string): Promise<Task | null> {
    return this.update(id, { dueDate: tomorrowIso() });
  },

  async setPriority(id: string, priority: Task['priority']): Promise<Task | null> {
    return this.update(id, { priority });
  },

  async setRecurrence(
    id: string,
    recurrence: Task['recurrence']
  ): Promise<Task | null> {
    return this.update(id, { recurrence });
  },

  async reorderTasks(orderedIds: string[]): Promise<void> {
    if (orderedIds.length === 0) return;
    const db = await getDb();
    const now = nowIso();
    await Promise.all(
      orderedIds.map((id, index) =>
        db.runAsync(
          'UPDATE tasks SET sortOrder = ?, updatedAt = ? WHERE id = ? AND deletedAt IS NULL',
          [index, now, id]
        )
      )
    );
  },

  async scheduleForDate(id: string, dueDate: string): Promise<Task | null> {
    return this.update(id, { dueDate });
  },

  async getAllActive(): Promise<Task[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM tasks WHERE status = 'active' AND deletedAt IS NULL ORDER BY sortOrder ASC`
    );
    return rows.map(mapRowToTask);
  },

  async getCompleted(): Promise<Task[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM tasks WHERE status = 'completed' AND deletedAt IS NULL
       ORDER BY completedAt DESC`
    );
    return rows.map(mapRowToTask);
  },

  async getByListId(listId: string): Promise<Task[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM tasks WHERE listId = ? AND status = 'active' AND deletedAt IS NULL
       ORDER BY sortOrder ASC`,
      [listId]
    );
    return rows.map(mapRowToTask);
  },
};
