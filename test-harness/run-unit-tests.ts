/**
 * Unit + repository tests for recurrence and reminders.
 * Pure utils run against an injected clock; repository tests run the real
 * taskRepository + reminderService against in-memory SQLite with Expo stubbed.
 *
 * Run from repo root: npm run test:unit
 */
import assert from 'node:assert/strict';

import { getDb, closeDb } from '@/db/client';
import { initDatabase } from '@/db/migrations';
import {
  __resetHandledResponses,
  claimResponse,
  initReminders,
  readResponse,
  REMINDER_ACTION_COMPLETE,
  REMINDER_ACTION_SNOOZE,
  REMINDER_CATEGORY,
  snoozeReminder,
  SNOOZE_MINUTES,
  syncScheduledReminders,
} from '@/features/reminders/reminderService';
import { taskRepository } from '@/features/tasks/taskRepository';
import { useProStore } from '@/store/proStore';
import { useTaskStore } from '@/store/taskStore';
import { useToastStore } from '@/store/toastStore';
import { parseTaskInput } from '@/utils/parseTaskInput';
import { getNextDueDate, shiftReminderToDueDate } from '@/utils/recurrence';
import {
  buildReminderIso,
  isReminderOnDifferentDay,
  isReminderPast,
} from '@/utils/reminderTime';
import {
  computeCompletionStats,
  formatCompletionStats,
} from '@/utils/streaks';
import { importBackupFromFile, buildBackup } from '@/features/backup/backupService';
import { __setPickerResult } from './stubs/expo-document-picker';
import { cacheDirectory } from './stubs/expo-file-system-legacy';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { scheduled, cancelled, categories, __resetNotifications } =
  require('./stubs/expo-notifications.cjs') as {
    scheduled: Map<
      string,
      { body: string; date: Date; categoryIdentifier?: string }
    >;
    cancelled: string[];
    categories: Map<string, { identifier: string; buttonTitle: string }[]>;
    __resetNotifications: () => void;
  };

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
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

function local(y: number, m: number, d: number, h = 0, min = 0): Date {
  return new Date(y, m - 1, d, h, min, 0, 0);
}
function dayOf(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}
function timeOf(iso: string): string {
  const date = new Date(iso);
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}

async function freshDb() {
  await closeDb();
  __resetNotifications();
  await initDatabase();
  return getDb();
}

async function main() {
  console.log('recurrence + reminder tests\n');

  // ---- getNextDueDate -------------------------------------------------------
  await test('daily: anchor today → tomorrow', () => {
    const now = local(2026, 10, 23, 15);
    const next = getNextDueDate(local(2026, 10, 23).toISOString(), 'daily', now);
    assert.equal(dayOf(next), '2026-10-24');
  });

  await test('weekly overdue by three weeks catches up to next future week', () => {
    const now = local(2026, 10, 23);
    const anchor = local(2026, 10, 1); // Thursday, 22 days ago
    const next = getNextDueDate(anchor.toISOString(), 'weekly', now);
    assert.equal(dayOf(next), '2026-10-29'); // next Thursday after today
  });

  await test('biweekly steps two weeks from anchor', () => {
    const now = local(2026, 10, 23);
    const next = getNextDueDate(local(2026, 10, 23).toISOString(), 'biweekly', now);
    assert.equal(dayOf(next), '2026-11-6');
  });

  await test('completing early (anchor in future) steps from the anchor', () => {
    const now = local(2026, 10, 23);
    const next = getNextDueDate(local(2026, 10, 24).toISOString(), 'daily', now);
    assert.equal(dayOf(next), '2026-10-25');
  });

  await test('monthly from Jan 31 clamps to Feb 28 then returns to the 31st', () => {
    const anchor = local(2026, 1, 31).toISOString();
    const feb = getNextDueDate(anchor, 'monthly', local(2026, 1, 31));
    assert.equal(dayOf(feb), '2026-2-28');
    const mar = getNextDueDate(anchor, 'monthly', local(2026, 2, 28));
    assert.equal(dayOf(mar), '2026-3-31');
    const apr = getNextDueDate(anchor, 'monthly', local(2026, 3, 31));
    assert.equal(dayOf(apr), '2026-4-30');
  });

  await test('yearly from Feb 29 clamps to Feb 28 then returns to Feb 29', () => {
    const anchor = local(2028, 2, 29).toISOString();
    const y1 = getNextDueDate(anchor, 'yearly', local(2028, 2, 29));
    assert.equal(dayOf(y1), '2029-2-28');
    const leap = getNextDueDate(anchor, 'yearly', local(2031, 2, 28));
    assert.equal(dayOf(leap), '2032-2-29');
  });

  await test('daily across a DST change keeps local midnight', () => {
    // US spring-forward 2026-03-08; stepping must land on local midnight.
    const next = getNextDueDate(local(2026, 3, 7).toISOString(), 'daily', local(2026, 3, 7));
    const date = new Date(next);
    assert.equal(dayOf(next), '2026-3-8');
    assert.equal(date.getHours(), 0);
  });

  await test('none returns anchor unchanged', () => {
    const anchor = local(2026, 1, 1).toISOString();
    assert.equal(getNextDueDate(anchor, 'none'), anchor);
  });

  // ---- reminder helpers -----------------------------------------------------
  await test('shiftReminderToDueDate keeps clock time on new day', () => {
    const shifted = shiftReminderToDueDate(
      local(2026, 10, 23, 9, 30).toISOString(),
      local(2026, 11, 2).toISOString()
    );
    assert.equal(dayOf(shifted), '2026-11-2');
    assert.equal(timeOf(shifted), '9:30');
  });

  await test('buildReminderIso: no due date + passed time rolls to tomorrow', () => {
    const now = local(2026, 10, 23, 10);
    const iso = buildReminderIso(8, 0, undefined, now);
    assert.equal(dayOf(iso), '2026-10-24');
  });

  await test('buildReminderIso: explicit due date stays even if passed', () => {
    const now = local(2026, 10, 23, 10);
    const iso = buildReminderIso(8, 0, local(2026, 10, 23).toISOString(), now);
    assert.equal(dayOf(iso), '2026-10-23');
    assert.equal(isReminderPast(iso, now), true);
  });

  await test('isReminderOnDifferentDay', () => {
    const due = local(2026, 10, 23).toISOString();
    assert.equal(isReminderOnDifferentDay(local(2026, 10, 23, 9).toISOString(), due), false);
    assert.equal(isReminderOnDifferentDay(local(2026, 10, 24, 9).toISOString(), due), true);
    assert.equal(isReminderOnDifferentDay(undefined, due), false);
  });

  // ---- parseTaskInput -------------------------------------------------------
  await test('parser: recurrence words consumed when allowed', () => {
    const parsed = parseTaskInput('Water plants weekly', { allowRecurrence: true });
    assert.equal(parsed.title, 'Water plants');
    assert.equal(parsed.recurrence, 'weekly');
  });

  await test('parser: free users keep "Daily standup" intact', () => {
    const parsed = parseTaskInput('Daily standup', { allowRecurrence: false });
    assert.equal(parsed.title, 'Daily standup');
    assert.equal(parsed.recurrence, undefined);
  });

  await test('parser: biweekly / fortnightly / annually keywords', () => {
    assert.equal(parseTaskInput('Pay rent biweekly').recurrence, 'biweekly');
    assert.equal(parseTaskInput('Review fortnightly').recurrence, 'biweekly');
    assert.equal(parseTaskInput('Renew annually').recurrence, 'yearly');
  });

  await test('parser: bare passed time means tomorrow', () => {
    const now = local(2026, 10, 23, 10);
    const parsed = parseTaskInput('Call Bob 8am', { now });
    assert.equal(dayOf(parsed.reminderAt!), '2026-10-24');
    assert.equal(dayOf(parsed.dueDate!), '2026-10-24');
    assert.equal(parsed.title, 'Call Bob');
  });

  await test('parser: bare future time stays today', () => {
    const now = local(2026, 10, 23, 10);
    const parsed = parseTaskInput('Call Bob 4pm', { now });
    assert.equal(dayOf(parsed.reminderAt!), '2026-10-23');
    assert.equal(timeOf(parsed.reminderAt!), '16:00');
  });

  await test('parser: explicit "today 8am" is respected even when passed', () => {
    const now = local(2026, 10, 23, 10);
    const parsed = parseTaskInput('Gym today 8am', { now });
    assert.equal(dayOf(parsed.reminderAt!), '2026-10-23');
    assert.equal(isReminderPast(parsed.reminderAt, now), true);
  });

  await test('parser: "tomorrow 10am" lands reminder on tomorrow', () => {
    const now = local(2026, 10, 23, 10);
    const parsed = parseTaskInput('Call Daniel tomorrow 10am', { now });
    assert.equal(dayOf(parsed.dueDate!), '2026-10-24');
    assert.equal(dayOf(parsed.reminderAt!), '2026-10-24');
    assert.equal(timeOf(parsed.reminderAt!), '10:00');
  });

  await test('parser: leading keyword on a short phrase stays in the title', () => {
    const daily = parseTaskInput('Daily standup');
    assert.equal(daily.title, 'Daily standup');
    assert.equal(daily.recurrence, undefined);
    const monthly = parseTaskInput('Monthly report');
    assert.equal(monthly.title, 'Monthly report');
    assert.equal(monthly.recurrence, undefined);
  });

  await test('parser: leading keyword is consumed when the title survives', () => {
    const parsed = parseTaskInput('weekly review budget with Sam');
    assert.equal(parsed.recurrence, 'weekly');
    assert.equal(parsed.title, 'review budget with Sam');
  });

  await test('parser: trailing keyword is always consumed', () => {
    const parsed = parseTaskInput('Standup daily');
    assert.equal(parsed.recurrence, 'daily');
    assert.equal(parsed.title, 'Standup');
  });

  await test('parser: repeated keyword only consumes the trailing one', () => {
    const parsed = parseTaskInput('daily daily');
    assert.equal(parsed.recurrence, 'daily');
    assert.equal(parsed.title, 'daily');
  });

  // ---- repository -----------------------------------------------------------
  const FUTURE_DAY = (days: number, h = 9) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(h, 0, 0, 0);
    return d;
  };
  const startOfLocalDay = (d: Date) => {
    const c = new Date(d);
    c.setHours(0, 0, 0, 0);
    return c.toISOString();
  };

  await test('repo: moving the due date shifts the reminder and reschedules', async () => {
    await freshDb();
    const reminder = FUTURE_DAY(1, 9);
    const task = await taskRepository.create({
      title: 'Dentist',
      dueDate: startOfLocalDay(reminder),
      reminderAt: reminder.toISOString(),
    });
    assert.equal(scheduled.size, 1);
    const newDue = startOfLocalDay(FUTURE_DAY(3));
    const moved = await taskRepository.scheduleForDate(task.id, newDue);
    assert.equal(dayOf(moved!.reminderAt!), dayOf(newDue));
    assert.equal(timeOf(moved!.reminderAt!), '9:00');
    assert.equal(scheduled.size, 1, 'old notification replaced, not duplicated');
    assert.equal(cancelled.length, 1);
  });

  await test('repo: explicit reminderAt in update wins over the shift', async () => {
    await freshDb();
    const reminder = FUTURE_DAY(1, 9);
    const task = await taskRepository.create({
      title: 'Explicit',
      dueDate: startOfLocalDay(reminder),
      reminderAt: reminder.toISOString(),
    });
    const explicit = FUTURE_DAY(5, 14).toISOString();
    const updated = await taskRepository.update(task.id, {
      dueDate: startOfLocalDay(FUTURE_DAY(3)),
      reminderAt: explicit,
    });
    assert.equal(updated!.reminderAt, explicit);
  });

  await test('repo: clearing the due date leaves the reminder alone', async () => {
    await freshDb();
    const reminder = FUTURE_DAY(1, 9);
    const task = await taskRepository.create({
      title: 'Undated',
      dueDate: startOfLocalDay(reminder),
      reminderAt: reminder.toISOString(),
    });
    const updated = await taskRepository.update(task.id, { dueDate: undefined });
    assert.equal(updated!.dueDate, undefined);
    assert.equal(updated!.reminderAt, reminder.toISOString());
  });

  await test('repo: completing a recurring task advances due + reminder, stays active', async () => {
    await freshDb();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const reminder = new Date(today);
    reminder.setHours(23, 59, 0, 0);
    const task = await taskRepository.create({
      title: 'Stretch',
      recurrence: 'daily',
      dueDate: today.toISOString(),
      reminderAt: reminder.toISOString(),
      priority: 'must_do_today',
    });
    const { task: done, occurrenceId } = await taskRepository.complete(task.id);
    assert.equal(done!.status, 'active');
    assert.equal(done!.priority, 'normal');
    assert.equal(dayOf(done!.dueDate!), dayOf(FUTURE_DAY(1).toISOString()));
    assert.equal(dayOf(done!.reminderAt!), dayOf(done!.dueDate!));
    assert.equal(timeOf(done!.reminderAt!), '23:59');

    // The finished occurrence is logged as its own completed row.
    assert.ok(occurrenceId, 'occurrence recorded');
    const completed = await taskRepository.getCompleted();
    assert.equal(completed.length, 1, 'repeat leaves a completion record');
    assert.equal(completed[0].id, occurrenceId);
    assert.equal(completed[0].title, 'Stretch');
    assert.equal(completed[0].recurrence, 'none', 'the record does not repeat');
    assert.equal(
      dayOf(completed[0].dueDate!),
      dayOf(task.dueDate!),
      'record keeps the occurrence date'
    );
  });

  await test('repo: completing a plain task keeps the reminder, cancels the alert', async () => {
    await freshDb();
    const reminderAt = FUTURE_DAY(1).toISOString();
    const task = await taskRepository.create({ title: 'Once', reminderAt });
    assert.equal(scheduled.size, 1);
    const { task: done } = await taskRepository.complete(task.id);
    assert.equal(done!.status, 'completed');
    assert.equal(done!.reminderAt, reminderAt, 'reminder survives completion');
    assert.equal(scheduled.size, 0, 'nothing pending while completed');
  });

  await test('repo: reopening restores a future reminder and reschedules it', async () => {
    await freshDb();
    const reminderAt = FUTURE_DAY(1).toISOString();
    const task = await taskRepository.create({ title: 'Reopen', reminderAt });
    await taskRepository.complete(task.id);
    assert.equal(scheduled.size, 0);
    const reopened = await taskRepository.uncomplete(task.id);
    assert.equal(reopened!.status, 'active');
    assert.equal(reopened!.reminderAt, reminderAt);
    assert.equal(scheduled.size, 1, 'future reminder rings again');
  });

  await test('repo: reopening keeps a past reminder as data but never reschedules', async () => {
    await freshDb();
    const reminderAt = new Date(Date.now() - 3600_000).toISOString();
    const task = await taskRepository.create({ title: 'Stale', reminderAt });
    await taskRepository.complete(task.id);
    const reopened = await taskRepository.uncomplete(task.id);
    assert.equal(reopened!.status, 'active');
    assert.equal(reopened!.reminderAt, reminderAt);
    assert.equal(scheduled.size, 0, 'a passed time must not fire on reopen');
  });

  await test('repo: archive cancels exactly once', async () => {
    await freshDb();
    const task = await taskRepository.create({
      title: 'Archive me',
      reminderAt: FUTURE_DAY(1).toISOString(),
    });
    cancelled.length = 0;
    await taskRepository.archive(task.id);
    assert.equal(cancelled.length, 1);
    assert.equal(scheduled.size, 0);
  });

  await test('repo: past reminder is stored but never scheduled', async () => {
    await freshDb();
    const task = await taskRepository.create({
      title: 'Late',
      reminderAt: new Date(Date.now() - 3600_000).toISOString(),
    });
    assert.ok(task.reminderAt);
    assert.equal(scheduled.size, 0);
  });

  // ---- sync pass --------------------------------------------------------------
  await test('sync: schedules active future reminders missing a notification', async () => {
    const db = await freshDb();
    const future = FUTURE_DAY(2).toISOString();
    const past = new Date(Date.now() - 3600_000).toISOString();
    const now = new Date().toISOString();
    const insert = (id: string, status: string, reminderAt: string) =>
      db.runAsync(
        `INSERT INTO tasks (id, title, status, priority, reminderAt, recurrence, listId, sortOrder, createdAt, updatedAt)
         VALUES (?, ?, ?, 'normal', ?, 'none', 'inbox', 0, ?, ?)`,
        [id, id, status, reminderAt, now, now]
      );
    await insert('a-future', 'active', future);
    await insert('a-past', 'active', past);
    await insert('c-future', 'completed', future);
    // stale row for a task that is no longer active
    await db.runAsync(
      'INSERT INTO reminders (id, taskId, notificationId, scheduledAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
      ['r-stale', 'c-future', 'stale-notif', future, now, now]
    );

    const result = await syncScheduledReminders();
    assert.equal(result.scheduled, 1);
    assert.equal(result.cleared, 1);
    assert.deepEqual([...scheduled.values()].map((n) => n.body), ['a-future']);
    assert.ok(cancelled.includes('stale-notif'));

    const again = await syncScheduledReminders();
    assert.deepEqual(
      again,
      { scheduled: 0, cleared: 0, skipped: 0 },
      'idempotent'
    );
  });

  await test('sync: reschedules when reminderAt changed under an existing row', async () => {
    const db = await freshDb();
    const task = await taskRepository.create({
      title: 'Drift',
      reminderAt: FUTURE_DAY(1).toISOString(),
    });
    const newer = FUTURE_DAY(2).toISOString();
    await db.runAsync('UPDATE tasks SET reminderAt = ? WHERE id = ?', [newer, task.id]);
    const result = await syncScheduledReminders();
    assert.equal(result.scheduled, 1);
    assert.equal(scheduled.size, 1);
    assert.equal(
      [...scheduled.values()][0].date.toISOString(),
      newer
    );
  });

  await test('sync: schedules the soonest reminders first and defers the rest', async () => {
    const db = await freshDb();
    const now = new Date().toISOString();
    // 70 future reminders, inserted furthest-out first so ordering must be
    // applied rather than inherited from row order.
    for (let i = 70; i >= 1; i--) {
      const at = new Date(Date.now() + i * 3600_000).toISOString();
      await db.runAsync(
        `INSERT INTO tasks (id, title, status, priority, reminderAt, recurrence, listId, sortOrder, createdAt, updatedAt)
         VALUES (?, ?, 'active', 'normal', ?, 'none', 'inbox', 0, ?, ?)`,
        [`t${i}`, `t${i}`, at, now, now]
      );
    }
    const result = await syncScheduledReminders();
    assert.equal(result.scheduled, 60, 'stops short of the iOS limit');
    assert.equal(result.skipped, 10);
    const bodies = new Set([...scheduled.values()].map((n) => n.body));
    assert.ok(bodies.has('t1'), 'soonest is scheduled');
    assert.ok(!bodies.has('t70'), 'furthest out is deferred');
  });

  await test('repo: reopening a logged repeat pulls the live task back', async () => {
    await freshDb();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const reminder = new Date(today);
    reminder.setHours(23, 59, 0, 0);
    const task = await taskRepository.create({
      title: 'Stretch',
      recurrence: 'daily',
      dueDate: today.toISOString(),
      reminderAt: reminder.toISOString(),
    });
    const { occurrenceId } = await taskRepository.complete(task.id);

    const record = await taskRepository.getById(occurrenceId!);
    assert.equal(record!.recurringTaskId, task.id, 'record links to the task');

    const reopened = await taskRepository.uncomplete(occurrenceId!);
    assert.equal(reopened!.id, task.id, 'the live task is returned');
    assert.equal(reopened!.status, 'active');
    assert.equal(reopened!.dueDate, task.dueDate, 'pulled back to that day');
    assert.equal(reopened!.reminderAt, task.reminderAt);
    assert.equal(reopened!.recurrence, 'daily', 'still repeating');
    assert.equal(
      await taskRepository.getById(occurrenceId!),
      null,
      'record removed, no duplicate task'
    );
    assert.equal((await taskRepository.getCompleted()).length, 0);
  });

  await test('repo: a record outliving its task reopens as a plain task', async () => {
    await freshDb();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const task = await taskRepository.create({
      title: 'Orphan',
      recurrence: 'weekly',
      dueDate: today.toISOString(),
    });
    const { occurrenceId } = await taskRepository.complete(task.id);
    await taskRepository.deletePermanent(task.id);

    const reopened = await taskRepository.uncomplete(occurrenceId!);
    assert.equal(reopened!.id, occurrenceId);
    assert.equal(reopened!.status, 'active');
    assert.equal(reopened!.recurringTaskId, undefined, 'link dropped');
  });

  await test('migration: recurringTaskId is added to an older tasks table', async () => {
    await closeDb();
    __resetNotifications();
    const db = await getDb();
    // Pre-v5 shape: no recurringTaskId column.
    await db.execAsync(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, notes TEXT,
        status TEXT NOT NULL DEFAULT 'active', priority TEXT NOT NULL DEFAULT 'normal',
        dueDate TEXT, reminderAt TEXT, recurrence TEXT NOT NULL DEFAULT 'none',
        listId TEXT, sortOrder INTEGER NOT NULL DEFAULT 0, completedAt TEXT,
        createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, deletedAt TEXT
      );
      CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      INSERT INTO settings (key, value) VALUES ('schemaVersion', '4');
    `);
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO tasks (id, title, status, priority, recurrence, listId, sortOrder, createdAt, updatedAt)
       VALUES ('legacy', 'Legacy task', 'active', 'normal', 'daily', 'inbox', 0, ?, ?)`,
      [now, now]
    );

    await initDatabase();

    const columns = await db.getAllAsync<{ name: string }>(
      'PRAGMA table_info(tasks)'
    );
    assert.ok(
      columns.some((c) => c.name === 'recurringTaskId'),
      'column added'
    );
    const survived = await taskRepository.getById('legacy');
    assert.equal(survived!.title, 'Legacy task', 'existing data preserved');
    assert.equal(survived!.recurrence, 'daily');
    assert.equal(survived!.recurringTaskId, undefined);
    const version = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM settings WHERE key = 'schemaVersion'"
    );
    assert.equal(version!.value, '5');
  });

  // ---- notification actions ---------------------------------------------------
  await test('actions: Complete leads the registered category', async () => {
    await freshDb();
    await initReminders();
    const actions = categories.get(REMINDER_CATEGORY);
    assert.ok(actions, 'category registered');
    assert.deepEqual(
      actions!.map((a) => a.identifier),
      [REMINDER_ACTION_COMPLETE, REMINDER_ACTION_SNOOZE],
      'most common action first'
    );
  });

  await test('actions: scheduled reminders carry the category', async () => {
    await freshDb();
    await taskRepository.create({
      title: 'Actionable',
      reminderAt: FUTURE_DAY(1).toISOString(),
    });
    assert.equal(
      [...scheduled.values()][0].categoryIdentifier,
      REMINDER_CATEGORY
    );
  });

  await test('actions: response parsing maps identifiers to actions', () => {
    const build = (actionIdentifier?: string, taskId: unknown = 'abc') => ({
      actionIdentifier,
      notification: {
        request: { identifier: 'req-1', content: { data: { taskId } } },
      },
    });
    assert.deepEqual(readResponse(build(REMINDER_ACTION_COMPLETE)), {
      taskId: 'abc',
      action: 'complete',
      key: 'req-1:complete',
    });
    assert.equal(readResponse(build(REMINDER_ACTION_SNOOZE))!.action, 'snooze');
    assert.equal(readResponse(build(undefined))!.action, 'open');
    assert.equal(readResponse(build('whatever', 42)), null, 'ignores junk');
  });

  await test('actions: the same response is handled once, a new one is not blocked', () => {
    __resetHandledResponses();
    const first = readResponse({
      actionIdentifier: REMINDER_ACTION_COMPLETE,
      notification: { request: { identifier: 'r1', content: { data: { taskId: 't' } } } },
    })!;
    assert.equal(claimResponse(first), true, 'first delivery handled');
    assert.equal(claimResponse(first), false, 'cold-start duplicate dropped');
    const later = readResponse({
      actionIdentifier: REMINDER_ACTION_COMPLETE,
      notification: { request: { identifier: 'r2', content: { data: { taskId: 't' } } } },
    })!;
    assert.equal(claimResponse(later), true, 'a later notification for the same task still works');
  });

  await test('actions: snooze moves the reminder out and reschedules', async () => {
    await freshDb();
    const task = await taskRepository.create({
      title: 'Snoozy',
      reminderAt: FUTURE_DAY(1).toISOString(),
    });
    cancelled.length = 0;
    const until = await snoozeReminder(task.id);
    assert.ok(until);
    const delta = new Date(until!).getTime() - Date.now();
    assert.ok(
      Math.abs(delta - SNOOZE_MINUTES * 60_000) < 5_000,
      'about an hour out'
    );
    assert.equal(scheduled.size, 1, 'one pending alert');
    assert.equal(cancelled.length, 1, 'old alert replaced');
    const stored = await taskRepository.getById(task.id);
    assert.equal(stored!.reminderAt, until);
  });

  await test('actions: snooze ignores a task that is no longer active', async () => {
    await freshDb();
    const task = await taskRepository.create({
      title: 'Gone',
      reminderAt: FUTURE_DAY(1).toISOString(),
    });
    await taskRepository.complete(task.id);
    assert.equal(await snoozeReminder(task.id), null);
    assert.equal(await snoozeReminder('missing-id'), null);
  });

  // ---- store: quick add + recurring undo -------------------------------------
  const setPro = (value: boolean) => useProStore.setState({ isPro: value });

  await test('store: Pro quick add consumes a trailing repeat keyword', async () => {
    await freshDb();
    setPro(true);
    const task = await useTaskStore.getState().addTask('Water plants weekly');
    assert.equal(task!.title, 'Water plants');
    assert.equal(task!.recurrence, 'weekly');
  });

  await test('store: free quick add keeps the word and stays non-repeating', async () => {
    await freshDb();
    setPro(false);
    const task = await useTaskStore.getState().addTask('Water plants weekly');
    assert.equal(task!.title, 'Water plants weekly');
    assert.equal(task!.recurrence, 'none');
  });

  await test('store: toolbar recurrence option is applied to the new task', async () => {
    await freshDb();
    setPro(true);
    const task = await useTaskStore
      .getState()
      .addTask('Pay rent', undefined, { recurrence: 'monthly' });
    assert.equal(task!.recurrence, 'monthly');
    assert.ok(task!.dueDate, 'a repeat needs a start date');
  });

  await test('store: completing a repeat shows an undo toast that restores it', async () => {
    await freshDb();
    setPro(true);
    useToastStore.setState({ toast: null });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const reminder = new Date(today);
    reminder.setHours(23, 59, 0, 0);
    const task = await taskRepository.create({
      title: 'Stretch',
      recurrence: 'daily',
      dueDate: today.toISOString(),
      reminderAt: reminder.toISOString(),
      priority: 'must_do_today',
    });

    await useTaskStore.getState().completeTask(task.id);
    const advanced = await taskRepository.getById(task.id);
    assert.equal(advanced!.status, 'active');
    assert.notEqual(advanced!.dueDate, task.dueDate);

    const toast = useToastStore.getState().toast;
    assert.ok(toast, 'a toast is shown');
    assert.match(toast!.message, /^Done · next /);
    assert.equal(toast!.action?.label, 'Undo');

    await toast!.action!.onPress();
    const restored = await taskRepository.getById(task.id);
    assert.equal(restored!.dueDate, task.dueDate, 'due date restored');
    assert.equal(restored!.reminderAt, task.reminderAt, 'reminder restored');
    assert.equal(restored!.priority, 'must_do_today', 'priority restored');
  });

  await test('store: a completed repeat appears in Finished, undo removes it', async () => {
    await freshDb();
    setPro(true);
    useToastStore.setState({ toast: null });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const task = await taskRepository.create({
      title: 'Stretch',
      recurrence: 'daily',
      dueDate: today.toISOString(),
    });

    await useTaskStore.getState().completeTask(task.id);
    let done = useTaskStore.getState().doneTasks;
    assert.equal(done.length, 1, 'the finished occurrence is visible');
    assert.equal(done[0].title, 'Stretch');
    assert.notEqual(done[0].id, task.id, 'the live task keeps its own id');

    await useToastStore.getState().toast!.action!.onPress();
    done = useTaskStore.getState().doneTasks;
    assert.equal(done.length, 0, 'undo clears the logged occurrence');
    const live = await taskRepository.getById(task.id);
    assert.equal(live!.dueDate, task.dueDate);
  });

  await test('store: each repeat completion logs a separate occurrence', async () => {
    await freshDb();
    setPro(true);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const task = await taskRepository.create({
      title: 'Vitamins',
      recurrence: 'daily',
      dueDate: today.toISOString(),
    });
    await useTaskStore.getState().completeTask(task.id);
    await useTaskStore.getState().completeTask(task.id);
    const done = await taskRepository.getCompleted();
    assert.equal(done.length, 2);
    assert.equal(new Set(done.map((t) => t.id)).size, 2, 'distinct records');
  });

  await test('store: reopening from Finished pulls the repeat back, no duplicate', async () => {
    await freshDb();
    setPro(true);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const task = await taskRepository.create({
      title: 'Stretch',
      recurrence: 'daily',
      dueDate: today.toISOString(),
    });
    await useTaskStore.getState().completeTask(task.id);
    const record = useTaskStore.getState().doneTasks[0];

    await useTaskStore.getState().uncompleteTask(record.id);
    await useTaskStore.getState().refreshDone();

    assert.equal(useTaskStore.getState().doneTasks.length, 0);
    const all = await taskRepository.getAllActive();
    assert.equal(all.length, 1, 'no duplicate task left behind');
    assert.equal(all[0].id, task.id);
    assert.equal(all[0].dueDate, task.dueDate, 'back to the reopened day');
    assert.equal(all[0].recurrence, 'daily');
  });

  await test('store: completing a plain task shows no toast', async () => {
    await freshDb();
    setPro(true);
    useToastStore.setState({ toast: null });
    const task = await taskRepository.create({ title: 'Once' });
    await useTaskStore.getState().completeTask(task.id);
    assert.equal(useToastStore.getState().toast, null);
  });

  await test('store: repeat toggle is ignored on a completed task', async () => {
    await freshDb();
    setPro(true);
    const task = await taskRepository.create({ title: 'Done already' });
    await taskRepository.complete(task.id);
    await useTaskStore.getState().toggleRecurring(task.id);
    const after = await taskRepository.getById(task.id);
    assert.equal(after!.recurrence, 'none');
    assert.equal(after!.status, 'completed');
  });

  await test('store: non-Pro repeat toggle prompts for Pro instead of repeating', async () => {
    await freshDb();
    setPro(false);
    const task = await taskRepository.create({ title: 'Tempting' });
    await useTaskStore.getState().toggleRecurring(task.id);
    const after = await taskRepository.getById(task.id);
    assert.equal(after!.recurrence, 'none');
  });

  // ---- streak foundation ------------------------------------------------------
  const isoDaysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  };

  await test('streaks: consecutive daily occurrences count up to today', () => {
    const stats = computeCompletionStats(
      [isoDaysAgo(0), isoDaysAgo(1), isoDaysAgo(2), isoDaysAgo(3)],
      'daily'
    );
    assert.deepEqual(stats, { total: 4, streak: 4 });
  });

  await test('streaks: one missed day is forgiven, two break the run', () => {
    const forgiven = computeCompletionStats(
      [isoDaysAgo(0), isoDaysAgo(2), isoDaysAgo(3)],
      'daily'
    );
    assert.equal(forgiven.streak, 3);
    const broken = computeCompletionStats(
      [isoDaysAgo(0), isoDaysAgo(3), isoDaysAgo(4)],
      'daily'
    );
    assert.equal(broken.streak, 1);
    assert.equal(broken.total, 3);
  });

  await test('streaks: a stale run is not current', () => {
    const stats = computeCompletionStats(
      [isoDaysAgo(10), isoDaysAgo(11), isoDaysAgo(12)],
      'daily'
    );
    assert.deepEqual(stats, { total: 3, streak: 0 });
  });

  await test('streaks: weekly tolerance and duplicate days', () => {
    const weekly = computeCompletionStats(
      [isoDaysAgo(0), isoDaysAgo(0), isoDaysAgo(8), isoDaysAgo(15)],
      'weekly'
    );
    assert.deepEqual(weekly.total, 3, 'same day counts once');
    assert.equal(weekly.streak, 3);
    assert.deepEqual(computeCompletionStats([], 'daily'), { total: 0, streak: 0 });
    assert.deepEqual(computeCompletionStats([isoDaysAgo(0)], 'none'), {
      total: 1,
      streak: 0,
    });
  });

  await test('streaks: summary copy', () => {
    assert.equal(formatCompletionStats({ total: 0, streak: 0 }), '');
    assert.equal(formatCompletionStats({ total: 1, streak: 1 }), 'Done once');
    assert.equal(formatCompletionStats({ total: 5, streak: 1 }), 'Done 5 times');
    assert.equal(
      formatCompletionStats({ total: 12, streak: 5 }),
      'Done 12 times · 5 in a row'
    );
  });

  await test('streaks: repository returns only this task\'s occurrences, newest first', async () => {
    await freshDb();
    setPro(true);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const a = await taskRepository.create({ title: 'A', recurrence: 'daily', dueDate: today.toISOString() });
    const b = await taskRepository.create({ title: 'B', recurrence: 'daily', dueDate: today.toISOString() });
    await taskRepository.complete(a.id);
    await new Promise((r) => setTimeout(r, 5));
    await taskRepository.complete(a.id);
    await taskRepository.complete(b.id);
    const occ = await taskRepository.getOccurrences(a.id);
    assert.equal(occ.length, 2);
    assert.ok(occ.every((o) => o.recurringTaskId === a.id));
    assert.ok(occ[0].completedAt! >= occ[1].completedAt!, 'newest first');
    assert.equal((await taskRepository.getOccurrences(b.id)).length, 1);
  });

  // ---- user-style edge cases ---------------------------------------------------
  await test('edge: a double tap on a repeat completes it once', async () => {
    await freshDb();
    setPro(true);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const task = await taskRepository.create({
      title: 'Twice?',
      recurrence: 'daily',
      dueDate: today.toISOString(),
    });
    const store = useTaskStore.getState();
    await Promise.all([store.completeTask(task.id), store.completeTask(task.id)]);
    const live = await taskRepository.getById(task.id);
    assert.equal(dayOf(live!.dueDate!), dayOf(FUTURE_DAY(1).toISOString()), 'advanced one step');
    assert.equal((await taskRepository.getCompleted()).length, 1, 'one record');
  });

  await test('edge: complete → reopen → complete leaves exactly one record', async () => {
    await freshDb();
    setPro(true);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const task = await taskRepository.create({
      title: 'Flip',
      recurrence: 'daily',
      dueDate: today.toISOString(),
    });
    const store = useTaskStore.getState();
    await store.completeTask(task.id);
    const record = (await taskRepository.getCompleted())[0];
    await store.uncompleteTask(record.id);
    assert.equal((await taskRepository.getCompleted()).length, 0);
    await store.completeTask(task.id);
    assert.equal((await taskRepository.getCompleted()).length, 1);
    const live = await taskRepository.getById(task.id);
    assert.equal(dayOf(live!.dueDate!), dayOf(FUTURE_DAY(1).toISOString()));
  });

  await test('edge: reopening a record of an archived series does not revive it', async () => {
    await freshDb();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const task = await taskRepository.create({
      title: 'Retired habit',
      recurrence: 'daily',
      dueDate: today.toISOString(),
    });
    const { occurrenceId } = await taskRepository.complete(task.id);
    await taskRepository.archive(task.id);
    const reopened = await taskRepository.uncomplete(occurrenceId!);
    assert.equal(reopened!.id, occurrenceId, 'the record itself reopens');
    assert.equal(reopened!.recurringTaskId, undefined);
    const live = await taskRepository.getById(task.id);
    assert.equal(live!.status, 'archived', 'series stays archived');
  });

  await test('edge: undo after the live task was deleted does not throw', async () => {
    await freshDb();
    setPro(true);
    useToastStore.setState({ toast: null });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const task = await taskRepository.create({
      title: 'Vanishing',
      recurrence: 'daily',
      dueDate: today.toISOString(),
    });
    await useTaskStore.getState().completeTask(task.id);
    await taskRepository.deletePermanent(task.id);
    await useToastStore.getState().toast!.action!.onPress();
    assert.equal((await taskRepository.getCompleted()).length, 0, 'record cleaned up');
  });

  await test('edge: changing the repeat rule keeps the history', async () => {
    await freshDb();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const task = await taskRepository.create({
      title: 'Evolving',
      recurrence: 'daily',
      dueDate: today.toISOString(),
    });
    await taskRepository.complete(task.id);
    await taskRepository.setRecurrence(task.id, 'weekly');
    assert.equal((await taskRepository.getOccurrences(task.id)).length, 1);
    await taskRepository.setRecurrence(task.id, 'none');
    assert.equal((await taskRepository.getOccurrences(task.id)).length, 1, 'history survives turning repeat off');
  });

  await test('edge: Clear finished removes records but not the live task', async () => {
    await freshDb();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const task = await taskRepository.create({
      title: 'Keep me',
      recurrence: 'daily',
      dueDate: today.toISOString(),
    });
    await taskRepository.complete(task.id);
    await taskRepository.clearCompleted();
    assert.equal((await taskRepository.getCompleted()).length, 0);
    assert.ok(await taskRepository.getById(task.id), 'live task untouched');
  });

  await test('edge: an imported repeat with no due date still advances from today', async () => {
    await freshDb();
    const db = await getDb();
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO tasks (id, title, status, priority, recurrence, listId, sortOrder, createdAt, updatedAt)
       VALUES ('undated', 'Undated repeat', 'active', 'normal', 'weekly', 'inbox', 0, ?, ?)`,
      [now, now]
    );
    const { task } = await taskRepository.complete('undated');
    assert.equal(dayOf(task!.dueDate!), dayOf(FUTURE_DAY(7).toISOString()));
  });

  await test('edge: moving a task with a passed reminder to tomorrow makes it ring again', async () => {
    await freshDb();
    const past = new Date();
    past.setHours(past.getHours() - 2, 0, 0, 0);
    const todayStart = new Date(past);
    todayStart.setHours(0, 0, 0, 0);
    const task = await taskRepository.create({
      title: 'Missed it',
      dueDate: todayStart.toISOString(),
      reminderAt: past.toISOString(),
    });
    assert.equal(scheduled.size, 0, 'nothing pending for a passed time');
    const moved = await taskRepository.moveToTomorrow(task.id);
    assert.equal(dayOf(moved!.reminderAt!), dayOf(FUTURE_DAY(1).toISOString()));
    assert.equal(timeOf(moved!.reminderAt!), timeOf(past.toISOString()));
    assert.equal(scheduled.size, 1, 'shifted reminder is scheduled');
  });

  await test('edge: snooze that crosses midnight reads as a different day', async () => {
    const lateTonight = new Date();
    lateTonight.setHours(23, 30, 0, 0);
    const snoozed = new Date(lateTonight.getTime() + SNOOZE_MINUTES * 60_000).toISOString();
    const todayStart = new Date(lateTonight);
    todayStart.setHours(0, 0, 0, 0);
    assert.equal(isReminderOnDifferentDay(snoozed, todayStart.toISOString()), true);
  });

  await test('edge: monthly repeat with a reminder keeps its clock time across month end', () => {
    const jan31 = local(2026, 1, 31).toISOString();
    const next = getNextDueDate(jan31, 'monthly', local(2026, 1, 31));
    const shifted = shiftReminderToDueDate(local(2026, 1, 31, 7, 45).toISOString(), next);
    assert.equal(dayOf(shifted), '2026-2-28');
    assert.equal(timeOf(shifted), '7:45');
  });

  await test('edge: backup round-trip keeps the record link and reopen still works', async () => {
    await freshDb();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const task = await taskRepository.create({
      title: 'Portable',
      recurrence: 'daily',
      dueDate: today.toISOString(),
    });
    const { occurrenceId } = await taskRepository.complete(task.id);
    const backup = await buildBackup();
    const exported = backup.tasks.find((t) => t.id === occurrenceId);
    assert.equal(exported!.recurringTaskId, task.id, 'link exported');

    await freshDb();
    const path = join(cacheDirectory, `rt-${Math.random()}.clearday`);
    await writeFile(path, JSON.stringify(backup), 'utf8');
    __setPickerResult({ canceled: false, assets: [{ uri: path }] });
    assert.equal(await importBackupFromFile(), true);

    const imported = await taskRepository.getById(occurrenceId!);
    assert.equal(imported!.recurringTaskId, task.id, 'link imported');
    const reopened = await taskRepository.uncomplete(occurrenceId!);
    assert.equal(reopened!.id, task.id, 'folds back into the live task after import');
  });

  await test('edge: an imported record whose parent is missing becomes a plain task', async () => {
    await freshDb();
    const now = new Date().toISOString();
    const backup = await buildBackup();
    backup.tasks.push({
      id: 'lonely',
      title: 'Lonely record',
      status: 'completed',
      priority: 'normal',
      recurrence: 'none',
      recurringTaskId: 'does-not-exist',
      sortOrder: 0,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const path = join(cacheDirectory, `orphan-${Math.random()}.clearday`);
    await writeFile(path, JSON.stringify(backup), 'utf8');
    __setPickerResult({ canceled: false, assets: [{ uri: path }] });
    assert.equal(await importBackupFromFile(), true);
    const row = await taskRepository.getById('lonely');
    assert.equal(row!.recurringTaskId, undefined, 'dangling link dropped on import');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  await closeDb();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
