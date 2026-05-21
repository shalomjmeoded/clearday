/**
 * Local-first storage: clearday.db (SQLite) is the source of truth.
 * No account, no backend, no network required for core features.
 * Tables: tasks, lists, reminders, settings.
 */
import { DEFAULT_SETTINGS } from '@/types/settings';
import { nowIso } from '@/utils/dates';

import { INBOX_LIST_ID, SCHEMA_VERSION } from './constants';
import { getDb } from './client';
import { MIGRATION_SQL } from './schema';

async function seedDefaults(): Promise<void> {
  const db = await getDb();
  const now = nowIso();

  const inbox = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM lists WHERE id = ?',
    [INBOX_LIST_ID]
  );
  if (!inbox) {
    const columns = await db.getAllAsync<{ name: string }>(
      'PRAGMA table_info(lists)'
    );
    const hasColor = columns.some((c) => c.name === 'color');
    if (hasColor) {
      await db.runAsync(
        'INSERT INTO lists (id, name, color, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
        [INBOX_LIST_ID, 'Inbox', '#4F6B52', 0, now, now]
      );
    } else {
      await db.runAsync(
        'INSERT INTO lists (id, name, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
        [INBOX_LIST_ID, 'Inbox', 0, now, now]
      );
    }
  }

  const settingsRows: [string, string][] = [
    ['theme', DEFAULT_SETTINGS.theme],
    ['colorTheme', DEFAULT_SETTINGS.colorTheme],
    ['hapticsEnabled', String(DEFAULT_SETTINGS.hapticsEnabled)],
    ['completedTaskBehavior', DEFAULT_SETTINGS.completedTaskBehavior],
    ['defaultReminderTime', DEFAULT_SETTINGS.defaultReminderTime],
    ['swipeLeftAction', DEFAULT_SETTINGS.swipeLeftAction],
    ['swipeRightAction', DEFAULT_SETTINGS.swipeRightAction],
    ['defaultListId', DEFAULT_SETTINGS.defaultListId],
    ['isPro', String(DEFAULT_SETTINGS.isPro)],
    ['schemaVersion', String(SCHEMA_VERSION)],
  ];

  for (const [key, value] of settingsRows) {
    const existing = await db.getFirstAsync<{ key: string }>(
      'SELECT key FROM settings WHERE key = ?',
      [key]
    );
    if (!existing) {
      await db.runAsync('INSERT INTO settings (key, value) VALUES (?, ?)', [
        key,
        value,
      ]);
    }
  }
}

async function migrateToV2(db: Awaited<ReturnType<typeof getDb>>): Promise<void> {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'schemaVersion'"
  );
  const version = parseInt(row?.value ?? '1', 10);

  const columns = await db.getAllAsync<{ name: string }>(
    'PRAGMA table_info(tasks)'
  );
  const hasRecurrence = columns.some((c) => c.name === 'recurrence');
  if (!hasRecurrence) {
    await db.execAsync(
      `ALTER TABLE tasks ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'none'`
    );
  }
  if (version >= 2) return;

  await db.runAsync(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('schemaVersion', ?)",
    [String(SCHEMA_VERSION)]
  );
}

async function migrateToV3(db: Awaited<ReturnType<typeof getDb>>): Promise<void> {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'schemaVersion'"
  );
  const version = parseInt(row?.value ?? '1', 10);

  const columns = await db.getAllAsync<{ name: string }>(
    'PRAGMA table_info(lists)'
  );
  const hasColor = columns.some((c) => c.name === 'color');
  if (!hasColor) {
    await db.execAsync('ALTER TABLE lists ADD COLUMN color TEXT');
  }

  await db.runAsync(
    "UPDATE lists SET color = COALESCE(color, ?) WHERE id = ?",
    ['#4F6B52', INBOX_LIST_ID]
  );
  if (version >= 3) return;

  await db.runAsync(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('schemaVersion', ?)",
    [String(SCHEMA_VERSION)]
  );
}

async function migrateToV4(db: Awaited<ReturnType<typeof getDb>>): Promise<void> {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'schemaVersion'"
  );
  const version = parseInt(row?.value ?? '1', 10);

  const columns = await db.getAllAsync<{ name: string }>(
    'PRAGMA table_info(tasks)'
  );
  const hasColor = columns.some((c) => c.name === 'color');
  if (!hasColor) {
    await db.execAsync('ALTER TABLE tasks ADD COLUMN color TEXT');
  }
  if (version >= 4) return;

  await db.runAsync(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('schemaVersion', ?)",
    [String(SCHEMA_VERSION)]
  );
}

export async function initDatabase(): Promise<void> {
  const db = await getDb();
  await db.execAsync(MIGRATION_SQL);
  await seedDefaults();
  await migrateToV2(db);
  await migrateToV3(db);
  await migrateToV4(db);
}
