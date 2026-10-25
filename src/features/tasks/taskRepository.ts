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
  cancelScheduledNotifications,
  scheduleReminderForTask,
} from '../reminders/reminderService';

/**
 * Storage caps. The UI has no hard limits, so a paste of arbitrary size ends
 * up here; past these lengths the extra text is unreadable in any view and
 * only inflates every query that touches the row.
 */
export const MAX_TITLE_LENGTH = 500;
export const MAX_NOTES_LENGTH = 10_000;

function clampTitle(title: string): string {
  return title.trim().slice(0, MAX_TITLE_LENGTH);
}

function clampNotes(notes: string | undefined): string | undefined {
  return notes === undefined ? undefined : notes.slice(0, MAX_NOTES_LENGTH);
}

/**
 * Completions already being written, keyed by task id. The store guards its
 * own callers, but the repository must hold the line too: two racing
 * complete() calls on a repeating task would each log an occurrence and
 * advance the date twice. The second caller shares the first one's result.
 */
const completeInFlight = new Map<
  string,
  Promise<{ task: Task | null; occurrenceId?: string }>
>();

/**
 * SQL fragment placing a new task after everything in its list. Evaluated
 * inside the INSERT itself so two creates racing on the same list cannot
 * read the same MAX and land on one sortOrder.
 */
const NEXT_SORT_ORDER_SQL =
  '(SELECT COALESCE(MAX(sortOrder), -1) + 1 FROM tasks WHERE listId = ? AND deletedAt IS NULL)';

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

/**
 * Deletes every task matching `where` with two set-based statements instead
 * of a per-row loop (clearing a long history used to issue thousands of
 * DELETEs). OS notifications for the doomed tasks are cancelled first; the
 * row deletes then run in one transaction, so a kill mid-way cannot leave
 * half the set gone. A cancelled notification whose rows survive the kill is
 * harmless: the next reminder sync reschedules from the tasks themselves.
 */
async function deleteTasksWhere(
  where: string,
  params: (string | number)[] = []
): Promise<void> {
  const db = await getDb();
  const pending = await db.getAllAsync<{ notificationId: string | null }>(
    `SELECT r.notificationId FROM reminders r
     WHERE r.taskId IN (SELECT id FROM tasks WHERE ${where})`,
    params
  );
  await cancelScheduledNotifications(
    pending
      .map((row) => row.notificationId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  );
  await runInTransaction(async () => {
    await db.runAsync(
      `DELETE FROM reminders WHERE taskId IN (SELECT id FROM tasks WHERE ${where})`,
      params
    );
    await db.runAsync(`DELETE FROM tasks WHERE ${where}`, params);
  });
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
    const recurrence = input.recurrence ?? DEFAULT_RECURRENCE;
    const priority = input.priority ?? 'normal';
    const dueDate = resolveDueDateForPriority(
      resolveDueDateForRecurrence(input.dueDate, recurrence),
      priority
    );

    const task: Task = {
      id: createId(),
      title: clampTitle(input.title),
      notes: clampNotes(input.notes),
      status: 'active',
      priority,
      color: input.color,
      dueDate,
      reminderAt: input.reminderAt,
      recurrence,
      listId,
      sortOrder: input.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    };

    await db.runAsync(
      `INSERT INTO tasks (id, title, notes, status, priority, color, dueDate, reminderAt, recurrence, listId, sortOrder, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, ${NEXT_SORT_ORDER_SQL}), ?, ?)`,
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
        input.sortOrder ?? null,
        task.listId ?? INBOX_LIST_ID,
        task.createdAt,
        task.updatedAt,
      ]
    );

    if (input.sortOrder === undefined) {
      const row = await db.getFirstAsync<{ sortOrder: number }>(
        'SELECT sortOrder FROM tasks WHERE id = ?',
        [task.id]
      );
      task.sortOrder = row?.sortOrder ?? 0;
    }

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
    if (input.title !== undefined) updated.title = clampTitle(input.title);
    if (input.notes !== undefined) updated.notes = clampNotes(input.notes);
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
    // A second complete arriving while the first is writing joins it instead
    // of logging another occurrence and advancing the date twice.
    const inFlight = completeInFlight.get(id);
    if (inFlight) return inFlight;
    const work = this.completeInner(id).finally(() => {
      completeInFlight.delete(id);
    });
    completeInFlight.set(id, work);
    return work;
  },

  async completeInner(
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

      // Atomic: a kill between logging the occurrence and advancing the date
      // must not leave a logged repeat whose live task never moved on.
      return runInTransaction(async () => {
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
      });
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
    await deleteTasksWhere('deletedAt IS NOT NULL');
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

    // A drag usually moves one task a few slots; only rows whose position
    // actually changed are written, so reordering doesn't touch (and stamp
    // updatedAt on) every task in the list.
    const current = new Map<string, number>();
    const CHUNK = 500; // stay under SQLite's bound-parameter limit
    for (let i = 0; i < orderedIds.length; i += CHUNK) {
      const chunk = orderedIds.slice(i, i + CHUNK);
      const rows = await db.getAllAsync<{ id: string; sortOrder: number }>(
        `SELECT id, sortOrder FROM tasks WHERE deletedAt IS NULL AND id IN (${chunk
          .map(() => '?')
          .join(',')})`,
        chunk
      );
      for (const row of rows) current.set(row.id, row.sortOrder);
    }

    const changes: [string, number][] = [];
    for (const [index, id] of orderedIds.entries()) {
      const existing = current.get(id);
      if (existing !== undefined && existing !== index) {
        changes.push([id, index]);
      }
    }
    if (changes.length === 0) return;

    const now = nowIso();
    // One transaction: a kill mid-way must not leave half the list reordered.
    await runInTransaction(async () => {
      for (const [id, index] of changes) {
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
    await deleteTasksWhere(`status = 'completed' AND deletedAt IS NULL`);
  },

  /**
   * Hides the whole completed history behind one Undo window. All rows are
   * stamped with the same deletedAt, which doubles as the batch handle for
   * restoreClearedCompleted / purgeClearedCompleted. Completed rows carry no
   * scheduled notifications, so there is nothing to cancel here.
   */
  async softDeleteCompleted(): Promise<string> {
    const db = await getDb();
    const marker = nowIso();
    await db.runAsync(
      `UPDATE tasks SET deletedAt = ?, updatedAt = ?
       WHERE status = 'completed' AND deletedAt IS NULL`,
      [marker, marker]
    );
    return marker;
  },

  /** Reverses softDeleteCompleted for one batch (the Undo path). */
  async restoreClearedCompleted(marker: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      'UPDATE tasks SET deletedAt = NULL, updatedAt = ? WHERE deletedAt = ?',
      [nowIso(), marker]
    );
  },

  /** Makes one softDeleteCompleted batch permanent (the Undo window closing). */
  async purgeClearedCompleted(marker: string): Promise<void> {
    await deleteTasksWhere('deletedAt = ?', [marker]);
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
