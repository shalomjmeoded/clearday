import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { Screen } from '@/components/layout/Screen';
import { ScreenWithBottomBar } from '@/components/layout/ScreenWithBottomBar';
import { HeaderBackButton } from '@/components/navigation/HeaderBackButton';
import { TaskList } from '@/components/tasks/TaskList';
import { listRepository } from '@/features/lists/listRepository';
import { radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useSettingsStore } from '@/store/settingsStore';
import { useTaskStore } from '@/store/taskStore';
import { useTheme } from '@/theme/ThemeProvider';
import {
  triggerLightHaptic,
  triggerSelectionHaptic,
  triggerSuccessHaptic,
} from '@/utils/haptics';
import { paramString } from '@/utils/routeParams';

export default function ListDetailScreen() {
  const { listId: listIdParam } = useLocalSearchParams<{ listId: string }>();
  const listId = paramString(listIdParam);
  const addInputRef = useRef<TextInput | null>(null);
  const { tokens } = useTheme();
  const [listName, setListName] = useState('');
  const [listColor, setListColor] = useState<string | undefined>();
  const [reorderMode, setReorderMode] = useState(false);
  const defaultListId = useSettingsStore((s) => s.settings.defaultListId);
  const setSetting = useSettingsStore((s) => s.setSetting);
  const isTodayDefault = listId === defaultListId;
  const listTasks = useTaskStore((s) => s.listTasks);
  const refreshList = useTaskStore((s) => s.refreshList);
  const addTask = useTaskStore((s) => s.addTask);
  const completeTask = useTaskStore((s) => s.completeTask);
  const uncompleteTask = useTaskStore((s) => s.uncompleteTask);
  const archiveTask = useTaskStore((s) => s.archiveTask);
  const deleteTaskWithUndo = useTaskStore((s) => s.deleteTaskWithUndo);
  const setImportant = useTaskStore((s) => s.setImportant);
  const toggleRecurring = useTaskStore((s) => s.toggleRecurring);
  const moveToTomorrow = useTaskStore((s) => s.moveToTomorrow);
  const reorderTasks = useTaskStore((s) => s.reorderTasks);

  // Re-read on focus so a rename or recolor from the edit screen shows up.
  useFocusEffect(
    useCallback(() => {
      if (!listId) return;
      refreshList(listId);
      let cancelled = false;
      listRepository.getById(listId).then((list) => {
        if (list && !cancelled) {
          setListName(list.name);
          setListColor(list.color);
        }
      });
      return () => {
        cancelled = true;
      };
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

  const useForToday = async () => {
    if (!listId || isTodayDefault) return;
    await triggerSelectionHaptic();
    await setSetting('defaultListId', listId);
  };

  const header = (
    <View style={styles.header}>
      <HeaderBackButton tokens={tokens} />
      <View style={styles.titleRow}>
        {listColor ? (
          <View style={[styles.colorDot, { backgroundColor: listColor }]} />
        ) : null}
        <Text style={[typography.screenTitle, { color: tokens.text }]}>{listName}</Text>
      </View>
      <View style={styles.actionsRow}>
        <Pressable
          onPress={useForToday}
          accessibilityRole="button"
          accessibilityLabel={
            isTodayDefault ? 'Shown on Today' : 'Show this list on Today'
          }
          style={({ pressed }) => [
            styles.actionPill,
            {
              backgroundColor: isTodayDefault ? tokens.accentSoft : 'transparent',
              borderColor: isTodayDefault ? tokens.accent : tokens.border,
            },
            pressed && !isTodayDefault && { opacity: 0.75 },
          ]}
        >
          <Text
            style={[
              typography.button,
              styles.actionLabel,
              { color: isTodayDefault ? tokens.accent : tokens.mutedText },
            ]}
          >
            {isTodayDefault ? 'On Today ✓' : 'Use for Today'}
          </Text>
        </Pressable>
        <Pressable
          onPress={async () => {
            await triggerLightHaptic();
            setReorderMode((value) => !value);
          }}
          accessibilityRole="button"
          accessibilityLabel="Reorder tasks"
          style={({ pressed }) => [
            styles.actionPill,
            {
              backgroundColor: reorderMode ? tokens.accent : 'transparent',
              borderColor: reorderMode ? tokens.accent : tokens.border,
            },
            pressed && { opacity: 0.75 },
          ]}
        >
          <Text
            style={[
              typography.button,
              styles.actionLabel,
              { color: reorderMode ? tokens.onAccent : tokens.mutedText },
            ]}
          >
            Order
          </Text>
        </Pressable>
        <Pressable
          onPress={async () => {
            await triggerLightHaptic();
            router.push(`/list/${listId}`);
          }}
          accessibilityRole="button"
          accessibilityLabel="Edit list name and color"
          style={({ pressed }) => [
            styles.actionPill,
            { borderColor: tokens.border },
            pressed && { opacity: 0.75 },
          ]}
        >
          <Text style={[typography.button, styles.actionLabel, { color: tokens.mutedText }]}>
            Edit
          </Text>
        </Pressable>
      </View>
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
        onDelete={async (id) => {
          await triggerLightHaptic();
          await deleteTaskWithUndo(id);
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
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionPill: {
    minHeight: 36,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  actionLabel: { fontSize: 14 },
});
