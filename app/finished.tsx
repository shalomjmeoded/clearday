import { router } from 'expo-router';
import { Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { format, isBefore, parseISO, startOfDay, subDays } from 'date-fns';

import { Screen } from '@/components/layout/Screen';
import { TaskRow } from '@/components/tasks/TaskRow';
import { SearchBar, SearchToggle } from '@/components/ui/SearchBar';
import { SEARCH_RESULT_LIMIT } from '@/features/tasks/taskQueries';
import { useTaskSearch } from '@/hooks/useTaskSearch';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTaskStore } from '@/store/taskStore';
import { useTheme } from '@/theme/ThemeProvider';
import type { Task, TaskStatus } from '@/types/task';
import { triggerLightHaptic } from '@/utils/haptics';

type Section = { title: string; data: Task[]; archived?: boolean };

// Archived rows live nowhere else, so this is where a search must find them.
const SEARCH_STATUSES: readonly TaskStatus[] = ['completed', 'archived'];

/**
 * Recent days each get their own section; past ~30 days the day-by-day
 * breakdown stops carrying information, so older history collapses into
 * one section per month to keep a long history scannable. Archived tasks
 * are out of every list, so this is the one place they can be found and
 * brought back.
 */
function buildSections(doneTasks: Task[], archivedTasks: Task[]): Section[] {
  const dayDetailCutoff = subDays(startOfDay(new Date()), 30);
  const groups = new Map<string, Task[]>();
  for (const task of doneTasks) {
    let key = 'Earlier';
    if (task.completedAt) {
      const completed = parseISO(task.completedAt);
      key = isBefore(completed, dayDetailCutoff)
        ? format(completed, 'MMMM yyyy')
        : format(completed, 'EEEE, MMM d');
    }
    const list = groups.get(key) ?? [];
    list.push(task);
    groups.set(key, list);
  }
  const result: Section[] = [...groups.entries()].map(([title, data]) => ({
    title,
    data,
  }));
  if (archivedTasks.length > 0) {
    result.push({ title: 'Archived', data: archivedTasks, archived: true });
  }
  return result;
}

export default function FinishedTasksScreen() {
  const { tokens } = useTheme();
  const doneTasks = useTaskStore((s) => s.doneTasks);
  const archivedTasks = useTaskStore((s) => s.archivedTasks);
  const refreshDone = useTaskStore((s) => s.refreshDone);
  const loadMoreDone = useTaskStore((s) => s.loadMoreDone);
  const doneHasMore = useTaskStore((s) => s.doneHasMore);
  const refreshArchived = useTaskStore((s) => s.refreshArchived);
  const uncompleteTask = useTaskStore((s) => s.uncompleteTask);
  const unarchiveTask = useTaskStore((s) => s.unarchiveTask);
  const archiveTask = useTaskStore((s) => s.archiveTask);
  const deleteTaskWithUndo = useTaskStore((s) => s.deleteTaskWithUndo);
  const setImportant = useTaskStore((s) => s.setImportant);
  const toggleRecurring = useTaskStore((s) => s.toggleRecurring);
  const clearFinishedTasks = useTaskStore((s) => s.clearFinishedTasks);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const search = useTaskSearch(searchQuery, SEARCH_STATUSES);
  const searching = searchQuery.trim().length > 0;
  // Each status group is capped separately; say so rather than let a long
  // history look complete when it is not.
  const searchTruncated =
    searching &&
    ['completed', 'archived'].some(
      (status) =>
        search.results.filter((task) => task.status === status).length >=
        SEARCH_RESULT_LIMIT
    );

  useFocusEffect(
    useCallback(() => {
      refreshDone();
      refreshArchived();
    }, [refreshDone, refreshArchived])
  );

  const sections = useMemo((): Section[] => {
    if (searching) {
      // Results come back grouped by status (see searchTasks), so one split
      // is enough to feed the same sections the unfiltered history uses.
      return buildSections(
        search.results.filter((task) => task.status === 'completed'),
        search.results.filter((task) => task.status === 'archived')
      );
    }
    return buildSections(doneTasks, archivedTasks);
  }, [archivedTasks, doneTasks, search.results, searching]);

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

  const confirmClear = () => {
    Alert.alert(
      'Clear finished tasks?',
      'This deletes all completed tasks. You can undo for a few seconds afterwards.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear all',
          style: 'destructive',
          onPress: async () => {
            await triggerLightHaptic();
            await clearFinishedTasks();
          },
        },
      ]
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Finished Tasks',
          headerStyle: { backgroundColor: tokens.background },
          headerTintColor: tokens.accent,
          headerShadowVisible: false,
          headerRight: () => (
            <SearchToggle
              open={searchOpen}
              onPress={toggleSearch}
              label="Search finished tasks"
              color={tokens.accent}
            />
          ),
        }}
      />
      <Screen edges={['bottom']} style={{ backgroundColor: tokens.background }}>
        {searchOpen ? (
          <SearchBar
            value={searchQuery}
            onChangeText={setSearchQuery}
            onClose={closeSearch}
            placeholder="Search finished"
          />
        ) : null}
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          style={{ flex: 1, backgroundColor: tokens.background }}
          contentContainerStyle={[
            styles.listContent,
            sections.length === 0 && styles.listEmpty,
          ]}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          // Search already covers the whole table; paging would only append
          // unfiltered history under the matches.
          onEndReached={doneHasMore && !searching ? () => loadMoreDone() : undefined}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[typography.body, { color: tokens.mutedText }]}>
                {searching
                  ? search.active
                    ? 'No matches.'
                    : 'Searching…'
                  : 'No finished tasks yet.'}
              </Text>
            </View>
          }
          renderSectionHeader={({ section }) => (
            <Text
              style={[typography.caption, styles.sectionTitle, { color: tokens.mutedText }]}
            >
              {section.title}
            </Text>
          )}
          renderItem={({ item, section }) => (
            <TaskRow
              task={item}
              colorMark={item.color}
              restoreMode={Boolean(section.archived)}
              onComplete={() =>
                section.archived ? unarchiveTask(item.id) : uncompleteTask(item.id)
              }
              onPress={() => router.push(`/task/${item.id}`)}
              onArchive={() =>
                section.archived ? unarchiveTask(item.id) : archiveTask(item.id)
              }
              onDelete={() => deleteTaskWithUndo(item.id)}
              onPin={() => setImportant(item.id)}
              onToggleRecurring={() => toggleRecurring(item.id)}
            />
          )}
          ListFooterComponent={
            <>
              {searchTruncated ? (
                <Text
                  style={[typography.caption, styles.truncated, { color: tokens.mutedText }]}
                >
                  Showing the first {SEARCH_RESULT_LIMIT} matches. Try a more specific search.
                </Text>
              ) : null}
              {doneHasMore && !searching ? (
                <ActivityIndicator
                  style={styles.pagingSpinner}
                  color={tokens.mutedText}
                />
              ) : null}
              {doneTasks.length > 0 && !searching ? (
                <Pressable onPress={confirmClear} style={styles.clearBtn}>
                  <Text style={[typography.button, { color: tokens.danger }]}>
                    Clear finished tasks
                  </Text>
                </Pressable>
              ) : null}
            </>
          }
        />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: spacing.xl,
  },
  listEmpty: {
    flexGrow: 1,
  },
  empty: {
    paddingTop: spacing.xxl,
    alignItems: 'center',
  },
  sectionTitle: {
    paddingHorizontal: spacing.lg,
    // 24/8 keeps a header visually attached to the section it introduces
    // rather than hovering off the one above it.
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    letterSpacing: 0.4,
  },
  pagingSpinner: {
    paddingVertical: spacing.lg,
  },
  truncated: {
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  clearBtn: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    minHeight: 44,
    justifyContent: 'center',
  },
});
