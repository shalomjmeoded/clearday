import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

import { INBOX_LIST_ID } from '@/db/constants';
import { getDb } from '@/db/client';
import { mapRowToTask } from '@/features/tasks/taskMapper';
import { scheduleReminderForTask } from '@/features/reminders/reminderService';
import { DEFAULT_RECURRENCE } from '@/types/recurrence';
import type { ClearDayBackup } from '@/types/backup';
import {
  CLEARDAY_BACKUP_VERSION,
} from '@/types/backup';
import type { TaskList } from '@/types/list';
import type { Task } from '@/types/task';
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

function normalizeTask(task: Task): Task {
  return {
    ...task,
    recurrence: task.recurrence ?? DEFAULT_RECURRENCE,
    listId: task.listId ?? INBOX_LIST_ID,
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
  const lists = ensureInboxList(backup.lists);
  const tasks = backup.tasks.map(normalizeTask);

  await db.execAsync('BEGIN IMMEDIATE TRANSACTION');
  try {
    await db.runAsync('DELETE FROM reminders');
    await db.runAsync('DELETE FROM tasks');
    await db.runAsync('DELETE FROM lists');

    for (const list of lists) {
      await db.runAsync(
        `INSERT INTO lists (id, name, sortOrder, createdAt, updatedAt, deletedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          list.id,
          list.name,
          list.sortOrder,
          list.createdAt,
          list.updatedAt,
          list.deletedAt ?? null,
        ]
      );
    }

    for (const task of tasks) {
      await db.runAsync(
        `INSERT INTO tasks (id, title, notes, status, priority, dueDate, reminderAt, recurrence, listId, sortOrder, completedAt, createdAt, updatedAt, deletedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          task.id,
          task.title,
          task.notes ?? null,
          task.status,
          task.priority,
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
      const stringValue =
        value === undefined
          ? String(DEFAULT_SETTINGS[key as keyof AppSettings])
          : typeof value === 'boolean'
            ? String(value)
            : String(value);
      await db.runAsync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        [key, stringValue]
      );
    }

    await db.runAsync(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      ['schemaVersion', '2']
    );

    await db.execAsync('COMMIT');
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }

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
    dialogTitle: 'Export ClearDay backup',
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
  onRestored: () => void | Promise<void>
): Promise<void> {
  confirmImportBackup(async () => {
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
    }
  });
}
