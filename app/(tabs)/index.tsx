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

import { ScreenWithBottomBar } from '@/components/layout/ScreenWithBottomBar';
import { TaskList } from '@/components/tasks/TaskList';
import { INBOX_LIST_ID } from '@/db/constants';
import { MIN_TOUCH_TARGET } from '@/constants/layout';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useListStore } from '@/store/listStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTaskStore } from '@/store/taskStore';
import { useTheme } from '@/theme/ThemeProvider';
import type { QuickAddOptions } from '@/types/quickAdd';
import { isOverdue, isToday, formatHeaderDate } from '@/utils/dates';
import { applyPartialOrder } from '@/utils/reorder';
import {
  triggerLightHaptic,
  triggerMediumHaptic,
  triggerSuccessHaptic,
} from '@/utils/haptics';
import type { Task } from '@/types/task';

type TaskSortMode =
  | 'manual'
  | 'scheduled'
  | 'created'
  | 'modified'
  | 'alpha'
  | 'color';

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
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const setImportant = useTaskStore((s) => s.setImportant);
  const toggleRecurring = useTaskStore((s) => s.toggleRecurring);
  const moveToTomorrow = useTaskStore((s) => s.moveToTomorrow);
  const reorderTasks = useTaskStore((s) => s.reorderTasks);
  const [statusFilter, setStatusFilter] = useState<'all' | 'overdue' | 'today' | 'tomorrow'>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [sortMode, setSortMode] = useState<TaskSortMode>('manual');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

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
    if (statusFilter === 'overdue') {
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
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      nextTasks = nextTasks.filter(
        (task) =>
          task.title.toLowerCase().includes(query) ||
          (task.notes ?? '').toLowerCase().includes(query)
      );
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
    listScopedActive,
    listColors,
    defaultListId,
    searchQuery,
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
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      completed = completed.filter(
        (task) =>
          task.title.toLowerCase().includes(query) ||
          (task.notes ?? '').toLowerCase().includes(query)
      );
    }
    return completed;
  }, [
    defaultListId,
    searchQuery,
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
    Alert.alert('Delete task?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await triggerLightHaptic();
          await deleteTask(id);
        },
      },
    ]);
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

  const openLists = async () => {
    Keyboard.dismiss();
    await triggerMediumHaptic();
    router.push('/lists');
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
          <Text style={[typography.heroTitle, { color: tokens.text }]}>
            Today
          </Text>
          <Text
            style={[
              typography.caption,
              styles.date,
              { color: tokens.mutedText },
            ]}
          >
            {formatHeaderDate()}
            {' · '}
            {lists.find((list) => list.id === defaultListId)?.name ?? 'Inbox'}
          </Text>
        </View>
        <Pressable
          onPress={openFocus}
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
          <Pressable
            onPress={toggleSearch}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.focusPressed]}
            hitSlop={10}
          >
            <Ionicons name="search-outline" size={19} color={tokens.text} />
          </Pressable>
          <Pressable
            onPress={openLists}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.focusPressed]}
            hitSlop={10}
          >
            <Ionicons name="folder-outline" size={19} color={tokens.text} />
          </Pressable>
          <Pressable
            onPress={openSettings}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.focusPressed]}
          >
            <Ionicons name="settings-outline" size={19} color={tokens.text} />
          </Pressable>
        </View>
      </View>
      {searchOpen ? (
        <View style={styles.searchWrap}>
          <View
            style={[
              styles.searchBox,
              {
                borderColor: tokens.border,
                backgroundColor: tokens.sectionBg,
              },
            ]}
          >
            <Ionicons name="search-outline" size={16} color={tokens.mutedText} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
              placeholder="Search"
              placeholderTextColor={tokens.mutedText}
              style={[typography.body, styles.searchInput, { color: tokens.text }]}
            />
            {searchQuery ? (
              <Pressable
                onPress={() => setSearchQuery('')}
                style={({ pressed }) => [styles.searchIconBtn, pressed && styles.focusPressed]}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={17} color={tokens.mutedText} />
              </Pressable>
            ) : null}
            <Pressable
              onPress={closeSearch}
              style={({ pressed }) => [styles.searchIconBtn, pressed && styles.focusPressed]}
              accessibilityRole="button"
              accessibilityLabel="Close search"
              hitSlop={8}
            >
              <Ionicons name="chevron-up" size={18} color={tokens.mutedText} />
            </Pressable>
          </View>
        </View>
      ) : null}
      {sortMenuOpen ? (
        <View style={[styles.sortMenu, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
          {SORT_OPTIONS.map((option) => {
            const active = option.key === sortMode;
            return (
              <Pressable
                key={option.key}
                onPress={async () => {
                  Keyboard.dismiss();
                  await triggerLightHaptic();
                  setSortMode(option.key);
                  setSortMenuOpen(false);
                }}
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
        contentContainerStyle={styles.statusTabs}
      >
        {statusTabs.map((tab) => {
          const active = statusFilter === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setStatusFilter(tab.key)}
              style={styles.statusTab}
            >
              <Text
                style={[
                  typography.screenTitle,
                  styles.statusTabText,
                  { color: active ? tokens.text : tokens.mutedText },
                ]}
              >
                {tab.label} ({tab.count})
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
            <Ionicons name="add" size={26} color="#fff" />
          </Pressable>
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
            statusFilter === 'all'
              ? 'No tasks here.'
              : `No ${statusFilter} tasks.`
          }
          emptySubtitle="Capture it before it gets noisy."
          emptyActionLabel={adding ? undefined : 'Add a task'}
          onEmptyPress={adding ? undefined : focusQuickAdd}
          onComplete={handleComplete}
          onUncomplete={handleUncomplete}
          onPress={(id) => router.push(`/task/${id}`)}
          onArchive={handleArchive}
          onMoveTomorrow={moveToTomorrow}
          onDelete={handleDelete}
          onSetImportant={setImportant}
          onToggleRecurring={toggleRecurring}
          onReorder={(orderedIds) =>
            // The list may be filtered or searched; only the visible rows
            // moved, so hidden tasks keep their slots.
            reorderTasks(
              applyPartialOrder(
                listScopedActive.map((task) => task.id),
                orderedIds
              ),
              defaultListId
            )
          }
          reorderMode={reorderMode}
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
    minWidth: 25,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.xs,
    minHeight: 25,
    flex: 1,
    justifyContent: 'center',
  },
  sortText: { fontSize: 12, lineHeight: 15 },
  searchWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  searchBox: {
    minHeight: 38,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  searchInput: {
    paddingVertical: spacing.xs,
    paddingHorizontal: 0,
    fontSize: 16,
    flex: 1,
  },
  searchIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortMenu: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  sortOption: {
    minHeight: 34,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusTabs: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md + 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2F3638',
  },
  statusTab: {
    minHeight: 38,
    justifyContent: 'flex-end',
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm + 2,
  },
  statusTabText: { fontSize: 16, lineHeight: 21 },
  activeUnderline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -1,
    height: 4,
    borderRadius: 3,
  },
  date: { marginTop: -2 },
  defaultHint: {
    marginTop: 0,
    textTransform: 'none',
    letterSpacing: 0,
  },
  focusBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
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
