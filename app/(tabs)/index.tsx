import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { ScreenWithBottomBar } from '@/components/layout/ScreenWithBottomBar';
import { TaskList } from '@/components/tasks/TaskList';
import {
  TODAY_FILTER_ALL,
  TodayListFilter,
} from '@/components/today/TodayListFilter';
import { INBOX_LIST_ID } from '@/db/constants';
import { MIN_TOUCH_TARGET } from '@/constants/layout';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useListStore } from '@/store/listStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTaskStore } from '@/store/taskStore';
import { useTheme } from '@/theme/ThemeProvider';
import { formatHeaderDate } from '@/utils/dates';
import {
  triggerLightHaptic,
  triggerMediumHaptic,
  triggerSuccessHaptic,
} from '@/utils/haptics';
import type { Task } from '@/types/task';

function filterTasksByList(tasks: Task[], listFilter: string): Task[] {
  if (listFilter === TODAY_FILTER_ALL) return tasks;
  return tasks.filter(
    (t) => (t.listId ?? INBOX_LIST_ID) === listFilter
  );
}

export default function TodayScreen() {
  const { tokens } = useTheme();
  const lists = useListStore((s) => s.lists);
  const defaultListId = useSettingsStore((s) => s.settings.defaultListId);
  const todayTasks = useTaskStore((s) => s.todayTasks);
  const todayCompletedTasks = useTaskStore((s) => s.todayCompletedTasks);
  const todayReady = useTaskStore((s) => s.todayReady);
  const refreshToday = useTaskStore((s) => s.refreshToday);
  const refreshLists = useListStore((s) => s.refresh);
  const addTask = useTaskStore((s) => s.addTask);
  const completeTask = useTaskStore((s) => s.completeTask);
  const uncompleteTask = useTaskStore((s) => s.uncompleteTask);
  const archiveTask = useTaskStore((s) => s.archiveTask);
  const moveToTomorrow = useTaskStore((s) => s.moveToTomorrow);
  const [listFilter, setListFilter] = useState(TODAY_FILTER_ALL);

  useFocusEffect(
    useCallback(() => {
      refreshToday();
      refreshLists();
    }, [refreshToday, refreshLists])
  );

  const filteredActive = useMemo(
    () => filterTasksByList(todayTasks, listFilter),
    [todayTasks, listFilter]
  );
  const filteredCompleted = useMemo(
    () => filterTasksByList(todayCompletedTasks, listFilter),
    [todayCompletedTasks, listFilter]
  );

  const addTargetListId =
    listFilter === TODAY_FILTER_ALL ? defaultListId : listFilter;
  const addTargetListName =
    lists.find((l) => l.id === addTargetListId)?.name ?? 'Inbox';

  const handleComplete = async (id: string) => {
    if (todayCompletedTasks.some((t) => t.id === id)) {
      await triggerLightHaptic();
      await uncompleteTask(id);
      return;
    }
    await triggerSuccessHaptic();
    await completeTask(id);
  };

  const handleArchive = async (id: string) => {
    await triggerLightHaptic();
    await archiveTask(id);
  };

  const handleAdd = async (text: string) => {
    const created = await addTask(text, addTargetListId);
    if (!created) {
      Alert.alert('Could not add task', 'Please try again.');
    }
  };

  const openFocus = async () => {
    await triggerMediumHaptic();
    router.push('/focus');
  };

  const header = (
    <View>
      <View style={styles.header}>
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
          </Text>
          <Text style={[typography.meta, styles.defaultHint, { color: tokens.mutedText }]}>
            Adding to {addTargetListName}
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
          <Text
            style={[
              typography.button,
              { color: tokens.accent, fontSize: 15 },
            ]}
          >
            Focus
          </Text>
        </Pressable>
      </View>
      {lists.length > 0 ? (
        <TodayListFilter
          lists={lists}
          value={listFilter}
          onChange={setListFilter}
        />
      ) : null}
    </View>
  );

  return (
    <ScreenWithBottomBar aboveTabBar onSubmit={handleAdd} header={header}>
      <View style={styles.list}>
        <TaskList
          activeTasks={filteredActive}
          completedTasks={filteredCompleted}
          loading={!todayReady}
          adPlacement="today_after_tasks"
          hideAdWhenKeyboardOpen
          emptyMessage={
            listFilter === TODAY_FILTER_ALL
              ? 'Nothing for today. Nice.'
              : 'Nothing for this list today.'
          }
          emptySubtitle="Tap below when something comes to mind."
          onComplete={handleComplete}
          onPress={(id) => router.push(`/task/${id}`)}
          onArchive={handleArchive}
          onMoveTomorrow={moveToTomorrow}
        />
      </View>
    </ScreenWithBottomBar>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerText: { flex: 1, gap: spacing.xs },
  date: { marginTop: spacing.xs },
  defaultHint: {
    marginTop: spacing.xs,
    textTransform: 'none',
    letterSpacing: 0,
  },
  focusBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: spacing.md + 2,
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  focusPressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  list: { flex: 1 },
});
