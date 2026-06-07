import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { Screen } from '@/components/layout/Screen';
import { ScreenWithBottomBar } from '@/components/layout/ScreenWithBottomBar';
import { HeaderBackButton } from '@/components/navigation/HeaderBackButton';
import { TaskList } from '@/components/tasks/TaskList';
import { listRepository } from '@/features/lists/listRepository';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import type { QuickAddOptions } from '@/types/quickAdd';
import { useTaskStore } from '@/store/taskStore';
import { useTheme } from '@/theme/ThemeProvider';
import { triggerLightHaptic, triggerSuccessHaptic } from '@/utils/haptics';
import { paramString } from '@/utils/routeParams';

export default function ListDetailScreen() {
  const { listId: listIdParam } = useLocalSearchParams<{ listId: string }>();
  const listId = paramString(listIdParam);
  const addInputRef = useRef<TextInput | null>(null);
  const { tokens } = useTheme();
  const [listName, setListName] = useState('');
  const [listColor, setListColor] = useState<string | undefined>();
  const [reorderMode, setReorderMode] = useState(false);
  const listTasks = useTaskStore((s) => s.listTasks);
  const refreshList = useTaskStore((s) => s.refreshList);
  const addTask = useTaskStore((s) => s.addTask);
  const completeTask = useTaskStore((s) => s.completeTask);
  const uncompleteTask = useTaskStore((s) => s.uncompleteTask);
  const archiveTask = useTaskStore((s) => s.archiveTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const setImportant = useTaskStore((s) => s.setImportant);
  const toggleRecurring = useTaskStore((s) => s.toggleRecurring);
  const moveToTomorrow = useTaskStore((s) => s.moveToTomorrow);
  const reorderTasks = useTaskStore((s) => s.reorderTasks);

  useEffect(() => {
    if (!listId) return;
    listRepository.getById(listId).then((list) => {
      if (list) {
        setListName(list.name);
        setListColor(list.color);
      }
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
      <HeaderBackButton tokens={tokens} />
      <View style={styles.titleRow}>
        {listColor ? (
          <View style={[styles.colorDot, { backgroundColor: listColor }]} />
        ) : null}
        <Text style={[typography.screenTitle, { color: tokens.text }]}>{listName}</Text>
      </View>
      <Pressable
        onPress={async () => {
          await triggerLightHaptic();
          setReorderMode((value) => !value);
        }}
        style={({ pressed }) => [
          styles.orderButton,
          {
            backgroundColor: reorderMode ? tokens.accent : tokens.accentSoft,
            borderColor: tokens.border,
          },
          pressed && { opacity: 0.75 },
        ]}
      >
        <Text
          style={[
            typography.button,
            { color: reorderMode ? tokens.onAccent : tokens.accent },
          ]}
        >
          Order
        </Text>
      </Pressable>
    </View>
  );

  return (
    <ScreenWithBottomBar
      header={header}
      onSubmit={(text, options) => addTask(text, listId, options)}
      inputRef={addInputRef}
    >
      <TaskList
        activeTasks={listTasks}
        completedTasks={[]}
        listColors={listColor ? { [listId]: listColor } : undefined}
        emptyMessage="No tasks in this list."
        emptySubtitle="Start this list with one clear next step."
        emptyActionLabel="Add to this list"
        onEmptyPress={() => addInputRef.current?.focus()}
        onComplete={async (id) => {
          await triggerSuccessHaptic();
          await completeTask(id);
        }}
        onUncomplete={async (id) => {
          await triggerLightHaptic();
          await uncompleteTask(id);
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
        onReorder={(orderedIds) => reorderTasks(orderedIds, listId)}
        reorderMode={reorderMode}
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  colorDot: { width: 12, height: 12, borderRadius: 6 },
  orderButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
});
