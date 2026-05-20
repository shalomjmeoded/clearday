import { create } from 'zustand';

import { taskRepository } from '@/features/tasks/taskRepository';
import {
  fetchDoneTasks,
  fetchLaterTasks,
  fetchTodayCompletedTasks,
  fetchTodayTasks,
  fetchTomorrowTasks,
} from '@/features/tasks/taskQueries';
import { parseTaskInput } from '@/utils/parseTaskInput';
import type { Task } from '@/types/task';
import { INBOX_LIST_ID } from '@/db/constants';

export type TaskView = 'today' | 'tomorrow' | 'later' | 'done' | 'list';

interface TaskState {
  todayTasks: Task[];
  todayCompletedTasks: Task[];
  tomorrowTasks: Task[];
  laterTasks: Task[];
  doneTasks: Task[];
  listTasks: Task[];
  loading: boolean;
  todayReady: boolean;
  refreshToday: () => Promise<void>;
  refreshTomorrow: () => Promise<void>;
  refreshLater: () => Promise<void>;
  refreshDone: () => Promise<void>;
  refreshList: (listId: string) => Promise<void>;
  addTask: (
    raw: string,
    listId?: string,
    options?: { defaultDueDate?: string }
  ) => Promise<Task | null>;
  completeTask: (id: string) => Promise<void>;
  uncompleteTask: (id: string) => Promise<void>;
  archiveTask: (id: string) => Promise<void>;
  moveToTomorrow: (id: string) => Promise<void>;
  scheduleTask: (id: string, dueDate: string) => Promise<void>;
  refreshAll: () => Promise<void>;
}

async function refreshAfterMutation(
  get: () => TaskState,
  listId?: string
): Promise<void> {
  await get().refreshAll();
  if (listId) {
    await get().refreshList(listId);
  }
}

export const useTaskStore = create<TaskState>((set, get) => ({
  todayTasks: [],
  todayCompletedTasks: [],
  tomorrowTasks: [],
  laterTasks: [],
  doneTasks: [],
  listTasks: [],
  loading: false,
  todayReady: false,

  refreshToday: async () => {
    const [todayTasks, todayCompletedTasks] = await Promise.all([
      fetchTodayTasks(),
      fetchTodayCompletedTasks(),
    ]);
    set({ todayTasks, todayCompletedTasks, todayReady: true });
  },

  refreshTomorrow: async () => {
    const tomorrowTasks = await fetchTomorrowTasks();
    set({ tomorrowTasks });
  },

  refreshLater: async () => {
    const laterTasks = await fetchLaterTasks();
    set({ laterTasks });
  },

  refreshDone: async () => {
    const doneTasks = await fetchDoneTasks();
    set({ doneTasks });
  },

  refreshList: async (listId: string) => {
    const listTasks = await taskRepository.getByListId(listId);
    set({ listTasks });
  },

  refreshAll: async () => {
    set({ loading: true });
    await Promise.all([
      get().refreshToday(),
      get().refreshTomorrow(),
      get().refreshLater(),
      get().refreshDone(),
    ]);
    set({ loading: false });
  },

  addTask: async (raw, listId = INBOX_LIST_ID, options) => {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    let title = trimmed;
    let priority: Task['priority'] = 'normal';
    let dueDate: string | undefined = options?.defaultDueDate;
    let reminderAt: string | undefined;

    try {
      const parsed = parseTaskInput(trimmed);
      title = parsed.title || trimmed;
      priority = parsed.priority;
      dueDate = parsed.dueDate ?? dueDate;
      reminderAt = parsed.reminderAt;
      if (dueDate && priority === 'must_do_today') {
        priority = 'normal';
      }
    } catch {
      // Parser failed — still create as plain text.
    }

    try {
      const task = await taskRepository.create({
        title,
        priority,
        dueDate,
        reminderAt,
        listId,
      });
      await refreshAfterMutation(get, listId);
      return task;
    } catch {
      return null;
    }
  },

  completeTask: async (id) => {
    const existing = await taskRepository.getById(id);
    await taskRepository.complete(id);
    await refreshAfterMutation(get, existing?.listId);
  },

  uncompleteTask: async (id) => {
    const existing = await taskRepository.getById(id);
    await taskRepository.uncomplete(id);
    await refreshAfterMutation(get, existing?.listId);
  },

  archiveTask: async (id) => {
    const existing = await taskRepository.getById(id);
    await taskRepository.archive(id);
    await refreshAfterMutation(get, existing?.listId);
  },

  moveToTomorrow: async (id) => {
    const existing = await taskRepository.getById(id);
    await taskRepository.moveToTomorrow(id);
    await refreshAfterMutation(get, existing?.listId);
  },

  scheduleTask: async (id, dueDate) => {
    const existing = await taskRepository.getById(id);
    await taskRepository.update(id, {
      dueDate,
      priority: existing?.priority === 'must_do_today' ? 'normal' : existing?.priority,
    });
    await refreshAfterMutation(get, existing?.listId);
  },
}));
