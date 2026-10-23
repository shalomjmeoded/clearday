import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

import { INBOX_LIST_ID, SCHEMA_VERSION } from '@/db/constants';
import { getDb } from '@/db/client';
import { mapRowToTask } from '@/features/tasks/taskMapper';
import {
  cancelScheduledNotifications,
  scheduleReminderForTask,
} from '@/features/reminders/reminderService';
import { DEFAULT_RECURRENCE, type TaskRecurrence } from '@/types/recurrence';
import type { ClearDayBackup } from '@/types/backup';
import {
  CLEARDAY_BACKUP_VERSION,
} from '@/types/backup';
import type { TaskList } from '@/types/list';
import type { Task, TaskPriority, TaskStatus } from '@/types/task';
import { DEFAULT_SETTINGS, type AppSettings } from '@/types/settings';
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

  const settings: Record<string, unknown> = {};
  for (const row of settingRows) {
    if (row.key === 'schemaVersion') continue;
    settings[row.key] = row.value;
  }

  return {
    version: CLEARDAY_BACKUP_VERSION,
    exportedAt: nowIso(),
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
    throw new Error(
      `This backup version (${parsed.version}) is not supported. Expected version ${CLEARDAY_BACKUP_VERSION}.`
    );
  }
  return parsed;
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
  const lists = ensureInboxList(
    backup.lists.map((list, index) => normalizeList(list, index))
  );
  const knownListIds = new Set<string>();
  for (const list of lists) {
    if (knownListIds.has(list.id)) {
      throw new Error(`Backup contains duplicate list id "${list.id}".`);
    }
    knownListIds.add(list.id);
  }
  const tasks = backup.tasks.map((task, index) =>
    normalizeTask(task, index, knownListIds)
  );

  const seenIds = new Set<string>();
  for (const task of tasks) {
    if (seenIds.has(task.id)) {
      throw new Error(`Backup contains duplicate task id "${task.id}".`);
    }
    seenIds.add(task.id);
  }

  // Capture before the wipe so the pre-import OS notifications can be
  // cancelled after the restore commits (never before — a failed import
  // must leave existing reminders untouched).
  const staleReminders = await db.getAllAsync<{ notificationId: string | null }>(
    'SELECT notificationId FROM reminders'
  );

  await db.execAsync('BEGIN IMMEDIATE TRANSACTION');
  try {
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
        `INSERT INTO tasks (id, title, notes, status, priority, color, dueDate, reminderAt, recurrence, listId, sortOrder, completedAt, createdAt, updatedAt, deletedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          task.listId ?? INBOX_LIST_ID,
          task.sortOrder,
          task.completedAt ?? null,
          task.createdAt,
          task.updatedAt,
          task.deletedAt ?? null,
        ]
      );
    }

    const settings = backup.settings ?? {};
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      const value = settings[key];
      let stringValue =
        value === undefined || typeof value === 'object'
          ? String(DEFAULT_SETTINGS[key as keyof AppSettings])
          : String(value);
      if (key === 'defaultListId' && !knownListIds.has(stringValue)) {
        stringValue = INBOX_LIST_ID;
      }
      await db.runAsync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        [key, stringValue]
      );
    }

    await db.runAsync(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      ['schemaVersion', String(SCHEMA_VERSION)]
    );

    await db.execAsync('COMMIT');
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }

  await cancelScheduledNotifications(
    staleReminders
      .map((row) => row.notificationId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  );

  for (const task of tasks) {
    if (task.reminderAt && task.status === 'active') {
      await scheduleReminderForTask(task);
    }
  }
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
}

export async function importBackupFromFile(): Promise<boolean> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets?.[0]?.uri) {
    return false;
  }

  const raw = await FileSystem.readAsStringAsync(result.assets[0].uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const backup = parseBackupJson(raw);
  await restoreBackupData(backup);
  return true;
}

export function confirmImportBackup(onConfirm: () => void | Promise<void>): void {
  Alert.alert(
    'Import backup?',
    'This replaces all tasks, lists, and settings on this device with the backup file. This cannot be undone.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Import',
        style: 'destructive',
        onPress: () => {
          void onConfirm();
        },
      },
    ]
  );
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
  confirmImportBackup(async () => {
    onBusyChange?.(true);
    try {
      const imported = await importBackupFromFile();
      if (!imported) return;
      await onRestored();
      Alert.alert(
        'Import complete',
        'Your tasks and settings were restored from the backup.'
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not import backup.';
      Alert.alert('Import failed', message);
    } finally {
      onBusyChange?.(false);
    }
  });
}
