/** expo-sqlite stub backed by Node's built-in SQLite, matching the async API used by the app. */
import { DatabaseSync } from 'node:sqlite';

class StubSQLiteDatabase {
  constructor() {
    this.db = new DatabaseSync(':memory:');
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

export async function openDatabaseAsync(_name) {
  return new StubSQLiteDatabase();
}
