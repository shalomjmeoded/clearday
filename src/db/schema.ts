/** clearday.db — local source of truth (tasks, lists, reminders, settings). */
export const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS lists (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  deletedAt TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  priority TEXT NOT NULL DEFAULT 'normal',
  dueDate TEXT,
  reminderAt TEXT,
  recurrence TEXT NOT NULL DEFAULT 'none',
  listId TEXT,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  completedAt TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  deletedAt TEXT
);

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY NOT NULL,
  taskId TEXT NOT NULL,
  notificationId TEXT,
  scheduledAt TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_status_dueDate ON tasks(status, dueDate);
CREATE INDEX IF NOT EXISTS idx_tasks_listId_sortOrder ON tasks(listId, sortOrder);
`;
