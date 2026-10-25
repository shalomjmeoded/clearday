import { Alert, Platform } from 'react-native';
import { router } from 'expo-router';
import { create } from 'zustand';

import { taskRepository } from '@/features/tasks/taskRepository';
import {
  DONE_PAGE_SIZE,
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
import { useToastStore } from '@/store/toastStore';
import { DEFAULT_RECURRENCE } from '@/types/recurrence';
import { formatDisplayDate, isToday } from '@/utils/dates';
import { isRecurring } from '@/utils/recurrence';

/** Lets the checkmark finish before a recurring row is replaced by its next date. */
const RECURRING_ADVANCE_DELAY_MS = 260;

/**
 * Completions in progress. A second tap on the same row while the first is
 * still writing would otherwise log a second occurrence and advance twice.
 */
const completing = new Set<string>();

/**
 * Collapses overlapping refreshes of one view into at most two passes: the
 * one in flight and a single trailing re-run for everyone who arrived while
 * it ran. A burst of N rapid mutations used to fan out into N full refetches
 * per view at once (enough to exhaust memory on a big database); callers
 * still always observe a refresh started at or after their call.
 */
function coalesceRefresh(fn: () => Promise<void>): () => Promise<void> {
  let inflight: Promise<void> | null = null;
  let trailing: Promise<void> | null = null;
  const run = () => {
    const p = fn().finally(() => {
      if (inflight === p) inflight = null;
    });
    inflight = p;
    return p;
  };
  return () => {
    if (!inflight) return run();
    if (!trailing) {
      trailing = inflight
        .catch(() => {})
        .then(() => {
          trailing = null;
          return run();
        });
    }
    return trailing;
  };
}

/**
 * Soft-deleted tasks whose shared Undo toast is still open. Deleting several
 * tasks in a row folds into one growing batch: Undo brings them all back,
 * and only the batch's own toast closing purges them.
 */
let pendingDeleteIds: string[] = [];
/** Invalidates a superseded delete toast's expiry (bumped before each show). */
let deleteBatchToken = 0;

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

function removeTaskFromState(
  set: (
    partial:
      | Partial<TaskState>
      | ((state: TaskState) => Partial<TaskState>)
  ) => void,
  id: string
) {
  const drop = (tasks: Task[]) => tasks.filter((task) => task.id !== id);
  set((state) => ({
    todayTasks: drop(state.todayTasks),
    tomorrowTasks: drop(state.tomorrowTasks),
    laterTasks: drop(state.laterTasks),
    listTasks: drop(state.listTasks),
    todayCompletedTasks: drop(state.todayCompletedTasks),
    tomorrowCompletedTasks: drop(state.tomorrowCompletedTasks),
    doneTasks: drop(state.doneTasks),
    archivedTasks: drop(state.archivedTasks),
  }));
}

function findTaskInState(state: TaskState, id: string): Task | undefined {
  return [
    ...state.todayTasks,
    ...state.tomorrowTasks,
    ...state.laterTasks,
    ...state.listTasks,
    ...state.todayCompletedTasks,
    ...state.tomorrowCompletedTasks,
    ...state.doneTasks,
  ].find((task) => task.id === id);
}

export type TaskView = 'today' | 'tomorrow' | 'later' | 'done' | 'list';

interface TaskState {
  todayTasks: Task[];
  todayCompletedTasks: Task[];
  tomorrowCompletedTasks: Task[];
  tomorrowTasks: Task[];
  laterTasks: Task[];
  doneTasks: Task[];
  archivedTasks: Task[];
  listTasks: Task[];
  loading: boolean;
  todayReady: boolean;
  /** Whether older completed tasks remain beyond the pages loaded so far. */
  doneHasMore: boolean;
  /** Loads the next page of completed history into doneTasks. */
  loadMoreDone: () => Promise<void>;
  refreshToday: () => Promise<void>;
  refreshTomorrow: () => Promise<void>;
  refreshLater: () => Promise<void>;
  refreshDone: () => Promise<void>;
  refreshArchived: () => Promise<void>;
  refreshList: (listId: string) => Promise<void>;
  addTask: (
    raw: string,
    listId?: string,
    options?: QuickAddOptions & { defaultDueDate?: string }
  ) => Promise<Task | null>;
  completeTask: (id: string) => Promise<void>;
  uncompleteTask: (id: string) => Promise<void>;
  archiveTask: (id: string) => Promise<void>;
  unarchiveTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  /** Hides the task at once and only deletes for real once the Undo toast closes. */
  deleteTaskWithUndo: (id: string) => Promise<void>;
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


async function completeTaskInner(
  id: string,
  set: (
    partial:
      | Partial<TaskState>
      | ((state: TaskState) => Partial<TaskState>)
  ) => void,
  get: () => TaskState
): Promise<void> {
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

  if (isRecurring(existing.recurrence)) {
    // Show the tick on the current row, then let the refresh swap in the
    // next occurrence — instead of the row vanishing mid-tap.
    patchTaskInState(set, id, {
      status: 'completed',
      completedAt: new Date().toISOString(),
    });
    await new Promise((resolve) =>
      setTimeout(resolve, RECURRING_ADVANCE_DELAY_MS)
    );
  }

  const { task: result, occurrenceId } = await taskRepository.complete(id);
  await refreshAfterMutation(get, existing?.listId);
  await get().refreshDone();

  if (isRecurring(existing.recurrence) && result?.dueDate) {
    // The row has moved to its next date; say so and offer a way back.
    const previous = {
      dueDate: existing.dueDate,
      reminderAt: existing.reminderAt,
      snoozedUntil: existing.snoozedUntil,
      priority: existing.priority,
    };
    useToastStore.getState().show(
      `Done · next ${formatDisplayDate(result.dueDate)}`,
      {
        key: 'recurring-done',
        action: {
          label: 'Undo',
          onPress: async () => {
            // Undo must also remove the occurrence that was just logged,
            // otherwise the repeat leaves a phantom entry in Finished.
            if (occurrenceId) {
              await taskRepository.deletePermanent(occurrenceId);
            }
            await taskRepository.update(id, previous);
            await refreshAfterMutation(get, existing.listId);
            await get().refreshDone();
          },
        },
      }
    );
  }
}

export const useTaskStore = create<TaskState>((set, get) => ({
  todayTasks: [],
  todayCompletedTasks: [],
  tomorrowCompletedTasks: [],
  tomorrowTasks: [],
  laterTasks: [],
  doneTasks: [],
  archivedTasks: [],
  listTasks: [],
  loading: false,
  todayReady: false,
  doneHasMore: false,

  refreshToday: coalesceRefresh(async () => {
    if (Platform.OS === 'web') {
      set({ todayTasks: [], todayCompletedTasks: [], todayReady: true });
      return;
    }

    const [todayTasks, todayCompletedTasks] = await Promise.all([
      fetchTodayTasks(),
      fetchTodayCompletedTasks(),
    ]);
    set({ todayTasks, todayCompletedTasks, todayReady: true });
  }),

  refreshTomorrow: coalesceRefresh(async () => {
    if (Platform.OS === 'web') {
      set({ tomorrowTasks: [], tomorrowCompletedTasks: [] });
      return;
    }

    const [tomorrowTasks, tomorrowCompletedTasks] = await Promise.all([
      fetchTomorrowTasks(),
      fetchTomorrowCompletedTasks(),
    ]);
    set({ tomorrowTasks, tomorrowCompletedTasks });
  }),

  refreshLater: coalesceRefresh(async () => {
    if (Platform.OS === 'web') {
      set({ laterTasks: [] });
      return;
    }

    const laterTasks = await fetchLaterTasks();
    set({ laterTasks });
  }),

  // Resets to the first page; loadMoreDone walks further back on scroll. A
  // refresh triggered while the user sits deep in the history keeps the pages
  // already on screen by refetching the same span in one query.
  refreshDone: coalesceRefresh(async () => {
    if (Platform.OS === 'web') {
      set({ doneTasks: [], doneHasMore: false });
      return;
    }

    const span = Math.max(get().doneTasks.length, DONE_PAGE_SIZE);
    const doneTasks = await fetchDoneTasks(span);
    set({ doneTasks, doneHasMore: doneTasks.length === span });
  }),

  loadMoreDone: async () => {
    if (Platform.OS === 'web' || !get().doneHasMore) return;
    const offset = get().doneTasks.length;
    const page = await fetchDoneTasks(DONE_PAGE_SIZE, offset);
    set((state) => {
      // A refresh may have landed meanwhile; drop anything already shown.
      const seen = new Set(state.doneTasks.map((task) => task.id));
      return {
        doneTasks: [...state.doneTasks, ...page.filter((t) => !seen.has(t.id))],
        doneHasMore: page.length === DONE_PAGE_SIZE,
      };
    });
  },

  refreshArchived: coalesceRefresh(async () => {
    if (Platform.OS === 'web') {
      set({ archivedTasks: [] });
      return;
    }

    const archivedTasks = await taskRepository.getArchived();
    set({ archivedTasks });
  }),

  refreshList: async (listId: string) => {
    if (Platform.OS === 'web') {
      set({ listTasks: [] });
      return;
    }

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

    const isPro = getIsPro();

    try {
      // Free users keep recurrence words in the title rather than losing them.
      const parsed = parseTaskInput(trimmed, { allowRecurrence: isPro });
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
      // The parser always dates a pinned task today, so only a pin on some
      // other day is a contradiction, and then the day wins.
      if (dueDate && priority === 'must_do_today' && !isToday(dueDate)) {
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
    if (options?.recurrence !== undefined) recurrence = options.recurrence;

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
    if (completing.has(id)) return;
    completing.add(id);
    try {
      await completeTaskInner(id, set, get);
    } finally {
      completing.delete(id);
    }
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
    if (!existing) return;
    await taskRepository.archive(id);
    await refreshAfterMutation(get, existing.listId);
    await get().refreshArchived();
    // Archive takes the row out of every list at once, so offer a way back
    // right here; the task also stays reachable under Finished → Archived.
    useToastStore.getState().show('Archived', {
      key: 'archive',
      action: {
        label: 'Undo',
        onPress: async () => {
          await taskRepository.update(id, {
            status: existing.status,
            completedAt: existing.completedAt,
            reminderAt: existing.reminderAt,
            snoozedUntil: existing.snoozedUntil,
          });
          await refreshAfterMutation(get, existing.listId);
          await get().refreshDone();
          await get().refreshArchived();
        },
      },
    });
  },

  unarchiveTask: async (id) => {
    const existing = await taskRepository.getById(id);
    if (!existing) return;
    set((state) => ({
      archivedTasks: state.archivedTasks.filter((task) => task.id !== id),
    }));
    await taskRepository.unarchive(id);
    await refreshAfterMutation(get, existing.listId);
  },

  deleteTask: async (id) => {
    const existing = await taskRepository.getById(id);
    await taskRepository.deletePermanent(id);
    await refreshAfterMutation(get, existing?.listId);
  },

  deleteTaskWithUndo: async (id) => {
    const existing = findTaskInState(get(), id) ?? (await taskRepository.getById(id));
    if (!existing) return;
    // Drop the row from view right away, then soft-delete so any refresh
    // during the Undo window (adding a task, switching tabs) keeps it hidden.
    removeTaskFromState(set, id);
    await taskRepository.softDelete(id);

    // Deletes made while the Undo toast is open join one batch: showing a new
    // toast fires the old one's onExpire, which used to make every delete but
    // the last permanent the moment the next row was swiped away. The token
    // turns the superseded toast's expiry into a no-op; only the batch's
    // final toast settles it, for all its tasks at once.
    pendingDeleteIds.push(id);
    const token = ++deleteBatchToken;
    const takeBatch = () => {
      if (token !== deleteBatchToken) return null;
      const ids = pendingDeleteIds;
      pendingDeleteIds = [];
      return ids;
    };
    const refreshViews = async () => {
      await refreshAfterMutation(get, existing.listId);
      await get().refreshDone();
      await get().refreshArchived();
    };
    const count = pendingDeleteIds.length;
    useToastStore.getState().show(count > 1 ? `${count} deleted` : 'Deleted', {
      key: 'delete-undo',
      action: {
        label: 'Undo',
        onPress: async () => {
          const ids = takeBatch();
          if (!ids) return;
          for (const taskId of ids) {
            await taskRepository.restoreDeleted(taskId);
          }
          await refreshViews();
        },
      },
      onExpire: async () => {
        const ids = takeBatch();
        if (!ids) return;
        for (const taskId of ids) {
          await taskRepository.deletePermanent(taskId);
        }
        await refreshViews();
      },
    });
  },

  setImportant: async (id) => {
    const existing = findTaskInState(get(), id) ?? (await taskRepository.getById(id));
    if (!existing) return;
    const nextPriority = existing.priority === 'important' ? 'normal' : 'important';
    patchTaskInState(set, id, { priority: nextPriority });
    await taskRepository.setPriority(id, nextPriority);
    await refreshAfterMutation(get, existing?.listId);
  },

  toggleRecurring: async (id) => {
    const isPro = getIsPro();
    const existing = await taskRepository.getById(id);
    // Repeating only makes sense for open tasks; completed rows ignore the action.
    if (!existing || existing.status !== 'active') return;

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

  // Clearing hides the history first and only deletes for real once the Undo
  // toast closes, matching how single deletes behave. Rows missed by the undo
  // window (app killed mid-toast) are finished by purgeSoftDeleted at launch.
  clearFinishedTasks: async () => {
    const marker = await taskRepository.softDeleteCompleted();
    const refreshViews = async () => {
      await get().refreshDone();
      await get().refreshToday();
      await get().refreshTomorrow();
    };
    await refreshViews();
    useToastStore.getState().show('Finished tasks cleared', {
      key: 'clear-finished',
      action: {
        label: 'Undo',
        onPress: async () => {
          await taskRepository.restoreClearedCompleted(marker);
          await refreshViews();
        },
      },
      onExpire: async () => {
        await taskRepository.purgeClearedCompleted(marker);
      },
    });
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
