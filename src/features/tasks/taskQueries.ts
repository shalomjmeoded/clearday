import { getDb } from '@/db/client';
import { INBOX_LIST_ID } from '@/db/constants';
import { mapRowToTask } from '@/features/tasks/taskMapper';
import type { Task, TaskStatus } from '@/types/task';
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

/** Cap per status group on one search; past this the list is noise and the query should narrow. */
export const SEARCH_RESULT_LIMIT = 200;

/** Results come back in this order regardless of how `statuses` is given. */
const STATUS_ORDER: readonly TaskStatus[] = ['active', 'completed', 'archived'];

export interface TaskSearchOptions {
  /** Which statuses to look in. Order has no effect; results are grouped by status. */
  statuses: readonly TaskStatus[];
  /** Restrict to one list. */
  listId?: string;
  /** Applied to each status group separately, so a long history cannot crowd out the others. */
  limit?: number;
  /** Only tasks due at or after this instant (inclusive). Undated tasks are excluded. */
  dueFrom?: string;
  /** How open matches are ordered: their list position (default) or by due date. */
  activeOrder?: 'list' | 'date';
}

/**
 * Turns one search term into a GLOB pattern that matches it anywhere,
 * ignoring letter case. GLOB rather than LIKE because LIKE only folds ASCII
 * ("ÉCOLE" would not find "école"), while a GLOB class [éÉ] is checked per
 * character in UTF-8, so the fold follows JavaScript's Unicode rules. The
 * GLOB metacharacters * ? [ are wrapped in a class so they match literally.
 */
export function buildGlobPattern(term: string): string {
  let out = '*';
  for (const ch of term) {
    const lower = ch.toLowerCase();
    const upper = ch.toUpperCase();
    if (lower !== upper && [...lower].length === 1 && [...upper].length === 1) {
      out += `[${lower}${upper}]`;
    } else if (ch === '*' || ch === '?' || ch === '[') {
      out += `[${ch}]`;
    } else {
      out += ch;
    }
  }
  return out + '*';
}

/**
 * Escapes the LIKE metacharacters so a query containing "%" or "_" matches
 * those characters literally. The backslash is the escape char declared in
 * the ESCAPE clause, so it has to be escaped first.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * One SQL predicate per term. LIKE already folds ASCII case and scans about
 * five times faster than a GLOB full of character classes, so it carries
 * every plain-ASCII term; GLOB steps in only when a term has letters LIKE
 * would compare case-sensitively.
 */
export function termPredicate(term: string): { sql: string; pattern: string } {
  if (/^[\x00-\x7F]*$/.test(term)) {
    return {
      sql: "(title LIKE ? ESCAPE '\\' OR COALESCE(notes, '') LIKE ? ESCAPE '\\')",
      pattern: `%${escapeLikePattern(term)}%`,
    };
  }
  return {
    sql: "(title GLOB ? OR COALESCE(notes, '') GLOB ?)",
    pattern: buildGlobPattern(term),
  };
}

/** Whitespace-separated terms; every term must match title or notes. */
export function searchTerms(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean);
}

/**
 * In-memory twin of searchTasks for rows a screen already holds (Today's
 * completed section), so both halves of one screen agree on what matches.
 */
export function taskMatchesSearch(task: Pick<Task, 'title' | 'notes'>, query: string): boolean {
  const terms = searchTerms(query);
  if (terms.length === 0) return true;
  const haystack = `${task.title}\n${task.notes ?? ''}`.toLowerCase();
  return terms.every((term) => haystack.includes(term.toLowerCase()));
}

/**
 * The one search the app has. Runs in SQL so it covers the whole table —
 * the Finished history is paged, and an in-memory filter there would miss
 * anything not yet scrolled into view. Every term must appear in the title
 * or the notes (substring, case-insensitive). One query per status, each
 * with its own limit, concatenated in a fixed order: open tasks in list
 * order, then completed newest first, then archived most recently touched
 * first, so a caller can split them by status without re-sorting.
 */
export async function searchTasks(
  query: string,
  {
    statuses,
    listId,
    limit = SEARCH_RESULT_LIMIT,
    dueFrom,
    activeOrder = 'list',
  }: TaskSearchOptions
): Promise<Task[]> {
  const terms = searchTerms(query);
  const wanted = STATUS_ORDER.filter((status) => statuses.includes(status));
  if (terms.length === 0 || wanted.length === 0) return [];

  const where = ['status = ?', 'deletedAt IS NULL'];
  const scope: (string | number)[] = [];
  if (listId) {
    where.push('COALESCE(listId, ?) = ?');
    scope.push(INBOX_LIST_ID, listId);
  }
  if (dueFrom) {
    where.push('dueDate >= ?');
    scope.push(dueFrom);
  }
  for (const term of terms) {
    const { sql, pattern } = termPredicate(term);
    where.push(sql);
    scope.push(pattern, pattern);
  }
  const orderBy: Record<TaskStatus, string> = {
    active: activeOrder === 'date' ? 'dueDate ASC, sortOrder ASC' : 'sortOrder ASC',
    completed: 'completedAt DESC',
    archived: 'updatedAt DESC',
  };

  const db = await getDb();
  const results: Task[] = [];
  for (const status of wanted) {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM tasks WHERE ${where.join(' AND ')} ORDER BY ${orderBy[status]} LIMIT ?`,
      [status, ...scope, limit]
    );
    results.push(...rows.map(mapRowToTask));
  }
  return results;
}
