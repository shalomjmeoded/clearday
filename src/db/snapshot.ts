import * as FileSystem from 'expo-file-system/legacy';

import { closeDb, getDb } from './client';
import { DB_NAME } from './constants';
import { runExclusive } from './exclusive';
import { databaseDirectory, initDatabase, PRE_MIGRATION_SNAPSHOT } from './migrations';

export interface SnapshotInfo {
  /** When the copy was written, i.e. just before the last schema upgrade. */
  takenAt: Date | null;
}

function toUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

/** The pre-update copy, if one exists on this device. */
export async function getSnapshotInfo(): Promise<SnapshotInfo | null> {
  try {
    const directory = await databaseDirectory();
    if (!directory) return null;
    const info = await FileSystem.getInfoAsync(
      toUri(`${directory}/${PRE_MIGRATION_SNAPSHOT}`)
    );
    if (!info.exists) return null;
    const takenAt =
      'modificationTime' in info && typeof info.modificationTime === 'number'
        ? new Date(info.modificationTime * 1000)
        : null;
    return { takenAt };
  } catch {
    return null;
  }
}

/**
 * Replaces the live database with the pre-update copy, then brings it up to
 * the current schema. Everything written since that copy is lost, so the
 * caller must confirm with the user first. Runs under the exclusive lock so
 * no reminder sync or notification action can touch the file mid-swap.
 */
export async function restoreSnapshot(): Promise<void> {
  const {
    cancelScheduledNotifications,
    syncScheduledReminders,
  } = await import('@/features/reminders/reminderService');

  const staleNotificationIds = await runExclusive(async () => {
    const SQLite = await import('expo-sqlite');
    const directory = await databaseDirectory();
    if (!directory) throw new Error('Storage is not available here.');
    const from = toUri(`${directory}/${PRE_MIGRATION_SNAPSHOT}`);
    const info = await FileSystem.getInfoAsync(from);
    if (!info.exists) throw new Error('No earlier copy was found on this device.');

    // Notifications scheduled by the database being replaced would otherwise
    // keep ringing for tasks the copy does not know about.
    let pending: string[] = [];
    try {
      const current = await getDb();
      const rows = await current.getAllAsync<{ notificationId: string | null }>(
        'SELECT notificationId FROM reminders'
      );
      pending = rows
        .map((row) => row.notificationId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
    } catch {
      // A damaged file may not be readable; nothing to cancel then.
    }

    await closeDb();
    // Removes the main file and its -wal/-shm sidecars, so the copy is not
    // mixed with the old journal.
    await SQLite.deleteDatabaseAsync(DB_NAME, directory);
    await FileSystem.copyAsync({ from, to: toUri(`${directory}/${DB_NAME}`) });
    await initDatabase();

    // The copy's reminder rows name notifications that fired or were
    // cancelled long ago. Dropping them makes the sync pass rebuild the OS
    // schedule from the tasks themselves instead of trusting stale ids.
    const restored = await getDb();
    await restored.runAsync('DELETE FROM reminders');
    return pending;
  });

  await cancelScheduledNotifications(staleNotificationIds);
  await syncScheduledReminders();
}

/**
 * SQLite's quick_check: linear in the file size and cheap at this scale.
 * Returns false when the file is damaged, in which case the pre-update copy
 * is the best recovery the device has.
 */
export async function checkIntegrity(): Promise<boolean> {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<{ quick_check: string }>('PRAGMA quick_check');
    return rows.length === 1 && rows[0]?.quick_check === 'ok';
  } catch {
    return false;
  }
}
