import { getDb } from '@/db/client';
import { mapRowToTask } from '@/features/tasks/taskMapper';
import type { Task } from '@/types/task';
import { localDayRangeIso } from '@/utils/dates';

/**
 * Day filtering happens in SQL. Every timestamp is written via toISOString
 * (fixed-width UTC Zulu — see toDueDateIso), so string comparison against the
 * local day's [start, end) instant range is exactly isSameDay() in JS, and
 * the (status, dueDate) / (status, completedAt) indexes can carry the query
 * instead of every view materialising the whole table.
 */

/** Page size for the completed history; the Finished screen loads more on scroll. */
export const DONE_PAGE_SIZE = 100;

/**
 * Today shows what needs attention now: due today, overdue, must-do, or
 * captured today without a date. An overdue task stays here until it is
 * done or rescheduled rather than quietly dropping off the list.
 */
export async function fetchTodayTasks(): Promise<Task[]> {
  const db = await getDb();
  const today = localDayRangeIso();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM tasks
     WHERE status = 'active' AND deletedAt IS NULL
       AND (
         priority = 'must_do_today'
         OR (dueDate IS NOT NULL AND dueDate < ?)
         OR (dueDate IS NULL AND createdAt >= ? AND createdAt < ?)
       )
     ORDER BY CASE WHEN priority = 'must_do_today' THEN 0 ELSE 1 END, sortOrder ASC`,
    [today.end, today.start, today.end]
  );
  return rows.map(mapRowToTask);
}

/**
 * Completed on today's calendar day — except tasks due tomorrow, which show
 * under Tomorrow's completed section instead.
 */
export async function fetchTodayCompletedTasks(): Promise<Task[]> {
  const db = await getDb();
  const today = localDayRangeIso();
  const tomorrow = localDayRangeIso(1);
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM tasks
     WHERE status = 'completed' AND deletedAt IS NULL
       AND completedAt >= ? AND completedAt < ?
       AND (dueDate IS NULL OR dueDate < ? OR dueDate >= ?)
     ORDER BY completedAt DESC`,
    [today.start, today.end, tomorrow.start, tomorrow.end]
  );
  return rows.map(mapRowToTask);
}

/** Tasks due tomorrow that were finished early (today or tomorrow). */
export async function fetchTomorrowCompletedTasks(): Promise<Task[]> {
  const db = await getDb();
  const today = localDayRangeIso();
  const tomorrow = localDayRangeIso(1);
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM tasks
     WHERE status = 'completed' AND deletedAt IS NULL
       AND dueDate >= ? AND dueDate < ?
       AND completedAt >= ? AND completedAt < ?
     ORDER BY completedAt DESC`,
    [tomorrow.start, tomorrow.end, today.start, tomorrow.end]
  );
  return rows.map(mapRowToTask);
}

export async function fetchTomorrowTasks(): Promise<Task[]> {
  const db = await getDb();
  const tomorrow = localDayRangeIso(1);
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM tasks
     WHERE status = 'active' AND deletedAt IS NULL
       AND dueDate >= ? AND dueDate < ?
     ORDER BY sortOrder ASC`,
    [tomorrow.start, tomorrow.end]
  );
  return rows.map(mapRowToTask);
}

export async function fetchLaterTasks(): Promise<Task[]> {
  const db = await getDb();
  const tomorrow = localDayRangeIso(1);
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM tasks
     WHERE status = 'active' AND deletedAt IS NULL AND dueDate >= ?
     ORDER BY dueDate ASC, sortOrder ASC`,
    [tomorrow.end]
  );
  return rows.map(mapRowToTask);
}

/**
 * One page of the completed history, newest first. Rows missing completedAt
 * (legacy data) sort last, so paging walks the history in a stable order.
 */
export async function fetchDoneTasks(
  limit: number = DONE_PAGE_SIZE,
  offset = 0
): Promise<Task[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM tasks WHERE status = 'completed' AND deletedAt IS NULL
     ORDER BY completedAt DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  return rows.map(mapRowToTask);
}
