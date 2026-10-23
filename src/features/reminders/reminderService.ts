import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import { getDb } from '@/db/client';
import { mapRowToTask } from '@/features/tasks/taskMapper';
import type { Task } from '@/types/task';
import { createId } from '@/utils/id';
import { nowIso } from '@/utils/dates';

type NotificationsModule = typeof import('expo-notifications');

let notificationsModule: NotificationsModule | null | undefined;
let channelReady = false;
let handlerConfigured = false;
let categoryReady = false;

/** Notification category carrying the quick actions. */
export const REMINDER_CATEGORY = 'clearday-reminder';
export const REMINDER_ACTION_COMPLETE = 'complete';
export const REMINDER_ACTION_SNOOZE = 'snooze';
/** How far "Snooze" pushes a reminder out. */
export const SNOOZE_MINUTES = 60;

export type ReminderAction = 'open' | 'complete' | 'snooze';

/** Local notifications are not available in Expo Go on Android (SDK 53+). */
export function areLocalNotificationsSupported(): boolean {
  if (Platform.OS === 'web') return false;
  if (
    Platform.OS === 'android' &&
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
  ) {
    return false;
  }
  return true;
}

async function loadNotifications(): Promise<NotificationsModule | null> {
  if (!areLocalNotificationsSupported()) {
    notificationsModule = null;
    return null;
  }

  if (notificationsModule !== undefined) {
    return notificationsModule;
  }

  try {
    const Notifications = await import('expo-notifications');
    notificationsModule = Notifications;

    if (!handlerConfigured) {
      try {
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });
        handlerConfigured = true;
      } catch {
        // ignore
      }
    }

    return Notifications;
  } catch {
    notificationsModule = null;
    return null;
  }
}

async function ensureAndroidChannel(
  Notifications: NotificationsModule
): Promise<void> {
  if (channelReady || Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('clearday-reminders', {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.HIGH,
    });
    channelReady = true;
  } catch {
    // ignore
  }
}

export type ReminderPermissionStatus =
  | 'granted'
  | 'denied'
  | 'undetermined'
  | 'unsupported';

/** Current OS permission without prompting the user. */
export async function getReminderPermissionStatus(): Promise<ReminderPermissionStatus> {
  const Notifications = await loadNotifications();
  if (!Notifications) return 'unsupported';
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return 'granted';
    if (status === 'denied') return 'denied';
    return 'undetermined';
  } catch {
    return 'denied';
  }
}

/**
 * Registers the Complete / Snooze buttons. The most common action comes
 * first, since some devices surface only the leading action.
 */
async function ensureCategory(Notifications: NotificationsModule): Promise<void> {
  if (categoryReady) return;
  try {
    await Notifications.setNotificationCategoryAsync(REMINDER_CATEGORY, [
      {
        identifier: REMINDER_ACTION_COMPLETE,
        buttonTitle: 'Complete',
        options: { opensAppToForeground: false },
      },
      {
        identifier: REMINDER_ACTION_SNOOZE,
        buttonTitle: 'Snooze 1 Hour',
        options: { opensAppToForeground: false },
      },
    ]);
    categoryReady = true;
  } catch {
    // ignore
  }
}

export async function requestReminderPermission(): Promise<boolean> {
  const Notifications = await loadNotifications();
  if (!Notifications) return false;

  try {
    await ensureAndroidChannel(Notifications);
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

interface ScheduleOptions {
  /** Skip the OS prompt; only schedule when permission is already granted. */
  silent?: boolean;
}

export async function scheduleReminderForTask(
  task: Task,
  options: ScheduleOptions = {}
): Promise<void> {
  if (!task.reminderAt || task.status !== 'active') return;

  const Notifications = await loadNotifications();
  if (!Notifications) return;

  try {
    const granted = options.silent
      ? (await getReminderPermissionStatus()) === 'granted'
      : await requestReminderPermission();
    if (!granted) return;

    await cancelReminderForTask(task.id);

    const triggerDate = new Date(task.reminderAt);
    if (triggerDate.getTime() <= Date.now()) return;

    await ensureCategory(Notifications);

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Do!',
        body: task.title,
        data: { taskId: task.id },
        categoryIdentifier: REMINDER_CATEGORY,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
        channelId:
          Platform.OS === 'android' ? 'clearday-reminders' : undefined,
      },
    });

    const db = await getDb();
    const now = nowIso();
    const reminderId = createId();
    await db.runAsync(
      'INSERT INTO reminders (id, taskId, notificationId, scheduledAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
      [reminderId, task.id, notificationId, task.reminderAt, now, now]
    );
  } catch {
    // graceful failure (Expo Go, denied permission, etc.)
  }
}

export async function cancelReminderForTask(taskId: string): Promise<void> {
  const db = await getDb();

  try {
    const rows = await db.getAllAsync<{ notificationId: string | null }>(
      'SELECT notificationId FROM reminders WHERE taskId = ?',
      [taskId]
    );

    const Notifications = await loadNotifications();
    if (Notifications) {
      for (const row of rows) {
        if (row.notificationId) {
          try {
            await Notifications.cancelScheduledNotificationAsync(
              row.notificationId
            );
          } catch {
            // ignore
          }
        }
      }
    }

    await db.runAsync('DELETE FROM reminders WHERE taskId = ?', [taskId]);
  } catch {
    // ignore
  }
}

/** Cancels already-scheduled OS notifications by id (e.g. after a backup restore replaced the reminders table). */
export async function cancelScheduledNotifications(
  notificationIds: string[]
): Promise<void> {
  if (notificationIds.length === 0) return;
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  for (const notificationId of notificationIds) {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch {
      // ignore
    }
  }
}

export async function initReminders(): Promise<void> {
  const Notifications = await loadNotifications();
  if (Notifications) {
    await ensureAndroidChannel(Notifications);
    await ensureCategory(Notifications);
  }
}

/**
 * Reconciles the OS schedule with the database. Runs on launch and when the
 * app returns to the foreground. Schedules active tasks whose future reminder
 * has no notification yet (e.g. permission granted later in OS settings) and
 * drops reminder rows for tasks that no longer need one. Never prompts.
 */
/**
 * iOS keeps at most 64 pending local notifications and silently drops the
 * rest, so the sync pass schedules the soonest ones first and stops short of
 * the limit. Reminders beyond it are picked up by a later sync, once nearer
 * ones have fired.
 */
const MAX_PENDING_NOTIFICATIONS = 60;

export async function syncScheduledReminders(): Promise<{
  scheduled: number;
  cleared: number;
  skipped: number;
}> {
  const result = { scheduled: 0, cleared: 0, skipped: 0 };
  if (!areLocalNotificationsSupported()) return result;

  const db = await getDb();
  try {
    const nowMs = Date.now();
    const tasks = (
      await db.getAllAsync<Record<string, unknown>>(
        `SELECT * FROM tasks WHERE deletedAt IS NULL AND reminderAt IS NOT NULL`
      )
    ).map(mapRowToTask);
    const reminderRows = await db.getAllAsync<{
      taskId: string;
      notificationId: string | null;
      scheduledAt: string;
    }>('SELECT taskId, notificationId, scheduledAt FROM reminders');
    const byTask = new Map(reminderRows.map((row) => [row.taskId, row]));
    const activeTaskIds = new Set<string>();

    const granted = (await getReminderPermissionStatus()) === 'granted';

    const due = tasks
      .filter(
        (task) =>
          task.status === 'active' &&
          new Date(task.reminderAt!).getTime() > nowMs
      )
      .sort(
        (a, b) =>
          new Date(a.reminderAt!).getTime() - new Date(b.reminderAt!).getTime()
      );

    let pending = 0;
    for (const task of due) {
      activeTaskIds.add(task.id);
      if (!granted) continue;
      if (pending >= MAX_PENDING_NOTIFICATIONS) {
        result.skipped += 1;
        continue;
      }
      pending += 1;
      const row = byTask.get(task.id);
      const upToDate = row?.notificationId && row.scheduledAt === task.reminderAt;
      if (upToDate) continue;
      await scheduleReminderForTask(task, { silent: true });
      result.scheduled += 1;
    }

    // Rows for tasks that are not active, have no future reminder, or no longer exist.
    for (const row of reminderRows) {
      if (activeTaskIds.has(row.taskId)) continue;
      await cancelReminderForTask(row.taskId);
      result.cleared += 1;
    }
  } catch {
    // best effort
  }
  return result;
}

export interface ReminderResponse {
  taskId: string;
  action: ReminderAction;
  /** Stable id for this specific response, used to drop duplicates. */
  key: string;
}

/**
 * The response that cold-starts the app can arrive twice on iOS: once from
 * getLastNotificationResponseAsync and again through the live listener. A
 * second "Complete" on a repeat would log two occurrences, so each response
 * is handled at most once per process.
 */
const handledResponses = new Set<string>();

export function claimResponse(response: ReminderResponse): boolean {
  if (handledResponses.has(response.key)) return false;
  handledResponses.add(response.key);
  return true;
}

/** Test hook. */
export function __resetHandledResponses(): void {
  handledResponses.clear();
}

/**
 * Subscribes to notification taps and action buttons. Returns an unsubscribe
 * function (a no-op where notifications are unsupported).
 */
export async function addReminderResponseListener(
  handler: (response: ReminderResponse) => void
): Promise<() => void> {
  const Notifications = await loadNotifications();
  if (!Notifications) return () => {};
  try {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const parsed = readResponse(response);
        if (parsed && claimResponse(parsed)) handler(parsed);
      }
    );
    return () => subscription.remove();
  } catch {
    return () => {};
  }
}

/** The notification response that cold-started the app, if any. */
export async function getLaunchReminderResponse(): Promise<ReminderResponse | null> {
  const Notifications = await loadNotifications();
  if (!Notifications) return null;
  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    const parsed = response ? readResponse(response) : null;
    return parsed && claimResponse(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function readResponse(response: {
  actionIdentifier?: string;
  notification: {
    date?: number;
    request: { identifier?: string; content: { data?: unknown } };
  };
}): ReminderResponse | null {
  const data = response.notification.request.content.data as
    | { taskId?: unknown }
    | undefined;
  if (typeof data?.taskId !== 'string') return null;
  const action = readAction(response.actionIdentifier);
  const requestId =
    response.notification.request.identifier ??
    `${data.taskId}@${response.notification.date ?? 0}`;
  return { taskId: data.taskId, action, key: `${requestId}:${action}` };
}

function readAction(actionIdentifier?: string): ReminderAction {
  if (actionIdentifier === REMINDER_ACTION_COMPLETE) return 'complete';
  if (actionIdentifier === REMINDER_ACTION_SNOOZE) return 'snooze';
  return 'open';
}

/** Pushes a task's reminder out by the snooze interval. */
export async function snoozeReminder(taskId: string): Promise<string | null> {
  const { taskRepository } = await import('@/features/tasks/taskRepository');
  const task = await taskRepository.getById(taskId);
  if (!task || task.status !== 'active') return null;
  const reminderAt = new Date(
    Date.now() + SNOOZE_MINUTES * 60_000
  ).toISOString();
  await taskRepository.update(taskId, { reminderAt });
  return reminderAt;
}
