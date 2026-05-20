import { getDb } from '@/db/client';
import { mapRowToTask } from '@/features/tasks/taskMapper';
import type { Task } from '@/types/task';
import {
  isAfterTomorrow,
  isCreatedToday,
  isToday,
  isTomorrow,
} from '@/utils/dates';

function sortTodayTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const aMust = a.priority === 'must_do_today' ? 0 : 1;
    const bMust = b.priority === 'must_do_today' ? 0 : 1;
    if (aMust !== bMust) return aMust - bMust;
    return a.sortOrder - b.sortOrder;
  });
}

function matchesTodayActive(task: Task): boolean {
  if (task.status !== 'active') return false;
  if (task.priority === 'must_do_today') return true;
  if (task.dueDate && isToday(task.dueDate)) return true;
  if (!task.dueDate && isCreatedToday(task.createdAt)) return true;
  return false;
}

export async function fetchTodayTasks(): Promise<Task[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM tasks WHERE deletedAt IS NULL`
  );
  const tasks = rows.map(mapRowToTask);
  return sortTodayTasks(tasks.filter(matchesTodayActive));
}

export async function fetchTodayCompletedTasks(): Promise<Task[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM tasks WHERE status = 'completed' AND deletedAt IS NULL ORDER BY completedAt DESC`
  );
  return rows
    .map(mapRowToTask)
    .filter((t) => t.completedAt && isToday(t.completedAt));
}

export async function fetchTomorrowTasks(): Promise<Task[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM tasks WHERE status = 'active' AND deletedAt IS NULL AND dueDate IS NOT NULL`
  );
  return rows
    .map(mapRowToTask)
    .filter((t) => t.dueDate && isTomorrow(t.dueDate))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function fetchLaterTasks(): Promise<Task[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM tasks WHERE status = 'active' AND deletedAt IS NULL AND dueDate IS NOT NULL`
  );
  return rows
    .map(mapRowToTask)
    .filter((t) => t.dueDate && isAfterTomorrow(t.dueDate))
    .sort((a, b) => {
      const aDate = new Date(a.dueDate!).getTime();
      const bDate = new Date(b.dueDate!).getTime();
      return aDate - bDate || a.sortOrder - b.sortOrder;
    });
}

export async function fetchDoneTasks(): Promise<Task[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM tasks WHERE status = 'completed' AND deletedAt IS NULL ORDER BY completedAt DESC`
  );
  return rows.map(mapRowToTask);
}
