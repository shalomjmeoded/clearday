import { Platform } from 'react-native';
import type * as SQLite from 'expo-sqlite';

import { DB_NAME } from './constants';

// The in-flight open is cached, not just the result, so two callers racing
// on the first access share one connection instead of each opening their own.
let opening: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (Platform.OS === 'web') {
    throw new Error('SQLite storage is not available in the web preview.');
  }

  if (!opening) {
    opening = (async () => {
      const SQLite = await import('expo-sqlite');
      return SQLite.openDatabaseAsync(DB_NAME);
    })();
    // A failed open (disk full, locked file) must not poison every later call.
    opening.catch(() => {
      opening = null;
    });
  }
  return opening;
}

export async function closeDb(): Promise<void> {
  const pending = opening;
  opening = null;
  if (pending) {
    const database = await pending.catch(() => null);
    await database?.closeAsync();
  }
}
