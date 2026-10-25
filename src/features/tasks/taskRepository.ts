import { INBOX_LIST_ID } from '@/db/constants';
import { getDb } from '@/db/client';
import { runInTransaction } from '@/db/exclusive';
import { mapRowToTask } from '@/features/tasks/taskMapper';
import { DEFAULT_RECURRENCE } from '@/types/recurrence';
import type { CreateTaskInput, Task, UpdateTaskInput } from '@/types/task';
import { createId } from '@/utils/id';
import { nowIso, todayDueIso } from '@/utils/dates';
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

/**
 * "Must do today" names a day, so a pinned task always carries one. Quick
 * add's "!!" has done this since the start; the toolbar pin and the detail
 * screen now agree, so a pin left undone turns overdue tomorrow instead of
 * floating on Today with no date behind it.
 */
function resolveDueDateForPriority(
  dueDate: string | undefined,
  priority: Task['priority']
): string | undefined {
  if (priority !== 'must_do_today' || dueDate) return dueDate;
  return todayDueIso();
}

function resolveDueDateForRecurrence(
  dueDate: string | undefined,
  recurrence: Task['recurrence']
): string | undefined {
  if (!isRecurring(recurrence)) return dueDate;
  if (dueDate) return dueDate;
  return todayDueIso();
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
    const priority = input.priority ?? 'normal';
    const dueDate = resolveDueDateForPriority(
      resolveDueDateForRecurrence(input.dueDate, recurrence),
      priority
    );

    const task: Task = {
      id: createId(),
      title: input.title.trim(),
      notes: input.notes,
      status: 'active',
      priority,
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
    const priority = input.priority ?? existing.priority;
    let dueDate =
      'dueDate' in input ? input.dueDate : existing.dueDate;
    if (isRecurring(recurrence) && !dueDate) {
      dueDate = todayDueIso();
    }
    dueDate = resolveDueDateForPriority(dueDate, priority);

    const db = await getDb();
    const now = nowIso();
    const updated: Task = {
      ...existing,
      ...input,
      recurrence,
      dueDate,
      updatedAt: now,
    };
    if ('recurringTaskId' in input) {
      updated.recurringTaskId = input.recurringTaskId;
    }
    if ('reminderAt' in input) {
      updated.reminderAt = input.reminderAt;
    } else if (
      existing.reminderAt &&
      dueDate &&
      dueDate !== existing.dueDate
    ) {
      // The due day moved and the caller said nothing about the reminder:
      // keep the same clock time on the new day instead of firing on the old one.
      updated.reminderAt = shiftReminderToDueDate(existing.reminderAt, dueDate);
    }
    if ('snoozedUntil' in input) {
      updated.snoozedUntil = input.snoozedUntil;
    } else if (
      updated.reminderAt !== existing.reminderAt ||
      dueDate !== existing.dueDate
    ) {
      // A snooze belongs to the alert it pushed. Once the reminder or the
      // day changes (including a repeat advancing), it has nothing to push.
      updated.snoozedUntil = undefined;
    }

    await db.runAsync(
      `UPDATE tasks SET title = ?, notes = ?, status = ?, priority = ?, color = ?, dueDate = ?, reminderAt = ?, snoozedUntil = ?,
        recurrence = ?, recurringTaskId = ?, listId = ?, sortOrder = ?, completedAt = ?, updatedAt = ?, deletedAt = ?
       WHERE id = ?`,
      [
        updated.title,
        updated.notes ?? null,
        updated.status,
        updated.priority,
        updated.color ?? null,
        updated.dueDate ?? null,
        updated.reminderAt ?? null,
        updated.snoozedUntil ?? null,
        updated.recurrence,
        updated.recurringTaskId ?? null,
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

  /**
   * Records a finished occurrence of a repeating task as its own completed
   * row, the way other task apps log each repeat, so the work shows up in
   * Finished and the completed sections. The live task keeps its id and
   * simply moves to its next date.
   */
  async logRecurringOccurrence(task: Task): Promise<string> {
    const db = await getDb();
    const now = nowIso();
    const occurrenceId = createId();
    await db.runAsync(
      `INSERT INTO tasks (id, title, notes, status, priority, color, dueDate, reminderAt, recurrence, recurringTaskId, listId, sortOrder, completedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, 'none', ?, ?, ?, ?, ?, ?)`,
      [
        occurrenceId,
        task.title,
        task.notes ?? null,
        task.priority,
        task.color ?? null,
        task.dueDate ?? null,
        task.reminderAt ?? null,
        task.id,
        task.listId ?? INBOX_LIST_ID,
        task.sortOrder,
        now,
        task.createdAt,
        now,
      ]
    );
    return occurrenceId;
  },

  async complete(
    id: string
  ): Promise<{ task: Task | null; occurrenceId?: string }> {
    const existing = await this.getById(id);
    if (!existing) return { task: null };

    if (isRecurring(existing.recurrence)) {
      const anchor = existing.dueDate ?? todayDueIso();
      const nextDue = getNextDueDate(anchor, existing.recurrence);
      let reminderAt = existing.reminderAt;
      if (reminderAt) {
        reminderAt = shiftReminderToDueDate(reminderAt, nextDue);
      }
      const priority =
        existing.priority === 'must_do_today' ? 'normal' : existing.priority;

      const occurrenceId = await this.logRecurringOccurrence(existing);
      const task = await this.update(id, {
        status: 'active',
        completedAt: undefined,
        dueDate: nextDue,
        reminderAt,
        snoozedUntil: undefined,
        priority,
      });
      return { task, occurrenceId };
    }

    // The reminder is kept on the task: completing cancels the pending
    // notification (see update), and reopening restores the reminder. A time
    // that has already passed is never rescheduled, matching how other task
    // apps treat a reopened overdue task.
    const now = nowIso();
    const task = await this.update(id, {
      status: 'completed',
      completedAt: now,
    });
    return { task };
  },

  /**
   * Reopening a logged repeat means "I did not actually do that one": the
   * record is removed and the live task is pulled back to that date, rather
   * than a duplicate of the repeating task being resurrected.
   */
  async uncomplete(id: string): Promise<Task | null> {
    const existing = await this.getById(id);

    if (existing?.recurringTaskId) {
      const live = await this.getById(existing.recurringTaskId);
      // Only fold back into a task that is still in play. An archived series
      // should not be resurrected by reopening one old record.
      if (live && live.status === 'active') {
        // Atomic: a kill between the two writes must not lose the record
        // without pulling the live task back.
        return runInTransaction(async () => {
          await this.deletePermanent(id);
          return this.update(live.id, {
            status: 'active',
            completedAt: undefined,
            dueDate: existing.dueDate,
            reminderAt: existing.reminderAt,
            priority: existing.priority,
          });
        });
      }
      // The series is gone or archived, so the record becomes a plain task.
      await this.update(id, { recurringTaskId: undefined });
    }

    return this.update(id, {
      status: 'active',
      completedAt: undefined,
    });
  },

  /**
   * The reminder stays on the row, as it does for a completed task: leaving
   * the active state cancels the alert (see update), and unarchiving puts a
   * still-future one back on the clock instead of losing it.
   */
  async archive(id: string): Promise<Task | null> {
    return this.update(id, { status: 'archived' });
  },

  /** Brings an archived task back to the active list. */
  async unarchive(id: string): Promise<Task | null> {
    const existing = await this.getById(id);
    if (!existing || existing.status !== 'archived') return existing;
    return this.update(id, { status: 'active', completedAt: undefined });
  },

  async getArchived(): Promise<Task[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM tasks WHERE status = 'archived' AND deletedAt IS NULL
       ORDER BY updatedAt DESC`
    );
    return rows.map(mapRowToTask);
  },

  /**
   * Hides the row behind the Undo toast: every query filters on deletedAt,
   * so the task vanishes from all views at once but can still come back.
   */
  async softDelete(id: string): Promise<void> {
    await cancelReminderForTask(id);
    const db = await getDb();
    const now = nowIso();
    await db.runAsync(
      'UPDATE tasks SET deletedAt = ?, updatedAt = ? WHERE id = ? AND deletedAt IS NULL',
      [now, now, id]
    );
  },

  /** Reverses softDelete and puts a still-future reminder back on the clock. */
  async restoreDeleted(id: string): Promise<Task | null> {
    const db = await getDb();
    await db.runAsync(
      'UPDATE tasks SET deletedAt = NULL, updatedAt = ? WHERE id = ?',
      [nowIso(), id]
    );
    const task = await this.getById(id);
    if (task?.reminderAt && task.status === 'active') {
      await scheduleReminderForTask(task);
    }
    return task;
  },

  /**
   * Finishes deletes whose Undo window was cut short by the app closing.
   * Only safe at launch, when no Undo toast can be pending.
   */
  async purgeSoftDeleted(): Promise<void> {
    const db = await getDb();
    const rows = await db.getAllAsync<{ id: string }>(
      'SELECT id FROM tasks WHERE deletedAt IS NOT NULL'
    );
    for (const row of rows) {
      await this.deletePermanent(row.id);
    }
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
    // One transaction: a kill mid-way must not leave half the list reordered.
    await runInTransaction(async () => {
      for (const [index, id] of orderedIds.entries()) {
        await db.runAsync(
          'UPDATE tasks SET sortOrder = ?, updatedAt = ? WHERE id = ? AND deletedAt IS NULL',
          [index, now, id]
        );
      }
    });
  },

  async scheduleForDate(id: string, dueDate: string): Promise<Task | null> {
    return this.update(id, { dueDate });
  },

  /** Logged completions of a repeating task, newest first. */
  async getOccurrences(recurringTaskId: string): Promise<Task[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM tasks WHERE recurringTaskId = ? AND status = 'completed' AND deletedAt IS NULL
       ORDER BY completedAt DESC`,
      [recurringTaskId]
    );
    return rows.map(mapRowToTask);
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

  async clearCompleted(): Promise<void> {
    const db = await getDb();
    const rows = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM tasks WHERE status = 'completed' AND deletedAt IS NULL`
    );
    // All or nothing, so a kill mid-way cannot leave half the history gone.
    await runInTransaction(async () => {
      for (const row of rows) {
        await this.deletePermanent(row.id);
      }
    });
  },

  async countActiveByList(): Promise<Record<string, number>> {
    const db = await getDb();
    const rows = await db.getAllAsync<{ listId: string | null; count: number }>(
      `SELECT listId, COUNT(*) as count FROM tasks
       WHERE status = 'active' AND deletedAt IS NULL
       GROUP BY listId`
    );
    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.listId ?? INBOX_LIST_ID] = row.count;
    }
    return counts;
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
