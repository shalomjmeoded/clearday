import { INBOX_LIST_ID } from '@/db/constants';
import { getDb } from '@/db/client';
import { runInTransaction } from '@/db/exclusive';
import type { TaskList } from '@/types/list';
import { createId } from '@/utils/id';
import { nowIso } from '@/utils/dates';

export const LIST_COLORS = [
  '#4F6B52',
  '#356C8C',
  '#8A5D8F',
  '#B85C4A',
  '#9B7A34',
  '#5E6F91',
];

function rowToList(row: Record<string, unknown>): TaskList {
  return {
    id: row.id as string,
    name: row.name as string,
    color: (row.color as string) ?? undefined,
    sortOrder: row.sortOrder as number,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
    deletedAt: (row.deletedAt as string) ?? undefined,
  };
}

export const listRepository = {
  async getAll(): Promise<TaskList[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM lists WHERE deletedAt IS NULL ORDER BY sortOrder ASC'
    );
    return rows.map(rowToList);
  },

  async getById(id: string): Promise<TaskList | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM lists WHERE id = ? AND deletedAt IS NULL',
      [id]
    );
    return row ? rowToList(row) : null;
  },

  async countCustomLists(): Promise<number> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM lists WHERE id != ? AND deletedAt IS NULL',
      [INBOX_LIST_ID]
    );
    return row?.count ?? 0;
  },

  async create(name: string): Promise<TaskList> {
    const db = await getDb();
    const now = nowIso();
    const row = await db.getFirstAsync<{ maxOrder: number | null }>(
      'SELECT MAX(sortOrder) as maxOrder FROM lists WHERE deletedAt IS NULL'
    );
    const list: TaskList = {
      id: createId(),
      name: name.trim(),
      color: LIST_COLORS[((row?.maxOrder ?? 0) + 1) % LIST_COLORS.length],
      sortOrder: (row?.maxOrder ?? 0) + 1,
      createdAt: now,
      updatedAt: now,
    };
    await db.runAsync(
      'INSERT INTO lists (id, name, color, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
      [list.id, list.name, list.color ?? null, list.sortOrder, list.createdAt, list.updatedAt]
    );
    return list;
  },

  async rename(id: string, name: string): Promise<TaskList> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('List name is required.');
    }
    const db = await getDb();
    const now = nowIso();
    await db.runAsync(
      'UPDATE lists SET name = ?, updatedAt = ? WHERE id = ? AND deletedAt IS NULL',
      [trimmed, now, id]
    );
    const list = await listRepository.getById(id);
    if (!list) {
      throw new Error('List not found.');
    }
    return list;
  },

  async updateColor(id: string, color: string): Promise<TaskList> {
    const db = await getDb();
    const now = nowIso();
    await db.runAsync(
      'UPDATE lists SET color = ?, updatedAt = ? WHERE id = ? AND deletedAt IS NULL',
      [color, now, id]
    );
    const list = await listRepository.getById(id);
    if (!list) {
      throw new Error('List not found.');
    }
    return list;
  },

  async delete(id: string): Promise<void> {
    if (id === INBOX_LIST_ID) {
      throw new Error('Cannot delete the Inbox list.');
    }
    const db = await getDb();
    const now = nowIso();
    // Tasks move to the Inbox and the list goes in one step, so none can be
    // left pointing at a list that no longer shows.
    await runInTransaction(async () => {
      await db.runAsync(
        'UPDATE tasks SET listId = ?, updatedAt = ? WHERE listId = ? AND deletedAt IS NULL',
        [INBOX_LIST_ID, now, id]
      );
      await db.runAsync(
        'UPDATE lists SET deletedAt = ?, updatedAt = ? WHERE id = ?',
        [now, now, id]
      );
    });
  },
};
