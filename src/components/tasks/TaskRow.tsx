import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInDown,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { RectButton, Swipeable } from 'react-native-gesture-handler';

import { usePressHoldFeedback } from '@/hooks/usePressHoldFeedback';
import { radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';
import type { Task } from '@/types/task';
import { formatTaskSideDate } from '@/utils/formatTaskSideDate';
import { formatRecurrenceLabel, isRecurring } from '@/utils/recurrence';
import { triggerSoftHaptic } from '@/utils/haptics';
import { DECORATIVE } from '@/utils/accessibility';
import { describeTaskRow, taskReminderDisplay } from '@/utils/taskAccessibility';

const SWIPE_ACTIVE_OFFSET_X: [number, number] = [-10, 10];
const SWIPE_FAIL_OFFSET_Y: [number, number] = [-20, 20];

interface Props {
  task: Task;
  listName?: string;
  colorMark?: string;
  onComplete: () => void;
  onPress: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onPin: () => void;
  onToggleRecurring: () => void;
  onDragActivate?: () => void;
  /**
   * Reorder one slot up/down. Drag-and-drop is unreachable with a screen
   * reader, so these back the "Move up"/"Move down" accessibility actions.
   */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isDragging?: boolean;
  swipeEnabled?: boolean;
  compact?: boolean;
  /** Row of an archived task: the primary action brings it back rather than completing it. */
  restoreMode?: boolean;
}

function TaskRowInner({
  task,
  listName,
  colorMark,
  onComplete,
  onPress,
  onArchive,
  onDelete,
  onPin,
  onToggleRecurring,
  onDragActivate,
  onMoveUp,
  onMoveDown,
  isDragging = false,
  swipeEnabled = true,
  compact = false,
  restoreMode = false,
}: Props) {
  const { tokens } = useTheme();
  const swipeRef = useRef<Swipeable>(null);
  const lastContentTapAt = useRef(0);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completed = task.status === 'completed';
  const progress = useSharedValue(completed ? 1 : 0);
  const { animatedStyle: holdStyle, pressIn, pressOut } = usePressHoldFeedback();
  const isMust = task.priority === 'must_do_today' && !completed;
  const isImportant = task.priority === 'important' && !completed;
  const sideDate = formatTaskSideDate(task.dueDate);
  const dragEnabled = Boolean(onDragActivate) && !completed;
  const showPriorityMarker =
    task.priority === 'important' || task.priority === 'must_do_today';
  // Shared with the accessibility label below, so the spoken reminder and the
  // visible one cannot drift apart.
  const { label: reminderLabel, isPast: reminderPast } =
    taskReminderDisplay(task);

  // The row is one accessibility element: its children collapse into this
  // label, so anything left out here is invisible to a screen reader.
  const accessibilityLabel = useMemo(
    () => describeTaskRow(task, { listName, restoreMode }),
    [task, listName, restoreMode]
  );

  // Mirrors the swipe rails and the drag handle, neither of which a screen
  // reader can reach. Surfaces in the VoiceOver actions rotor / TalkBack menu.
  const accessibilityActions = useMemo(() => {
    const actions: { name: string; label: string }[] = [
      {
        name: 'completeTask',
        label: restoreMode
          ? 'Restore task'
          : completed
            ? 'Mark as to-do'
            : 'Mark done',
      },
    ];
    if (!completed) {
      actions.push({
        name: 'toggleRepeat',
        label: isRecurring(task.recurrence) ? 'Stop repeating' : 'Repeat task',
      });
    }
    actions.push({
      name: 'togglePin',
      label: task.priority === 'important' ? 'Unstar task' : 'Star task',
    });
    actions.push({ name: 'archiveTask', label: 'Archive task' });
    actions.push({ name: 'deleteTask', label: 'Delete task' });
    if (onMoveUp) actions.push({ name: 'moveUp', label: 'Move up' });
    if (onMoveDown) actions.push({ name: 'moveDown', label: 'Move down' });
    return actions;
  }, [
    completed,
    onMoveDown,
    onMoveUp,
    restoreMode,
    task.priority,
    task.recurrence,
  ]);

  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      switch (event.nativeEvent.actionName) {
        case 'completeTask':
          onComplete();
          break;
        case 'toggleRepeat':
          onToggleRecurring();
          break;
        case 'togglePin':
          onPin();
          break;
        case 'archiveTask':
          onArchive();
          break;
        case 'deleteTask':
          onDelete();
          break;
        case 'moveUp':
          onMoveUp?.();
          break;
        case 'moveDown':
          onMoveDown?.();
          break;
      }
    },
    [
      onArchive,
      onComplete,
      onDelete,
      onMoveDown,
      onMoveUp,
      onPin,
      onToggleRecurring,
    ]
  );

  const openTask = useCallback(() => {
    if (isDragging) return;
    void onPress();
  }, [isDragging, onPress]);

  const handlePressIn = useCallback(() => {
    if (isDragging) return;
    pressIn();
  }, [isDragging, pressIn]);

  const handlePressOut = useCallback(() => {
    pressOut();
  }, [pressOut]);

  const handleDragActivate = useCallback(async () => {
    if (!dragEnabled || !onDragActivate || isDragging) return;
    await triggerSoftHaptic();
    onDragActivate();
  }, [dragEnabled, isDragging, onDragActivate]);

  const handleContentPress = useCallback(() => {
    if (isDragging) return;

    const now = Date.now();

    if (now - lastContentTapAt.current < 260) {
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
      }
      lastContentTapAt.current = 0;
      onComplete();
      return;
    }

    lastContentTapAt.current = now;
    if (singleTapTimer.current) {
      clearTimeout(singleTapTimer.current);
    }
    singleTapTimer.current = setTimeout(() => {
      singleTapTimer.current = null;
      if (lastContentTapAt.current === now) {
        lastContentTapAt.current = 0;
        openTask();
      }
    }, 260);
  }, [isDragging, onComplete, openTask]);

  useEffect(
    () => () => {
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
      }
    },
    []
  );

  useEffect(() => {
    progress.set(withTiming(completed ? 1 : 0, { duration: 240 }));
  }, [completed, progress]);

  const titleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0, 1], [1, 0.45]),
  }));

  const runAction = useCallback((action: () => void) => {
    action();
    requestAnimationFrame(() => swipeRef.current?.close());
  }, []);

  const renderLeft = () => (
    <View style={styles.actionRail}>
      <RectButton
        accessibilityRole="button"
        accessibilityLabel="Delete task"
        style={[styles.iconAction, { backgroundColor: tokens.danger }]}
        onPress={() => runAction(onDelete)}
      >
        <Ionicons name="trash-outline" size={16} color={tokens.onAccent} />
        <Text style={[styles.actionLabel, { color: tokens.onAccent }]}>Delete</Text>
      </RectButton>
      <RectButton
        accessibilityRole="button"
        accessibilityLabel="Edit task"
        style={[styles.iconAction, { backgroundColor: tokens.actionEdit }]}
        onPress={() => runAction(onPress)}
      >
        <Ionicons name="create-outline" size={16} color={tokens.onAccent} />
        <Text style={[styles.actionLabel, { color: tokens.onAccent }]}>Edit</Text>
      </RectButton>
      <RectButton
        accessibilityRole="button"
        accessibilityLabel="Archive task"
        style={[styles.iconAction, { backgroundColor: tokens.swipeArchive }]}
        onPress={() => runAction(onArchive)}
      >
        <Ionicons name="archive-outline" size={16} color={tokens.onAccent} />
        <Text style={[styles.actionLabel, { color: tokens.onAccent }]}>Archive</Text>
      </RectButton>
    </View>
  );

  const renderRight = () => (
    <View style={styles.actionRail}>
      <RectButton
        accessibilityRole="button"
        accessibilityLabel={
          task.priority === 'important' ? 'Unstar task' : 'Star task'
        }
        style={[styles.iconAction, { backgroundColor: tokens.actionPin }]}
        onPress={() => runAction(onPin)}
      >
        <Ionicons
          name={task.priority === 'important' ? 'star' : 'star-outline'}
          size={16}
          color={tokens.onAccent}
        />
        <Text style={[styles.actionLabel, { color: tokens.onAccent }]}>
          {task.priority === 'important' ? 'Unstar' : 'Star'}
        </Text>
      </RectButton>
      {/* Repeat only applies to open tasks, so it is left out once done. */}
      {!completed ? (
        <RectButton
          accessibilityRole="button"
          accessibilityLabel={
            isRecurring(task.recurrence) ? 'Stop repeating' : 'Repeat task'
          }
          style={[styles.iconAction, { backgroundColor: tokens.actionRepeat }]}
          onPress={() => runAction(onToggleRecurring)}
        >
          <Ionicons
            name={isRecurring(task.recurrence) ? 'repeat' : 'repeat-outline'}
            size={16}
            color={tokens.onAccent}
          />
          <Text style={[styles.actionLabel, { color: tokens.onAccent }]}>
            {isRecurring(task.recurrence) ? 'Stop' : 'Repeat'}
          </Text>
        </RectButton>
      ) : null}
      <RectButton
        accessibilityRole="button"
        accessibilityLabel={
          restoreMode ? 'Restore task' : completed ? 'Mark as to-do' : 'Mark done'
        }
        style={[styles.iconAction, { backgroundColor: tokens.actionRead }]}
        onPress={() => runAction(onComplete)}
      >
        <Ionicons
          name={
            restoreMode
              ? 'arrow-undo-outline'
              : completed
                ? 'arrow-undo-outline'
                : 'checkmark-circle-outline'
          }
          size={16}
          color={tokens.onAccent}
        />
        <Text style={[styles.actionLabel, { color: tokens.onAccent }]}>
          {restoreMode ? 'Restore' : completed ? 'Todo' : 'Done'}
        </Text>
      </RectButton>
    </View>
  );

  const content = (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handleContentPress}
      onLongPress={dragEnabled ? handleDragActivate : undefined}
      delayLongPress={200}
      disabled={isDragging}
      style={styles.content}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Opens task details"
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={handleAccessibilityAction}
      // VoiceOver's activate gesture cannot produce the double tap that
      // completes a task, and routing it through that timer would just delay
      // opening. Send assistive activation straight to the detail screen.
      onAccessibilityTap={openTask}
    >
      {colorMark ? (
        <View style={[styles.colorMark, { backgroundColor: colorMark }]} />
      ) : null}
      <Animated.Text
        style={[
          completed ? typography.taskTitleCompleted : typography.taskTitle,
          { color: completed ? tokens.mutedText : tokens.text },
          titleStyle,
          completed && styles.strikethrough,
        ]}
        numberOfLines={3}
      >
        {task.title}
      </Animated.Text>
      {task.notes && !completed ? (
        <Text
          style={[typography.meta, styles.notePreview, { color: tokens.mutedText }]}
          numberOfLines={1}
        >
          {task.notes}
        </Text>
      ) : null}
      {(task.reminderAt || listName || isRecurring(task.recurrence)) && !completed && (
        <View style={styles.meta}>
          {task.reminderAt ? (
            <Text
              style={[
                typography.meta,
                { color: tokens.mutedText },
                reminderPast && styles.strikethrough,
              ]}
            >
              {reminderLabel}
            </Text>
          ) : null}
          {isRecurring(task.recurrence) ? (
            <Text style={[typography.meta, { color: tokens.accent }]}>
              ↻ {formatRecurrenceLabel(task.recurrence)}
            </Text>
          ) : null}
          {listName ? (
            <Text style={[typography.meta, { color: tokens.mutedText }]}>
              {listName}
            </Text>
          ) : null}
        </View>
      )}
      {completed && (task.reminderAt || task.recurringTaskId) ? (
        <View style={styles.meta}>
          {task.recurringTaskId ? (
            <Text style={[typography.meta, { color: tokens.mutedText }]}>
              ↻
            </Text>
          ) : null}
          {task.reminderAt ? (
            <Text style={[typography.meta, { color: tokens.mutedText }]}>
              {reminderLabel}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );

  const rowBody = (
    <Animated.View
      style={[
        styles.row,
        !isDragging && holdStyle,
        {
          backgroundColor: isMust ? tokens.card : tokens.background,
          borderColor: isImportant ? tokens.actionPin : tokens.paperLine,
        },
        isMust && styles.mustRow,
        isImportant && { backgroundColor: tokens.card },
      ]}
    >
      {isMust ? (
        <View style={[styles.mustBar, { backgroundColor: tokens.accent }]} />
      ) : null}
      {/* The due date is spoken as part of the row label, so the column
          itself would only add a duplicate stop. */}
      <View style={styles.dateColumn} {...DECORATIVE}>
        <Text
          style={[
            typography.meta,
            styles.sideDate,
            { color: tokens.mutedText },
          ]}
          numberOfLines={1}
        >
          {sideDate || ' '}
        </Text>
      </View>
      <View style={styles.pinColumn}>
        <View style={[styles.verticalRule, { backgroundColor: tokens.paperLine }]} />
        {completed ? (
          <View style={[styles.doneMarker, { backgroundColor: tokens.actionRead }]} />
        ) : null}
        {task.priority === 'important' ? (
          <Pressable
            onPress={onPin}
            hitSlop={10}
            style={styles.pinButton}
            accessibilityRole="button"
            accessibilityLabel="Unstar task"
          >
            <Ionicons name="star" size={14} color={tokens.actionPin} />
          </Pressable>
        ) : showPriorityMarker ? (
          // Pinned-to-today is shown, not toggled, here; it is cleared from task
          // detail. The row label already says "Pinned to today", so the glyph
          // stays out of the accessibility tree.
          <View style={styles.pinButton} {...DECORATIVE}>
            <Ionicons name="pin" size={14} color={tokens.accent} />
          </View>
        ) : null}
      </View>
      {content}
    </Animated.View>
  );

  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      exiting={FadeOut.duration(140)}
      style={[styles.outer, compact && styles.outerCompact]}
    >
      <Swipeable
        ref={swipeRef}
        enabled={swipeEnabled && !isDragging}
        renderLeftActions={renderLeft}
        renderRightActions={renderRight}
        friction={2}
        overshootFriction={8}
        activeOffsetX={SWIPE_ACTIVE_OFFSET_X}
        failOffsetY={SWIPE_FAIL_OFFSET_Y}
      >
        {rowBody}
      </Swipeable>
    </Animated.View>
  );
}

export const TaskRow = React.memo(TaskRowInner);

const styles = StyleSheet.create({
  outer: {
    marginBottom: 0,
    position: 'relative',
  },
  outerCompact: { marginBottom: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    // The row is itself the tap target (tap opens, double-tap completes), so
    // it meets the 44pt minimum with margin to spare.
    minHeight: 48,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
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
  dateColumn: {
    width: 34,
    minHeight: 28,
    paddingTop: 2,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
  },
  sideDate: {
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  pinColumn: {
    width: 28,
    minHeight: 28,
    paddingTop: 1,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  verticalRule: {
    position: 'absolute',
    right: 0,
    // Cancels the row's vertical padding so the rule spans edge to edge.
    top: -spacing.sm,
    bottom: -spacing.sm,
    width: StyleSheet.hairlineWidth,
  },
  doneMarker: {
    position: 'absolute',
    left: 2,
    top: 7,
    width: 4,
    height: 21,
    borderRadius: 3,
  },
  pinButton: {
    minWidth: 24,
    minHeight: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 28,
    paddingLeft: spacing.sm,
  },
  colorMark: {
    position: 'absolute',
    left: 0,
    top: 3,
    bottom: 3,
    width: 3,
    borderRadius: 3,
  },
  strikethrough: { textDecorationLine: 'line-through' },
  notePreview: {
    marginTop: 1,
    lineHeight: 18,
  },
  meta: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 2,
    flexWrap: 'wrap',
  },
  actionRail: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginVertical: spacing.xs,
  },
  iconAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 56,
    marginRight: StyleSheet.hairlineWidth,
    gap: 2,
    paddingHorizontal: 4,
  },
  actionLabel: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
  },
});
