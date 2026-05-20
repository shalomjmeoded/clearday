import { INBOX_LIST_ID } from '@/db/constants';
import { getDb } from '@/db/client';
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type CompletedTaskBehavior,
  type ThemeMode,
} from '@/types/settings';

function parseSettings(rows: { key: string; value: string }[]): AppSettings {
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    theme: (map.theme as ThemeMode) ?? DEFAULT_SETTINGS.theme,
    hapticsEnabled:
      map.hapticsEnabled === undefined
        ? DEFAULT_SETTINGS.hapticsEnabled
        : map.hapticsEnabled === 'true',
    completedTaskBehavior:
      (map.completedTaskBehavior as CompletedTaskBehavior) ??
      DEFAULT_SETTINGS.completedTaskBehavior,
    defaultReminderTime:
      map.defaultReminderTime ?? DEFAULT_SETTINGS.defaultReminderTime,
    defaultListId: map.defaultListId ?? DEFAULT_SETTINGS.defaultListId ?? INBOX_LIST_ID,
    isPro:
      map.isPro === undefined
        ? DEFAULT_SETTINGS.isPro
        : map.isPro === 'true',
  };
}

export async function loadSettings(): Promise<AppSettings> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM settings'
  );
  return parseSettings(rows);
}

export async function updateSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K]
): Promise<AppSettings> {
  const db = await getDb();
  const stringValue =
    typeof value === 'boolean' ? String(value) : String(value);
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [key, stringValue]
  );
  return loadSettings();
}
