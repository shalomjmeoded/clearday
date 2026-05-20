import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { MIN_TOUCH_TARGET } from '@/constants/layout';
import { usePressHoldFeedback } from '@/hooks/usePressHoldFeedback';
import { triggerMediumHaptic } from '@/utils/haptics';
import { radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';
import type { Task } from '@/types/task';
import {
  formatDisplayDate,
  formatTime,
  isOverdue,
} from '@/utils/dates';
import { formatRecurrenceLabel, isRecurring } from '@/utils/recurrence';

import { TaskCheckbox } from './TaskCheckbox';

interface Props {
  task: Task;
  listName?: string;
  onComplete: () => void;
  onPress: () => void;
  onArchive: () => void;
  onMoveTomorrow: () => void;
  compact?: boolean;
}

function TaskRowInner({
  task,
  listName,
  onComplete,
  onPress,
  onArchive,
  onMoveTomorrow,
  compact = false,
}: Props) {
  const { tokens } = useTheme();
  const completed = task.status === 'completed';
  const progress = useSharedValue(completed ? 1 : 0);
  const { animatedStyle: holdStyle, pressIn, pressOut } = usePressHoldFeedback();
  const isMust = task.priority === 'must_do_today' && !completed;

  const openTask = () => {
    void onPress();
  };

  const handleLongPress = () => {
    void triggerMediumHaptic();
    openTask();
  };

  useEffect(() => {
    progress.value = withTiming(completed ? 1 : 0, { duration: 240 });
  }, [completed, progress]);

  const titleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [1, 0.45]),
  }));

  const renderLeft = () => (
    <Pressable
      style={[styles.action, { backgroundColor: tokens.swipeTomorrow }]}
      onPress={onMoveTomorrow}
    >
      <Text style={styles.actionText}>Tomorrow</Text>
    </Pressable>
  );

  const renderRight = () => (
    <Pressable
      style={[styles.action, { backgroundColor: tokens.swipeArchive }]}
      onPress={onArchive}
    >
      <Text style={styles.actionText}>Archive</Text>
    </Pressable>
  );

  const overdue = isOverdue(task.dueDate) && !completed;

  return (
    <View style={[styles.outer, compact && styles.outerCompact]}>
      <Swipeable
        renderLeftActions={renderLeft}
        renderRightActions={renderRight}
        friction={2}
        overshootFriction={8}
        activeOffsetX={[-16, 16]}
        failOffsetY={[-12, 12]}
      >
        <Animated.View
          style={[
            styles.row,
            holdStyle,
            {
              backgroundColor: isMust ? tokens.card : tokens.background,
              borderColor: tokens.border,
            },
            isMust && styles.mustRow,
          ]}
        >
          {isMust && (
            <View style={[styles.mustBar, { backgroundColor: tokens.accent }]} />
          )}
          <TaskCheckbox
            checked={completed}
            priority={task.priority}
            onPress={onComplete}
          />
          <Pressable
            onPress={openTask}
            onLongPress={handleLongPress}
            delayLongPress={420}
            onPressIn={pressIn}
            onPressOut={pressOut}
            style={styles.content}
          >
            <Animated.Text
              style={[
                completed ? typography.taskTitleCompleted : typography.taskTitle,
                { color: tokens.text },
                titleStyle,
                completed && styles.strikethrough,
              ]}
              numberOfLines={3}
            >
              {task.title}
            </Animated.Text>
            {(task.dueDate || listName || isRecurring(task.recurrence)) &&
              !completed && (
              <View style={styles.meta}>
                {task.dueDate && (
                  <Text
                    style={[
                      typography.meta,
                      { color: overdue ? tokens.danger : tokens.mutedText },
                    ]}
                  >
                    {formatDisplayDate(task.dueDate)}
                    {task.reminderAt ? ` · ${formatTime(task.reminderAt)}` : ''}
                  </Text>
                )}
                {isRecurring(task.recurrence) && (
                  <Text style={[typography.meta, { color: tokens.accent }]}>
                    ↻ {formatRecurrenceLabel(task.recurrence)}
                  </Text>
                )}
                {listName && (
                  <Text style={[typography.meta, { color: tokens.mutedText }]}>
                    {listName}
                  </Text>
                )}
              </View>
            )}
          </Pressable>
        </Animated.View>
      </Swipeable>
    </View>
  );
}

export const TaskRow = React.memo(TaskRowInner);

const styles = StyleSheet.create({
  outer: { marginBottom: spacing.xs },
  outerCompact: { marginBottom: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET + 12,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mustRow: {
    marginHorizontal: spacing.md,
    borderRadius: radius.md,
    borderBottomWidth: 0,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingLeft: spacing.md + 4,
  },
  mustBar: {
    position: 'absolute',
    left: 0,
    top: spacing.sm,
    bottom: spacing.sm,
    width: 3,
    borderRadius: 2,
  },
  content: { flex: 1, justifyContent: 'center', minHeight: MIN_TOUCH_TARGET },
  strikethrough: { textDecorationLine: 'line-through' },
  meta: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
    flexWrap: 'wrap',
  },
  action: {
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    minWidth: 96,
    marginVertical: spacing.xs,
    borderRadius: radius.md,
    marginHorizontal: spacing.xs,
  },
  actionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
