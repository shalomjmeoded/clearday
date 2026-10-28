import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated';

import { ScreenWithBottomBar } from '@/components/layout/ScreenWithBottomBar';
import { TaskList } from '@/components/tasks/TaskList';
import { SearchBar, SearchToggle } from '@/components/ui/SearchBar';
import { INBOX_LIST_ID } from '@/db/constants';
import { taskMatchesSearch } from '@/features/tasks/taskQueries';
import { useTaskSearch } from '@/hooks/useTaskSearch';
import { MIN_TOUCH_TARGET } from '@/constants/layout';
import { radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useListStore } from '@/store/listStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTaskStore } from '@/store/taskStore';
import { useTheme } from '@/theme/ThemeProvider';
import type { QuickAddOptions } from '@/types/quickAdd';
import type { TaskSortMode } from '@/types/settings';
import { isOverdue, isToday, formatHeaderDate } from '@/utils/dates';
import { applyPartialOrder } from '@/utils/reorder';
import {
  triggerLightHaptic,
  triggerMediumHaptic,
  triggerSuccessHaptic,
} from '@/utils/haptics';
import type { Task, TaskStatus } from '@/types/task';

// Today only ever lists open work; finished matches belong to Finished.
const SEARCH_STATUSES: readonly TaskStatus[] = ['active'];

const SORT_OPTIONS: { key: TaskSortMode; label: string }[] = [
  { key: 'manual', label: 'Manual Sorting' },
  { key: 'scheduled', label: 'Scheduled Date' },
  { key: 'created', label: 'Created Date' },
  { key: 'modified', label: 'Modified Date' },
  { key: 'alpha', label: 'Alphabetical' },
  { key: 'color', label: 'Color Tag' },
];

function filterTasksByList(tasks: Task[], listId: string): Task[] {
  return tasks.filter((task) => (task.listId ?? INBOX_LIST_ID) === listId);
}

export default function TodayScreen() {
  const { tokens } = useTheme();
  const addInputRef = useRef<TextInput | null>(null);
  const closeAddTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeAddSubscriptionRef = useRef<ReturnType<typeof Keyboard.addListener> | null>(null);
  const lists = useListStore((s) => s.lists);
  const defaultListId = useSettingsStore((s) => s.settings.defaultListId);
  const todayTasks = useTaskStore((s) => s.todayTasks);
  const todayCompletedTasks = useTaskStore((s) => s.todayCompletedTasks);
  const tomorrowTasks = useTaskStore((s) => s.tomorrowTasks);
  const tomorrowCompletedTasks = useTaskStore((s) => s.tomorrowCompletedTasks);
  const laterTasks = useTaskStore((s) => s.laterTasks);
  const todayReady = useTaskStore((s) => s.todayReady);
  const refreshAll = useTaskStore((s) => s.refreshAll);
  const refreshLists = useListStore((s) => s.refresh);
  const addTask = useTaskStore((s) => s.addTask);
  const completeTask = useTaskStore((s) => s.completeTask);
  const uncompleteTask = useTaskStore((s) => s.uncompleteTask);
  const archiveTask = useTaskStore((s) => s.archiveTask);
  const deleteTaskWithUndo = useTaskStore((s) => s.deleteTaskWithUndo);
  const setImportant = useTaskStore((s) => s.setImportant);
  const toggleRecurring = useTaskStore((s) => s.toggleRecurring);
  const moveToTomorrow = useTaskStore((s) => s.moveToTomorrow);
  const reorderTasks = useTaskStore((s) => s.reorderTasks);
  const [statusFilter, setStatusFilter] = useState<'all' | 'overdue' | 'today' | 'tomorrow'>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [adding, setAdding] = useState(false);
  // Persisted: a sort chosen once should still be there tomorrow.
  const sortMode = useSettingsStore((s) => s.settings.todaySortMode);
  const setSetting = useSettingsStore((s) => s.setSetting);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  // Runs in SQL against the whole list rather than the loaded views, so a
  // task Today would never show (undated, captured last week) is still
  // findable from here.
  const search = useTaskSearch(searchQuery, SEARCH_STATUSES, { listId: defaultListId });
  const searching = searchQuery.trim().length > 0;

  useFocusEffect(
    useCallback(() => {
      refreshAll();
      refreshLists();
    }, [refreshAll, refreshLists])
  );

  const reorderMode = sortMode === 'manual';

  const allActiveTasks = useMemo(() => {
    const map = new Map<string, Task>();
    [...todayTasks, ...tomorrowTasks, ...laterTasks]
      .filter((task) => task.status === 'active')
      .forEach((task) => {
        map.set(task.id, task);
      });
    return [...map.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [todayTasks, tomorrowTasks, laterTasks]);

  const listColors = useMemo(
    () =>
      Object.fromEntries(
        lists
          .filter((list) => Boolean(list.color))
          .map((list) => [list.id, list.color as string])
      ),
    [lists]
  );

  const listNames = useMemo(
    () => Object.fromEntries(lists.map((list) => [list.id, list.name])),
    [lists]
  );

  const listScopedActive = useMemo(
    () => filterTasksByList(allActiveTasks, defaultListId),
    [allActiveTasks, defaultListId]
  );

  const filteredActive = useMemo(() => {
    let nextTasks: Task[];
    if (searching) {
      // The status tabs narrow the matches the same way they narrow the
      // unfiltered list: by membership in the view each tab stands for.
      const inView = (view: Task[]) => {
        const ids = new Set(view.map((task) => task.id));
        return search.results.filter((task) => ids.has(task.id));
      };
      if (statusFilter === 'overdue') {
        nextTasks = search.results.filter(
          (task) => task.dueDate && isOverdue(task.dueDate)
        );
      } else if (statusFilter === 'tomorrow') {
        nextTasks = inView(tomorrowTasks);
      } else if (statusFilter === 'today') {
        nextTasks = inView(todayTasks);
      } else {
        nextTasks = search.results;
      }
    } else if (statusFilter === 'overdue') {
      nextTasks = listScopedActive.filter(
        (task) => task.dueDate && isOverdue(task.dueDate)
      );
    } else if (statusFilter === 'tomorrow') {
      nextTasks = filterTasksByList(tomorrowTasks, defaultListId).filter(
        (task) => task.status === 'active'
      );
    } else if (statusFilter === 'today') {
      nextTasks = filterTasksByList(todayTasks, defaultListId).filter(
        (task) => task.status === 'active'
      );
    } else {
      nextTasks = filterTasksByList(allActiveTasks, defaultListId);
    }
    if (sortMode === 'scheduled') {
      return [...nextTasks].sort((a, b) => {
        const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        return aDate - bDate || a.sortOrder - b.sortOrder;
      });
    }
    if (sortMode === 'created') {
      return [...nextTasks].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    }
    if (sortMode === 'modified') {
      return [...nextTasks].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    }
    if (sortMode === 'alpha') {
      return [...nextTasks].sort((a, b) => a.title.localeCompare(b.title));
    }
    if (sortMode === 'color') {
      return [...nextTasks].sort((a, b) => {
        const aColor = a.color ?? listColors[a.listId ?? ''] ?? '';
        const bColor = b.color ?? listColors[b.listId ?? ''] ?? '';
        return aColor.localeCompare(bColor) || a.sortOrder - b.sortOrder;
      });
    }
    return nextTasks;
  }, [
    allActiveTasks,
    listScopedActive,
    listColors,
    defaultListId,
    search.results,
    searching,
    sortMode,
    statusFilter,
    todayTasks,
    tomorrowTasks,
  ]);

  const filteredCompleted = useMemo(() => {
    let completed: Task[];
    if (statusFilter === 'tomorrow') {
      completed = filterTasksByList(tomorrowCompletedTasks, defaultListId);
    } else if (statusFilter === 'today') {
      completed = filterTasksByList(
        todayCompletedTasks.filter(
          (task) =>
            !task.dueDate ||
            (task.dueDate && (isToday(task.dueDate) || isOverdue(task.dueDate)))
        ),
        defaultListId
      );
    } else if (statusFilter === 'overdue') {
      completed = [];
    } else {
      completed = filterTasksByList(todayCompletedTasks, defaultListId);
    }
    if (searching) {
      completed = completed.filter((task) => taskMatchesSearch(task, searchQuery));
    }
    return completed;
  }, [
    defaultListId,
    searchQuery,
    searching,
    statusFilter,
    todayCompletedTasks,
    tomorrowCompletedTasks,
  ]);

  const overdueCount = listScopedActive.filter(
    (task) => task.dueDate && isOverdue(task.dueDate)
  ).length;
  const todayCount = filterTasksByList(todayTasks, defaultListId).filter(
    (task) => task.status === 'active'
  ).length;
  const tomorrowCount = filterTasksByList(tomorrowTasks, defaultListId).filter(
    (task) => task.status === 'active'
  ).length;
  const statusTabs = [
    { key: 'all' as const, label: 'All', count: listScopedActive.length },
    { key: 'overdue' as const, label: 'Overdue', count: overdueCount },
    { key: 'today' as const, label: 'Today', count: todayCount },
    { key: 'tomorrow' as const, label: 'Tomorrow', count: tomorrowCount },
  ];

  const clearPendingQuickAddClose = useCallback(() => {
    if (closeAddTimerRef.current) {
      clearTimeout(closeAddTimerRef.current);
      closeAddTimerRef.current = null;
    }
    closeAddSubscriptionRef.current?.remove();
    closeAddSubscriptionRef.current = null;
  }, []);

  const closeQuickAddAfterKeyboard = useCallback(() => {
    clearPendingQuickAddClose();

    const finishClose = () => {
      clearPendingQuickAddClose();
      setAdding(false);
    };

    closeAddSubscriptionRef.current = Keyboard.addListener(
      'keyboardDidHide',
      finishClose
    );
    closeAddTimerRef.current = setTimeout(finishClose, 360);
  }, [clearPendingQuickAddClose]);

  useEffect(() => clearPendingQuickAddClose, [clearPendingQuickAddClose]);

  useEffect(() => {
    if (!adding) return;
    const timer = setTimeout(() => addInputRef.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, [adding]);

  const focusQuickAdd = () => {
    clearPendingQuickAddClose();
    setAdding(true);
    setTimeout(() => addInputRef.current?.focus(), 60);
  };

  const handleComplete = async (id: string) => {
    await triggerSuccessHaptic();
    await completeTask(id);
  };

  const handleUncomplete = async (id: string) => {
    await triggerLightHaptic();
    await uncompleteTask(id);
  };

  const handleArchive = async (id: string) => {
    await triggerLightHaptic();
    await archiveTask(id);
  };

  const handleDelete = async (id: string) => {
    await triggerLightHaptic();
    await deleteTaskWithUndo(id);
  };

  const handleAdd = async (text: string, options?: QuickAddOptions) => {
    const created = await addTask(text, defaultListId, options);
    if (!created) {
      Alert.alert('Could not add task', 'Please try again.');
      return;
    }
    closeQuickAddAfterKeyboard();
  };

  const openFocus = async () => {
    Keyboard.dismiss();
    await triggerMediumHaptic();
    router.push('/focus');
  };

  const openSettings = async () => {
    Keyboard.dismiss();
    await triggerMediumHaptic();
    router.push('/settings');
  };

  const toggleSearch = async () => {
    await triggerLightHaptic();
    if (searchOpen) Keyboard.dismiss();
    setSearchOpen((value) => !value);
    if (searchOpen) setSearchQuery('');
  };

  const closeSearch = () => {
    Keyboard.dismiss();
    setSearchOpen(false);
    setSearchQuery('');
  };

  const toggleOrder = async () => {
    Keyboard.dismiss();
    await triggerLightHaptic();
    setSortMenuOpen((value) => !value);
  };

  const header = (
    <View>
      <View style={[styles.header, styles.headerTop]}>
        <View style={styles.headerText}>
          <Text
            style={[typography.heroTitle, { color: tokens.text }]}
            accessibilityRole="header"
          >
            Today
          </Text>
          <Pressable
            onPress={async () => {
              await triggerLightHaptic();
              router.push('/lists');
            }}
            hitSlop={8}
            accessibilityRole="button"
            // The old label replaced the children outright, so the date and
            // the list name were never spoken at all.
            accessibilityLabel={`${formatHeaderDate()}. Showing list: ${
              lists.find((list) => list.id === defaultListId)?.name ?? 'Inbox'
            }`}
            accessibilityHint="Changes which list Today shows"
          >
            <Text
              style={[
                typography.caption,
                styles.date,
                { color: tokens.mutedText },
              ]}
            >
              {formatHeaderDate()}
              {' · '}
              <Text style={{ color: tokens.accent }}>
                {lists.find((list) => list.id === defaultListId)?.name ?? 'Inbox'}
              </Text>
            </Text>
          </Pressable>
        </View>
        <Pressable
          onPress={openFocus}
          accessibilityRole="button"
          accessibilityHint="Opens focus mode"
          style={({ pressed }) => [
            styles.focusBtn,
            {
              backgroundColor: tokens.accentSoft,
              borderColor: tokens.border,
              minHeight: MIN_TOUCH_TARGET,
            },
            pressed && styles.focusPressed,
          ]}
        >
          <Text style={[typography.button, { color: tokens.accent, fontSize: 15 }]}>
            Focus
          </Text>
        </Pressable>
      </View>
      <View style={styles.header}>
        <Pressable
          onPress={toggleOrder}
          accessibilityRole="button"
          accessibilityLabel={`Sort: ${
            SORT_OPTIONS.find((option) => option.key === sortMode)?.label
          }`}
          accessibilityHint="Opens the sort options"
          accessibilityState={{ expanded: sortMenuOpen }}
          // Stays inside the header's own 8pt bottom padding, so it cannot
          // overlap the status tabs below.
          hitSlop={4}
          style={({ pressed }) => [
            styles.sortPill,
            {
              backgroundColor: sortMenuOpen ? tokens.accentSoft : 'transparent',
              borderColor: tokens.border,
            },
            pressed && styles.focusPressed,
          ]}
        >
          <Ionicons name="list-outline" size={13} color={tokens.text} />
          <Text style={[typography.body, styles.sortText, { color: tokens.text }]}>
            {SORT_OPTIONS.find((option) => option.key === sortMode)?.label}
          </Text>
        </Pressable>
        <View style={styles.headerActions}>
          <SearchToggle open={searchOpen} onPress={toggleSearch} label="Search tasks" />
          <Pressable
            onPress={openSettings}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.focusPressed]}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
          >
            <Ionicons name="settings-outline" size={19} color={tokens.text} />
          </Pressable>
        </View>
      </View>
      {searchOpen ? (
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          onClose={closeSearch}
        />
      ) : null}
      {sortMenuOpen ? (
        <View
          style={[styles.sortMenu, { backgroundColor: tokens.card, borderColor: tokens.border }]}
          accessibilityRole="radiogroup"
        >
          {SORT_OPTIONS.map((option) => {
            const active = option.key === sortMode;
            return (
              <Pressable
                key={option.key}
                onPress={async () => {
                  Keyboard.dismiss();
                  await triggerLightHaptic();
                  setSortMenuOpen(false);
                  await setSetting('todaySortMode', option.key);
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                // Explicit, so the checkmark glyph on the active row cannot
                // leak into the label derived from children.
                accessibilityLabel={option.label}
                style={({ pressed }) => [styles.sortOption, pressed && { opacity: 0.72 }]}
              >
                <Text style={[typography.meta, { color: active ? tokens.accent : tokens.text }]}>
                  {option.label}
                </Text>
                {active ? <Ionicons name="checkmark" size={15} color={tokens.accent} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        contentContainerStyle={[styles.statusTabs, { borderBottomColor: tokens.border }]}
      >
        {statusTabs.map((tab) => {
          const active = statusFilter === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setStatusFilter(tab.key)}
              accessibilityRole="tab"
              // Tabs are selected, not checked — `selected` is what maps to the
              // iOS selected trait and to View.setSelected on Android.
              accessibilityState={{ selected: active }}
              // Without this the nested count reads as a bare trailing number
              // ("All 5"), and the active tab is marked only by an underline.
              accessibilityLabel={`${tab.label}, ${tab.count} ${
                tab.count === 1 ? 'task' : 'tasks'
              }`}
              style={styles.statusTab}
            >
              <Text
                style={[
                  typography.screenTitle,
                  styles.statusTabText,
                  { color: active ? tokens.text : tokens.mutedText },
                ]}
              >
                {tab.label}
                <Text style={[styles.statusTabCount, { color: tokens.mutedText }]}>
                  {'  '}
                  {tab.count}
                </Text>
              </Text>
              {active ? (
                <View style={[styles.activeUnderline, { backgroundColor: tokens.text }]} />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <ScreenWithBottomBar
      aboveTabBar
      onSubmit={handleAdd}
      header={header}
      inputRef={addInputRef}
      showInputBar
      inputBarActive={adding}
      keepEditing={adding}
      onDismissEmpty={closeQuickAddAfterKeyboard}
      inactiveInputContent={
        <View style={styles.idleAddWrap}>
          <Animated.View
            entering={ZoomIn.duration(180)}
            exiting={ZoomOut.duration(130)}
          >
            <Pressable
              onPress={focusQuickAdd}
              style={({ pressed }) => [
                styles.idleAddButton,
                { backgroundColor: tokens.accent },
                pressed && { opacity: 0.82, transform: [{ scale: 0.98 }] },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Add task"
            >
              <Ionicons name="add" size={26} color={tokens.onAccent} />
            </Pressable>
          </Animated.View>
        </View>
      }
    >
      <View style={styles.list}>
        <TaskList
          key={defaultListId}
          activeTasks={filteredActive}
          completedTasks={filteredCompleted}
          inlineCompleted
          loading={!todayReady}
          listNames={listNames}
          listColors={listColors}
          emptyMessage={
            searching
              ? search.active
                ? 'No matches.'
                : 'Searching…'
              : statusFilter === 'all'
                ? 'No tasks here.'
                : `No ${statusFilter} tasks.`
          }
          emptySubtitle={searching ? undefined : 'Capture it before it gets noisy.'}
          // A task added under an open search would not match it and seem
          // to vanish, so the empty state offers nothing while searching.
          emptyActionLabel={adding || searching ? undefined : 'Add a task'}
          onEmptyPress={adding || searching ? undefined : focusQuickAdd}
          onComplete={handleComplete}
          onUncomplete={handleUncomplete}
          onPress={(id) => router.push(`/task/${id}`)}
          onArchive={handleArchive}
          onMoveTomorrow={moveToTomorrow}
          onDelete={handleDelete}
          onSetImportant={setImportant}
          onToggleRecurring={toggleRecurring}
          onReorder={(orderedIds) =>
            // The list may be filtered; only the visible rows moved, so
            // hidden tasks keep their slots.
            reorderTasks(
              applyPartialOrder(
                listScopedActive.map((task) => task.id),
                orderedIds
              ),
              defaultListId
            )
          }
          // Search can surface tasks outside the loaded views, whose slots the
          // partial-order base does not know; results are for finding, not
          // arranging, so dragging pauses while the search bar is open.
          reorderMode={reorderMode && !searchOpen}
        />
      </View>
    </ScreenWithBottomBar>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  headerTop: {
    alignItems: 'flex-start',
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  headerText: { flexShrink: 0 },
  headerActions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  iconBtn: {
    minWidth: 36,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm + 2,
    // Matches the icon buttons in the same row, which already set its height,
    // so this costs no vertical space. 4pt of hitSlop takes it to 44.
    minHeight: 36,
    justifyContent: 'center',
  },
  sortText: { fontSize: 13, lineHeight: 17 },
  sortMenu: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  sortOption: {
    // Full-width menu rows, so height was the only thing short of 44. Brings
    // them in line with the other option sheets.
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusTabs: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md + 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statusTab: {
    // hitSlop would have to reach into the header above or the first task row
    // below, either of which would overlap something tappable. Growing is
    // safe here: `flex-end` keeps the label the same distance from the
    // underline, so only the space above it increases.
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'flex-end',
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm + 2,
  },
  statusTabText: { fontSize: 16, lineHeight: 21 },
  statusTabCount: { fontSize: 13, fontWeight: '500' },
  activeUnderline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -1,
    height: 2,
    borderRadius: 1,
  },
  date: { marginTop: spacing.xs },
  focusBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  focusPressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  list: { flex: 1 },
  idleAddWrap: {
    minHeight: 52,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  idleAddButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
