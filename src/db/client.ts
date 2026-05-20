import * as SQLite from 'expo-sqlite';

import { DB_NAME } from './constants';

let database: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!database) {
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
