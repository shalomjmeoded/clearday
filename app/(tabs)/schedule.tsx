import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { ScreenWithBottomBar } from '@/components/layout/ScreenWithBottomBar';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TaskList } from '@/components/tasks/TaskList';
import type { QuickAddOptions } from '@/types/quickAdd';
import type { Task } from '@/types/task';
import { useTaskStore } from '@/store/taskStore';
import { dayIso } from '@/utils/scheduleDates';
import { triggerSuccessHaptic, triggerLightHaptic } from '@/utils/haptics';

export default function ScheduleScreen() {
  const [segment, setSegment] = useState('tomorrow');
  const tomorrowTasks = useTaskStore((s) => s.tomorrowTasks);
  const tomorrowCompletedTasks = useTaskStore((s) => s.tomorrowCompletedTasks);
  const laterTasks = useTaskStore((s) => s.laterTasks);
  const refreshTomorrow = useTaskStore((s) => s.refreshTomorrow);
  const refreshLater = useTaskStore((s) => s.refreshLater);
  const addTask = useTaskStore((s) => s.addTask);
  const completeTask = useTaskStore((s) => s.completeTask);
  const uncompleteTask = useTaskStore((s) => s.uncompleteTask);
  const archiveTask = useTaskStore((s) => s.archiveTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const setImportant = useTaskStore((s) => s.setImportant);
  const toggleRecurring = useTaskStore((s) => s.toggleRecurring);
  const moveToTomorrow = useTaskStore((s) => s.moveToTomorrow);

  useFocusEffect(
    useCallback(() => {
      refreshTomorrow();
      refreshLater();
    }, [refreshTomorrow, refreshLater])
  );

  const tasks = segment === 'tomorrow' ? tomorrowTasks : laterTasks;
  const completedTasks = useMemo((): Task[] => {
    if (segment !== 'tomorrow') return [];
    return tomorrowCompletedTasks;
  }, [segment, tomorrowCompletedTasks]);

  const handleComplete = async (id: string) => {
    await triggerSuccessHaptic();
    await completeTask(id);
  };

  const handleUncomplete = async (id: string) => {
    await triggerLightHaptic();
    await uncompleteTask(id);
  };
  const emptyMessage =
    segment === 'tomorrow'
      ? 'Nothing for tomorrow.'
      : 'Nothing on the horizon.';
  const emptySubtitle =
    segment === 'tomorrow'
      ? 'Add a task below, or swipe Today → Tomorrow.'
      : 'Add below with a date (e.g. “friday” or “in 2 weeks”).';

  const handleAdd = async (text: string, options?: QuickAddOptions) => {
    const defaultDueDate =
      segment === 'tomorrow' ? dayIso(1) : dayIso(7);
    const created = await addTask(text, undefined, { ...options, defaultDueDate });
    if (!created) {
      Alert.alert('Could not add task', 'Please try again.');
    }
  };

  return (
    <ScreenWithBottomBar
      aboveTabBar
      onSubmit={handleAdd}
      placeholder={
        segment === 'tomorrow'
          ? 'Add for tomorrow…'
          : 'Add with a date…'
      }
      header={
        <>
          <ScreenHeader title="Schedule" />
          <SegmentedControl
            segments={[
              { key: 'tomorrow', label: 'Tomorrow' },
              { key: 'later', label: 'Later' },
            ]}
            value={segment}
            onChange={setSegment}
          />
        </>
      }
    >
      <View style={styles.list}>
        <TaskList
          activeTasks={tasks}
          completedTasks={completedTasks}
          inlineCompleted={segment === 'tomorrow'}
          emptyMessage={emptyMessage}
          emptySubtitle={emptySubtitle}
          onComplete={handleComplete}
          onUncomplete={handleUncomplete}
          onPress={(id) => router.push(`/task/${id}`)}
          onArchive={async (id) => {
            await triggerLightHaptic();
            await archiveTask(id);
          }}
          onMoveTomorrow={moveToTomorrow}
          onDelete={(id) => {
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
          }}
          onSetImportant={setImportant}
          onToggleRecurring={toggleRecurring}
        />
      </View>
    </ScreenWithBottomBar>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
});
