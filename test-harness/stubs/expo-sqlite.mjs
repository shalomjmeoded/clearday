/** expo-sqlite stub backed by Node's built-in SQLite, matching the async API used by the app. */
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const defaultDatabaseDirectory = mkdtempSync(join(tmpdir(), 'clearday-sqlite-'));

// Tests run in memory by default. File mode backs each database by a real
// file under defaultDatabaseDirectory, for exercising snapshot/restore.
let fileMode = false;
export function __setFileMode(enabled) {
  fileMode = enabled;
}

class StubSQLiteDatabase {
  constructor(name) {
    this.db = new DatabaseSync(fileMode ? join(defaultDatabaseDirectory, name) : ':memory:');
  }

  async execAsync(sql) {
    this.db.exec(sql);
  }

  async runAsync(sql, params = []) {
    this.db.prepare(sql).run(...params);
  }

  async getAllAsync(sql, params = []) {
    return this.db.prepare(sql).all(...params);
  }

  async getFirstAsync(sql, params = []) {
    return this.db.prepare(sql).get(...params) ?? null;
  }

  async closeAsync() {
    this.db.close();
  }
}

export async function openDatabaseAsync(name) {
  return new StubSQLiteDatabase(name);
}

export async function deleteDatabaseAsync(name, directory = defaultDatabaseDirectory) {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    await rm(join(directory, `${name}${suffix}`), { force: true });
  }
}
