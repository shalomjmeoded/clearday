import { router } from 'expo-router';
import { Stack } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Alert, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { format, parseISO } from 'date-fns';

import { Screen } from '@/components/layout/Screen';
import { TaskRow } from '@/components/tasks/TaskRow';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTaskStore } from '@/store/taskStore';
import { useTheme } from '@/theme/ThemeProvider';
import type { Task } from '@/types/task';
import { triggerLightHaptic } from '@/utils/haptics';

type Section = { title: string; data: Task[]; archived?: boolean };

export default function FinishedTasksScreen() {
  const { tokens } = useTheme();
  const doneTasks = useTaskStore((s) => s.doneTasks);
  const archivedTasks = useTaskStore((s) => s.archivedTasks);
  const refreshDone = useTaskStore((s) => s.refreshDone);
  const refreshArchived = useTaskStore((s) => s.refreshArchived);
  const uncompleteTask = useTaskStore((s) => s.uncompleteTask);
  const unarchiveTask = useTaskStore((s) => s.unarchiveTask);
  const archiveTask = useTaskStore((s) => s.archiveTask);
  const deleteTaskWithUndo = useTaskStore((s) => s.deleteTaskWithUndo);
  const setImportant = useTaskStore((s) => s.setImportant);
  const toggleRecurring = useTaskStore((s) => s.toggleRecurring);
  const clearFinishedTasks = useTaskStore((s) => s.clearFinishedTasks);

  useFocusEffect(
    useCallback(() => {
      refreshDone();
      refreshArchived();
    }, [refreshDone, refreshArchived])
  );

  const sections = useMemo((): Section[] => {
    const groups = new Map<string, Task[]>();
    for (const task of doneTasks) {
      const key = task.completedAt
        ? format(parseISO(task.completedAt), 'EEEE, MMM d')
        : 'Earlier';
      const list = groups.get(key) ?? [];
      list.push(task);
      groups.set(key, list);
    }
    const result: Section[] = [...groups.entries()].map(([title, data]) => ({
      title,
      data,
    }));
    // Archived tasks are out of every list, so this is the one place they
    // can be found and brought back.
    if (archivedTasks.length > 0) {
      result.push({ title: 'Archived', data: archivedTasks, archived: true });
    }
    return result;
  }, [archivedTasks, doneTasks]);

  const confirmClear = () => {
    Alert.alert(
      'Clear finished tasks?',
      'This permanently deletes all completed tasks. This cannot be undone.',
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
        }}
      />
      <Screen edges={['bottom']} style={{ backgroundColor: tokens.background }}>
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
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[typography.body, { color: tokens.mutedText }]}>
                No finished tasks yet.
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
            doneTasks.length > 0 ? (
              <Pressable onPress={confirmClear} style={styles.clearBtn}>
                <Text style={[typography.button, { color: tokens.danger }]}>
                  Clear finished tasks
                </Text>
              </Pressable>
            ) : null
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
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
    letterSpacing: 0.4,
  },
  clearBtn: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    minHeight: 44,
    justifyContent: 'center',
  },
});
