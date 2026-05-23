import { Alert } from 'react-native';
import { router } from 'expo-router';
import { create } from 'zustand';

import { taskRepository } from '@/features/tasks/taskRepository';
import {
  fetchDoneTasks,
  fetchLaterTasks,
  fetchTodayCompletedTasks,
  fetchTodayTasks,
  fetchTomorrowTasks,
  fetchTomorrowCompletedTasks,
} from '@/features/tasks/taskQueries';
import { parseTaskInput } from '@/utils/parseTaskInput';
import type { QuickAddOptions } from '@/types/quickAdd';
import type { Task } from '@/types/task';
import { INBOX_LIST_ID } from '@/db/constants';
import { listRepository } from '@/features/lists/listRepository';
import { getIsPro } from '@/store/proStore';
import { useSettingsStore } from '@/store/settingsStore';
import { DEFAULT_RECURRENCE } from '@/types/recurrence';
import { isRecurring } from '@/utils/recurrence';

function patchTaskInState(
  set: (
    partial:
      | Partial<TaskState>
      | ((state: TaskState) => Partial<TaskState>)
  ) => void,
  id: string,
  patch: Partial<Task>
) {
  const update = (tasks: Task[]) =>
    tasks.map((task) => (task.id === id ? { ...task, ...patch } : task));
  set((state) => ({
    todayTasks: update(state.todayTasks),
    tomorrowTasks: update(state.tomorrowTasks),
    laterTasks: update(state.laterTasks),
    listTasks: update(state.listTasks),
    todayCompletedTasks: update(state.todayCompletedTasks),
    tomorrowCompletedTasks: update(state.tomorrowCompletedTasks),
    doneTasks: update(state.doneTasks),
  }));
}

export type TaskView = 'today' | 'tomorrow' | 'later' | 'done' | 'list';

interface TaskState {
  todayTasks: Task[];
  todayCompletedTasks: Task[];
  tomorrowCompletedTasks: Task[];
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
    options?: QuickAddOptions & { defaultDueDate?: string }
  ) => Promise<Task | null>;
  completeTask: (id: string) => Promise<void>;
  uncompleteTask: (id: string) => Promise<void>;
  archiveTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  setImportant: (id: string) => Promise<void>;
  toggleRecurring: (id: string) => Promise<void>;
  moveToTomorrow: (id: string) => Promise<void>;
  reorderTasks: (orderedIds: string[], listId?: string) => Promise<void>;
  clearFinishedTasks: () => Promise<void>;
  scheduleTask: (id: string, dueDate: string) => Promise<void>;
  refreshAll: () => Promise<void>;
}

async function refreshAfterMutation(
  get: () => TaskState,
  listId?: string
): Promise<void> {
  await Promise.all([
    get().refreshToday(),
    get().refreshTomorrow(),
    get().refreshLater(),
  ]);
  if (listId) {
    await get().refreshList(listId);
  }
}

export const useTaskStore = create<TaskState>((set, get) => ({
  todayTasks: [],
  todayCompletedTasks: [],
  tomorrowCompletedTasks: [],
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
    const [tomorrowTasks, tomorrowCompletedTasks] = await Promise.all([
      fetchTomorrowTasks(),
      fetchTomorrowCompletedTasks(),
    ]);
    set({ tomorrowTasks, tomorrowCompletedTasks });
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
    await Promise.all([
      get().refreshToday(),
      get().refreshTomorrow(),
      get().refreshLater(),
      get().refreshDone(),
    ]);
  },

  addTask: async (raw, listId = INBOX_LIST_ID, options) => {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    let title = trimmed;
    let priority: Task['priority'] = 'normal';
    let dueDate: string | undefined = options?.defaultDueDate;
    let reminderAt: string | undefined;
    let recurrence: Task['recurrence'] | undefined;
    let color: string | undefined;
    let targetListId = listId;

    try {
      const parsed = parseTaskInput(trimmed);
      title = parsed.title || trimmed;
      priority = parsed.priority;
      dueDate = parsed.dueDate ?? dueDate;
      reminderAt = parsed.reminderAt;
      recurrence = parsed.recurrence;
      if (parsed.listHint) {
        const lists = await listRepository.getAll();
        const hint = parsed.listHint.toLowerCase();
        const matched = lists.find(
          (l) =>
            l.name.toLowerCase() === hint ||
            l.name.toLowerCase().replace(/\s+/g, '') === hint
        );
        if (matched) {
          targetListId = matched.id;
        }
      }
      if (dueDate && priority === 'must_do_today') {
        priority = 'normal';
      }
    } catch {
      // Parser failed — still create as plain text.
    }

    if (options?.dueDate !== undefined) dueDate = options.dueDate;
    if (options?.reminderAt !== undefined) reminderAt = options.reminderAt;
    if (options?.color !== undefined) {
      color = options.color ?? undefined;
    }
    if (options?.priority) priority = options.priority;

    const isPro = getIsPro();
    if (recurrence && isRecurring(recurrence) && !isPro) {
      recurrence = DEFAULT_RECURRENCE;
    }

    try {
      const task = await taskRepository.create({
        title,
        priority,
        dueDate,
        reminderAt,
        recurrence,
        color,
        listId: targetListId,
      });
      await refreshAfterMutation(get, targetListId);
      return task;
    } catch {
      return null;
    }
  },

  completeTask: async (id) => {
    const existing = await taskRepository.getById(id);
    if (!existing) return;

    if (!isRecurring(existing.recurrence)) {
      const completedAt = new Date().toISOString();
      set((state) => ({
        todayTasks: state.todayTasks.filter((task) => task.id !== id),
        tomorrowTasks: state.tomorrowTasks.filter((task) => task.id !== id),
        laterTasks: state.laterTasks.filter((task) => task.id !== id),
        listTasks: state.listTasks.filter((task) => task.id !== id),
        todayCompletedTasks: [
          { ...existing, status: 'completed', completedAt },
          ...state.todayCompletedTasks.filter((task) => task.id !== id),
        ],
      }));
    }

    await taskRepository.complete(id);
    await refreshAfterMutation(get, existing?.listId);
    await get().refreshDone();
  },

  uncompleteTask: async (id) => {
    const existing = await taskRepository.getById(id);
    if (!existing) return;

    set((state) => ({
      todayCompletedTasks: state.todayCompletedTasks.filter((task) => task.id !== id),
      tomorrowCompletedTasks: state.tomorrowCompletedTasks.filter(
        (task) => task.id !== id
      ),
      doneTasks: state.doneTasks.filter((task) => task.id !== id),
    }));

    await taskRepository.uncomplete(id);
    await refreshAfterMutation(get, existing?.listId);
    await get().refreshDone();
  },

  archiveTask: async (id) => {
    const existing = await taskRepository.getById(id);
    await taskRepository.archive(id);
    await refreshAfterMutation(get, existing?.listId);
  },

  deleteTask: async (id) => {
    const existing = await taskRepository.getById(id);
    await taskRepository.deletePermanent(id);
    await refreshAfterMutation(get, existing?.listId);
  },

  setImportant: async (id) => {
    const existing = await taskRepository.getById(id);
    if (!existing) return;
    const nextPriority = existing.priority === 'important' ? 'normal' : 'important';
    patchTaskInState(set, id, { priority: nextPriority });
    await taskRepository.setPriority(id, nextPriority);
    await refreshAfterMutation(get, existing?.listId);
  },

  toggleRecurring: async (id) => {
    const isPro = getIsPro();
    const existing = await taskRepository.getById(id);
    if (!existing) return;

    if (isRecurring(existing.recurrence)) {
      patchTaskInState(set, id, { recurrence: DEFAULT_RECURRENCE });
      await taskRepository.setRecurrence(id, DEFAULT_RECURRENCE);
      await refreshAfterMutation(get, existing.listId);
      return;
    }

    if (!isPro) {
      Alert.alert(
        'Do! Pro',
        'Recurring tasks are included with Pro.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'View Pro', onPress: () => router.push('/pro') },
        ]
      );
      return;
    }

    patchTaskInState(set, id, { recurrence: 'daily' });
    await taskRepository.setRecurrence(id, 'daily');
    await refreshAfterMutation(get, existing.listId);
  },

  moveToTomorrow: async (id) => {
    const existing = await taskRepository.getById(id);
    await taskRepository.moveToTomorrow(id);
    await refreshAfterMutation(get, existing?.listId);
  },

  reorderTasks: async (orderedIds, listId) => {
    try {
      await taskRepository.reorderTasks(orderedIds);
    } catch {
      await refreshAfterMutation(get, listId);
    }
  },

  clearFinishedTasks: async () => {
    await taskRepository.clearCompleted();
    await get().refreshDone();
    await get().refreshToday();
    await get().refreshTomorrow();
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
