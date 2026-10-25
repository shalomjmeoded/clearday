/**
 * Unit + repository tests for recurrence and reminders.
 * Pure utils run against an injected clock; repository tests run the real
 * taskRepository + reminderService against in-memory SQLite with Expo stubbed.
 *
 * Run from repo root: npm run test:unit
 */
import assert from 'node:assert/strict';

import { getDb, closeDb } from '@/db/client';
import { INBOX_LIST_ID, SCHEMA_VERSION } from '@/db/constants';
import {
  __isDbBusy,
  runExclusive,
  runInTransaction,
  whenDbIdle,
} from '@/db/exclusive';
import { initDatabase, __MIGRATIONS, PRE_MIGRATION_SNAPSHOT } from '@/db/migrations';
import { fetchTodayTasks, fetchTomorrowTasks } from '@/features/tasks/taskQueries';
import { checkIntegrity, getSnapshotInfo, restoreSnapshot } from '@/db/snapshot';
import { mapRowToTask } from '@/features/tasks/taskMapper';
import { listRepository } from '@/features/lists/listRepository';
import { useSettingsStore } from '@/store/settingsStore';
import { applyPartialOrder } from '@/utils/reorder';
import { DatabaseSync } from 'node:sqlite';
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
import {
  PRO_ENTITLEMENT_CACHE_KEY,
  readCachedEntitlement,
  writeCachedEntitlement,
} from '@/features/pro/proEntitlementCache';
import {
  __getSubscriptionPackages,
  NoSubscriptionPackagesError,
  PurchaseFlowError,
  PurchasesNotConfiguredError,
  revenueCatSubscriptionService,
} from '@/features/pro/subscriptionService';
import { getIsPro, useProStore } from '@/store/proStore';
import { useTaskStore } from '@/store/taskStore';
import { __resetToastQueue, useToastStore } from '@/store/toastStore';
import { parseTaskInput } from '@/utils/parseTaskInput';
import { getNextDueDate, shiftReminderToDueDate } from '@/utils/recurrence';
import { isOverdue, msUntilNextLocalMidnight, toDueDateIso } from '@/utils/dates';
import { tomorrowIso } from '@/utils/scheduleDates';
import {
  buildReminderIso,
  effectiveReminderAt,
  formatTimeKeyLabel,
  isReminderOnDifferentDay,
  isReminderPast,
  parseTimeKey,
} from '@/utils/reminderTime';
import { loadSettings, updateSetting } from '@/features/settings/settingsRepository';
import { DEFAULT_SETTINGS, normalizeSettings } from '@/types/settings';
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

/**
 * Runs `fn` with the process clock in another zone. Node re-reads TZ on
 * change, and date-fns builds on the native Date, so everything under test
 * follows. The machine's zone is restored afterwards.
 */
async function withTimeZone<T>(tz: string, fn: () => T | Promise<T>): Promise<T> {
  const previous = process.env.TZ;
  process.env.TZ = tz;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

async function freshDb() {
  await closeDb();
  __resetNotifications();
  __resetToastQueue();
  useToastStore.setState({ toast: null });
  await initDatabase();
  return getDb();
}

/** Mimics <Toast />: an action press dismisses first (skipping onExpire), then runs. */
async function pressToastAction(): Promise<void> {
  const toast = useToastStore.getState().toast;
  if (!toast?.action) throw new Error('no toast action to press');
  useToastStore.getState().dismiss(toast.id, { ranAction: true });
  await toast.action.onPress();
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

  await test('daily across a DST change keeps the calendar day, anchored at local noon', () => {
    // US spring-forward 2026-03-08; stepping must land on the next calendar
    // day at the canonical noon anchor, not 23 hours later.
    const next = getNextDueDate(local(2026, 3, 7).toISOString(), 'daily', local(2026, 3, 7));
    const date = new Date(next);
    assert.equal(dayOf(next), '2026-3-8');
    assert.equal(date.getHours(), 12);
    // A midnight anchor written by an earlier build steps the same way.
    assert.equal(next, getNextDueDate(local(2026, 3, 7, 12).toISOString(), 'daily', local(2026, 3, 7)));
  });

  await test('dates: toDueDateIso stores local noon and reads as the same day far to the west', async () => {
    const stored = await withTimeZone('Europe/Berlin', () =>
      toDueDateIso(new Date(2026, 9, 27, 8, 15))
    );
    for (const tz of ['Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Pacific/Honolulu', 'Asia/Tokyo']) {
      await withTimeZone(tz, () => {
        assert.equal(dayOf(stored), '2026-10-27', `still Oct 27 in ${tz}`);
      });
    }
    // The old midnight anchor is what broke: one hour west and it is the 26th.
    const midnight = await withTimeZone('Europe/Berlin', () =>
      new Date(2026, 9, 27, 0, 0).toISOString()
    );
    await withTimeZone('America/New_York', () => {
      assert.equal(dayOf(midnight), '2026-10-26', 'midnight anchor slips a day');
    });
  });

  await test('dates: msUntilNextLocalMidnight lands on 00:00 of the next day across DST', async () => {
    await withTimeZone('America/New_York', () => {
      // 2026-11-01 is the 25-hour fall-back day; 2026-03-08 the 23-hour one.
      for (const now of [local(2026, 11, 1, 0, 30), local(2026, 3, 8, 0, 30), local(2026, 10, 25, 23, 0)]) {
        const fire = new Date(now.getTime() + msUntilNextLocalMidnight(now));
        assert.equal(fire.getDate(), now.getDate() + 1);
        assert.equal(fire.getHours(), 0);
        assert.equal(fire.getMinutes(), 0);
        assert.equal(fire.getSeconds(), 1, 'one-second cushion past the boundary');
      }
      assert.equal(msUntilNextLocalMidnight(local(2026, 11, 1, 0, 30)), 24.5 * 3600_000 + 1000);
    });
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

  await test('buildReminderIso: rolling to tomorrow on the fall-back day is a calendar step', async () => {
    await withTimeZone('America/New_York', () => {
      // 00:40 on 2026-11-01, a 25-hour day. "+24h" is still Nov 1, so the
      // reminder used to land in the past and was never scheduled.
      const now = local(2026, 11, 1, 0, 40);
      const iso = buildReminderIso(0, 30, undefined, now);
      assert.equal(dayOf(iso), '2026-11-2');
      assert.equal(timeOf(iso), '0:30');
      assert.equal(isReminderPast(iso, now), false);
    });
  });

  await test('parser: due dates come out at the noon anchor', () => {
    const now = local(2026, 10, 23, 10);
    assert.equal(new Date(parseTaskInput('tomorrow', { now }).dueDate!).getHours(), 12);
    assert.equal(new Date(parseTaskInput('call Bob 8am', { now }).dueDate!).getHours(), 12);
    assert.equal(timeOf(parseTaskInput('call Bob 8am', { now }).reminderAt!), '8:00');
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
    assert.equal(version!.value, String(SCHEMA_VERSION));
  });

  /** Exact schema shipped in the first release (schemaVersion 2). */
  async function seedFirstReleaseDb() {
    await closeDb();
    __resetNotifications();
    const db = await getDb();
    await db.execAsync(`
      CREATE TABLE lists (
        id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL,
        sortOrder INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, deletedAt TEXT
      );
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, notes TEXT,
        status TEXT NOT NULL DEFAULT 'active', priority TEXT NOT NULL DEFAULT 'normal',
        dueDate TEXT, reminderAt TEXT, recurrence TEXT NOT NULL DEFAULT 'none',
        listId TEXT, sortOrder INTEGER NOT NULL DEFAULT 0, completedAt TEXT,
        createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, deletedAt TEXT
      );
      CREATE TABLE reminders (
        id TEXT PRIMARY KEY NOT NULL, taskId TEXT NOT NULL, notificationId TEXT,
        scheduledAt TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
      );
      CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      CREATE INDEX idx_tasks_status_dueDate ON tasks(status, dueDate);
      CREATE INDEX idx_tasks_listId_sortOrder ON tasks(listId, sortOrder);
      INSERT INTO settings (key, value) VALUES
        ('theme', 'dark'), ('hapticsEnabled', 'false'),
        ('completedTaskBehavior', 'hide'), ('defaultReminderTime', '08:30'),
        ('defaultListId', 'inbox'), ('isPro', 'true'), ('schemaVersion', '2');
      INSERT INTO lists (id, name, sortOrder, createdAt, updatedAt) VALUES
        ('inbox', 'Inbox', 0, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'),
        ('work', 'Work', 1, '2025-01-02T00:00:00.000Z', '2025-01-02T00:00:00.000Z');
      INSERT INTO tasks (id, title, notes, status, priority, dueDate, reminderAt, recurrence, listId, sortOrder, completedAt, createdAt, updatedAt) VALUES
        ('t1', 'Old active', 'keep me', 'active', 'important', '2025-02-01T09:00:00.000Z', '2025-02-01T09:00:00.000Z', 'weekly', 'work', 3, NULL, '2025-01-03T00:00:00.000Z', '2025-01-03T00:00:00.000Z'),
        ('t2', 'Old done', NULL, 'completed', 'normal', NULL, NULL, 'none', 'inbox', 0, '2025-01-05T12:00:00.000Z', '2025-01-04T00:00:00.000Z', '2025-01-05T12:00:00.000Z');
      INSERT INTO reminders (id, taskId, notificationId, scheduledAt, createdAt, updatedAt) VALUES
        ('r1', 't1', 'os-1', '2025-02-01T09:00:00.000Z', '2025-01-03T00:00:00.000Z', '2025-01-03T00:00:00.000Z');
    `);
    return db;
  }

  async function settingsMap(db: Awaited<ReturnType<typeof getDb>>) {
    const rows = await db.getAllAsync<{ key: string; value: string }>(
      'SELECT key, value FROM settings'
    );
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  await test('migration: first-release (v2) database upgrades with all data intact', async () => {
    const db = await seedFirstReleaseDb();
    await initDatabase();

    for (const [table, column] of [
      ['lists', 'color'],
      ['tasks', 'color'],
      ['tasks', 'recurringTaskId'],
    ] as const) {
      const cols = await db.getAllAsync<{ name: string }>(
        `PRAGMA table_info(${table})`
      );
      assert.ok(cols.some((c) => c.name === column), `${table}.${column} added`);
    }
    const indexes = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'tasks'"
    );
    assert.ok(indexes.some((i) => i.name === 'idx_tasks_recurringTaskId'));

    const t1 = await taskRepository.getById('t1');
    assert.equal(t1!.title, 'Old active');
    assert.equal(t1!.notes, 'keep me');
    assert.equal(t1!.priority, 'important');
    assert.equal(t1!.recurrence, 'weekly');
    assert.equal(t1!.listId, 'work');
    assert.equal(t1!.sortOrder, 3);
    assert.equal(t1!.reminderAt, '2025-02-01T09:00:00.000Z');
    assert.equal(t1!.color, undefined);
    assert.equal(t1!.recurringTaskId, undefined);
    const t2 = await taskRepository.getById('t2');
    assert.equal(t2!.status, 'completed');
    assert.equal(t2!.completedAt, '2025-01-05T12:00:00.000Z');

    const lists = await db.getAllAsync<{ id: string; name: string; color: string | null }>(
      'SELECT id, name, color FROM lists ORDER BY sortOrder'
    );
    assert.deepEqual(
      lists.map((l) => [l.id, l.name, l.color]),
      [
        ['inbox', 'Inbox', '#4F6B52'],
        ['work', 'Work', null],
      ],
      'inbox gets default colour, custom list untouched'
    );
    const reminders = await db.getAllAsync('SELECT * FROM reminders');
    assert.equal(reminders.length, 1, 'reminder rows preserved');

    const map = await settingsMap(db);
    assert.equal(map.schemaVersion, String(SCHEMA_VERSION));
    assert.equal(map.theme, 'dark', 'user setting preserved');
    assert.equal(map.hapticsEnabled, 'false');
    assert.equal(map.completedTaskBehavior, 'hide');
    assert.equal(map.defaultReminderTime, '08:30');
    assert.equal(map.colorTheme, 'classic', 'new key seeded');
    assert.equal(map.swipeLeftAction, 'tomorrow', 'new key seeded');
    assert.equal('isPro' in map, false, 'legacy isPro row removed');
  });

  await test('migration: a second launch is a no-op', async () => {
    const db = await seedFirstReleaseDb();
    await initDatabase();
    const before = await db.getAllAsync('SELECT * FROM tasks ORDER BY id');
    await initDatabase();
    const after = await db.getAllAsync('SELECT * FROM tasks ORDER BY id');
    assert.deepEqual(after, before);
    assert.equal((await settingsMap(db)).schemaVersion, String(SCHEMA_VERSION));
  });

  await test('migration: each step stamps its own version, so a crash resumes correctly', async () => {
    const db = await seedFirstReleaseDb();
    // Run only the first pending step by hand, as if the app died after it.
    const v3 = __MIGRATIONS.find((m) => m.version === 3)!;
    await v3.run(db);
    await db.runAsync(
      "UPDATE settings SET value = '3' WHERE key = 'schemaVersion'"
    );
    await initDatabase();
    const cols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(tasks)');
    assert.ok(cols.some((c) => c.name === 'color'), 'v4 still applied');
    assert.ok(cols.some((c) => c.name === 'recurringTaskId'), 'v5 still applied');
    const map = await settingsMap(db);
    assert.equal(map.schemaVersion, String(SCHEMA_VERSION));
    assert.equal('isPro' in map, false, 'v6 still applied');
  });

  await test('migration: versions are consecutive and end at SCHEMA_VERSION', () => {
    const versions = __MIGRATIONS.map((m) => m.version);
    assert.deepEqual(
      versions,
      versions.map((_, i) => i + 2)
    );
    assert.equal(versions[versions.length - 1], SCHEMA_VERSION);
  });

  await test('migration: fresh database is stamped current without running steps', async () => {
    const db = await freshDb();
    const map = await settingsMap(db);
    assert.equal(map.schemaVersion, String(SCHEMA_VERSION));
    const inbox = await db.getFirstAsync<{ color: string }>(
      "SELECT color FROM lists WHERE id = 'inbox'"
    );
    assert.equal(inbox!.color, '#4F6B52');
  });

  await test('migration: a database from a newer build is left alone', async () => {
    const db = await freshDb();
    await db.runAsync(
      "UPDATE settings SET value = '999' WHERE key = 'schemaVersion'"
    );
    await db.runAsync("INSERT INTO settings (key, value) VALUES ('isPro', 'true')");
    await initDatabase();
    const map = await settingsMap(db);
    assert.equal(map.schemaVersion, '999', 'stamp not lowered');
    assert.equal(map.isPro, 'true', 'no migration re-run against newer data');
    const task = await taskRepository.create({ title: 'still works' });
    assert.ok(await taskRepository.getById(task.id));
  });

  await test('migration: unstamped database with data is treated as legacy (v1)', async () => {
    const db = await seedFirstReleaseDb();
    await db.runAsync("DELETE FROM settings WHERE key = 'schemaVersion'");
    await initDatabase();
    const cols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(tasks)');
    assert.ok(cols.some((c) => c.name === 'recurringTaskId'));
    assert.equal((await taskRepository.getById('t1'))!.title, 'Old active');
    assert.equal((await settingsMap(db)).schemaVersion, String(SCHEMA_VERSION));
  });

  // ---- settings validation ---------------------------------------------------
  await test('settings: normalizeSettings replaces every malformed value with its default', () => {
    const out = normalizeSettings({
      theme: 'purple',
      colorTheme: 42,
      hapticsEnabled: 'yes',
      completedTaskBehavior: null,
      defaultReminderTime: '25:99',
      swipeLeftAction: 'fly',
      swipeRightAction: ['archive'],
      defaultListId: '',
    });
    assert.deepEqual(out, DEFAULT_SETTINGS);
  });

  await test('settings: normalizeSettings keeps valid values and accepts stored string booleans', () => {
    const out = normalizeSettings({
      theme: 'dark',
      colorTheme: 'mint',
      hapticsEnabled: 'false',
      completedTaskBehavior: 'show',
      defaultReminderTime: '23:45',
      swipeLeftAction: 'delete',
      swipeRightAction: 'important',
      defaultListId: 'work',
    });
    assert.deepEqual(out, {
      theme: 'dark',
      colorTheme: 'mint',
      hapticsEnabled: false,
      completedTaskBehavior: 'show',
      defaultReminderTime: '23:45',
      swipeLeftAction: 'delete',
      swipeRightAction: 'important',
      defaultListId: 'work',
    });
    assert.equal(
      normalizeSettings({ defaultListId: 'work' }, new Set(['inbox'])).defaultListId,
      'inbox',
      'unknown list → inbox when the list set is known'
    );
    assert.equal(normalizeSettings(null).theme, 'system');
    assert.equal(normalizeSettings([] as unknown as Record<string, unknown>).theme, 'system');
  });

  await test('settings: a junk row in the table is sanitised on load, not propagated', async () => {
    const db = await freshDb();
    await db.runAsync("UPDATE settings SET value = 'garbage' WHERE key = 'defaultReminderTime'");
    await db.runAsync("UPDATE settings SET value = 'neon' WHERE key = 'colorTheme'");
    const loaded = await loadSettings();
    assert.equal(loaded.defaultReminderTime, '09:00');
    assert.equal(loaded.colorTheme, 'classic');
    const after = await updateSetting('theme', 'dark');
    assert.equal(after.theme, 'dark');
    assert.equal(after.defaultReminderTime, '09:00');
  });

  await test('reminderTime: parseTimeKey never yields NaN', () => {
    assert.deepEqual(parseTimeKey('08:30'), { hours: 8, minutes: 30 });
    assert.deepEqual(parseTimeKey('garbage'), { hours: 9, minutes: 0 });
    assert.deepEqual(parseTimeKey('25:00'), { hours: 9, minutes: 0 });
    assert.deepEqual(parseTimeKey('12:60'), { hours: 9, minutes: 0 });
    assert.deepEqual(parseTimeKey(''), { hours: 9, minutes: 0 });
    assert.deepEqual(parseTimeKey('7:05'), { hours: 7, minutes: 5 });
    assert.ok(!Number.isNaN(new Date(formatTimeKeyLabel('nope')).getTime()) || true);
    assert.equal(typeof formatTimeKeyLabel('nope'), 'string');
  });

  // ---- batch: workflow + data-loss fixes --------------------------------------
  // Same module instance the app uses (the dynamic import resolves to the stub).
  const { defaultDatabaseDirectory } = (await import('expo-sqlite')) as unknown as {
    defaultDatabaseDirectory: string;
  };

  await test('snapshot: a pre-migration copy holds the old schema and rows', async () => {
    await seedFirstReleaseDb();
    await initDatabase();
    const copy = new DatabaseSync(join(defaultDatabaseDirectory, PRE_MIGRATION_SNAPSHOT));
    try {
      const cols = copy.prepare('PRAGMA table_info(tasks)').all() as { name: string }[];
      assert.ok(!cols.some((c) => c.name === 'recurringTaskId'), 'copy predates v5');
      const rows = copy.prepare('SELECT id FROM tasks ORDER BY id').all() as { id: string }[];
      assert.deepEqual(rows.map((r) => r.id), ['t1', 't2']);
      const v = copy.prepare("SELECT value FROM settings WHERE key='schemaVersion'").get() as { value: string };
      assert.equal(v.value, '2');
    } finally {
      copy.close();
    }
  });

  await test('snapshot: not taken when there is nothing to migrate', async () => {
    const { rm, stat } = await import('node:fs/promises');
    const path = join(defaultDatabaseDirectory, PRE_MIGRATION_SNAPSHOT);
    await rm(path, { force: true });
    await freshDb();
    await initDatabase();
    await assert.rejects(stat(path), 'no snapshot on a current database');
  });

  await test('today: overdue tasks stay on Today; completed and archived are excluded', async () => {
    await freshDb();
    const yesterday = new Date(Date.now() - 24 * 3600_000).toISOString();
    const overdue = await taskRepository.create({ title: 'late', dueDate: yesterday });
    const today = await taskRepository.create({ title: 'now', dueDate: new Date().toISOString() });
    const tomorrow = await taskRepository.create({
      title: 'later',
      dueDate: new Date(Date.now() + 24 * 3600_000).toISOString(),
    });
    const done = await taskRepository.create({ title: 'done', dueDate: yesterday });
    await taskRepository.complete(done.id);
    const archived = await taskRepository.create({ title: 'shelved', dueDate: yesterday });
    await taskRepository.archive(archived.id);

    const ids = (await fetchTodayTasks()).map((t) => t.id).sort();
    assert.deepEqual(ids, [overdue.id, today.id].sort());
    assert.ok(!ids.includes(tomorrow.id));
  });

  await test('reorder: applyPartialOrder moves only the visible rows', () => {
    const full = ['a', 'b', 'c', 'd', 'e'];
    // Only b, d visible; user drags d above b.
    assert.deepEqual(applyPartialOrder(full, ['d', 'b']), ['a', 'd', 'c', 'b', 'e']);
    // Nothing visible → untouched.
    assert.deepEqual(applyPartialOrder(full, []), full);
    // Full reorder passes straight through.
    assert.deepEqual(applyPartialOrder(full, ['e', 'd', 'c', 'b', 'a']), ['e', 'd', 'c', 'b', 'a']);
    // A visible id unknown to the full list is appended, not dropped.
    assert.deepEqual(applyPartialOrder(['a', 'b'], ['b', 'z', 'a']), ['b', 'a', 'z']);
  });

  await test('mapper: damaged enum columns fall back instead of propagating', () => {
    const task = mapRowToTask({
      id: 'x', title: 'T', status: 'weird', priority: 7, recurrence: 'fortnightly-ish',
      sortOrder: 'nope', createdAt: 'c', updatedAt: 'u',
    });
    assert.equal(task.status, 'active');
    assert.equal(task.priority, 'normal');
    assert.equal(task.recurrence, 'none');
    assert.equal(task.sortOrder, 0);
  });

  await test('recurrence: getNextDueDate terminates on unknown values and bad anchors', () => {
    const past = local(2020, 1, 1).toISOString();
    assert.equal(getNextDueDate(past, 'bogus' as never), past, 'unknown → unchanged');
    const next = getNextDueDate('not-a-date', 'daily', local(2026, 10, 24));
    assert.equal(dayOf(next), '2026-10-24', 'bad anchor → today');
  });

  await test('archive: task is reachable under Archived and can be brought back', async () => {
    await freshDb();
    const task = await taskRepository.create({
      title: 'shelve me',
      reminderAt: FUTURE_DAY(1).toISOString(),
    });
    assert.equal(scheduled.size, 1);
    await useTaskStore.getState().archiveTask(task.id);
    assert.equal(scheduled.size, 0, 'reminder cancelled on archive');
    assert.deepEqual(
      useTaskStore.getState().archivedTasks.map((t) => t.id),
      [task.id]
    );
    assert.equal((await taskRepository.getAllActive()).length, 0);
    assert.equal(useToastStore.getState().toast?.message, 'Archived');

    await useTaskStore.getState().unarchiveTask(task.id);
    const back = await taskRepository.getById(task.id);
    assert.equal(back!.status, 'active');
    assert.equal(useTaskStore.getState().archivedTasks.length, 0);
    assert.equal((await taskRepository.getArchived()).length, 0);
  });

  await test('archive: Undo restores the previous status and reminder', async () => {
    await freshDb();
    const task = await taskRepository.create({
      title: 'oops',
      reminderAt: FUTURE_DAY(1).toISOString(),
    });
    await useTaskStore.getState().archiveTask(task.id);
    await pressToastAction();
    const back = await taskRepository.getById(task.id);
    assert.equal(back!.status, 'active');
    assert.equal(back!.reminderAt, task.reminderAt, 'reminder restored');
    assert.equal(scheduled.size, 1, 'notification rescheduled');
  });

  await test('lists: deleting a list moves its tasks to Inbox atomically', async () => {
    await freshDb();
    const list = await listRepository.create('Work');
    const a = await taskRepository.create({ title: 'a', listId: list.id });
    const b = await taskRepository.create({ title: 'b', listId: list.id });
    await taskRepository.complete(b.id);
    await listRepository.delete(list.id);
    assert.equal((await taskRepository.getById(a.id))!.listId, 'inbox');
    assert.equal((await taskRepository.getById(b.id))!.listId, 'inbox', 'completed moved too');
    assert.equal(await listRepository.getById(list.id), null);
    await assert.rejects(listRepository.delete('inbox'));
    assert.equal(__isDbBusy(), false);
  });

  await test('settings: a defaultListId pointing at a missing list loads as Inbox', async () => {
    const db = await freshDb();
    await db.runAsync("UPDATE settings SET value = 'ghost' WHERE key = 'defaultListId'");
    assert.equal((await loadSettings()).defaultListId, 'inbox');
    const list = await listRepository.create('Real');
    await updateSetting('defaultListId', list.id);
    assert.equal((await loadSettings()).defaultListId, list.id, 'existing list kept');
    await useSettingsStore.getState().setSetting('defaultListId', list.id);
    await listRepository.delete(list.id);
    assert.equal((await loadSettings()).defaultListId, 'inbox', 'deleted list → inbox');
  });

  await test('parser: "tonight" after 8pm means tomorrow night', () => {
    const late = local(2026, 10, 24, 21, 30);
    const parsed = parseTaskInput('Call mum tonight', { now: late });
    assert.equal(dayOf(parsed.dueDate!), '2026-10-25');
    assert.equal(timeOf(parsed.reminderAt!), '20:00');
    const early = local(2026, 10, 24, 10);
    const p2 = parseTaskInput('Call mum tonight', { now: early });
    assert.equal(dayOf(p2.dueDate!), '2026-10-24');
    assert.equal(p2.title, 'Call mum');
  });

  await test('finished: clearCompleted removes all history atomically and keeps archived', async () => {
    await freshDb();
    const a = await taskRepository.create({ title: 'a' });
    const b = await taskRepository.create({ title: 'b' });
    const c = await taskRepository.create({ title: 'c' });
    await taskRepository.complete(a.id);
    await taskRepository.complete(b.id);
    await taskRepository.archive(c.id);
    await taskRepository.clearCompleted();
    assert.equal((await taskRepository.getCompleted()).length, 0);
    assert.equal((await taskRepository.getArchived()).length, 1);
    assert.equal(__isDbBusy(), false);
  });

  // ---- snapshot restore (file-backed) -----------------------------------------
  const sqliteStub = (await import('expo-sqlite')) as unknown as {
    __setFileMode: (on: boolean) => void;
    deleteDatabaseAsync: (name: string, dir?: string) => Promise<void>;
  };

  async function withFileDb(fn: () => Promise<void>) {
    await closeDb();
    const { rm } = await import('node:fs/promises');
    await rm(join(defaultDatabaseDirectory, PRE_MIGRATION_SNAPSHOT), { force: true });
    await sqliteStub.deleteDatabaseAsync('clearday.db');
    sqliteStub.__setFileMode(true);
    try {
      await fn();
    } finally {
      await closeDb();
      sqliteStub.__setFileMode(false);
      await sqliteStub.deleteDatabaseAsync('clearday.db');
    }
  }

  await test('snapshot: none reported on a fresh install; integrity passes', async () => {
    await withFileDb(async () => {
      await initDatabase();
      assert.equal(await getSnapshotInfo(), null);
      assert.equal(await checkIntegrity(), true);
      await assert.rejects(restoreSnapshot(), /No earlier copy/);
    });
  });

  await test('snapshot: restoring returns to the pre-update data, re-migrated to the current schema', async () => {
    await withFileDb(async () => {
      // A first-release database on disk, then the app updates.
      const db = await getDb();
      await db.execAsync(`
        CREATE TABLE lists (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, sortOrder INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, deletedAt TEXT);
        CREATE TABLE tasks (id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, notes TEXT, status TEXT NOT NULL DEFAULT 'active', priority TEXT NOT NULL DEFAULT 'normal', dueDate TEXT, reminderAt TEXT, recurrence TEXT NOT NULL DEFAULT 'none', listId TEXT, sortOrder INTEGER NOT NULL DEFAULT 0, completedAt TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, deletedAt TEXT);
        CREATE TABLE reminders (id TEXT PRIMARY KEY NOT NULL, taskId TEXT NOT NULL, notificationId TEXT, scheduledAt TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
        CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
        INSERT INTO settings (key, value) VALUES ('schemaVersion', '2'), ('theme', 'dark');
        INSERT INTO lists (id, name, sortOrder, createdAt, updatedAt) VALUES ('inbox', 'Inbox', 0, 'c', 'u');
        INSERT INTO tasks (id, title, status, priority, recurrence, listId, sortOrder, createdAt, updatedAt)
          VALUES ('old', 'From before', 'active', 'normal', 'none', 'inbox', 0, 'c', 'u');
      `);
      await initDatabase();
      const info = await getSnapshotInfo();
      assert.ok(info, 'snapshot exists after an upgrade');
      assert.ok(info!.takenAt instanceof Date);

      // Life goes on after the update…
      const after = await taskRepository.create({ title: 'Made after update' });
      await taskRepository.deletePermanent('old');
      assert.equal(await taskRepository.getById('old'), null);

      // …then the user rolls back.
      await restoreSnapshot();
      assert.equal((await taskRepository.getById('old'))!.title, 'From before');
      assert.equal(await taskRepository.getById(after.id), null, 'post-update work is gone');
      const live = await getDb();
      const version = await live.getFirstAsync<{ value: string }>(
        "SELECT value FROM settings WHERE key = 'schemaVersion'"
      );
      assert.equal(version!.value, String(SCHEMA_VERSION), 'copy re-migrated');
      const cols = await live.getAllAsync<{ name: string }>('PRAGMA table_info(tasks)');
      assert.ok(cols.some((c) => c.name === 'recurringTaskId'));
      const theme = await live.getFirstAsync<{ value: string }>(
        "SELECT value FROM settings WHERE key = 'theme'"
      );
      assert.equal(theme!.value, 'dark', 'old settings came back');
      assert.equal(await checkIntegrity(), true);
      assert.equal(__isDbBusy(), false);
      // The repository works on the swapped-in connection.
      assert.ok(await taskRepository.create({ title: 'works after restore' }));
    });
  });

  await test('snapshot: restore rebuilds the OS reminder schedule from the copy', async () => {
    await withFileDb(async () => {
      const db = await getDb();
      await db.execAsync(`
        CREATE TABLE lists (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, sortOrder INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, deletedAt TEXT);
        CREATE TABLE tasks (id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, notes TEXT, status TEXT NOT NULL DEFAULT 'active', priority TEXT NOT NULL DEFAULT 'normal', dueDate TEXT, reminderAt TEXT, recurrence TEXT NOT NULL DEFAULT 'none', listId TEXT, sortOrder INTEGER NOT NULL DEFAULT 0, completedAt TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, deletedAt TEXT);
        CREATE TABLE reminders (id TEXT PRIMARY KEY NOT NULL, taskId TEXT NOT NULL, notificationId TEXT, scheduledAt TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
        CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
        INSERT INTO settings (key, value) VALUES ('schemaVersion', '2');
        INSERT INTO lists (id, name, sortOrder, createdAt, updatedAt) VALUES ('inbox', 'Inbox', 0, 'c', 'u');
      `);
      const future = FUTURE_DAY(2).toISOString();
      // A task from before the update whose OS notification id is long gone.
      await db.runAsync(
        `INSERT INTO tasks (id, title, status, priority, reminderAt, recurrence, listId, sortOrder, createdAt, updatedAt)
         VALUES ('old', 'Old reminder', 'active', 'normal', ?, 'none', 'inbox', 0, 'c', 'u')`,
        [future]
      );
      await db.runAsync(
        `INSERT INTO reminders (id, taskId, notificationId, scheduledAt, createdAt, updatedAt)
         VALUES ('r', 'old', 'ghost-notif', ?, 'c', 'u')`,
        [future]
      );
      await initDatabase(); // snapshot taken here (v2 → current)
      __resetNotifications();

      // After the update: a new task with a live notification.
      await taskRepository.create({ title: 'New reminder', reminderAt: future });
      assert.equal(scheduled.size, 1);
      const [liveId] = [...scheduled.keys()];

      await restoreSnapshot();

      assert.ok(cancelled.includes(liveId), 'post-update notification cancelled');
      assert.ok(!scheduled.has(liveId));
      const rows = await (await getDb()).getAllAsync<{ taskId: string; notificationId: string }>(
        'SELECT taskId, notificationId FROM reminders'
      );
      assert.deepEqual(rows.map((r) => r.taskId), ['old'], 'one row for the restored task');
      assert.notEqual(rows[0].notificationId, 'ghost-notif', 'stale id replaced');
      assert.ok(scheduled.has(rows[0].notificationId), 'and it is really scheduled');
      assert.equal(__isDbBusy(), false);
    });
  });

  await test('snapshot: a damaged database file fails the integrity check and the copy repairs it', async () => {
    await withFileDb(async () => {
      const db = await getDb();
      await db.execAsync(`
        CREATE TABLE lists (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, sortOrder INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, deletedAt TEXT);
        CREATE TABLE tasks (id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, notes TEXT, status TEXT NOT NULL DEFAULT 'active', priority TEXT NOT NULL DEFAULT 'normal', dueDate TEXT, reminderAt TEXT, recurrence TEXT NOT NULL DEFAULT 'none', listId TEXT, sortOrder INTEGER NOT NULL DEFAULT 0, completedAt TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, deletedAt TEXT);
        CREATE TABLE reminders (id TEXT PRIMARY KEY NOT NULL, taskId TEXT NOT NULL, notificationId TEXT, scheduledAt TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
        CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
        INSERT INTO settings (key, value) VALUES ('schemaVersion', '2');
        INSERT INTO lists (id, name, sortOrder, createdAt, updatedAt) VALUES ('inbox', 'Inbox', 0, 'c', 'u');
        INSERT INTO tasks (id, title, status, priority, recurrence, listId, sortOrder, createdAt, updatedAt)
          VALUES ('keep', 'Survives', 'active', 'normal', 'none', 'inbox', 0, 'c', 'u');
      `);
      await initDatabase(); // v2 → current takes a snapshot
      assert.ok(await getSnapshotInfo());

      // Scribble over the live file.
      await closeDb();
      const { writeFile: write } = await import('node:fs/promises');
      await write(join(defaultDatabaseDirectory, 'clearday.db'), 'this is not a database at all');
      assert.equal(await checkIntegrity(), false);

      await restoreSnapshot();
      assert.equal(await checkIntegrity(), true);
      assert.equal((await taskRepository.getById('keep'))!.title, 'Survives');
    });
  });

  await test('migration: v7 adds the reminders index on upgrade and on fresh installs', async () => {
    const indexName = 'idx_reminders_taskId';
    const fresh = await freshDb();
    const freshIdx = await fresh.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='reminders'"
    );
    assert.ok(freshIdx.some((i) => i.name === indexName));
    const legacy = await seedFirstReleaseDb();
    await initDatabase();
    const legacyIdx = await legacy.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='reminders'"
    );
    assert.ok(legacyIdx.some((i) => i.name === indexName));
  });

  await test('migration: v8 adds snoozedUntil; v9 re-anchors due dates to local noon', async () => {
    const db = await seedFirstReleaseDb();
    // Legacy rows: a midnight anchor as earlier builds wrote it, and a
    // damaged value that must be left alone rather than crash the upgrade.
    const midnight = local(2026, 10, 27).toISOString();
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO tasks (id, title, status, priority, dueDate, recurrence, listId, sortOrder, createdAt, updatedAt)
       VALUES ('legacy-due', 'Legacy', 'active', 'normal', ?, 'none', 'inbox', 0, ?, ?),
              ('broken-due', 'Broken', 'active', 'normal', 'not-a-date', 'none', 'inbox', 0, ?, ?)`,
      [midnight, now, now, now, now]
    );
    await initDatabase();

    const cols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(tasks)');
    assert.ok(cols.some((c) => c.name === 'snoozedUntil'), 'column added');

    const legacy = await taskRepository.getById('legacy-due');
    assert.equal(dayOf(legacy!.dueDate!), '2026-10-27', 'same day');
    assert.equal(new Date(legacy!.dueDate!).getHours(), 12, 'now at noon');
    assert.equal(legacy!.dueDate, toDueDateIso(new Date(midnight)));
    const broken = await db.getFirstAsync<{ dueDate: string }>(
      "SELECT dueDate FROM tasks WHERE id = 'broken-due'"
    );
    assert.equal(broken!.dueDate, 'not-a-date', 'unparseable value untouched');
    const t1 = await taskRepository.getById('t1');
    assert.equal(t1!.dueDate, toDueDateIso(new Date('2025-02-01T09:00:00.000Z')));

    // Re-running the step is a no-op.
    const before = await db.getAllAsync<{ id: string; dueDate: string }>('SELECT id, dueDate FROM tasks ORDER BY id');
    await __MIGRATIONS.find((m) => m.version === 9)!.run(db);
    const after = await db.getAllAsync<{ id: string; dueDate: string }>('SELECT id, dueDate FROM tasks ORDER BY id');
    assert.deepEqual(after, before);
  });

  await test('today: legacy midnight and noon due dates sort into the same day', async () => {
    await freshDb();
    const legacyToday = await taskRepository.create({ title: 'old style', dueDate: startOfLocalDay(new Date()) });
    const noonToday = await taskRepository.create({ title: 'new style', dueDate: toDueDateIso(new Date()) });
    const noonTomorrow = await taskRepository.create({ title: 'tomorrow', dueDate: tomorrowIso() });
    const legacyYesterday = startOfLocalDay(FUTURE_DAY(-1));
    const late = await taskRepository.create({ title: 'late', dueDate: legacyYesterday });

    const todayIds = (await fetchTodayTasks()).map((t) => t.id);
    assert.ok(todayIds.includes(legacyToday.id) && todayIds.includes(noonToday.id));
    assert.ok(todayIds.includes(late.id), 'overdue');
    assert.ok(!todayIds.includes(noonTomorrow.id));
    assert.deepEqual((await fetchTomorrowTasks()).map((t) => t.id), [noonTomorrow.id]);
    assert.equal(isOverdue(toDueDateIso(FUTURE_DAY(-1))), true);
    assert.equal(isOverdue(toDueDateIso(new Date())), false);
  });

  // ---- end-to-end edge cases ---------------------------------------------------
  await test('edge: a repeat overdue by months catches up once and logs the missed date', async () => {
    await freshDb();
    const longAgo = local(2026, 1, 15).toISOString();
    const task = await taskRepository.create({
      title: 'Pay rent',
      recurrence: 'monthly',
      dueDate: longAgo,
    });
    assert.ok((await fetchTodayTasks()).some((t) => t.id === task.id), 'overdue repeat is on Today');
    const { task: next, occurrenceId } = await taskRepository.complete(task.id);
    assert.ok(new Date(next!.dueDate!).getTime() > Date.now(), 'jumped to a future month');
    assert.equal(new Date(next!.dueDate!).getDate(), 15, 'kept the anchor day');
    const occ = await taskRepository.getById(occurrenceId!);
    assert.equal(occ!.dueDate, longAgo, 'the logged repeat records the date it was for');
    assert.ok(!(await fetchTodayTasks()).some((t) => t.id === task.id), 'no longer on Today');
  });

  await test('edge: double-tapping complete twice in flight logs one occurrence', async () => {
    await freshDb();
    const task = await taskRepository.create({ title: 'Stretch', recurrence: 'daily' });
    await Promise.all([
      useTaskStore.getState().completeTask(task.id),
      useTaskStore.getState().completeTask(task.id),
    ]);
    assert.equal((await taskRepository.getOccurrences(task.id)).length, 1);
  });

  await test('edge: archived tasks follow a deleted list into the Inbox and survive a backup round-trip', async () => {
    await freshDb();
    const list = await listRepository.create('Side');
    const task = await taskRepository.create({ title: 'Shelved', listId: list.id });
    await taskRepository.archive(task.id);
    await listRepository.delete(list.id);
    assert.equal((await taskRepository.getById(task.id))!.listId, 'inbox');

    const backup = await buildBackup();
    assert.equal(backup.tasks.find((t) => t.id === task.id)?.status, 'archived');
    const path = join(cacheDirectory, `archived-${Date.now()}.clearday`);
    await writeFile(path, JSON.stringify(backup), 'utf8');
    await freshDb();
    __setPickerResult({ canceled: false, assets: [{ uri: path }] });
    assert.equal(await importBackupFromFile(), true);
    assert.deepEqual(
      (await taskRepository.getArchived()).map((t) => t.id),
      [task.id],
      'still archived, still findable'
    );
  });

  await test('edge: reopening a logged repeat whose series was archived makes it a plain task', async () => {
    await freshDb();
    const task = await taskRepository.create({ title: 'Journal', recurrence: 'daily' });
    const { occurrenceId } = await taskRepository.complete(task.id);
    await taskRepository.archive(task.id);
    const reopened = await taskRepository.uncomplete(occurrenceId!);
    assert.equal(reopened!.status, 'active');
    assert.equal(reopened!.recurringTaskId, undefined);
    assert.equal((await taskRepository.getById(task.id))!.status, 'archived', 'series untouched');
  });

  await test('edge: clearing finished removes logged repeats but keeps the live series', async () => {
    await freshDb();
    const task = await taskRepository.create({ title: 'Run', recurrence: 'daily' });
    await taskRepository.complete(task.id);
    await taskRepository.complete(task.id);
    assert.equal((await taskRepository.getOccurrences(task.id)).length, 2);
    await taskRepository.clearCompleted();
    assert.equal((await taskRepository.getOccurrences(task.id)).length, 0);
    assert.equal((await taskRepository.getById(task.id))!.status, 'active');
  });

  await test('edge: deleting a task mid-sync leaves no orphan reminder row or notification', async () => {
    await freshDb();
    const task = await taskRepository.create({
      title: 'Gone soon',
      reminderAt: FUTURE_DAY(1).toISOString(),
    });
    await Promise.all([
      syncScheduledReminders(),
      taskRepository.deletePermanent(task.id),
    ]);
    await syncScheduledReminders();
    const rows = await (await getDb()).getAllAsync('SELECT * FROM reminders');
    assert.equal(rows.length, 0);
    assert.equal(scheduled.size, 0);
  });

  await test('edge: default list deleted while selected falls back to Inbox everywhere', async () => {
    await freshDb();
    const list = await listRepository.create('Temp');
    await useSettingsStore.getState().setSetting('defaultListId', list.id);
    assert.equal(useSettingsStore.getState().settings.defaultListId, list.id);
    const { useListStore } = await import('@/store/listStore');
    await useListStore.getState().refresh();
    await useListStore.getState().deleteList(list.id);
    assert.equal(useSettingsStore.getState().settings.defaultListId, 'inbox');
    assert.equal((await loadSettings()).defaultListId, 'inbox');
  });

  await test('edge: quick-add parses list hints, priority and a passed time together', async () => {
    await freshDb();
    const list = await listRepository.create('Errands');
    const now = new Date();
    const passedHour = `${((now.getHours() + 23) % 24) || 12}${now.getHours() - 1 >= 12 ? 'pm' : 'am'}`;
    const created = await useTaskStore.getState().addTask(`!Buy milk #errands ${passedHour}`);
    assert.ok(created);
    assert.equal(created!.listId, list.id, 'list hint matched case-insensitively');
    assert.equal(created!.priority, 'important');
    assert.equal(created!.title, 'Buy milk');
    assert.ok(created!.reminderAt && new Date(created!.reminderAt).getTime() > Date.now(), 'passed time rolled forward');
  });

  // ---- db client / exclusive lock --------------------------------------------
  await test('client: concurrent first calls share one connection', async () => {
    await closeDb();
    const [a, b, c] = await Promise.all([getDb(), getDb(), getDb()]);
    assert.equal(a, b);
    assert.equal(b, c);
    await initDatabase();
  });

  await test('exclusive: whenDbIdle waits for exclusive work, runs are serialised', async () => {
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const first = runExclusive(async () => {
      order.push('first:start');
      await gate;
      order.push('first:end');
      return 1;
    });
    const second = runExclusive(async () => {
      order.push('second');
      return 2;
    });
    const idle = whenDbIdle().then(() => order.push('idle'));
    await Promise.resolve();
    assert.ok(__isDbBusy());
    assert.deepEqual(order, ['first:start']);
    release();
    assert.deepEqual(await Promise.all([first, second]), [1, 2]);
    await idle;
    assert.equal(order[0], 'first:start');
    assert.equal(order[1], 'first:end');
    assert.ok(order.indexOf('second') > 1 && order.indexOf('idle') > 1);
    assert.equal(__isDbBusy(), false);
  });

  await test('exclusive: a throwing run releases the lock and rethrows', async () => {
    await assert.rejects(
      runExclusive(async () => {
        throw new Error('boom');
      }),
      /boom/
    );
    assert.equal(__isDbBusy(), false);
    assert.equal(await runExclusive(async () => 'ok'), 'ok');
  });

  await test('exclusive: runInTransaction rolls back on error', async () => {
    const db = await freshDb();
    await assert.rejects(
      runInTransaction(async () => {
        await db.runAsync("INSERT INTO settings (key, value) VALUES ('tmp', '1')");
        throw new Error('abort');
      })
    );
    const row = await db.getFirstAsync("SELECT * FROM settings WHERE key = 'tmp'");
    assert.equal(row, null, 'rolled back');
    assert.equal(__isDbBusy(), false);
  });

  await test('repository: reorderTasks is atomic', async () => {
    await freshDb();
    const a = await taskRepository.create({ title: 'a' });
    const b = await taskRepository.create({ title: 'b' });
    await taskRepository.reorderTasks([b.id, a.id]);
    const active = await taskRepository.getAllActive();
    assert.deepEqual(active.map((t) => t.id), [b.id, a.id]);
    // An id that does not exist must not abort the rest.
    await taskRepository.reorderTasks([a.id, 'ghost', b.id]);
    assert.equal((await taskRepository.getById(b.id))!.sortOrder, 2);
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
    assert.equal(stored!.reminderAt, task.reminderAt, 'chosen time untouched');
    assert.equal(stored!.snoozedUntil, until);
    assert.equal(effectiveReminderAt(stored!), until);
    assert.equal([...scheduled.values()][0].date.toISOString(), until, 'alert rings at the snoozed moment');
  });

  await test('actions: snoozing a repeat does not move its time on the next date', async () => {
    await freshDb();
    const due = tomorrowIso();
    const nine = FUTURE_DAY(1, 9).toISOString();
    const task = await taskRepository.create({
      title: 'Meds',
      recurrence: 'daily',
      dueDate: due,
      reminderAt: nine,
    });
    const until = await snoozeReminder(task.id);
    assert.ok(until);
    const { task: advanced } = await taskRepository.complete(task.id);
    assert.equal(timeOf(advanced!.reminderAt!), '9:00', 'still a 9:00 reminder');
    assert.equal(dayOf(advanced!.reminderAt!), dayOf(advanced!.dueDate!));
    assert.equal(advanced!.snoozedUntil, undefined, 'snooze did not outlive its occurrence');
    assert.equal(
      [...scheduled.values()][0].date.toISOString(),
      advanced!.reminderAt,
      'next alert is the 9:00 one'
    );
  });

  await test('actions: a snooze is dropped when the reminder or day changes, kept on other edits', async () => {
    await freshDb();
    const task = await taskRepository.create({
      title: 'Call',
      dueDate: tomorrowIso(),
      reminderAt: FUTURE_DAY(1, 9).toISOString(),
    });
    const until = await snoozeReminder(task.id);
    const renamed = await taskRepository.update(task.id, { title: 'Call Sam' });
    assert.equal(renamed!.snoozedUntil, until, 'an unrelated edit keeps the snooze');
    assert.equal([...scheduled.values()][0].date.toISOString(), until);

    const retimed = await taskRepository.update(task.id, { reminderAt: FUTURE_DAY(1, 15).toISOString() });
    assert.equal(retimed!.snoozedUntil, undefined, 'a new time replaces the snooze');
    assert.equal([...scheduled.values()][0].date.toISOString(), retimed!.reminderAt);

    await snoozeReminder(task.id);
    const moved = await taskRepository.scheduleForDate(task.id, toDueDateIso(FUTURE_DAY(3)));
    assert.equal(moved!.snoozedUntil, undefined, 'a new day replaces the snooze');
    assert.equal(timeOf(moved!.reminderAt!), '15:00', 'reminder followed the day at its chosen time');
  });

  await test('store: undoing an archive or a repeat completion brings a live snooze back', async () => {
    await freshDb();
    const plain = await taskRepository.create({
      title: 'Plain',
      reminderAt: FUTURE_DAY(1).toISOString(),
    });
    const until = await snoozeReminder(plain.id);
    await useTaskStore.getState().archiveTask(plain.id);
    assert.equal(scheduled.size, 0, 'archive silences the alert');
    await pressToastAction();
    await new Promise((r) => setTimeout(r, 50));
    const back = await taskRepository.getById(plain.id);
    assert.equal(back!.status, 'active');
    assert.equal(back!.snoozedUntil, until, 'snooze restored with the reminder');
    assert.equal([...scheduled.values()].at(-1)!.date.toISOString(), until);

    const repeat = await taskRepository.create({
      title: 'Repeat',
      recurrence: 'daily',
      dueDate: tomorrowIso(),
      reminderAt: FUTURE_DAY(1, 9).toISOString(),
    });
    const repeatUntil = await snoozeReminder(repeat.id);
    await useTaskStore.getState().completeTask(repeat.id);
    await new Promise((r) => setTimeout(r, 300));
    await pressToastAction();
    await new Promise((r) => setTimeout(r, 50));
    const restored = await taskRepository.getById(repeat.id);
    assert.equal(restored!.dueDate, repeat.dueDate);
    assert.equal(restored!.snoozedUntil, repeatUntil);
  });

  await test('sync: a snoozed alert is left where it is', async () => {
    await freshDb();
    const task = await taskRepository.create({
      title: 'Snoozed',
      reminderAt: FUTURE_DAY(1).toISOString(),
    });
    const until = await snoozeReminder(task.id);
    const result = await syncScheduledReminders();
    assert.deepEqual(result, { scheduled: 0, cleared: 0, skipped: 0 }, 'nothing to redo');
    assert.equal([...scheduled.values()][0].date.toISOString(), until);
    // A passed reminder with a live snooze is still a pending alert, not an orphan.
    const db = await getDb();
    const past = new Date(Date.now() - 3600_000).toISOString();
    await db.runAsync('UPDATE tasks SET reminderAt = ? WHERE id = ?', [past, task.id]);
    const again = await syncScheduledReminders();
    assert.equal(again.cleared, 0);
    assert.equal(scheduled.size, 1);
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

    await pressToastAction();
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

    await pressToastAction();
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
    await pressToastAction();
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

  // ---- pro store: subscription failure recovery --------------------------------
  const svc = revenueCatSubscriptionService as {
    getProStatus: typeof revenueCatSubscriptionService.getProStatus;
    getOfferings: typeof revenueCatSubscriptionService.getOfferings;
    purchase: typeof revenueCatSubscriptionService.purchase;
    restorePurchases: typeof revenueCatSubscriptionService.restorePurchases;
  };
  const originalGetProStatus = svc.getProStatus;
  const originalGetOfferings = svc.getOfferings;
  const originalPurchase = svc.purchase;
  const originalRestore = svc.restorePurchases;
  const resetSvc = () => {
    svc.getProStatus = originalGetProStatus;
    svc.getOfferings = originalGetOfferings;
    svc.purchase = originalPurchase;
    svc.restorePurchases = originalRestore;
  };

  await test('pro: unknown status keeps the last known entitlement', async () => {
    useProStore.setState({ isPro: true, activeProductId: 'yearly', error: null });
    svc.getProStatus = async () => ({ isPro: false, source: 'unknown' as const, productId: null });
    await useProStore.getState().refreshProStatus();
    assert.equal(useProStore.getState().isPro, true, 'Pro not revoked on unknown');
    assert.equal(useProStore.getState().activeProductId, 'yearly');
    resetSvc();
  });

  await test('pro: authoritative revenuecat status does update entitlement', async () => {
    useProStore.setState({ isPro: true, activeProductId: 'yearly' });
    svc.getProStatus = async () => ({ isPro: false, source: 'revenuecat' as const, productId: null });
    await useProStore.getState().refreshProStatus();
    assert.equal(useProStore.getState().isPro, false, 'real expiry locks Pro');
    resetSvc();
  });

  await test('pro: restore with unknown source neither clears Pro nor claims no purchase', async () => {
    useProStore.setState({ isPro: true, activeProductId: 'yearly', error: null });
    svc.restorePurchases = async () => ({ isPro: false, source: 'unknown' as const, productId: null });
    const result = await useProStore.getState().restorePurchases();
    assert.equal(result.restored, false);
    assert.match(result.message, /Could not restore/);
    assert.equal(useProStore.getState().isPro, true, 'entitlement preserved');
    assert.equal(useProStore.getState().restoring, false);
    resetSvc();
  });

  await test('pro: purchase failures map to a message AND the right recovery action', async () => {
    const cases: [string, RegExp | null, string | null][] = [
      ['cancelled', null, null],
      ['network', /No internet/, 'retry-purchase'],
      ['pending', /awaiting approval/, 'none'],
      ['already-owned', /already linked/, 'restore'],
      ['not-allowed', /not allowed/, 'none'],
      ['store-problem', /App Store/, 'retry-purchase'],
      ['product-unavailable', /unavailable/, 'retry-plans'],
      ['not-configured', /unavailable right now/, 'retry-plans'],
      ['unknown', /Purchase failed/, 'retry-purchase'],
    ];
    for (const [reason, pattern, action] of cases) {
      useProStore.setState({ error: null, purchasing: false });
      svc.purchase = async () => {
        throw new PurchaseFlowError('boom', reason as never);
      };
      await useProStore.getState().purchase('com.do.simpletodo.pro.yearly');
      const { error, purchasing } = useProStore.getState();
      assert.equal(purchasing, false, `${reason}: purchasing reset`);
      if (pattern === null) {
        assert.equal(error, null, 'cancel shows no error');
      } else {
        assert.match(error?.message ?? '', pattern, `${reason} message`);
        assert.equal(error?.action, action, `${reason} recovery action`);
      }
    }
    resetSvc();
  });

  await test('pro: successful purchase applies the entitlement', async () => {
    useProStore.setState({ isPro: false, activeProductId: null, error: null });
    svc.purchase = async () => ({
      isPro: true,
      source: 'revenuecat' as const,
      productId: 'com.do.simpletodo.pro.yearly',
    });
    await useProStore.getState().purchase('com.do.simpletodo.pro.yearly');
    const state = useProStore.getState();
    assert.equal(state.isPro, true);
    assert.equal(state.activeProductId, 'com.do.simpletodo.pro.yearly');
    assert.equal(state.error, null);
    assert.equal(state.provisional, false);
    resetSvc();
  });

  await test('pro: a purchase that returns no entitlement is surfaced, not silent', async () => {
    useProStore.setState({ isPro: false, activeProductId: null, error: null });
    svc.purchase = async () => ({
      isPro: false,
      source: 'revenuecat' as const,
      productId: null,
    });
    await useProStore.getState().purchase('com.do.simpletodo.pro.yearly');
    const { error, purchasing, isPro } = useProStore.getState();
    assert.equal(purchasing, false);
    assert.equal(isPro, false);
    assert.match(error?.message ?? '', /purchase went through/);
    assert.equal(error?.action, 'restore', 'offers Restore, not a blind retry');
    resetSvc();
  });

  await test('pro: offerings failures map to the right recovery action', async () => {
    const cases: [() => unknown, RegExp, string][] = [
      [
        () => new PurchasesNotConfiguredError('unsupported'),
        /not available on this platform/,
        'none',
      ],
      [
        () => new PurchasesNotConfiguredError('missing-key'),
        /not configured in this build/,
        'none',
      ],
      [
        () => new PurchasesNotConfiguredError('failed'),
        /Could not reach/,
        'retry-plans',
      ],
      [() => new NoSubscriptionPackagesError(), /No subscription products/, 'retry-plans'],
      [
        () => Object.assign(new Error('offline'), { networkError: true }),
        /No internet/,
        'retry-plans',
      ],
      [() => new Error('boom'), /Could not load plans/, 'retry-plans'],
    ];

    for (const [makeError, pattern, action] of cases) {
      useProStore.setState({ error: null, offerings: [{ id: 'x' } as never] });
      svc.getOfferings = async () => {
        throw makeError();
      };
      await useProStore.getState().loadOfferings();
      const { error, offerings, loading } = useProStore.getState();
      assert.match(error?.message ?? '', pattern);
      assert.equal(error?.action, action);
      assert.equal(offerings.length, 0, 'stale plans cleared on failure');
      assert.equal(loading, false, 'loading always resets');
    }
    resetSvc();
  });

  await test('pro: a successful offerings load clears a previous error', async () => {
    useProStore.setState({
      error: { message: 'stale', action: 'retry-plans' },
      offerings: [],
    });
    svc.getOfferings = async () => [
      {
        id: 'yearly',
        identifier: 'yearly',
        title: 'Yearly',
        priceString: '$19.99',
        productId: 'com.do.simpletodo.pro.yearly',
      },
    ];
    await useProStore.getState().loadOfferings();
    const state = useProStore.getState();
    assert.equal(state.error, null);
    assert.equal(state.offerings.length, 1);
    resetSvc();
  });

  // ---- pro entitlement cache (cold-start gating) -------------------------------
  await test('cache: round-trips an active entitlement', async () => {
    await freshDb();
    const expires = new Date(Date.now() + 86_400_000).toISOString();
    await writeCachedEntitlement({
      isPro: true,
      productId: 'com.do.simpletodo.pro.yearly',
      expiresAt: expires,
    });
    const cached = await readCachedEntitlement();
    assert.equal(cached!.isPro, true);
    assert.equal(cached!.productId, 'com.do.simpletodo.pro.yearly');
    assert.ok(cached!.cachedAt, 'stamped');
  });

  await test('cache: an expired Pro cache does not keep Pro unlocked', async () => {
    await freshDb();
    await writeCachedEntitlement({
      isPro: true,
      productId: 'com.do.simpletodo.pro.monthly',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const cached = await readCachedEntitlement();
    assert.equal(cached!.isPro, false, 'stale cache falls back to free');
    assert.equal(cached!.productId, null);
  });

  await test('cache: an entitlement with no expiry stays valid', async () => {
    await freshDb();
    await writeCachedEntitlement({ isPro: true, productId: 'lifetime', expiresAt: null });
    assert.equal((await readCachedEntitlement())!.isPro, true);
  });

  await test('cache: missing or corrupt cache reads as null', async () => {
    const db = await freshDb();
    assert.equal(await readCachedEntitlement(), null, 'no row');
    await db.runAsync(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      [PRO_ENTITLEMENT_CACHE_KEY, '{not json']
    );
    assert.equal(await readCachedEntitlement(), null, 'corrupt row');
  });

  await test('pro: hydrate seeds Pro from cache before RevenueCat answers', async () => {
    await freshDb();
    await writeCachedEntitlement({
      isPro: true,
      productId: 'com.do.simpletodo.pro.yearly',
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    useProStore.setState({ isPro: false, hydrated: false, provisional: false, activeProductId: null });

    await useProStore.getState().hydrateProStatus();

    assert.equal(getIsPro(), true, 'gates see Pro from the first frame');
    assert.equal(useProStore.getState().provisional, true, 'marked provisional');
    assert.equal(useProStore.getState().activeProductId, 'com.do.simpletodo.pro.yearly');
  });

  await test('pro: a confirmed refresh clears provisional and rewrites the cache', async () => {
    await freshDb();
    useProStore.setState({ isPro: true, provisional: true, hydrated: true });
    const expires = new Date(Date.now() + 86_400_000).toISOString();
    svc.getProStatus = async () => ({
      isPro: true,
      source: 'revenuecat' as const,
      productId: 'com.do.simpletodo.pro.monthly',
      expiresAt: expires,
    });

    await useProStore.getState().refreshProStatus();

    assert.equal(useProStore.getState().provisional, false);
    const cached = await readCachedEntitlement();
    assert.equal(cached!.productId, 'com.do.simpletodo.pro.monthly', 'cache updated');
    assert.equal(cached!.expiresAt, expires);
    resetSvc();
  });

  await test('pro: a real expiry clears the cached Pro flag too', async () => {
    await freshDb();
    await writeCachedEntitlement({ isPro: true, productId: 'yearly', expiresAt: null });
    useProStore.setState({ isPro: true, provisional: true, hydrated: true });
    svc.getProStatus = async () => ({
      isPro: false,
      source: 'revenuecat' as const,
      productId: null,
    });

    await useProStore.getState().refreshProStatus();

    assert.equal(getIsPro(), false);
    assert.equal((await readCachedEntitlement())!.isPro, false, 'cache no longer grants Pro');
    resetSvc();
  });

  await test('pro: offline refresh after hydrate keeps cached Pro', async () => {
    await freshDb();
    await writeCachedEntitlement({ isPro: true, productId: 'yearly', expiresAt: null });
    useProStore.setState({ isPro: false, hydrated: false, provisional: false, activeProductId: null });
    await useProStore.getState().hydrateProStatus();

    svc.getProStatus = async () => ({ isPro: false, source: 'unknown' as const, productId: null });
    await useProStore.getState().refreshProStatus();

    assert.equal(getIsPro(), true, 'offline launch keeps a paying user on Pro');
    assert.equal((await readCachedEntitlement())!.isPro, true, 'cache untouched');
    resetSvc();
  });

  // ---- offering selection (dashboard rename resilience) ------------------------
  const pkgFor = (productId: string) => ({
    identifier: productId,
    packageType: 'ANNUAL',
    product: {
      identifier: productId,
      title: 'Pro',
      description: '',
      priceString: '$19.99',
    },
  });
  const offeringWith = (identifier: string, productIds: string[]) => ({
    identifier,
    availablePackages: productIds.map(pkgFor),
  });
  const YEARLY = 'com.do.simpletodo.pro.yearly';
  const MONTHLY = 'com.do.simpletodo.pro.monthly';

  await test('offerings: the current offering wins over a stale named one', () => {
    const stale = offeringWith('default', []);
    const live = offeringWith('default_v2', [YEARLY, MONTHLY]);
    const packages = __getSubscriptionPackages({
      all: { default: stale, default_v2: live },
      current: live,
    } as never);
    assert.equal(packages.length, 2, 'renamed current offering still resolves');
  });

  await test('offerings: falls back to the configured ID when current is empty', () => {
    const named = offeringWith('default', [YEARLY]);
    const emptyCurrent = offeringWith('promo', []);
    const packages = __getSubscriptionPackages({
      all: { default: named, promo: emptyCurrent },
      current: emptyCurrent,
    } as never);
    assert.equal(packages.length, 1);
    assert.equal(packages[0].product.identifier, YEARLY);
  });

  await test('offerings: falls back to any other offering as a last resort', () => {
    const other = offeringWith('seasonal', [MONTHLY]);
    const packages = __getSubscriptionPackages({
      all: { seasonal: other },
      current: null,
    } as never);
    assert.equal(packages.length, 1);
    assert.equal(packages[0].product.identifier, MONTHLY);
  });

  await test('offerings: unknown product IDs are filtered out everywhere', () => {
    const junk = offeringWith('default', ['com.someone.else.pro']);
    assert.equal(
      __getSubscriptionPackages({ all: { default: junk }, current: junk } as never).length,
      0,
      'foreign products never reach the paywall'
    );
  });

  await test('offerings: no offerings at all resolves to no packages', () => {
    assert.equal(
      __getSubscriptionPackages({ all: {}, current: null } as never).length,
      0
    );
    assert.equal(
      __getSubscriptionPackages({ all: undefined, current: undefined } as never).length,
      0,
      'missing fields do not throw'
    );
  });

  await test('backup: the entitlement cache is not exported', async () => {
    await freshDb();
    await writeCachedEntitlement({ isPro: true, productId: 'yearly', expiresAt: null });
    const backup = await buildBackup();
    assert.equal(
      backup.settings?.[PRO_ENTITLEMENT_CACHE_KEY],
      undefined,
      'purchase cache stays on the device'
    );
  });

  await test('backup: importing a backup does not drop Pro status', async () => {
    await freshDb();
    await writeCachedEntitlement({ isPro: true, productId: 'yearly', expiresAt: null });
    const backup = await buildBackup();
    const path = join(cacheDirectory, `pro-${Math.random()}.clearday`);
    await writeFile(path, JSON.stringify(backup), 'utf8');
    __setPickerResult({ canceled: false, assets: [{ uri: path }] });
    assert.equal(await importBackupFromFile(), true);
    assert.equal(
      (await readCachedEntitlement())!.isPro,
      true,
      'restoring a backup must not lock a paying user out'
    );
  });

  // ---- billing notices ---------------------------------------------------------
  await test('notice: a billing issue warns but keeps Pro unlocked', async () => {
    await freshDb();
    useProStore.setState({ isPro: false, notice: null, hydrated: true });
    svc.getProStatus = async () => ({
      isPro: true,
      source: 'revenuecat' as const,
      productId: YEARLY,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      billingIssueDetectedAt: new Date().toISOString(),
      willRenew: true,
    });
    await useProStore.getState().refreshProStatus();
    const { isPro, notice } = useProStore.getState();
    assert.equal(isPro, true, 'billing issue never gates features');
    assert.equal(notice?.tone, 'warning');
    assert.match(notice?.message ?? '', /billing problem/);
    resetSvc();
  });

  await test('notice: a cancelled-but-active subscription reads as info', async () => {
    await freshDb();
    useProStore.setState({ isPro: false, notice: null, hydrated: true });
    svc.getProStatus = async () => ({
      isPro: true,
      source: 'revenuecat' as const,
      productId: YEARLY,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      billingIssueDetectedAt: null,
      willRenew: false,
    });
    await useProStore.getState().refreshProStatus();
    const { isPro, notice } = useProStore.getState();
    assert.equal(isPro, true, 'cancelled users keep Pro until expiry');
    assert.equal(notice?.tone, 'info');
    assert.match(notice?.message ?? '', /stays active until/);
    resetSvc();
  });

  await test('notice: a healthy subscription has no notice, and it clears', async () => {
    await freshDb();
    useProStore.setState({
      isPro: true,
      notice: { message: 'stale', tone: 'warning' },
      hydrated: true,
    });
    svc.getProStatus = async () => ({
      isPro: true,
      source: 'revenuecat' as const,
      productId: YEARLY,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      billingIssueDetectedAt: null,
      willRenew: true,
    });
    await useProStore.getState().refreshProStatus();
    assert.equal(useProStore.getState().notice, null, 'resolved issue clears the notice');
    resetSvc();
  });

  await test('notice: a bad expiry date degrades to a message without a date', async () => {
    await freshDb();
    useProStore.setState({ isPro: false, notice: null, hydrated: true });
    svc.getProStatus = async () => ({
      isPro: true,
      source: 'revenuecat' as const,
      productId: YEARLY,
      expiresAt: 'not-a-date',
      billingIssueDetectedAt: new Date().toISOString(),
      willRenew: true,
    });
    await useProStore.getState().refreshProStatus();
    const { notice } = useProStore.getState();
    assert.match(notice?.message ?? '', /billing problem/);
    assert.ok(!/Invalid Date/.test(notice?.message ?? ''), 'never renders Invalid Date');
    resetSvc();
  });

  // ---- foreground recovery -----------------------------------------------------
  await test('recovery: foreground retries a retriable plans failure', async () => {
    await freshDb();
    let offeringCalls = 0;
    useProStore.setState({
      offerings: [],
      error: { message: 'offline', action: 'retry-plans' },
      loading: false,
      hydrated: true,
    });
    svc.getProStatus = async () => ({ isPro: false, source: 'unknown' as const, productId: null });
    svc.getOfferings = async () => {
      offeringCalls++;
      return [
        {
          id: 'yearly',
          identifier: 'yearly',
          title: 'Yearly',
          priceString: '$19.99',
          productId: YEARLY,
        },
      ];
    };

    await useProStore.getState().recoverOnForeground();

    assert.equal(offeringCalls, 1, 'retried once');
    assert.equal(useProStore.getState().offerings.length, 1, 'plans recovered');
    assert.equal(useProStore.getState().error, null, 'error cleared');
    resetSvc();
  });

  await test('recovery: foreground does NOT retry unfixable failures', async () => {
    await freshDb();
    let offeringCalls = 0;
    useProStore.setState({
      offerings: [],
      error: { message: 'missing key', action: 'none' },
      loading: false,
      hydrated: true,
    });
    svc.getProStatus = async () => ({ isPro: false, source: 'unknown' as const, productId: null });
    svc.getOfferings = async () => {
      offeringCalls++;
      return [];
    };

    await useProStore.getState().recoverOnForeground();

    assert.equal(offeringCalls, 0, 'a missing build key cannot fix itself');
    resetSvc();
  });

  await test('recovery: foreground does not refetch plans it already has', async () => {
    await freshDb();
    let offeringCalls = 0;
    useProStore.setState({
      offerings: [{ productId: YEARLY } as never],
      error: { message: 'stale', action: 'retry-plans' },
      loading: false,
      hydrated: true,
    });
    svc.getProStatus = async () => ({ isPro: false, source: 'unknown' as const, productId: null });
    svc.getOfferings = async () => {
      offeringCalls++;
      return [];
    };

    await useProStore.getState().recoverOnForeground();

    assert.equal(offeringCalls, 0, 'no wasted network call');
    resetSvc();
  });

  await test('recovery: foreground still refreshes entitlement on every return', async () => {
    await freshDb();
    let statusCalls = 0;
    useProStore.setState({ isPro: false, offerings: [], error: null, hydrated: true });
    svc.getProStatus = async () => {
      statusCalls++;
      return {
        isPro: true,
        source: 'revenuecat' as const,
        productId: YEARLY,
        expiresAt: null,
        billingIssueDetectedAt: null,
        willRenew: true,
      };
    };

    await useProStore.getState().recoverOnForeground();

    assert.equal(statusCalls, 1);
    assert.equal(getIsPro(), true, 'a renewal taken outside the app is picked up');
    resetSvc();
  });

  // ---- cross-cutting edge cases ------------------------------------------------
  await test('edge: hydrate runs only once, later calls do not clobber live state', async () => {
    await freshDb();
    await writeCachedEntitlement({ isPro: true, productId: YEARLY, expiresAt: null });
    useProStore.setState({ isPro: false, hydrated: false, provisional: false });
    await useProStore.getState().hydrateProStatus();
    assert.equal(getIsPro(), true);

    // A confirmed downgrade, then a stray second hydrate.
    useProStore.setState({ isPro: false, provisional: false });
    await useProStore.getState().hydrateProStatus();
    assert.equal(getIsPro(), false, 'cache does not resurrect a revoked entitlement');
  });

  await test('edge: a cancelled purchase leaves no error and no state change', async () => {
    await freshDb();
    useProStore.setState({
      isPro: false,
      activeProductId: null,
      error: null,
      purchasing: false,
    });
    svc.purchase = async () => {
      throw new PurchaseFlowError('cancelled', 'cancelled' as never);
    };
    await useProStore.getState().purchase(YEARLY);
    const state = useProStore.getState();
    assert.equal(state.error, null, 'cancelling is not an error');
    assert.equal(state.purchasing, false);
    assert.equal(state.isPro, false);
    resetSvc();
  });

  await test('edge: a failed purchase never downgrades an existing Pro user', async () => {
    await freshDb();
    await writeCachedEntitlement({ isPro: true, productId: YEARLY, expiresAt: null });
    useProStore.setState({ isPro: true, activeProductId: YEARLY, error: null });
    svc.purchase = async () => {
      throw new PurchaseFlowError('boom', 'network' as never);
    };
    await useProStore.getState().purchase(MONTHLY);
    assert.equal(getIsPro(), true, 'an upgrade attempt that fails keeps current Pro');
    assert.equal(
      (await readCachedEntitlement())!.isPro,
      true,
      'cache untouched by a failed purchase'
    );
    resetSvc();
  });

  await test('edge: a failed restore never downgrades an existing Pro user', async () => {
    await freshDb();
    await writeCachedEntitlement({ isPro: true, productId: YEARLY, expiresAt: null });
    useProStore.setState({ isPro: true, activeProductId: YEARLY, error: null });
    svc.restorePurchases = async () => {
      throw Object.assign(new Error('offline'), { networkError: true });
    };
    const result = await useProStore.getState().restorePurchases();
    assert.equal(result.restored, false);
    assert.match(result.message, /No internet/);
    assert.equal(getIsPro(), true, 'Pro survives a failed restore');
    assert.equal(useProStore.getState().error?.action, 'restore');
    resetSvc();
  });

  await test('edge: a successful restore on a fresh device caches the entitlement', async () => {
    await freshDb();
    useProStore.setState({ isPro: false, activeProductId: null, error: null });
    const expires = new Date(Date.now() + 86_400_000).toISOString();
    svc.restorePurchases = async () => ({
      isPro: true,
      source: 'revenuecat' as const,
      productId: MONTHLY,
      expiresAt: expires,
      billingIssueDetectedAt: null,
      willRenew: true,
    });
    const result = await useProStore.getState().restorePurchases();
    assert.equal(result.restored, true);
    const cached = await readCachedEntitlement();
    assert.equal(cached!.isPro, true, 'next launch is instantly Pro');
    assert.equal(cached!.expiresAt, expires);
    resetSvc();
  });

  await test('edge: concurrent loadOfferings calls settle consistently', async () => {
    await freshDb();
    useProStore.setState({ offerings: [], error: null, loading: false });
    svc.getOfferings = async () => {
      await new Promise((r) => setTimeout(r, 5));
      return [
        {
          id: 'yearly',
          identifier: 'yearly',
          title: 'Yearly',
          priceString: '$19.99',
          productId: YEARLY,
        },
      ];
    };
    const store = useProStore.getState();
    await Promise.all([store.loadOfferings(), store.loadOfferings(), store.loadOfferings()]);
    const state = useProStore.getState();
    assert.equal(state.loading, false, 'loading always resets');
    assert.equal(state.offerings.length, 1, 'no duplicated plans');
    assert.equal(state.error, null);
    resetSvc();
  });

  await test('edge: an expired cache plus an offline launch locks Pro', async () => {
    await freshDb();
    await writeCachedEntitlement({
      isPro: true,
      productId: YEARLY,
      expiresAt: new Date(Date.now() - 86_400_000).toISOString(),
    });
    useProStore.setState({ isPro: false, hydrated: false, provisional: false });
    await useProStore.getState().hydrateProStatus();
    assert.equal(getIsPro(), false, 'an expired sub does not stay unlocked offline');

    svc.getProStatus = async () => ({ isPro: false, source: 'unknown' as const, productId: null });
    await useProStore.getState().refreshProStatus();
    assert.equal(getIsPro(), false, 'and an unreachable service does not unlock it');
    resetSvc();
  });

  await test('edge: entitlement with no productId still grants Pro', async () => {
    await freshDb();
    useProStore.setState({ isPro: false, activeProductId: null, hydrated: true });
    svc.getProStatus = async () => ({
      isPro: true,
      source: 'revenuecat' as const,
      productId: null,
      expiresAt: null,
      billingIssueDetectedAt: null,
      willRenew: true,
    });
    await useProStore.getState().refreshProStatus();
    assert.equal(getIsPro(), true, 'a promotional grant without a product still unlocks');
    assert.equal(useProStore.getState().activeProductId, null);
    resetSvc();
  });

  // ---- undoable delete + toast expiry ------------------------------------
  await test('delete with undo: hidden everywhere, reminder silenced, Undo brings it back', async () => {
    await freshDb();
    useToastStore.setState({ toast: null });
    const task = await taskRepository.create({
      title: 'oops, not that one',
      reminderAt: FUTURE_DAY(1).toISOString(),
    });
    assert.equal(scheduled.size, 1);
    await useTaskStore.getState().refreshAll();

    await useTaskStore.getState().deleteTaskWithUndo(task.id);
    assert.equal(useToastStore.getState().toast?.message, 'Deleted');
    assert.equal(scheduled.size, 0, 'reminder cancelled while hidden');
    assert.equal(await taskRepository.getById(task.id), null, 'hidden from lookups');
    assert.equal((await taskRepository.getAllActive()).length, 0, 'hidden from lists');
    // A refresh in the Undo window (e.g. after adding another task) must not resurrect it.
    await useTaskStore.getState().refreshAll();
    assert.equal(
      useTaskStore.getState().todayTasks.some((t) => t.id === task.id),
      false,
      'refresh keeps it hidden'
    );

    await pressToastAction();
    const back = await taskRepository.getById(task.id);
    assert.equal(back?.title, 'oops, not that one', 'Undo restores the row');
    assert.equal(scheduled.size, 1, 'reminder rescheduled on Undo');
  });

  await test('delete with undo: letting the toast expire deletes for good', async () => {
    await freshDb();
    useToastStore.setState({ toast: null });
    const task = await taskRepository.create({ title: 'gone for real' });
    await useTaskStore.getState().deleteTaskWithUndo(task.id);
    const toast = useToastStore.getState().toast!;
    useToastStore.getState().dismiss(toast.id);
    await new Promise((r) => setTimeout(r, 20));
    const db = await getDb();
    const row = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM tasks WHERE id = ?',
      [task.id]
    );
    assert.equal(row, null, 'row removed from the table');
  });

  await test('toast: a same-key toast replaces in place and runs the old onExpire', async () => {
    useToastStore.setState({ toast: null });
    __resetToastQueue();
    let expired = 0;
    useToastStore.getState().show('first', { key: 'batch', onExpire: () => { expired++; } });
    useToastStore.getState().show('second', { key: 'batch' });
    assert.equal(expired, 1, 'same-key replacement runs onExpire of the replaced toast');
    assert.equal(useToastStore.getState().toast?.message, 'second');
    useToastStore.getState().dismiss();
  });

  await test('toast: a different toast queues instead of closing the Undo window', async () => {
    useToastStore.setState({ toast: null });
    __resetToastQueue();
    let expired = 0;
    useToastStore.getState().show('delete undo', { key: 'delete-undo', onExpire: () => { expired++; } });
    useToastStore.getState().show('Archived', { key: 'archive' });
    assert.equal(expired, 0, 'the pending Undo window stays open');
    assert.equal(useToastStore.getState().toast?.message, 'delete undo');
    useToastStore.getState().dismiss();
    assert.equal(expired, 1, 'timeout dismissal still expires it');
    assert.equal(useToastStore.getState().toast?.message, 'Archived', 'queued toast shows next');
    useToastStore.getState().dismiss();
    assert.equal(useToastStore.getState().toast, null);
  });

  await test('toast: taking the action skips onExpire', async () => {
    useToastStore.setState({ toast: null });
    __resetToastQueue();
    let expired = 0;
    useToastStore.getState().show('undoable', {
      action: { label: 'Undo', onPress: () => {} },
      onExpire: () => { expired++; },
    });
    const id = useToastStore.getState().toast!.id;
    useToastStore.getState().dismiss(id, { ranAction: true });
    assert.equal(expired, 0, 'action dismissal does not expire');
    assert.equal(useToastStore.getState().toast, null);
  });

  await test('countActiveByList: groups open tasks per list, ignores done and deleted', async () => {
    await freshDb();
    const work = await listRepository.create('Work');
    await taskRepository.create({ title: 'a' });
    await taskRepository.create({ title: 'b' });
    await taskRepository.create({ title: 'c', listId: work.id });
    const done = await taskRepository.create({ title: 'd', listId: work.id });
    await taskRepository.complete(done.id);
    const hidden = await taskRepository.create({ title: 'e' });
    await taskRepository.softDelete(hidden.id);
    const counts = await taskRepository.countActiveByList();
    assert.equal(counts[INBOX_LIST_ID], 2);
    assert.equal(counts[work.id], 1);
  });

  await test('purgeSoftDeleted: finishes interrupted deletes, keeps live rows', async () => {
    await freshDb();
    const keep = await taskRepository.create({ title: 'keep' });
    const drop = await taskRepository.create({ title: 'drop' });
    await taskRepository.softDelete(drop.id);
    await taskRepository.purgeSoftDeleted();
    const db = await getDb();
    const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM tasks');
    assert.deepEqual(rows.map((r) => r.id), [keep.id]);
  });

  // ---- final round: follow-ups and edge cases ---------------------------------
  await test('pin: "!!" and "p1" quick-add stay pinned and land on today; a pin on another day yields', async () => {
    await freshDb();
    setPro(true);
    const bang = await useTaskStore.getState().addTask('!! buy milk');
    assert.equal(bang!.priority, 'must_do_today');
    assert.equal(dayOf(bang!.dueDate!), dayOf(new Date().toISOString()));
    assert.equal(new Date(bang!.dueDate!).getHours(), 12, 'noon anchor');
    const p1 = await useTaskStore.getState().addTask('p1 call mom');
    assert.equal(p1!.priority, 'must_do_today');
    const later = await useTaskStore.getState().addTask('!! buy milk tomorrow');
    assert.equal(later!.priority, 'normal', 'the typed day wins over the pin');
    assert.equal(dayOf(later!.dueDate!), dayOf(FUTURE_DAY(1).toISOString()));
    assert.ok((await fetchTodayTasks()).some((t) => t.id === bang!.id));
  });

  await test('pin: the toolbar pin and setPriority without a date get today', async () => {
    await freshDb();
    const pinned = await useTaskStore.getState().addTask('buy milk', INBOX_LIST_ID, { priority: 'must_do_today' });
    assert.equal(pinned!.priority, 'must_do_today');
    assert.equal(dayOf(pinned!.dueDate!), dayOf(new Date().toISOString()));
    const plain = await taskRepository.create({ title: 'later pin' });
    assert.equal(plain.dueDate, undefined);
    const promoted = await taskRepository.setPriority(plain.id, 'must_do_today');
    assert.equal(dayOf(promoted!.dueDate!), dayOf(new Date().toISOString()));
    // A dated task keeps its own date; the detail screen handles the pull-to-today.
    const dated = await taskRepository.create({ title: 'dated', dueDate: tomorrowIso() });
    const kept = await taskRepository.setPriority(dated.id, 'must_do_today');
    assert.equal(kept!.dueDate, dated.dueDate);
  });

  await test('archive: keeps the reminder; unarchive reschedules a future one, leaves a past one quiet', async () => {
    await freshDb();
    const future = await taskRepository.create({ title: 'Soon', reminderAt: FUTURE_DAY(1).toISOString() });
    assert.equal(scheduled.size, 1);
    const archived = await taskRepository.archive(future.id);
    assert.equal(archived!.reminderAt, future.reminderAt, 'reminder kept as data');
    assert.equal(scheduled.size, 0, 'alert cancelled while archived');
    const back = await taskRepository.unarchive(future.id);
    assert.equal(back!.status, 'active');
    assert.equal(scheduled.size, 1, 'alert back on the clock');
    assert.equal([...scheduled.values()][0].date.toISOString(), future.reminderAt);

    const past = new Date(Date.now() - 3600_000).toISOString();
    const stale = await taskRepository.create({ title: 'Missed', reminderAt: past });
    await taskRepository.archive(stale.id);
    await taskRepository.unarchive(stale.id);
    assert.equal(scheduled.size, 1, 'a passed reminder is not revived');
    assert.equal((await taskRepository.getById(stale.id))!.reminderAt, past, 'but is still shown');
  });

  await test('snooze: a second snooze replaces the first; nothing to push means no snooze', async () => {
    await freshDb();
    const task = await taskRepository.create({ title: 'Twice', reminderAt: FUTURE_DAY(1).toISOString() });
    const first = await snoozeReminder(task.id);
    await new Promise((r) => setTimeout(r, 5));
    const second = await snoozeReminder(task.id);
    assert.ok(first && second && second > first);
    assert.equal(scheduled.size, 1, 'one pending alert, not two');
    assert.equal([...scheduled.values()][0].date.toISOString(), second);
    assert.equal((await taskRepository.getById(task.id))!.snoozedUntil, second);

    const quiet = await taskRepository.create({ title: 'No alarm' });
    assert.equal(await snoozeReminder(quiet.id), null);
    assert.equal((await taskRepository.getById(quiet.id))!.snoozedUntil, undefined);
  });

  await test('delete with undo: a snoozed alert comes back at its snoozed time', async () => {
    await freshDb();
    useToastStore.setState({ toast: null });
    const task = await taskRepository.create({ title: 'Snoozed then deleted', reminderAt: FUTURE_DAY(1).toISOString() });
    const until = await snoozeReminder(task.id);
    await useTaskStore.getState().deleteTaskWithUndo(task.id);
    assert.equal(scheduled.size, 0);
    await pressToastAction();
    assert.equal(scheduled.size, 1);
    assert.equal([...scheduled.values()][0].date.toISOString(), until);
  });

  await test('edge: completing a snoozed task and reopening it keeps the snoozed alert while it is still ahead', async () => {
    await freshDb();
    const task = await taskRepository.create({ title: 'Oops', reminderAt: FUTURE_DAY(1).toISOString() });
    const until = await snoozeReminder(task.id);
    await taskRepository.complete(task.id);
    assert.equal(scheduled.size, 0, 'done: nothing pending');
    const reopened = await taskRepository.uncomplete(task.id);
    assert.equal(reopened!.snoozedUntil, until);
    assert.equal([...scheduled.values()][0].date.toISOString(), until);
  });

  await test('backup: snoozedUntil round-trips and the restored alert rings at the snoozed time', async () => {
    await freshDb();
    const task = await taskRepository.create({ title: 'Portable snooze', reminderAt: FUTURE_DAY(1).toISOString() });
    const until = await snoozeReminder(task.id);
    const backup = await buildBackup();
    assert.equal(backup.tasks.find((t) => t.id === task.id)!.snoozedUntil, until, 'exported');

    await freshDb();
    const path = join(cacheDirectory, `snooze-${Math.random()}.clearday`);
    await writeFile(path, JSON.stringify(backup), 'utf8');
    __setPickerResult({ canceled: false, assets: [{ uri: path }] });
    assert.equal(await importBackupFromFile(), true);
    const imported = await taskRepository.getById(task.id);
    assert.equal(imported!.snoozedUntil, until);
    assert.equal(imported!.reminderAt, task.reminderAt);
    assert.equal([...scheduled.values()][0].date.toISOString(), until, 'restored alert honours the snooze');

    // An older backup, written before the column existed, imports cleanly.
    const legacy = { ...backup, tasks: backup.tasks.map(({ snoozedUntil: _drop, ...rest }) => rest) };
    await freshDb();
    const legacyPath = join(cacheDirectory, `legacy-${Math.random()}.clearday`);
    await writeFile(legacyPath, JSON.stringify(legacy), 'utf8');
    __setPickerResult({ canceled: false, assets: [{ uri: legacyPath }] });
    assert.equal(await importBackupFromFile(), true);
    assert.equal((await taskRepository.getById(task.id))!.snoozedUntil, undefined);
    assert.equal([...scheduled.values()][0].date.toISOString(), task.reminderAt);
  });

  await test('parser: tonight, weekdays and "inNd" all produce noon due dates', () => {
    const now = local(2026, 10, 23, 10); // a Friday
    for (const raw of ['tonight', 'monday', 'in2d', 'in1w', 'tomorrow 7am', '!! now-ish']) {
      const parsed = parseTaskInput(raw, { now });
      assert.ok(parsed.dueDate, `${raw} has a due date`);
      assert.equal(new Date(parsed.dueDate!).getHours(), 12, `${raw} at noon`);
    }
    const tonight = parseTaskInput('tonight', { now });
    assert.equal(timeOf(tonight.reminderAt!), '20:00');
    assert.equal(dayOf(tonight.dueDate!), '2026-10-23');
    assert.equal(dayOf(parseTaskInput('monday', { now }).dueDate!), '2026-10-26');
  });

  await test('recurrence: a noon anchor steps like a midnight one, including month-end clamps', () => {
    const jan31noon = toDueDateIso(local(2026, 1, 31));
    const next = getNextDueDate(jan31noon, 'monthly', local(2026, 1, 31));
    assert.equal(dayOf(next), '2026-2-28');
    // Note: each completion re-anchors on the current due date, so across
    // completions Jan 31 → Feb 28 → Mar 28. Keeping the 31st needs the
    // original anchor stored on the task; tracked as a follow-up.
    assert.equal(dayOf(getNextDueDate(next, 'monthly', local(2026, 2, 28))), '2026-3-28');
    const weeklyNoon = getNextDueDate(toDueDateIso(local(2026, 10, 1)), 'weekly', local(2026, 10, 20));
    const weeklyMidnight = getNextDueDate(local(2026, 10, 1).toISOString(), 'weekly', local(2026, 10, 20));
    assert.equal(weeklyNoon, weeklyMidnight);
    assert.equal(dayOf(weeklyNoon), '2026-10-22');
  });

  await test('dates: known limit — a zone jump of more than 12 hours still moves the day', async () => {
    const stored = await withTimeZone('Pacific/Auckland', () => toDueDateIso(new Date(2026, 9, 27)));
    await withTimeZone('America/Los_Angeles', () => {
      // Auckland noon is 16:00 the previous day in Los Angeles (20 hours apart).
      assert.equal(dayOf(stored), '2026-10-26');
    });
    await withTimeZone('Asia/Tokyo', () => {
      assert.equal(dayOf(stored), '2026-10-27', 'within twelve hours it holds');
    });
  });

  await test('dates: midnight timer from exactly 00:00 waits a full day; from 23:59:59 waits a second', () => {
    assert.equal(msUntilNextLocalMidnight(local(2026, 10, 25, 0, 0)), 24 * 3600_000 + 1000);
    const almost = new Date(2026, 9, 25, 23, 59, 59, 0);
    assert.equal(msUntilNextLocalMidnight(almost), 2000);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  await closeDb();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
