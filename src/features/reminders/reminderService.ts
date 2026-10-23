import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import { getDb } from '@/db/client';
import type { Task } from '@/types/task';
import { createId } from '@/utils/id';
import { nowIso } from '@/utils/dates';

type NotificationsModule = typeof import('expo-notifications');

let notificationsModule: NotificationsModule | null | undefined;
let channelReady = false;
let handlerConfigured = false;

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

export async function scheduleReminderForTask(task: Task): Promise<void> {
  if (!task.reminderAt || task.status !== 'active') return;

  const Notifications = await loadNotifications();
  if (!Notifications) return;

  try {
    const granted = await requestReminderPermission();
    if (!granted) return;

    await cancelReminderForTask(task.id);

    const triggerDate = new Date(task.reminderAt);
    if (triggerDate.getTime() <= Date.now()) return;

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Do!',
        body: task.title,
        data: { taskId: task.id },
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
  }
}
