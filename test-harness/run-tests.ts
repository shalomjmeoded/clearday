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
  importBackupFromFile,
  runImportWithFeedback,
} from '@/features/backup/backupService';
import { initDatabase } from '@/db/migrations';
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
} = require('./stubs/expo-notifications.cjs') as {
  scheduled: Map<string, { body: string; date: Date }>;
  cancelled: string[];
  __resetNotifications: () => void;
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
      /version \(99\) is not supported/
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
