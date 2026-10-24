/**
 * Local-first storage: clearday.db (SQLite) is the source of truth.
 * No account, no backend, no network required for core features.
 * Tables: tasks, lists, reminders, settings.
 *
 * Versioning: `settings.schemaVersion` records the last migration applied.
 * Each entry in MIGRATIONS upgrades from `version - 1` to `version`, runs in
 * its own transaction, and stamps its own number, so a crash mid-upgrade
 * resumes from the right place on the next launch. Migrations also check for
 * the columns they add, so re-running one against a database that already
 * has the change is harmless.
 */
import { DEFAULT_SETTINGS } from '@/types/settings';
import { nowIso } from '@/utils/dates';

import { INBOX_LIST_ID, SCHEMA_VERSION } from './constants';
import { getDb } from './client';
import { MIGRATION_SQL } from './schema';

type Db = Awaited<ReturnType<typeof getDb>>;

/** Default colour for the Inbox list, matching the first entry of LIST_COLORS. */
const INBOX_COLOR = '#4F6B52';

async function hasColumn(db: Db, table: string, column: string): Promise<boolean> {
  const columns = await db.getAllAsync<{ name: string }>(
    `PRAGMA table_info(${table})`
  );
  return columns.some((c) => c.name === column);
}

async function readSchemaVersion(db: Db): Promise<number | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'schemaVersion'"
  );
  if (!row) return null;
  const parsed = parseInt(row.value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function writeSchemaVersion(db: Db, version: number): Promise<void> {
  await db.runAsync(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('schemaVersion', ?)",
    [String(version)]
  );
}

interface Migration {
  version: number;
  run: (db: Db) => Promise<void>;
}

const MIGRATIONS: Migration[] = [
  {
    // Repeating tasks.
    version: 2,
    async run(db) {
      if (!(await hasColumn(db, 'tasks', 'recurrence'))) {
        await db.execAsync(
          `ALTER TABLE tasks ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'none'`
        );
      }
    },
  },
  {
    // List colours.
    version: 3,
    async run(db) {
      if (!(await hasColumn(db, 'lists', 'color'))) {
        await db.execAsync('ALTER TABLE lists ADD COLUMN color TEXT');
      }
      await db.runAsync(
        'UPDATE lists SET color = COALESCE(color, ?) WHERE id = ?',
        [INBOX_COLOR, INBOX_LIST_ID]
      );
    },
  },
  {
    // Task colours.
    version: 4,
    async run(db) {
      if (!(await hasColumn(db, 'tasks', 'color'))) {
        await db.execAsync('ALTER TABLE tasks ADD COLUMN color TEXT');
      }
    },
  },
  {
    // Links a logged completion back to the repeating task it came from.
    version: 5,
    async run(db) {
      if (!(await hasColumn(db, 'tasks', 'recurringTaskId'))) {
        await db.execAsync('ALTER TABLE tasks ADD COLUMN recurringTaskId TEXT');
      }
      // Created here rather than in MIGRATION_SQL: on an existing install the
      // column does not exist yet when that script runs.
      await db.execAsync(
        'CREATE INDEX IF NOT EXISTS idx_tasks_recurringTaskId ON tasks(recurringTaskId)'
      );
    },
  },
  {
    // The first release stored a local `isPro` flag in settings. Pro status
    // now comes from RevenueCat (cached under proEntitlementCache), so the
    // stale row is dropped rather than exported in backups forever.
    version: 6,
    async run(db) {
      await db.runAsync("DELETE FROM settings WHERE key = 'isPro'");
    },
  },
  {
    // Reminder rows are looked up by task on every schedule/cancel.
    version: 7,
    async run(db) {
      await db.execAsync(
        'CREATE INDEX IF NOT EXISTS idx_reminders_taskId ON reminders(taskId)'
      );
    },
  },
];

async function runMigration(db: Db, migration: Migration): Promise<void> {
  await db.execAsync('BEGIN IMMEDIATE TRANSACTION');
  try {
    await migration.run(db);
    await writeSchemaVersion(db, migration.version);
    await db.execAsync('COMMIT');
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
}

/**
 * Decides where an unstamped database starts. A database with no user rows
 * was just created by MIGRATION_SQL and already has the current shape; one
 * with data predates version tracking and must take every migration.
 */
async function resolveStartVersion(db: Db): Promise<number> {
  const stamped = await readSchemaVersion(db);
  if (stamped !== null) return stamped;

  const rows = await db.getFirstAsync<{ count: number }>(
    'SELECT (SELECT COUNT(*) FROM tasks) + (SELECT COUNT(*) FROM lists) + (SELECT COUNT(*) FROM settings) AS count'
  );
  const isFresh = (rows?.count ?? 0) === 0;
  if (isFresh) {
    await writeSchemaVersion(db, SCHEMA_VERSION);
    return SCHEMA_VERSION;
  }
  return 1;
}

/** File name of the copy taken right before a schema upgrade. */
export const PRE_MIGRATION_SNAPSHOT = 'clearday.pre-migration.db';

/** Directory holding clearday.db, or null where SQLite is unavailable. */
export async function databaseDirectory(): Promise<string | null> {
  const SQLite = await import('expo-sqlite');
  return (SQLite.defaultDatabaseDirectory as string | null | undefined) ?? null;
}

/**
 * Takes a consistent copy of the database before the first upgrade step runs,
 * so a failed or buggy migration can be recovered from without the user's
 * data being the only copy. VACUUM INTO is the supported way to copy a live
 * SQLite file (a plain file copy can miss uncheckpointed writes). Best
 * effort: a snapshot failure must never block the app from opening.
 */
async function snapshotBeforeMigration(db: Db, fromVersion: number): Promise<void> {
  try {
    const SQLite = await import('expo-sqlite');
    const directory = await databaseDirectory();
    if (!directory) return;
    // VACUUM INTO refuses to overwrite; only the most recent snapshot is kept.
    await SQLite.deleteDatabaseAsync(PRE_MIGRATION_SNAPSHOT, directory).catch(
      () => {}
    );
    const path = `${directory}/${PRE_MIGRATION_SNAPSHOT}`.replace(/^file:\/\//, '');
    await db.execAsync(`VACUUM INTO '${path.replace(/'/g, "''")}'`);
    console.log(`[db] snapshot taken before upgrading from v${fromVersion}`);
  } catch (error) {
    console.warn('[db] pre-migration snapshot failed:', error);
  }
}

async function runPendingMigrations(db: Db): Promise<void> {
  const startVersion = await resolveStartVersion(db);

  if (startVersion > SCHEMA_VERSION) {
    // Database written by a newer build. Leave its stamp alone so that build
    // does not re-run anything when it comes back; the tables are a superset
    // of what this build needs.
    console.warn(
      `[db] schemaVersion ${startVersion} is newer than this build (${SCHEMA_VERSION}).`
    );
    return;
  }

  const pending = MIGRATIONS.filter((m) => m.version > startVersion);
  if (pending.length === 0) return;

  await snapshotBeforeMigration(db, startVersion);
  for (const migration of pending) {
    await runMigration(db, migration);
  }
}

async function seedDefaults(db: Db): Promise<void> {
  const now = nowIso();

  const inbox = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM lists WHERE id = ?',
    [INBOX_LIST_ID]
  );
  if (!inbox) {
    await db.runAsync(
      'INSERT INTO lists (id, name, color, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
      [INBOX_LIST_ID, 'Inbox', INBOX_COLOR, 0, now, now]
    );
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
  ];

  for (const [key, value] of settingsRows) {
    await db.runAsync(
      'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
      [key, value]
    );
  }
}

export async function initDatabase(): Promise<void> {
  const db = await getDb();
  await db.execAsync(MIGRATION_SQL);
  await runPendingMigrations(db);
  await seedDefaults(db);
}

/** Test hook: the ordered migration list, so upgrade paths can be exercised. */
export const __MIGRATIONS = MIGRATIONS;
