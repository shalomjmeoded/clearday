import type { TaskList } from '@/types/list';
import type { Task } from '@/types/task';

/** Manual backup/export format for transfer between devices (no cloud). */
export type ClearDayBackup = {
  version: number;
  exportedAt: string;
  /** App version that wrote the file; informational, lets a future importer explain a mismatch. */
  appVersion?: string;
  tasks: Task[];
  lists: TaskList[];
  settings: Record<string, unknown>;
};

export const CLEARDAY_BACKUP_VERSION = 1;
