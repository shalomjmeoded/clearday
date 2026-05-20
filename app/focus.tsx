import { router } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen } from '@/components/layout/Screen';
import { MIN_TOUCH_TARGET } from '@/constants/layout';
import { TaskCheckbox } from '@/components/tasks/TaskCheckbox';
import { radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useFocusStore } from '@/store/focusStore';
import { useTaskStore } from '@/store/taskStore';
import { useTheme } from '@/theme/ThemeProvider';
import {
  triggerMediumHaptic,
  triggerSelectionHaptic,
  triggerSuccessHaptic,
  triggerSoftHaptic,
} from '@/utils/haptics';

const FOCUS_KEEP_AWAKE_TAG = 'clearday-focus';

function FocusKeepAwake() {
  useKeepAwake(FOCUS_KEEP_AWAKE_TAG);
  return null;
}

export default function FocusScreen() {
  const { tokens } = useTheme();
  const todayTasks = useTaskStore((s) => s.todayTasks);
  const refreshToday = useTaskStore((s) => s.refreshToday);
  const completeTask = useTaskStore((s) => s.completeTask);
  const selectedIds = useFocusStore((s) => s.selectedIds);
  const active = useFocusStore((s) => s.active);
  const toggleSelect = useFocusStore((s) => s.toggleSelect);
  const startFocus = useFocusStore((s) => s.startFocus);
  const exitFocus = useFocusStore((s) => s.exitFocus);
  const clearSelection = useFocusStore((s) => s.clearSelection);

  useFocusEffect(
    useCallback(() => {
      refreshToday();
      if (!useFocusStore.getState().active) {
        clearSelection();
      }
    }, [refreshToday, clearSelection])
  );

  const focusTasks = active
    ? todayTasks.filter((t) => selectedIds.includes(t.id))
    : todayTasks;

  const handleStart = async () => {
    await triggerMediumHaptic();
    startFocus();
  };

  const handleExit = async () => {
    await triggerSoftHaptic();
    exitFocus();
    clearSelection();
    router.back();
  };

  const handleToggle = async (id: string) => {
    await triggerSelectionHaptic();
    toggleSelect(id);
  };

  if (active) {
    return (
      <Screen variant="stack" edges={['top', 'bottom']} style={styles.screen}>
        <FocusKeepAwake />
        <View style={styles.header}>
          <Text style={[typography.screenTitle, { color: tokens.text }]}>
            Focus
          </Text>
          <Pressable onPress={handleExit} hitSlop={12}>
            <Text style={[typography.button, { color: tokens.accent, fontSize: 15 }]}>
              Exit
            </Text>
          </Pressable>
        </View>
        <ScrollView
          style={{ flex: 1, backgroundColor: tokens.background }}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {focusTasks.length === 0 ? (
            <Text style={[typography.empty, styles.empty, { color: tokens.mutedText }]}>
              All done. Nice work.
            </Text>
          ) : (
            focusTasks.map((task) => (
              <View
                key={task.id}
                style={[styles.focusRow, { borderBottomColor: tokens.border }]}
              >
                <TaskCheckbox
                  checked={false}
                  priority={task.priority}
                  onPress={async () => {
                    await triggerSuccessHaptic();
                    await completeTask(task.id);
                    await refreshToday();
                  }}
                />
                <Text style={[typography.taskTitle, { color: tokens.text, flex: 1 }]}>
                  {task.title}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen variant="stack" edges={['top', 'bottom']} style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={async () => {
            await triggerSoftHaptic();
            clearSelection();
            router.back();
          }}
          hitSlop={12}
        >
          <Text style={[typography.button, { color: tokens.accent, fontSize: 15 }]}>
            Cancel
          </Text>
        </Pressable>
        <Text style={[typography.screenTitle, { color: tokens.text }]}>
          Choose focus
        </Text>
        <View style={styles.headerSpacer} />
      </View>
      <Text style={[typography.body, styles.hint, { color: tokens.mutedText }]}>
        Pick up to 3 tasks for today.
      </Text>
      <ScrollView
        style={{ flex: 1, backgroundColor: tokens.background }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {todayTasks.map((task) => {
          const selected = selectedIds.includes(task.id);
          return (
            <Pressable
              key={task.id}
              onPress={() => handleToggle(task.id)}
              style={({ pressed }) => [
                styles.pickRow,
                { borderBottomColor: tokens.border },
                pressed && { opacity: 0.85 },
              ]}
            >
              <View
                style={[
                  styles.pickCircle,
                  {
                    borderColor: tokens.accent,
                    backgroundColor: selected ? tokens.accent : 'transparent',
                  },
                ]}
              />
              <Text style={[typography.taskTitle, { color: tokens.text, flex: 1 }]}>
                {task.title}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable
        onPress={handleStart}
        disabled={selectedIds.length === 0}
        style={({ pressed }) => [
          styles.startBtn,
          {
            backgroundColor: tokens.accent,
            minHeight: MIN_TOUCH_TARGET,
            opacity: selectedIds.length === 0 ? 0.35 : pressed ? 0.88 : 1,
          },
        ]}
      >
        <Text style={[typography.button, { color: tokens.onAccent }]}>
          Start focus
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerSpacer: { width: 56 },
  hint: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  scroll: { paddingBottom: spacing.xl },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: MIN_TOUCH_TARGET + 8,
  },
  pickCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 2 },
  focusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  empty: { textAlign: 'center', marginTop: spacing.xxl * 2 },
  startBtn: {
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
