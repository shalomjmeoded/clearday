/** Backup/restore stress at ~70k rows. Run with the harness loader like stress.ts. */
import { getDb, closeDb } from '@/db/client';
import { initDatabase } from '@/db/migrations';
import { buildBackup, restoreBackup } from '@/features/backup/backupService';
import { INBOX_LIST_ID } from '@/db/constants';
import { createId } from '@/utils/id';
import { nowIso, todayDueIso } from '@/utils/dates';

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  const r = await fn();
  console.log(`${label}: ${(performance.now() - t0).toFixed(1)}ms`);
  return r;
}

async function main() {
  await initDatabase();
  const db = await getDb();
  const now = nowIso();
  await db.execAsync('BEGIN');
  for (let i = 0; i < 70000; i++) {
    await db.runAsync(
      `INSERT INTO tasks (id, title, notes, status, priority, dueDate, recurrence, listId, sortOrder, completedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 'normal', ?, 'none', ?, ?, ?, ?, ?)`,
      [
        createId(),
        `backup stress task ${i} with a reasonably realistic title length`,
        i % 5 === 0 ? 'some notes\nmultiline '.repeat(5) : null,
        i % 3 === 0 ? 'completed' : 'active',
        i % 2 === 0 ? todayDueIso() : null,
        INBOX_LIST_ID,
        i,
        i % 3 === 0 ? now : null,
        now,
        now,
      ]
    );
  }
  await db.execAsync('COMMIT');

  const backup = await timed('buildBackup (70k tasks)', buildBackup);
  const json = JSON.stringify(backup, null, 2);
  console.log(`backup JSON size: ${(json.length / 1024 / 1024).toFixed(1)} MB`);
  const t0 = performance.now();
  JSON.parse(json);
  console.log(`JSON.parse: ${(performance.now() - t0).toFixed(1)}ms`);
  const summary = await timed('restoreBackup (70k tasks over existing 70k)', () =>
    restoreBackup(backup)
  );
  console.log('restore summary:', JSON.stringify(summary));
  await closeDb();
}

main().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
