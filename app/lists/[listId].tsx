import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { Screen } from '@/components/layout/Screen';
import { ScreenWithBottomBar } from '@/components/layout/ScreenWithBottomBar';
import { TaskList } from '@/components/tasks/TaskList';
import { listRepository } from '@/features/lists/listRepository';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTaskStore } from '@/store/taskStore';
import { useTheme } from '@/theme/ThemeProvider';
import { triggerLightHaptic, triggerSuccessHaptic } from '@/utils/haptics';
import { paramString } from '@/utils/routeParams';

export default function ListDetailScreen() {
  const { listId: listIdParam } = useLocalSearchParams<{ listId: string }>();
  const listId = paramString(listIdParam);
  const { tokens } = useTheme();
  const [listName, setListName] = useState('');
  const listTasks = useTaskStore((s) => s.listTasks);
  const refreshList = useTaskStore((s) => s.refreshList);
  const addTask = useTaskStore((s) => s.addTask);
  const completeTask = useTaskStore((s) => s.completeTask);
  const archiveTask = useTaskStore((s) => s.archiveTask);
  const moveToTomorrow = useTaskStore((s) => s.moveToTomorrow);

  useEffect(() => {
    if (!listId) return;
    listRepository.getById(listId).then((list) => {
      if (list) setListName(list.name);
    });
  }, [listId]);

  useFocusEffect(
    useCallback(() => {
      if (listId) refreshList(listId);
    }, [listId, refreshList])
  );

  if (!listId) {
    return (
      <Screen edges={['top', 'bottom']} variant="stack">
        <Text style={{ color: tokens.mutedText, padding: spacing.lg }}>
          List not found.
        </Text>
      </Screen>
    );
  }

  const header = (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
        <Text style={[typography.button, { color: tokens.accent, fontSize: 16 }]}>
          ← Back
        </Text>
      </Pressable>
      <Text style={[typography.screenTitle, { color: tokens.text }]}>{listName}</Text>
    </View>
  );

  return (
    <ScreenWithBottomBar
      header={header}
      onSubmit={(text) => addTask(text, listId)}
    >
      <TaskList
        activeTasks={listTasks}
        completedTasks={[]}
        emptyMessage="No tasks in this list."
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
      />
    </ScreenWithBottomBar>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
});
