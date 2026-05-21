import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { AdSlot } from '@/components/ads/AdSlot';
import { ScreenWithBottomBar } from '@/components/layout/ScreenWithBottomBar';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TaskList } from '@/components/tasks/TaskList';
import { useTaskStore } from '@/store/taskStore';
import { dayIso } from '@/utils/scheduleDates';
import { triggerSuccessHaptic, triggerLightHaptic } from '@/utils/haptics';

export default function ScheduleScreen() {
  const [segment, setSegment] = useState('tomorrow');
  const tomorrowTasks = useTaskStore((s) => s.tomorrowTasks);
  const laterTasks = useTaskStore((s) => s.laterTasks);
  const refreshTomorrow = useTaskStore((s) => s.refreshTomorrow);
  const refreshLater = useTaskStore((s) => s.refreshLater);
  const addTask = useTaskStore((s) => s.addTask);
  const completeTask = useTaskStore((s) => s.completeTask);
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
  const emptyMessage =
    segment === 'tomorrow'
      ? 'Nothing for tomorrow.'
      : 'Nothing on the horizon.';
  const emptySubtitle =
    segment === 'tomorrow'
      ? 'Add a task below, or swipe Today → Tomorrow.'
      : 'Add below with a date (e.g. “friday” or “in 2 weeks”).';

  const handleAdd = async (text: string) => {
    const defaultDueDate =
      segment === 'tomorrow' ? dayIso(1) : dayIso(7);
    const created = await addTask(text, undefined, { defaultDueDate });
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
          completedTasks={[]}
          emptyMessage={emptyMessage}
          emptySubtitle={emptySubtitle}
          onComplete={async (id) => {
            await triggerSuccessHaptic();
            await completeTask(id);
          }}
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
          ListFooterExtra={
            <View style={styles.adWrap}>
              <AdSlot placement="schedule_bottom" />
            </View>
          }
        />
      </View>
    </ScreenWithBottomBar>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  adWrap: { marginTop: 0 },
});
