import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

import { INBOX_LIST_ID, SCHEMA_VERSION } from '@/db/constants';
import { getDb } from '@/db/client';
import { runExclusive, withTransaction } from '@/db/exclusive';
import { mapRowToTask } from '@/features/tasks/taskMapper';
import {
  cancelScheduledNotifications,
  scheduleReminderForTask,
} from '@/features/reminders/reminderService';
import { DEFAULT_RECURRENCE, type TaskRecurrence } from '@/types/recurrence';
import { PRO_ENTITLEMENT_CACHE_KEY } from '@/features/pro/proEntitlementCache';
import type { ClearDayBackup } from '@/types/backup';
import {
  CLEARDAY_BACKUP_VERSION,
} from '@/types/backup';
import type { TaskList } from '@/types/list';
import type { Task, TaskPriority, TaskStatus } from '@/types/task';
import {
  normalizeSettings,
  serializeSetting,
  SETTINGS_KEYS,
} from '@/types/settings';
import { nowIso } from '@/utils/dates';

function backupFilename(): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `clearday-backup-${stamp}.clearday`;
}

export async function buildBackup(): Promise<ClearDayBackup> {
  const db = await getDb();

  const listRows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM lists WHERE deletedAt IS NULL ORDER BY sortOrder ASC'
  );
  const taskRows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM tasks WHERE deletedAt IS NULL'
  );
  const settingRows = await db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM settings'
  );

  // Only user preferences travel. This leaves out schemaVersion, the
  // device-local purchase cache (not user data, must not move between
  // devices), and any stale row from an earlier release.
  const settings: Record<string, unknown> = {};
  const exportable = new Set<string>(SETTINGS_KEYS);
  for (const row of settingRows) {
    if (row.key === PRO_ENTITLEMENT_CACHE_KEY) continue;
    if (!exportable.has(row.key)) continue;
    settings[row.key] = row.value;
  }

  return {
    version: CLEARDAY_BACKUP_VERSION,
    exportedAt: nowIso(),
    appVersion: Constants.expoConfig?.version ?? undefined,
    lists: listRows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      color: (row.color as string) ?? undefined,
      sortOrder: row.sortOrder as number,
      createdAt: row.createdAt as string,
      updatedAt: row.updatedAt as string,
      deletedAt: (row.deletedAt as string) ?? undefined,
    })),
    tasks: taskRows.map(mapRowToTask),
    settings,
  };
}

function parseBackupJson(raw: string): ClearDayBackup {
  const parsed = JSON.parse(raw) as ClearDayBackup;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid backup file.');
  }
  if (!Array.isArray(parsed.tasks) || !Array.isArray(parsed.lists)) {
    throw new Error('Backup file is missing tasks or lists.');
  }
  if (parsed.version !== CLEARDAY_BACKUP_VERSION) {
    const from = typeof parsed.appVersion === 'string' ? `, Do! ${parsed.appVersion}` : '';
    throw new Error(
      typeof parsed.version === 'number' && parsed.version > CLEARDAY_BACKUP_VERSION
        ? `This backup (version ${parsed.version}${from}) is from a newer version of Do!. Update the app, then import again.`
        : `This backup version (${parsed.version}) is not supported. Expected version ${CLEARDAY_BACKUP_VERSION}.`
    );
  }
  return parsed;
}

/** Device-local record of the last successful export; never exported itself. */
export const LAST_BACKUP_AT_KEY = 'lastBackupAt';

export async function getLastBackupAt(): Promise<string | null> {
  try {
    const db = await getDb();
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      [LAST_BACKUP_AT_KEY]
    );
    return row?.value ?? null;
  } catch {
    return null;
  }
}

async function recordBackupExported(): Promise<void> {
  try {
    const db = await getDb();
    await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
      LAST_BACKUP_AT_KEY,
      nowIso(),
    ]);
  } catch {
    // The export itself succeeded; the note is a convenience.
  }
}

/** What an import would replace the device's data with. Shown before confirming. */
export interface BackupSummary {
  exportedAt: string;
  taskCount: number;
  listCount: number;
}

export function summarizeBackup(backup: ClearDayBackup): BackupSummary {
  return {
    exportedAt: backup.exportedAt,
    taskCount: backup.tasks.filter(
      (task) => task && typeof task === 'object' && !task.deletedAt
    ).length,
    // The Inbox is implied and not worth counting as a "list" to the user.
    listCount: backup.lists.filter(
      (list) => list && typeof list === 'object' && !list.deletedAt && list.id !== INBOX_LIST_ID
    ).length,
  };
}

function formatBackupDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'an unknown date';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

const VALID_STATUSES: readonly TaskStatus[] = ['active', 'completed', 'archived'];
const VALID_PRIORITIES: readonly TaskPriority[] = [
  'normal',
  'important',
  'must_do_today',
];
const VALID_RECURRENCES: readonly TaskRecurrence[] = [
  'none',
  'daily',
  'weekly',
  'biweekly',
  'monthly',
  'yearly',
];

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Validates one imported task: structural fields must be present; enum-like fields fall back to safe defaults. */
function normalizeTask(
  task: Task,
  index: number,
  knownListIds: Set<string>
): Task {
  if (typeof task !== 'object' || task === null) {
    throw new Error(`Backup task #${index + 1} is not valid.`);
  }
  const id = asOptionalString(task.id);
  const title = asOptionalString(task.title);
  if (!id || !title) {
    throw new Error(`Backup task #${index + 1} is missing its id or title.`);
  }
  const now = nowIso();
  const listId = asOptionalString(task.listId);
  return {
    id,
    title,
    notes: asOptionalString(task.notes),
    status: oneOf(task.status, VALID_STATUSES, 'active'),
    priority: oneOf(task.priority, VALID_PRIORITIES, 'normal'),
    color: asOptionalString(task.color),
    dueDate: asOptionalString(task.dueDate),
    reminderAt: asOptionalString(task.reminderAt),
    recurrence: oneOf(task.recurrence, VALID_RECURRENCES, DEFAULT_RECURRENCE),
    recurringTaskId: asOptionalString(task.recurringTaskId),
    listId: listId && knownListIds.has(listId) ? listId : INBOX_LIST_ID,
    sortOrder: typeof task.sortOrder === 'number' ? task.sortOrder : 0,
    completedAt: asOptionalString(task.completedAt),
    createdAt: asOptionalString(task.createdAt) ?? now,
    updatedAt: asOptionalString(task.updatedAt) ?? now,
    deletedAt: asOptionalString(task.deletedAt),
  };
}

function normalizeList(list: TaskList, index: number): TaskList {
  if (typeof list !== 'object' || list === null) {
    throw new Error(`Backup list #${index + 1} is not valid.`);
  }
  const id = asOptionalString(list.id);
  const name = asOptionalString(list.name);
  if (!id || !name) {
    throw new Error(`Backup list #${index + 1} is missing its id or name.`);
  }
  const now = nowIso();
  return {
    id,
    name,
    color: asOptionalString(list.color),
    sortOrder: typeof list.sortOrder === 'number' ? list.sortOrder : 0,
    createdAt: asOptionalString(list.createdAt) ?? now,
    updatedAt: asOptionalString(list.updatedAt) ?? now,
    deletedAt: asOptionalString(list.deletedAt),
  };
}

function ensureInboxList(lists: TaskList[]): TaskList[] {
  const hasInbox = lists.some((l) => l.id === INBOX_LIST_ID);
  if (hasInbox) return lists;
  const now = nowIso();
  return [
    {
      id: INBOX_LIST_ID,
      name: 'Inbox',
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    },
    ...lists,
  ];
}

async function restoreBackupData(backup: ClearDayBackup): Promise<void> {
  const db = await getDb();
  // Exports never contain soft-deleted rows; a hand-edited file might. They
  // are dropped here so tasks cannot be bound to a list the UI never shows.
  const lists = ensureInboxList(
    backup.lists
      .map((list, index) => normalizeList(list, index))
      .filter((list) => !list.deletedAt)
  );
  const knownListIds = new Set<string>();
  for (const list of lists) {
    if (knownListIds.has(list.id)) {
      throw new Error(`Backup contains duplicate list id "${list.id}".`);
    }
    knownListIds.add(list.id);
  }
  const tasks = backup.tasks
    .map((task, index) => normalizeTask(task, index, knownListIds))
    .filter((task) => !task.deletedAt);

  const seenIds = new Set<string>();
  for (const task of tasks) {
    if (seenIds.has(task.id)) {
      throw new Error(`Backup contains duplicate task id "${task.id}".`);
    }
    seenIds.add(task.id);
  }

  // A completion record pointing at a task that is not in the backup becomes
  // a plain completed task rather than an unreachable orphan.
  for (const task of tasks) {
    if (task.recurringTaskId && !seenIds.has(task.recurringTaskId)) {
      task.recurringTaskId = undefined;
    }
  }

  // Held for the whole restore, including the notification rescheduling
  // after commit: returning from the document picker fires the foreground
  // reminder sync, which must not observe (or write into) a half-restored
  // database.
  await runExclusive(async () => {
    // Capture before the wipe so the pre-import OS notifications can be
    // cancelled after the restore commits (never before — a failed import
    // must leave existing reminders untouched).
    const staleReminders = await db.getAllAsync<{ notificationId: string | null }>(
      'SELECT notificationId FROM reminders'
    );

    await withTransaction(async () => {
      await db.runAsync('DELETE FROM reminders');
      await db.runAsync('DELETE FROM tasks');
      await db.runAsync('DELETE FROM lists');

      for (const list of lists) {
        await db.runAsync(
          `INSERT INTO lists (id, name, color, sortOrder, createdAt, updatedAt, deletedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            list.id,
            list.name,
            list.color ?? null,
            list.sortOrder,
            list.createdAt,
            list.updatedAt,
            list.deletedAt ?? null,
          ]
        );
      }

      for (const task of tasks) {
        await db.runAsync(
          `INSERT INTO tasks (id, title, notes, status, priority, color, dueDate, reminderAt, recurrence, recurringTaskId, listId, sortOrder, completedAt, createdAt, updatedAt, deletedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            task.id,
            task.title,
            task.notes ?? null,
            task.status,
            task.priority,
            task.color ?? null,
            task.dueDate ?? null,
            task.reminderAt ?? null,
            task.recurrence,
            task.recurringTaskId ?? null,
            task.listId ?? INBOX_LIST_ID,
            task.sortOrder,
            task.completedAt ?? null,
            task.createdAt,
            task.updatedAt,
            task.deletedAt ?? null,
          ]
        );
      }

      const settings = normalizeSettings(backup.settings, knownListIds);
      for (const key of SETTINGS_KEYS) {
        await db.runAsync(
          'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
          [key, serializeSetting(key, settings[key])]
        );
      }

      await db.runAsync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        ['schemaVersion', String(SCHEMA_VERSION)]
      );
    });

    await cancelScheduledNotifications(
      staleReminders
        .map((row) => row.notificationId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    );

    // Silent: this runs under the lock, and an OS permission prompt here
    // would hold it until the user answers. If permission is not granted
    // yet, the next sync pass schedules these once it is.
    for (const task of tasks) {
      if (task.reminderAt && task.status === 'active') {
        await scheduleReminderForTask(task, { silent: true });
      }
    }
  });
}

export async function exportBackupToFile(): Promise<void> {
  const backup = await buildBackup();
  const json = JSON.stringify(backup, null, 2);
  const filename = backupFilename();
  const uri = `${FileSystem.cacheDirectory}${filename}`;

  await FileSystem.writeAsStringAsync(uri, json, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('Sharing is not available on this device.');
  }

  await Sharing.shareAsync(uri, {
    mimeType: 'application/json',
    dialogTitle: 'Export Do! backup',
    UTI: 'public.json',
  });
  await recordBackupExported();
}

/** Lets the user choose a file and parses it; null when they cancel. */
export async function pickBackupFile(): Promise<ClearDayBackup | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets?.[0]?.uri) {
    return null;
  }

  const raw = await FileSystem.readAsStringAsync(result.assets[0].uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return parseBackupJson(raw);
}

export async function restoreBackup(backup: ClearDayBackup): Promise<BackupSummary> {
  await restoreBackupData(backup);
  return summarizeBackup(backup);
}

export async function importBackupFromFile(): Promise<boolean> {
  const backup = await pickBackupFile();
  if (!backup) return false;
  await restoreBackupData(backup);
  return true;
}

/**
 * Asks before replacing the device's data, naming what the file contains so
 * the user can tell they picked the right one. Resolves false on cancel or
 * when the dialog is dismissed without a choice.
 */
export function confirmImportBackup(summary: BackupSummary): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Replace with this backup?',
      `Backup from ${formatBackupDate(summary.exportedAt)} with ${plural(summary.taskCount, 'task')} and ${plural(summary.listCount, 'list')}.\n\nThis replaces all tasks, lists, and settings on this device. It cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Import', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

export function showDeviceTransferHelp(
  onExport: () => void | Promise<void>,
  onImport: () => void | Promise<void>
): void {
  Alert.alert(
    'Transfer between devices',
    'Cloud sync is not available yet. Export a backup on one phone, send the file (AirDrop, email, Files, Drive), then Import on the other device. Your task data is only in the file you move — we do not upload it.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Export', onPress: () => void onExport() },
      { text: 'Import', onPress: () => void onImport() },
    ]
  );
}

export async function runExportWithFeedback(): Promise<void> {
  try {
    await exportBackupToFile();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not export backup.';
    Alert.alert('Export failed', message);
  }
}

export async function runImportWithFeedback(
  onRestored: () => void | Promise<void>,
  onBusyChange?: (busy: boolean) => void
): Promise<void> {
  onBusyChange?.(true);
  try {
    // File first, confirmation second: the dialog can then say what is in it.
    const backup = await pickBackupFile();
    if (!backup) return;
    const summary = summarizeBackup(backup);
    if (!(await confirmImportBackup(summary))) return;
    await restoreBackup(backup);
    await onRestored();
    Alert.alert(
      'Import complete',
      `Restored ${plural(summary.taskCount, 'task')} and ${plural(summary.listCount, 'list')} from the backup.`
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not import backup.';
    Alert.alert('Import failed', message);
  } finally {
    onBusyChange?.(false);
  }
}
