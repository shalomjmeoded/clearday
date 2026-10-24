import { getDb } from '@/db/client';
import {
  normalizeSettings,
  serializeSetting,
  type AppSettings,
} from '@/types/settings';

export async function loadSettings(): Promise<AppSettings> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM settings'
  );
  // Today shows only the default list, so a stale id here would blank the
  // screen with no explanation; fall back to the Inbox instead.
  const lists = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM lists WHERE deletedAt IS NULL'
  );
  return normalizeSettings(
    Object.fromEntries(rows.map((r) => [r.key, r.value])),
    new Set(lists.map((l) => l.id))
  );
}

export async function updateSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K]
): Promise<AppSettings> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [key, serializeSetting(key, value)]
  );
  return loadSettings();
}
