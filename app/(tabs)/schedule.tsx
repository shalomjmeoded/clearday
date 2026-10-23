import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { ScreenWithBottomBar } from '@/components/layout/ScreenWithBottomBar';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TaskList } from '@/components/tasks/TaskList';
import type { QuickAddOptions } from '@/types/quickAdd';
import type { Task } from '@/types/task';
import { useSettingsStore } from '@/store/settingsStore';
import { useTaskStore } from '@/store/taskStore';
import { dayIso } from '@/utils/scheduleDates';
import { triggerSuccessHaptic, triggerLightHaptic } from '@/utils/haptics';

export default function ScheduleScreen() {
  const addInputRef = useRef<TextInput | null>(null);
  const [segment, setSegment] = useState('tomorrow');
  const defaultListId = useSettingsStore((s) => s.settings.defaultListId);
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
      ? 'Plan the next useful thing, or swipe a Today task to Tomorrow.'
      : 'Add anything with a date and it will land here.';
  const emptyActionLabel =
    segment === 'tomorrow' ? 'Add for tomorrow' : 'Add scheduled task';

  const handleAdd = async (text: string, options?: QuickAddOptions) => {
    const defaultDueDate =
      segment === 'tomorrow' ? dayIso(1) : dayIso(7);
    // Use the same list as Today, so a task added here is not stranded in
    // Inbox and invisible on a list-scoped Today.
    const created = await addTask(text, defaultListId, {
      ...options,
      defaultDueDate,
    });
    if (!created) {
      Alert.alert('Could not add task', 'Please try again.');
    }
  };

  return (
    <ScreenWithBottomBar
      aboveTabBar
      onSubmit={handleAdd}
      inputRef={addInputRef}
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
          emptyActionLabel={emptyActionLabel}
          onEmptyPress={() => addInputRef.current?.focus()}
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
