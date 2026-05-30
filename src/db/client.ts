import { Platform } from 'react-native';
import type * as SQLite from 'expo-sqlite';

import { DB_NAME } from './constants';

let database: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (Platform.OS === 'web') {
    throw new Error('SQLite storage is not available in the web preview.');
  }

  if (!database) {
    const SQLite = await import('expo-sqlite');
    database = await SQLite.openDatabaseAsync(DB_NAME);
  }
  return database;
}

export async function closeDb(): Promise<void> {
  if (database) {
    await database.closeAsync();
    database = null;
  }
}
