/**
 * Stress / performance probe (not part of the test suite).
 * Run: node --import tsx --import ./test-harness/loader.mjs --require ./test-harness/register-cjs.cjs test-harness/stress.ts
 */
import { getDb, closeDb } from '@/db/client';
import { initDatabase } from '@/db/migrations';
import { taskRepository } from '@/features/tasks/taskRepository';
import {
  fetchDoneTasks,
  fetchLaterTasks,
  fetchTodayTasks,
  fetchTomorrowTasks,
  fetchTodayCompletedTasks,
} from '@/features/tasks/taskQueries';
import { useTaskStore } from '@/store/taskStore';
import { useToastStore } from '@/store/toastStore';
import { listRepository } from '@/features/lists/listRepository';
import { INBOX_LIST_ID } from '@/db/constants';
import { createId } from '@/utils/id';
import { nowIso, todayDueIso } from '@/utils/dates';

const results: string[] = [];
function log(s: string) {
  results.push(s);
  console.log(s);
}
async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  const r = await fn();
  const ms = performance.now() - t0;
  log(`${label}: ${ms.toFixed(1)}ms`);
  return r;
}

async function seedRaw(opts: {
  count: number;
  status?: string;
  dueDate?: string | null;
  completedAt?: string | null;
  listId?: string;
  titlePrefix?: string;
  createdAt?: string;
}): Promise<string[]> {
  const db = await getDb();
  const ids: string[] = [];
  const now = nowIso();
  await db.execAsync('BEGIN');
  for (let i = 0; i < opts.count; i++) {
    const id = createId();
    ids.push(id);
    await db.runAsync(
      `INSERT INTO tasks (id, title, status, priority, dueDate, recurrence, listId, sortOrder, completedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, 'normal', ?, 'none', ?, ?, ?, ?, ?)`,
      [
        id,
        `${opts.titlePrefix ?? 'task'} ${i}`,
        opts.status ?? 'active',
        opts.dueDate === undefined ? todayDueIso() : opts.dueDate,
        opts.listId ?? INBOX_LIST_ID,
        i,
        opts.completedAt ?? null,
        opts.createdAt ?? now,
        now,
      ]
    );
  }
  await db.execAsync('COMMIT');
  return ids;
}

async function taskCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) c FROM tasks');
  return row!.c;
}

async function main() {
  await initDatabase();
  const store = useTaskStore.getState;

  log('=== A. Bulk insert via repository.create (per-insert path incl. nextSortOrder) ===');
  await timed('create 1,000 tasks sequentially (repository.create)', async () => {
    for (let i = 0; i < 1000; i++) {
      await taskRepository.create({ title: `seq ${i}` });
    }
  });
  await timed('create 100 tasks via store.addTask (each triggers refreshAfterMutation)', async () => {
    for (let i = 0; i < 100; i++) {
      await store().addTask(`store task ${i}`);
    }
  });

  log('\n=== B. Query performance at scale ===');
  await seedRaw({ count: 9000, titlePrefix: 'bulk-today' }); // total ~10k active due today
  await seedRaw({ count: 5000, dueDate: null, titlePrefix: 'undated-old', createdAt: '2025-01-01T12:00:00.000Z' });
  const tmrw = new Date(Date.now() + 864e5);
  await seedRaw({ count: 3000, dueDate: todayDueIso(tmrw), titlePrefix: 'tmrw' });
  const later = new Date(Date.now() + 30 * 864e5);
  await seedRaw({ count: 3000, dueDate: todayDueIso(later), titlePrefix: 'later' });
  await seedRaw({
    count: 50000,
    status: 'completed',
    completedAt: '2025-06-01T10:00:00.000Z',
    dueDate: null,
    titlePrefix: 'hist',
  });
  // some completed today
  await seedRaw({
    count: 500,
    status: 'completed',
    completedAt: nowIso(),
    dueDate: null,
    titlePrefix: 'done-today',
  });
  log(`seeded; total rows: ${await taskCount()}`);

  const today = await timed('fetchTodayTasks (scan all active, JS filter+sort)', fetchTodayTasks);
  log(`  -> today rows: ${today.length}`);
  const done = await timed('fetchDoneTasks (full completed history, no LIMIT)', fetchDoneTasks);
  log(`  -> done rows: ${done.length}`);
  await timed('fetchTodayCompletedTasks (scans all 50.5k completed)', fetchTodayCompletedTasks);
  await timed('fetchTomorrowTasks', fetchTomorrowTasks);
  await timed('fetchLaterTasks', fetchLaterTasks);
  await timed('countActiveByList', () => taskRepository.countActiveByList());
  await timed('getByListId(inbox)', () => taskRepository.getByListId(INBOX_LIST_ID));
  await timed('store.refreshAll (today+tomorrow+later+done in parallel)', () => store().refreshAll());

  log('\n=== C. Single mutations at scale (each fans out to 4-6 refetches) ===');
  const someId = today[Math.floor(today.length / 2)].id;
  await timed('store.completeTask(one task) incl. refreshes', () => store().completeTask(someId));
  await timed('store.addTask(one task) incl. refreshes', async () => {
    await store().addTask('one more at scale');
  });
  await timed('store.setImportant(one task) incl. refreshes', () => store().setImportant(today[0].id));
  await timed('store.uncompleteTask incl. refreshes', () => store().uncompleteTask(someId));

  log('\n=== D. Reorder large list ===');
  const inboxTasks = await taskRepository.getByListId(INBOX_LIST_ID);
  log(`  inbox active tasks: ${inboxTasks.length}`);
  const ids = inboxTasks.map((t) => t.id).reverse();
  await timed(`reorderTasks(${ids.length} ids, one UPDATE each in txn)`, () =>
    taskRepository.reorderTasks(ids)
  );

  log('\n=== E. Rapid-succession / concurrency ===');
  // E1: double-complete same task through the store (guard) and the repo (no guard)
  const victim = await taskRepository.create({ title: 'double-complete-store' });
  await Promise.all([store().completeTask(victim.id), store().completeTask(victim.id)]);
  const vRow = await (await getDb()).getAllAsync(
    `SELECT id,status FROM tasks WHERE title='double-complete-store'`
  );
  log(`store double-complete rows for same task: ${vRow.length} (expect 1)`);

  const recur = await taskRepository.create({ title: 'recur-race', recurrence: 'daily' });
  await Promise.all([taskRepository.complete(recur.id), taskRepository.complete(recur.id)]);
  const occ = await taskRepository.getOccurrences(recur.id);
  log(`repo-level concurrent complete of recurring task logged ${occ.length} occurrence(s) (1 = safe, 2 = double-log)`);

  // E2: concurrent creates -> sortOrder collisions
  const listA = await listRepository.create('RaceList');
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      taskRepository.create({ title: `race ${i}`, listId: listA.id })
    )
  );
  const raceRows = await (await getDb()).getAllAsync<{ sortOrder: number }>(
    `SELECT sortOrder FROM tasks WHERE listId = ? ORDER BY sortOrder`,
    [listA.id]
  );
  const uniq = new Set(raceRows.map((r) => r.sortOrder));
  log(`20 concurrent creates in one list -> ${uniq.size} distinct sortOrders (collisions: ${20 - uniq.size})`);

  // E3: 100 concurrent store completions of distinct tasks
  const batch = await seedRaw({ count: 25, titlePrefix: 'conc-complete' });
  await timed('25 concurrent store.completeTask (distinct tasks)', () =>
    Promise.all(batch.map((id) => store().completeTask(id))).then(() => {})
  );
  const leftover = await (await getDb()).getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) c FROM tasks WHERE title LIKE 'conc-complete%' AND status='active'`
  );
  log(`  leftover active after concurrent completes: ${leftover!.c} (expect 0)`);

  // E4: delete-with-undo storm — each new toast replaces the last; do expired onExpire fire?
  const delBatch = await seedRaw({ count: 10, titlePrefix: 'del-undo' });
  for (const id of delBatch) {
    await store().deleteTaskWithUndo(id);
  }
  // simulate the single surviving toast expiring
  const toast = useToastStore.getState().toast;
  if (toast?.onExpire) await toast.onExpire();
  const delRows = await (await getDb()).getAllAsync<{ id: string; deletedAt: string | null }>(
    `SELECT id, deletedAt FROM tasks WHERE title LIKE 'del-undo%'`
  );
  const softOnly = delRows.filter((r) => r.deletedAt !== null).length;
  log(`10 rapid deleteTaskWithUndo: ${delRows.length} rows remain, ${softOnly} stuck soft-deleted (purged only at next launch)`);

  // E5: complete racing delete
  const cd = await taskRepository.create({ title: 'complete-vs-delete' });
  await Promise.all([store().completeTask(cd.id), store().deleteTask(cd.id)]);
  const cdRow = await (await getDb()).getAllAsync(
    `SELECT id,status,deletedAt FROM tasks WHERE title='complete-vs-delete'`
  );
  log(`complete vs permanent delete race -> rows left: ${JSON.stringify(cdRow)}`);

  log('\n=== F. Recurring task with long occurrence history ===');
  const habit = await taskRepository.create({ title: 'habit', recurrence: 'daily' });
  await timed('complete recurring task 365 times (repo)', async () => {
    for (let i = 0; i < 365; i++) await taskRepository.complete(habit.id);
  });
  await timed('getOccurrences(365)', () => taskRepository.getOccurrences(habit.id));
  const habitTask = await taskRepository.getById(habit.id);
  log(`  habit dueDate after 365 completes: ${habitTask?.dueDate} (expect ~365 days out)`);
  await timed('fetchDoneTasks with 50.8k history', fetchDoneTasks);

  log('\n=== G. Edge cases ===');
  const empty = await store().addTask('    ');
  log(`addTask(whitespace) -> ${empty === null ? 'null (rejected)' : 'CREATED (bug)'}`);
  const huge = await taskRepository.create({ title: 'x'.repeat(100_000) });
  log(`100k-char title created ok, len=${huge.title.length}`);
  await timed('fetchToday after 100k-char title present', fetchTodayTasks);
  const emoji = await store().addTask('🔥🔥 schedule 📅 !! tomorrow at 25:99');
  log(`emoji/garbage-time addTask -> ${emoji ? `title="${emoji.title}" due=${emoji.dueDate} prio=${emoji.priority}` : 'null'}`);
  const far = await taskRepository.create({ title: 'far future', dueDate: '9999-12-31T12:00:00.000Z' });
  log(`far-future dueDate stored: ${far.dueDate}`);
  const past = await taskRepository.create({ title: 'ancient', dueDate: '1970-01-01T12:00:00.000Z' });
  const todayNow = await fetchTodayTasks();
  log(`ancient overdue task appears in Today: ${todayNow.some((t) => t.id === past.id)}`);

  log('\n=== H. clearCompleted with ~51k completed rows ===');
  await timed('clearCompleted (per-row DELETE loop in one txn)', () =>
    taskRepository.clearCompleted()
  );
  log(`rows after clear: ${await taskCount()}`);

  log('\n=== I. purgeSoftDeleted with 5k soft-deleted rows ===');
  const soft = await seedRaw({ count: 5000, titlePrefix: 'soft' });
  const db = await getDb();
  await db.execAsync(`UPDATE tasks SET deletedAt = '${nowIso()}' WHERE title LIKE 'soft%'`);
  await timed('purgeSoftDeleted(5000)', () => taskRepository.purgeSoftDeleted());

  await closeDb();
  log('\nDONE');
}

main().catch((e) => {
  console.error('STRESS FAILURE:', e);
  process.exit(1);
});
