import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { ScreenWithBottomBar } from '@/components/layout/ScreenWithBottomBar';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { SearchBar, SearchToggle } from '@/components/ui/SearchBar';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TaskList } from '@/components/tasks/TaskList';
import { taskMatchesSearch } from '@/features/tasks/taskQueries';
import { useTaskSearch } from '@/hooks/useTaskSearch';
import type { QuickAddOptions } from '@/types/quickAdd';
import type { Task, TaskStatus } from '@/types/task';
import { spacing } from '@/theme/spacing';
import { localDayRangeIso } from '@/utils/dates';
import { useSettingsStore } from '@/store/settingsStore';
import { useTaskStore } from '@/store/taskStore';
import { dayIso } from '@/utils/scheduleDates';
import { triggerSuccessHaptic, triggerLightHaptic } from '@/utils/haptics';

// Schedule is about what is coming up, so search looks at every open task
// dated tomorrow or later — Tomorrow and Later together, since the point of
// searching is not knowing which one holds the task.
const SEARCH_STATUSES: readonly TaskStatus[] = ['active'];

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
  const deleteTaskWithUndo = useTaskStore((s) => s.deleteTaskWithUndo);
  const setImportant = useTaskStore((s) => s.setImportant);
  const toggleRecurring = useTaskStore((s) => s.toggleRecurring);
  const moveToTomorrow = useTaskStore((s) => s.moveToTomorrow);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searching = searchQuery.trim().length > 0;
  const search = useTaskSearch(searchQuery, SEARCH_STATUSES, {
    dueFrom: localDayRangeIso(1).start,
    activeOrder: 'date',
  });

  useFocusEffect(
    useCallback(() => {
      refreshTomorrow();
      refreshLater();
    }, [refreshTomorrow, refreshLater])
  );

  const tasks = searching
    ? search.results
    : segment === 'tomorrow'
      ? tomorrowTasks
      : laterTasks;
  const completedTasks = useMemo((): Task[] => {
    // Tomorrow's early finishes are the only completed rows this screen
    // holds; a search narrows them with the same matcher the SQL side uses.
    if (searching) {
      return tomorrowCompletedTasks.filter((task) => taskMatchesSearch(task, searchQuery));
    }
    if (segment !== 'tomorrow') return [];
    return tomorrowCompletedTasks;
  }, [searchQuery, searching, segment, tomorrowCompletedTasks]);

  const toggleSearch = async () => {
    await triggerLightHaptic();
    if (searchOpen) {
      Keyboard.dismiss();
      setSearchQuery('');
    }
    setSearchOpen((value) => !value);
  };

  const closeSearch = () => {
    Keyboard.dismiss();
    setSearchOpen(false);
    setSearchQuery('');
  };

  const handleComplete = async (id: string) => {
    await triggerSuccessHaptic();
    await completeTask(id);
  };

  const handleUncomplete = async (id: string) => {
    await triggerLightHaptic();
    await uncompleteTask(id);
  };
  const emptyMessage = searching
    ? search.active
      ? 'No matches.'
      : 'Searching…'
    : segment === 'tomorrow'
      ? 'Nothing for tomorrow.'
      : 'Nothing on the horizon.';
  const emptySubtitle = searching
    ? undefined
    : segment === 'tomorrow'
      ? 'Plan the next useful thing, or swipe a Today task to Tomorrow.'
      : 'Add anything with a date and it will land here.';
  const emptyActionLabel = searching
    ? undefined
    : segment === 'tomorrow'
      ? 'Add for tomorrow'
      : 'Add scheduled task';

  const handleAdd = async (text: string, options?: QuickAddOptions) => {
    // While searching the segment control is hidden, so a new task takes
    // the nearest day rather than a date the user cannot see.
    const defaultDueDate =
      searching || segment === 'tomorrow' ? dayIso(1) : dayIso(7);
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
        searching || segment === 'tomorrow'
          ? 'Add for tomorrow…'
          : 'Add with a date…'
      }
      header={
        <>
          <ScreenHeader
            title="Schedule"
            right={
              <SearchToggle
                open={searchOpen}
                onPress={toggleSearch}
                label="Search upcoming tasks"
              />
            }
          />
          {searchOpen ? (
            // Takes the segment control's slot (and its height, so the list
            // does not jump): results span both segments, and each row's
            // side date says where it falls.
            <View style={styles.searchSlot}>
              <SearchBar
                value={searchQuery}
                onChangeText={setSearchQuery}
                onClose={closeSearch}
                placeholder="Search upcoming"
              />
            </View>
          ) : (
            <SegmentedControl
              segments={[
                { key: 'tomorrow', label: 'Tomorrow' },
                { key: 'later', label: 'Later' },
              ]}
              value={segment}
              onChange={setSegment}
            />
          )}
        </>
      }
    >
      <View style={styles.list}>
        <TaskList
          activeTasks={tasks}
          completedTasks={completedTasks}
          inlineCompleted={searching || segment === 'tomorrow'}
          emptyMessage={emptyMessage}
          emptySubtitle={emptySubtitle}
          emptyActionLabel={emptyActionLabel}
          onEmptyPress={searching ? undefined : () => addInputRef.current?.focus()}
          onComplete={handleComplete}
          onUncomplete={handleUncomplete}
          onPress={(id) => router.push(`/task/${id}`)}
          onArchive={async (id) => {
            await triggerLightHaptic();
            await archiveTask(id);
          }}
          onMoveTomorrow={moveToTomorrow}
          onDelete={async (id) => {
            await triggerLightHaptic();
            await deleteTaskWithUndo(id);
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
  // SegmentedControl is ~49pt plus a 24pt bottom margin; the bar is 50pt.
  searchSlot: { marginBottom: spacing.lg - 1 },
});
