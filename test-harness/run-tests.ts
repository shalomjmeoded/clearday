/**
 * End-to-end tests for the backup/export/import system.
 * Runs the real backupService + migrations + reminderService against an
 * in-memory SQLite database, with Expo/RN modules stubbed (see ./stubs).
 *
 * Run from repo root: npm run test:backup
 */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  buildBackup,
  exportBackupToFile,
  getLastBackupAt,
  LAST_BACKUP_AT_KEY,
  summarizeBackup,
  importBackupFromFile,
  runImportWithFeedback,
} from '@/features/backup/backupService';
import { initDatabase } from '@/db/migrations';
import { syncScheduledReminders } from '@/features/reminders/reminderService';
import { getDb, closeDb } from '@/db/client';
import { INBOX_LIST_ID, SCHEMA_VERSION } from '@/db/constants';
import { CLEARDAY_BACKUP_VERSION } from '@/types/backup';

import { __setPickerResult } from './stubs/expo-document-picker';
import { cacheDirectory } from './stubs/expo-file-system-legacy';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  scheduled,
  cancelled,
  __resetNotifications,
  __setPermissionGate,
} = require('./stubs/expo-notifications.cjs') as {
  scheduled: Map<string, { body: string; date: Date }>;
  cancelled: string[];
  __resetNotifications: () => void;
  __setPermissionGate: (gate: Promise<void>) => void;
};
import { sharedUris } from './stubs/expo-sharing';
import {
  alertLog,
  __clearAlerts,
  __setAlertButtonPicker,
} from './stubs/react-native';

const FUTURE = new Date(Date.now() + 24 * 3600_000).toISOString();
const PAST = new Date(Date.now() - 24 * 3600_000).toISOString();
const NOW = new Date().toISOString();

let passed = 0;
let failed = 0;

async function freshDb() {
  await closeDb();
  __resetNotifications();
  __clearAlerts();
  await initDatabase();
  return getDb();
}

async function seedList(id: string, name: string) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO lists (id, name, color, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
    [id, name, '#112233', 1, NOW, NOW]
  );
}

async function seedTask(
  id: string,
  overrides: Partial<Record<string, string | number | null>> = {}
) {
  const db = await getDb();
  const row = {
    title: `Task ${id}`,
    notes: null,
    status: 'active',
    priority: 'normal',
    color: null,
    dueDate: null,
    reminderAt: null,
    recurrence: 'none',
    listId: INBOX_LIST_ID,
    sortOrder: 0,
    completedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
  await db.runAsync(
    `INSERT INTO tasks (id, title, notes, status, priority, color, dueDate, reminderAt, recurrence, listId, sortOrder, completedAt, createdAt, updatedAt, deletedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      row.title,
      row.notes,
      row.status,
      row.priority,
      row.color,
      row.dueDate,
      row.reminderAt,
      row.recurrence,
      row.listId,
      row.sortOrder,
      row.completedAt,
      row.createdAt,
      row.updatedAt,
      row.deletedAt,
    ]
  );
}

/** Imports a backup object by writing it to a file and driving the real picker flow. */
async function importObject(backup: unknown): Promise<boolean> {
  const path = join(cacheDirectory, `import-${Math.random()}.clearday`);
  await writeFile(
    path,
    typeof backup === 'string' ? backup : JSON.stringify(backup),
    'utf8'
  );
  __setPickerResult({ canceled: false, assets: [{ uri: path }] });
  return importBackupFromFile();
}

function validBackup(overrides: Record<string, unknown> = {}) {
  return {
    version: CLEARDAY_BACKUP_VERSION,
    exportedAt: NOW,
    lists: [
      {
        id: INBOX_LIST_ID,
        name: 'Inbox',
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    tasks: [] as unknown[],
    settings: {} as Record<string, unknown>,
    ...overrides,
  };
}

async function snapshot() {
  const db = await getDb();
  return {
    tasks: await db.getAllAsync('SELECT * FROM tasks ORDER BY id'),
    lists: await db.getAllAsync('SELECT * FROM lists ORDER BY id'),
    settings: await db.getAllAsync('SELECT * FROM settings ORDER BY key'),
  };
}

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL  ${name}`);
    console.error(`      ${(error as Error).message}`);
  }
}

async function main() {
  console.log('backup/import/export end-to-end tests\n');

  await test('export → import round-trip preserves all data', async () => {
    await freshDb();
    await seedList('work', 'Work');
    await seedTask('t1', { listId: 'work', priority: 'important', notes: 'n1' });
    await seedTask('t2', {
      status: 'completed',
      completedAt: NOW,
      recurrence: 'weekly',
      dueDate: NOW,
    });
    const db = await getDb();
    await db.runAsync(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('theme', 'dark')"
    );

    const before = await snapshot();
    const backup = await buildBackup();

    // wipe into a different state, then restore
    await db.runAsync('DELETE FROM tasks');
    await db.runAsync("UPDATE settings SET value = 'light' WHERE key = 'theme'");
    assert.equal(await importObject(backup), true);

    const after = await snapshot();
    assert.deepEqual(after.tasks, before.tasks);
    assert.deepEqual(after.lists, before.lists);
    assert.deepEqual(after.settings, before.settings);
  });

  await test('export file is valid JSON, shared, and version-stamped', async () => {
    await freshDb();
    await seedTask('t1');
    sharedUris.length = 0;
    await exportBackupToFile();
    assert.equal(sharedUris.length, 1);
    const raw = await (await import('node:fs/promises')).readFile(
      sharedUris[0],
      'utf8'
    );
    const parsed = JSON.parse(raw);
    assert.equal(parsed.version, CLEARDAY_BACKUP_VERSION);
    assert.equal(parsed.tasks.length, 1);
    assert.ok(sharedUris[0].endsWith('.clearday'));
  });

  await test('export stamps the app version and records the last export date', async () => {
    await freshDb();
    assert.equal(await getLastBackupAt(), null);
    sharedUris.length = 0;
    await exportBackupToFile();
    const raw = await (await import('node:fs/promises')).readFile(sharedUris[0], 'utf8');
    const parsed = JSON.parse(raw);
    assert.equal(parsed.appVersion, '9.9.9-test');
    const last = await getLastBackupAt();
    assert.ok(last && !Number.isNaN(new Date(last).getTime()), 'lastBackupAt recorded');
    assert.ok(!(LAST_BACKUP_AT_KEY in parsed.settings), 'device-local note is not exported');
    // Importing a backup must not erase the device's own export history.
    assert.equal(await importObject(validBackup()), true);
    assert.equal(await getLastBackupAt(), last);
  });

  await test('a backup from a newer app version gets a clear "update the app" message', async () => {
    await freshDb();
    await assert.rejects(
      importObject(validBackup({ version: CLEARDAY_BACKUP_VERSION + 1, appVersion: '12.0' })),
      /newer version of Do!.*12\.0|12\.0.*newer version/s
    );
  });

  await test('summarizeBackup counts live tasks and custom lists only', async () => {
    const summary = summarizeBackup(
      validBackup({
        lists: [
          { id: INBOX_LIST_ID, name: 'Inbox', sortOrder: 0, createdAt: NOW, updatedAt: NOW },
          { id: 'a', name: 'A', sortOrder: 1, createdAt: NOW, updatedAt: NOW },
          { id: 'b', name: 'B', sortOrder: 2, createdAt: NOW, updatedAt: NOW, deletedAt: NOW },
        ],
        tasks: [
          { id: 't1', title: 'x' },
          { id: 't2', title: 'y', deletedAt: NOW },
          null,
        ],
      }) as never
    );
    assert.equal(summary.taskCount, 1);
    assert.equal(summary.listCount, 1);
  });

  await test('soft-deleted tasks and lists are excluded from export', async () => {
    await freshDb();
    await seedTask('live');
    await seedTask('dead', { deletedAt: NOW });
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO lists (id, name, sortOrder, createdAt, updatedAt, deletedAt) VALUES (?, ?, ?, ?, ?, ?)',
      ['gone', 'Gone', 5, NOW, NOW, NOW]
    );
    const backup = await buildBackup();
    assert.deepEqual(
      backup.tasks.map((t) => t.id),
      ['live']
    );
    assert.ok(!backup.lists.some((l) => l.id === 'gone'));
    assert.ok(!('schemaVersion' in backup.settings));
  });

  await test('import rejects invalid JSON and leaves data untouched', async () => {
    await freshDb();
    await seedTask('keep');
    const before = await snapshot();
    await assert.rejects(importObject('{not json'));
    assert.deepEqual(await snapshot(), before);
  });

  await test('import rejects non-object / missing arrays / wrong version', async () => {
    await freshDb();
    await assert.rejects(importObject('null'), /Invalid backup file/);
    await assert.rejects(
      importObject({ version: 1, tasks: 'nope', lists: [] }),
      /missing tasks or lists/
    );
    await assert.rejects(
      importObject(validBackup({ version: 99 })),
      /version 99\b.*newer version of Do!/
    );
  });

  await test('task missing id/title aborts import and rolls back fully', async () => {
    await freshDb();
    await seedTask('keep');
    const before = await snapshot();
    const backup = validBackup({
      tasks: [
        { id: 'ok', title: 'fine', createdAt: NOW, updatedAt: NOW },
        { id: 'bad', title: '' },
      ],
    });
    await assert.rejects(importObject(backup), /#2 is missing its id or title/);
    assert.deepEqual(await snapshot(), before, 'rollback must restore prior state');
  });

  await test('list missing name aborts import', async () => {
    await freshDb();
    await assert.rejects(
      importObject(validBackup({ lists: [{ id: 'x' }] })),
      /list #1 is missing its id or name/
    );
  });

  await test('duplicate task ids are rejected with a clear message', async () => {
    await freshDb();
    const task = { id: 'dup', title: 'A', createdAt: NOW, updatedAt: NOW };
    await assert.rejects(
      importObject(validBackup({ tasks: [task, { ...task, title: 'B' }] })),
      /duplicate task id "dup"/
    );
  });

  await test('duplicate list ids are rejected with a clear message', async () => {
    await freshDb();
    const list = { id: 'dup', name: 'A', createdAt: NOW, updatedAt: NOW };
    await assert.rejects(
      importObject(validBackup({ lists: [list, { ...list, name: 'B' }] })),
      /duplicate list id "dup"/
    );
  });

  await test('invalid enum values are coerced to safe defaults', async () => {
    await freshDb();
    const backup = validBackup({
      tasks: [
        {
          id: 't1',
          title: 'weird',
          status: 'banana',
          priority: 42,
          recurrence: { evil: true },
          sortOrder: 'NaN',
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });
    assert.equal(await importObject(backup), true);
    const db = await getDb();
    const row = await db.getFirstAsync<Record<string, unknown>>(
      "SELECT * FROM tasks WHERE id = 't1'"
    );
    assert.equal(row?.status, 'active');
    assert.equal(row?.priority, 'normal');
    assert.equal(row?.recurrence, 'none');
    assert.equal(row?.sortOrder, 0);
  });

  await test('orphan listId and missing inbox are repaired', async () => {
    await freshDb();
    const backup = validBackup({
      lists: [{ id: 'real', name: 'Real', createdAt: NOW, updatedAt: NOW }],
      tasks: [
        { id: 'a', title: 'orphan', listId: 'ghost', createdAt: NOW, updatedAt: NOW },
        { id: 'b', title: 'fine', listId: 'real', createdAt: NOW, updatedAt: NOW },
        { id: 'c', title: 'nolist', createdAt: NOW, updatedAt: NOW },
      ],
    });
    assert.equal(await importObject(backup), true);
    const db = await getDb();
    const inbox = await db.getFirstAsync(
      'SELECT id FROM lists WHERE id = ?',
      [INBOX_LIST_ID]
    );
    assert.ok(inbox, 'inbox list must be recreated');
    const rows = await db.getAllAsync<{ id: string; listId: string }>(
      'SELECT id, listId FROM tasks ORDER BY id'
    );
    // node:sqlite returns null-prototype rows; normalize before comparing
    assert.deepEqual(JSON.parse(JSON.stringify(rows)), [
      { id: 'a', listId: INBOX_LIST_ID },
      { id: 'b', listId: 'real' },
      { id: 'c', listId: INBOX_LIST_ID },
    ]);
  });

  await test('settings: missing keys default, junk values sanitized, schemaVersion current', async () => {
    await freshDb();
    const backup = validBackup({
      settings: {
        theme: 'dark',
        hapticsEnabled: false,
        defaultListId: 'ghost-list',
        colorTheme: { nested: 'object' },
      },
    });
    assert.equal(await importObject(backup), true);
    const db = await getDb();
    const rows = await db.getAllAsync<{ key: string; value: string }>(
      'SELECT key, value FROM settings'
    );
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    assert.equal(map.theme, 'dark');
    assert.equal(map.hapticsEnabled, 'false');
    assert.equal(map.defaultListId, INBOX_LIST_ID, 'orphan defaultListId → inbox');
    assert.equal(map.colorTheme, 'classic', 'object value → default');
    assert.equal(map.completedTaskBehavior, 'collapse', 'missing key → default');
    assert.equal(map.schemaVersion, String(SCHEMA_VERSION));
  });

  await test('settings: invalid enum / time values in a backup fall back to defaults', async () => {
    await freshDb();
    const backup = validBackup({
      settings: {
        theme: 'purple',
        colorTheme: 'neon',
        completedTaskBehavior: 'explode',
        swipeLeftAction: 'fly',
        swipeRightAction: 'important',
        defaultReminderTime: '25:99',
        hapticsEnabled: 'maybe',
      },
    });
    assert.equal(await importObject(backup), true);
    const db = await getDb();
    const rows = await db.getAllAsync<{ key: string; value: string }>(
      'SELECT key, value FROM settings'
    );
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    assert.equal(map.theme, 'system');
    assert.equal(map.colorTheme, 'classic');
    assert.equal(map.completedTaskBehavior, 'collapse');
    assert.equal(map.swipeLeftAction, 'tomorrow');
    assert.equal(map.swipeRightAction, 'important', 'valid value kept');
    assert.equal(map.defaultReminderTime, '09:00');
    assert.equal(map.hapticsEnabled, 'true');
  });

  await test('hand-edited backup: soft-deleted lists and tasks are dropped, their tasks go to Inbox', async () => {
    await freshDb();
    const backup = validBackup({
      lists: [
        { id: INBOX_LIST_ID, name: 'Inbox', sortOrder: 0, createdAt: NOW, updatedAt: NOW },
        { id: 'gone', name: 'Gone', sortOrder: 1, createdAt: NOW, updatedAt: NOW, deletedAt: NOW },
        { id: 'kept', name: 'Kept', sortOrder: 2, createdAt: NOW, updatedAt: NOW },
      ],
      tasks: [
        { id: 'a', title: 'A', status: 'active', listId: 'gone', createdAt: NOW, updatedAt: NOW },
        { id: 'b', title: 'B', status: 'active', listId: 'kept', createdAt: NOW, updatedAt: NOW },
        { id: 'c', title: 'C', status: 'active', listId: 'kept', createdAt: NOW, updatedAt: NOW, deletedAt: NOW },
      ],
      settings: { defaultListId: 'gone' },
    });
    assert.equal(await importObject(backup), true);
    const db = await getDb();
    const lists = await db.getAllAsync<{ id: string }>('SELECT id FROM lists ORDER BY sortOrder');
    assert.deepEqual(lists.map((l) => l.id), [INBOX_LIST_ID, 'kept']);
    const tasks = await db.getAllAsync<{ id: string; listId: string }>(
      'SELECT id, listId FROM tasks ORDER BY id'
    );
    assert.deepEqual(
      tasks.map((t) => [t.id, t.listId]),
      [
        ['a', INBOX_LIST_ID],
        ['b', 'kept'],
      ]
    );
    const def = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM settings WHERE key = 'defaultListId'"
    );
    assert.equal(def!.value, INBOX_LIST_ID, 'defaultListId cannot point at a dropped list');
  });

  await test('export carries only known user preferences', async () => {
    await freshDb();
    const db = await getDb();
    await db.runAsync("INSERT INTO settings (key, value) VALUES ('isPro', 'true')");
    await db.runAsync("INSERT INTO settings (key, value) VALUES ('someFutureKey', 'x')");
    const backup = await buildBackup();
    assert.deepEqual(
      Object.keys(backup.settings).sort(),
      [
        'colorTheme',
        'completedTaskBehavior',
        'defaultListId',
        'defaultReminderTime',
        'hapticsEnabled',
        'swipeLeftAction',
        'swipeRightAction',
        'theme',
      ]
    );
  });

  await test('import without settings key at all uses full defaults', async () => {
    await freshDb();
    const backup = validBackup();
    delete (backup as Record<string, unknown>).settings;
    assert.equal(await importObject(backup), true);
    const db = await getDb();
    const theme = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM settings WHERE key = 'theme'"
    );
    assert.equal(theme?.value, 'system');
  });

  await test('reminders: future+active scheduled, past/completed skipped', async () => {
    await freshDb();
    const backup = validBackup({
      tasks: [
        { id: 'f', title: 'future', reminderAt: FUTURE, createdAt: NOW, updatedAt: NOW },
        { id: 'p', title: 'past', reminderAt: PAST, createdAt: NOW, updatedAt: NOW },
        {
          id: 'c',
          title: 'done',
          reminderAt: FUTURE,
          status: 'completed',
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });
    assert.equal(await importObject(backup), true);
    const bodies = [...scheduled.values()].map((n) => n.body);
    assert.deepEqual(bodies, ['future']);
    const db = await getDb();
    const rows = await db.getAllAsync<{ taskId: string }>(
      'SELECT taskId FROM reminders'
    );
    assert.deepEqual(
      rows.map((r) => r.taskId),
      ['f']
    );
  });

  await test('stale OS notifications cancelled after successful import', async () => {
    await freshDb();
    await seedTask('old', { reminderAt: FUTURE });
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO reminders (id, taskId, notificationId, scheduledAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
      ['r1', 'old', 'stale-notif-1', FUTURE, NOW, NOW]
    );
    cancelled.length = 0;
    assert.equal(await importObject(validBackup()), true);
    assert.deepEqual(cancelled, ['stale-notif-1']);
  });

  await test('failed import does NOT cancel existing notifications', async () => {
    await freshDb();
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO reminders (id, taskId, notificationId, scheduledAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
      ['r1', 'x', 'precious-notif', FUTURE, NOW, NOW]
    );
    cancelled.length = 0;
    await assert.rejects(importObject(validBackup({ tasks: [{ id: 'bad' }] })));
    assert.deepEqual(cancelled, [], 'rollback must not touch OS notifications');
    const rows = await db.getAllAsync('SELECT * FROM reminders');
    assert.equal(rows.length, 1, 'reminders table must be untouched');
  });

  /**
   * Models the real race: the app comes back from the document picker, the
   * foreground reminder sync starts and reads the tables, then stalls on the
   * native permission call while the import begins its transaction. Returns
   * the sync's promise. The gate opens when the import reaches its first wipe
   * statement (the harmful spot), or after a short fallback for the case
   * where the import is correctly blocked behind the sync.
   */
  async function startSyncParkedOnPermission(options: { failOnTaskId?: string } = {}) {
    const db = await getDb();
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const original = db.runAsync.bind(db);
    db.runAsync = (async (sql: string, ...params: unknown[]) => {
      if (sql === 'DELETE FROM reminders') open();
      // Fault injection: a write error part-way through the restore.
      if (
        options.failOnTaskId &&
        sql.startsWith('INSERT INTO tasks') &&
        (params[0] as unknown[])?.[0] === options.failOnTaskId
      ) {
        // Fail slowly, the way a real I/O error surfaces, so that other work
        // parked on the connection has time to land inside the transaction.
        await new Promise((r) => setTimeout(r, 20));
        throw new Error('simulated disk error');
      }
      return (original as (...a: unknown[]) => Promise<unknown>)(sql, ...params);
    }) as typeof db.runAsync;
    setTimeout(open, 100);
    __setPermissionGate(gate);
    const sync = syncScheduledReminders();
    // Let the sync get as far as the permission call before the import starts.
    await new Promise((r) => setImmediate(r));
    // Wrapped so that awaiting this helper does not adopt (and wait on) `sync`.
    return { sync };
  }

  async function reminderInvariant() {
    const db = await getDb();
    const rows = await db.getAllAsync<{ taskId: string; notificationId: string }>(
      'SELECT taskId, notificationId FROM reminders ORDER BY taskId'
    );
    const tasks = new Set(
      (await db.getAllAsync<{ id: string }>('SELECT id FROM tasks')).map((t) => t.id)
    );
    for (const row of rows) {
      assert.ok(tasks.has(row.taskId), `reminder row for missing task ${row.taskId}`);
    }
    const known = new Set(rows.map((r) => r.notificationId));
    for (const id of scheduled.keys()) {
      assert.ok(known.has(id), `OS notification ${id} has no reminder row (orphan)`);
    }
    return rows;
  }

  await test('race: sync parked on permission while a FAILED import runs leaves reminders consistent', async () => {
    await freshDb();
    const db = await getDb();
    await seedTask('x', { reminderAt: FUTURE }); // needs scheduling
    await seedTask('y', { reminderAt: FUTURE }); // already scheduled
    await db.runAsync(
      'INSERT INTO reminders (id, taskId, notificationId, scheduledAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
      ['r-y', 'y', 'precious-notif', FUTURE, NOW, NOW]
    );
    cancelled.length = 0;
    const { sync } = await startSyncParkedOnPermission({ failOnTaskId: 'poison' });
    await assert.rejects(
      importObject(
        validBackup({
          tasks: [{ id: 'poison', title: 'P', status: 'active', createdAt: NOW, updatedAt: NOW }],
        })
      ),
      /simulated disk error/
    );
    await sync;
    assert.deepEqual(cancelled, [], 'nothing cancelled');
    const rows = await reminderInvariant();
    assert.deepEqual(
      rows.map((r) => r.taskId),
      ['x', 'y'],
      'x scheduled by the sync, y untouched'
    );
  });

  await test('race: sync parked on permission while a SUCCESSFUL import runs yields one reminder per restored task', async () => {
    await freshDb();
    await seedTask('old', { reminderAt: FUTURE }); // sync wants to schedule this
    const { sync } = await startSyncParkedOnPermission();
    const backup = validBackup({
      tasks: [
        { id: 'a', title: 'A', status: 'active', reminderAt: FUTURE, createdAt: NOW, updatedAt: NOW },
        { id: 'b', title: 'B', status: 'active', reminderAt: FUTURE, createdAt: NOW, updatedAt: NOW },
      ],
    });
    assert.equal(await importObject(backup), true);
    await sync;
    const rows = await reminderInvariant();
    assert.deepEqual(rows.map((r) => r.taskId), ['a', 'b'], 'no row for the wiped task');
    assert.equal(scheduled.size, 2, 'exactly one OS notification per restored task');
  });

  await test('picker cancel returns false and changes nothing', async () => {
    await freshDb();
    await seedTask('keep');
    const before = await snapshot();
    __setPickerResult({ canceled: true });
    assert.equal(await importBackupFromFile(), false);
    assert.deepEqual(await snapshot(), before);
  });

  await test('runImportWithFeedback: user cancels confirmation → no import', async () => {
    await freshDb();
    await seedTask('keep');
    const before = await snapshot();
    __setAlertButtonPicker((buttons) =>
      buttons.find((b) => b.style === 'cancel')
    );
    let restored = false;
    await runImportWithFeedback(() => {
      restored = true;
    });
    assert.equal(restored, false);
    assert.deepEqual(await snapshot(), before);
  });

  await test('runImportWithFeedback: confirm → import + onRestored + success alert', async () => {
    await freshDb();
    const path = join(cacheDirectory, 'feedback-test.clearday');
    await writeFile(path, JSON.stringify(validBackup()), 'utf8');
    __setPickerResult({ canceled: false, assets: [{ uri: path }] });
    __setAlertButtonPicker((buttons) =>
      buttons.find((b) => b.text === 'Import')
    );
    __clearAlerts();
    let restored = false;
    await runImportWithFeedback(() => {
      restored = true;
    });
    // confirmImportBackup fires onConfirm as a fire-and-forget void promise
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(restored, true);
    assert.ok(alertLog.some((a) => a.title === 'Import complete'));
  });

  await test('runImportWithFeedback: confirmation names the file contents; success names what was restored', async () => {
    await freshDb();
    const path = join(cacheDirectory, 'preview-test.clearday');
    await writeFile(
      path,
      JSON.stringify(
        validBackup({
          exportedAt: '2026-03-05T10:00:00.000Z',
          lists: [
            { id: INBOX_LIST_ID, name: 'Inbox', sortOrder: 0, createdAt: NOW, updatedAt: NOW },
            { id: 'w', name: 'Work', sortOrder: 1, createdAt: NOW, updatedAt: NOW },
          ],
          tasks: [
            { id: 'a', title: 'A', createdAt: NOW, updatedAt: NOW },
            { id: 'b', title: 'B', createdAt: NOW, updatedAt: NOW },
          ],
        })
      ),
      'utf8'
    );
    __setPickerResult({ canceled: false, assets: [{ uri: path }] });
    __setAlertButtonPicker((buttons) => buttons.find((b) => b.text === 'Import'));
    __clearAlerts();
    await runImportWithFeedback(() => {});
    const confirm = alertLog.find((a) => a.title === 'Replace with this backup?');
    assert.ok(confirm, 'confirmation shown');
    assert.match(confirm!.message!, /2 tasks and 1 list\b/);
    assert.match(confirm!.message!, /2026/);
    const done = alertLog.find((a) => a.title === 'Import complete');
    assert.match(done!.message!, /Restored 2 tasks and 1 list from the backup\./);
  });

  await test('runImportWithFeedback: dismissing the dialog without a choice imports nothing', async () => {
    await freshDb();
    await seedTask('keep');
    const before = await snapshot();
    const path = join(cacheDirectory, 'dismiss-test.clearday');
    await writeFile(path, JSON.stringify(validBackup()), 'utf8');
    __setPickerResult({ canceled: false, assets: [{ uri: path }] });
    __setAlertButtonPicker(() => undefined);
    const busy: boolean[] = [];
    await runImportWithFeedback(() => {}, (b) => busy.push(b));
    assert.deepEqual(await snapshot(), before);
    assert.deepEqual(busy, [true, false]);
  });

  await test('runImportWithFeedback: picker cancel never shows the confirmation', async () => {
    await freshDb();
    __setPickerResult({ canceled: true });
    __clearAlerts();
    await runImportWithFeedback(() => {});
    assert.equal(alertLog.length, 0);
  });

  await test('runImportWithFeedback: bad file → "Import failed" alert, data intact', async () => {
    await freshDb();
    await seedTask('keep');
    const before = await snapshot();
    const path = join(cacheDirectory, 'bad.clearday');
    await writeFile(path, '{broken', 'utf8');
    __setPickerResult({ canceled: false, assets: [{ uri: path }] });
    __setAlertButtonPicker((buttons) =>
      buttons.find((b) => b.text === 'Import')
    );
    __clearAlerts();
    await runImportWithFeedback(() => {});
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(alertLog.some((a) => a.title === 'Import failed'));
    assert.deepEqual(await snapshot(), before);
  });

  await test('runImportWithFeedback: busy callback fires true then false, even on failure', async () => {
    await freshDb();
    const path = join(cacheDirectory, 'busy-test.clearday');
    await writeFile(path, '{broken', 'utf8');
    __setPickerResult({ canceled: false, assets: [{ uri: path }] });
    __setAlertButtonPicker((buttons) =>
      buttons.find((b) => b.text === 'Import')
    );
    const busyStates: boolean[] = [];
    await runImportWithFeedback(() => {}, (busy) => busyStates.push(busy));
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(busyStates, [true, false]);
  });

  await test('regression: 2000-task synthetic round-trip with unicode/edge strings', async () => {
    await freshDb();
    await seedList('big', 'Big — 📋 "list" <with> \'quotes\'');
    const statuses = ['active', 'completed', 'archived'];
    const priorities = ['normal', 'important', 'must_do_today'];
    const recurrences = ['none', 'daily', 'weekly', 'biweekly', 'monthly', 'yearly'];
    for (let i = 0; i < 2000; i++) {
      await seedTask(`t${i}`, {
        title: `Task ${i} — émojis 🚀, newline\nand "quotes" ${'x'.repeat(i % 50)}`,
        notes: i % 3 === 0 ? `note; DROP TABLE tasks; --${i}` : null,
        status: statuses[i % 3],
        priority: priorities[i % 3],
        recurrence: recurrences[i % 6],
        listId: i % 2 === 0 ? 'big' : INBOX_LIST_ID,
        sortOrder: i,
        dueDate: i % 4 === 0 ? FUTURE : null,
        completedAt: i % 3 === 1 ? NOW : null,
      });
    }
    const before = await snapshot();
    const backup = await buildBackup();
    assert.equal(backup.tasks.length, 2000);
    const db = await getDb();
    await db.runAsync('DELETE FROM tasks');
    assert.equal(await importObject(backup), true);
    assert.deepEqual(await snapshot(), before);
  });

  await test('double import is idempotent (no duplicate rows)', async () => {
    await freshDb();
    await seedTask('t1');
    const backup = await buildBackup();
    assert.equal(await importObject(backup), true);
    assert.equal(await importObject(backup), true);
    const db = await getDb();
    const rows = await db.getAllAsync('SELECT id FROM tasks');
    assert.equal(rows.length, 1);
    const inboxes = await db.getAllAsync('SELECT id FROM lists WHERE id = ?', [
      INBOX_LIST_ID,
    ]);
    assert.equal(inboxes.length, 1);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
