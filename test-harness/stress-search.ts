/**
 * Search volume probe (not part of the test suite).
 * Run: node --import tsx --import ./test-harness/loader.mjs --require ./test-harness/register-cjs.cjs test-harness/stress-search.ts
 */
import { getDb, closeDb } from '@/db/client';
import { INBOX_LIST_ID } from '@/db/constants';
import { initDatabase } from '@/db/migrations';
import { searchTasks } from '@/features/tasks/taskQueries';
import { createId } from '@/utils/id';

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  const r = await fn();
  console.log(`${label}: ${(performance.now() - t0).toFixed(1)}ms`);
  return r;
}

async function seed(count: number, notesEvery: number, notesLen: number) {
  const db = await getDb();
  const now = Date.now();
  const notes = 'x'.repeat(notesLen);
  await db.execAsync('BEGIN');
  for (let i = 0; i < count; i++) {
    const status = i % 3 === 0 ? 'active' : i % 3 === 1 ? 'completed' : 'archived';
    const ts = new Date(now - i * 1000).toISOString();
    await db.runAsync(
      `INSERT INTO tasks (id, title, notes, status, priority, recurrence, listId, sortOrder, completedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 'normal', 'none', ?, ?, ?, ?, ?)`,
      [
        createId(),
        `task ${i} ${i % 5000 === 1 ? 'needle' : ''}`,
        i % notesEvery === 0 ? notes : null,
        status,
        INBOX_LIST_ID,
        i,
        status === 'completed' ? ts : null,
        ts,
        ts,
      ]
    );
  }
  await db.execAsync('COMMIT');
}

async function run(count: number, notesEvery: number, notesLen: number) {
  await closeDb();
  await initDatabase();
  await timed(`seed ${count} rows (notes on 1/${notesEvery}, ${notesLen} chars)`, () =>
    seed(count, notesEvery, notesLen)
  );
  const all = ['active', 'completed', 'archived'] as const;
  await timed('  rare term, all statuses', async () => {
    const r = await searchTasks('needle', { statuses: all });
    console.log(`    -> ${r.length} rows`);
  });
  await timed('  common term, all statuses (hits limit)', async () => {
    const r = await searchTasks('task', { statuses: all });
    console.log(`    -> ${r.length} rows`);
  });
  await timed('  two terms, history only', async () => {
    const r = await searchTasks('task 7', { statuses: ['completed'] });
    console.log(`    -> ${r.length} rows`);
  });
  await timed('  accented term (GLOB path), all statuses', async () => {
    const r = await searchTasks('tâsk', { statuses: all });
    console.log(`    -> ${r.length} rows`);
  });
  await timed('  no match, list scoped', async () => {
    const r = await searchTasks('zzzqqq', { statuses: all, listId: INBOX_LIST_ID });
    console.log(`    -> ${r.length} rows`);
  });
}

async function main() {
  await run(5_000, 3, 200);
  await run(20_000, 3, 500);
  await run(50_000, 2, 2_000);
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
