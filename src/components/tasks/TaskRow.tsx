import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector, Swipeable } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  LinearTransition,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

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
  reorderMode?: boolean;
  disableLayoutAnimation?: boolean;
  hiddenPlaceholder?: boolean;
  rowIndex?: number;
  activeDragIndex?: SharedValue<number>;
  hoverDragIndex?: SharedValue<number>;
  dragTranslationY?: SharedValue<number>;
  dragRowHeight?: SharedValue<number>;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onDragStart?: () => void;
  onDragMove?: (translationY: number) => void;
  onDragEnd?: (translationY: number) => void;
  onRowLayout?: (layout: { height: number; width: number; y: number }) => void;
  compact?: boolean;
}

const REORDER_STEP = 46;

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
  reorderMode = false,
  disableLayoutAnimation = false,
  hiddenPlaceholder = false,
  rowIndex = -1,
  activeDragIndex,
  hoverDragIndex,
  dragTranslationY,
  dragRowHeight,
  canMoveUp = false,
  canMoveDown = false,
  onDragStart,
  onDragMove,
  onDragEnd,
  onRowLayout,
  compact = false,
}: Props) {
  const { tokens } = useTheme();
  const completed = task.status === 'completed';
  const progress = useSharedValue(completed ? 1 : 0);
  const locallyDragging = useSharedValue(0);
  const dragDistance = useRef(0);
  const dragActive = useRef(false);
  const onDragStartRef = useRef(onDragStart);
  const onDragMoveRef = useRef(onDragMove);
  const onDragEndRef = useRef(onDragEnd);
  const { animatedStyle: holdStyle, pressIn, pressOut } = usePressHoldFeedback();
  const isMust = task.priority === 'must_do_today' && !completed;

  const openTask = () => {
    if (reorderMode || dragActive.current) return;
    void onPress();
  };

  useEffect(() => {
    onDragStartRef.current = onDragStart;
    onDragMoveRef.current = onDragMove;
    onDragEndRef.current = onDragEnd;
  }, [onDragEnd, onDragMove, onDragStart]);

  const resetDrag = useCallback((translationY = 0) => {
    dragDistance.current = 0;
    dragActive.current = false;
    onDragEndRef.current?.(translationY);
    locallyDragging.value = withTiming(0, { duration: 120 });
  }, [locallyDragging]);

  const beginDrag = useCallback(() => {
    if (dragActive.current) return;
    dragDistance.current = 0;
    dragActive.current = true;
    locallyDragging.value = 1;
    onDragStartRef.current?.();
  }, [locallyDragging]);

  const handlePressOut = () => {
    pressOut();
  };

  const handleLayout = (event: LayoutChangeEvent) => {
    onRowLayout?.(event.nativeEvent.layout);
  };

  useEffect(() => {
    progress.value = withTiming(completed ? 1 : 0, { duration: 240 });
  }, [completed, progress]);

  const titleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [1, 0.45]),
  }));

  const dragStyle = useAnimatedStyle(() => {
    const activeIndex = activeDragIndex?.value ?? -1;
    const hoverIndex = hoverDragIndex?.value ?? -1;
    const reorderStep = dragRowHeight?.value ?? REORDER_STEP;
    let previewOffset = 0;

    if (rowIndex >= 0 && activeIndex >= 0 && hoverIndex >= 0 && rowIndex !== activeIndex) {
      if (activeIndex < hoverIndex && rowIndex > activeIndex && rowIndex <= hoverIndex) {
        previewOffset = -reorderStep;
      }
      if (activeIndex > hoverIndex && rowIndex >= hoverIndex && rowIndex < activeIndex) {
        previewOffset = reorderStep;
      }
    }

    return {
      opacity: hiddenPlaceholder || locallyDragging.value ? 0 : 1,
      zIndex: locallyDragging.value ? 30 : 0,
      elevation: locallyDragging.value ? 12 : 0,
      transform: [
        {
          translateY: locallyDragging.value
            ? 0
            : withTiming(previewOffset, { duration: 120 }),
        },
        { scale: 1 },
      ],
    };
  });

  const renderLeft = () => (
    <View style={styles.actionRail}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Delete task"
        style={[styles.iconAction, { backgroundColor: tokens.danger }]}
        onPress={onDelete}
      >
        <Ionicons name="trash-outline" size={16} color="#fff" />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Edit task"
        style={[styles.iconAction, { backgroundColor: tokens.actionEdit }]}
        onPress={onPress}
      >
        <Ionicons name="create-outline" size={16} color="#fff" />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Archive task"
        style={[styles.iconAction, { backgroundColor: tokens.swipeArchive }]}
        onPress={onArchive}
      >
        <Ionicons name="archive-outline" size={16} color="#fff" />
      </Pressable>
    </View>
  );

  const renderRight = () => (
    <View style={styles.actionRail}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Pin task"
        style={[styles.iconAction, { backgroundColor: tokens.actionPin }]}
        onPress={onPin}
      >
        <Ionicons
          name={task.priority === 'important' ? 'star' : 'star-outline'}
          size={16}
          color="#fff"
        />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Repeat task"
        style={[styles.iconAction, { backgroundColor: tokens.actionRepeat }]}
        onPress={onToggleRecurring}
      >
        <Ionicons
          name={isRecurring(task.recurrence) ? 'repeat' : 'repeat-outline'}
          size={16}
          color="#fff"
        />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={completed ? 'Mark unread' : 'Mark read'}
        style={[styles.iconAction, { backgroundColor: tokens.actionRead }]}
        onPress={onComplete}
      >
        <Ionicons
          name={completed ? 'mail-unread-outline' : 'mail-open-outline'}
          size={16}
          color="#fff"
        />
      </Pressable>
    </View>
  );

  const overdue = isOverdue(task.dueDate) && !completed;
  const showPin = task.priority === 'important' || task.priority === 'must_do_today';
  const contentTapGesture = useMemo(() => {
    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDelay(260)
      .maxDuration(220)
      .maxDistance(14)
      .runOnJS(true)
      .onBegin(pressIn)
      .onEnd(() => {
        onComplete();
      })
      .onFinalize(handlePressOut);

    const singleTap = Gesture.Tap()
      .enabled(!reorderMode)
      .numberOfTaps(1)
      .maxDuration(220)
      .maxDistance(14)
      .runOnJS(true)
      .onBegin(pressIn)
      .onEnd(openTask)
      .onFinalize(handlePressOut);

    return Gesture.Exclusive(doubleTap, singleTap);
  }, [handlePressOut, onComplete, openTask, pressIn, reorderMode]);

  const reorderGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!completed)
        .activateAfterLongPress(reorderMode ? 0 : 420)
        .minDistance(3)
        .activeOffsetY([-3, 3])
        .failOffsetX([-18, 18])
        .runOnJS(true)
        .onStart(() => {
          beginDrag();
          void triggerMediumHaptic();
        })
        .onUpdate((event) => {
          beginDrag();
          if (dragTranslationY) {
            dragTranslationY.value = event.translationY;
          }
          dragDistance.current = event.translationY;
          onDragMoveRef.current?.(event.translationY);
        })
        .onFinalize(() => {
          resetDrag(dragDistance.current);
        }),
    [
      beginDrag,
      completed,
      dragTranslationY,
      reorderMode,
      resetDrag,
    ]
  );

  const row = (
    <Animated.View
      layout={
        disableLayoutAnimation
          ? undefined
          : LinearTransition.springify().damping(18).stiffness(220)
      }
      style={[
        styles.row,
        holdStyle,
        {
          backgroundColor: isMust ? tokens.card : tokens.background,
          borderColor: tokens.paperLine,
        },
        isMust && styles.mustRow,
      ]}
    >
      {isMust && (
        <View style={[styles.mustBar, { backgroundColor: tokens.accent }]} />
      )}
      <View style={styles.pinColumn}>
        <View style={[styles.verticalRule, { backgroundColor: tokens.paperLine }]} />
        {completed ? (
          <View style={[styles.doneMarker, { backgroundColor: tokens.actionRead }]} />
        ) : null}
        {showPin ? (
          <Pressable
            onPress={onPin}
            hitSlop={10}
            style={styles.pinButton}
            accessibilityRole="button"
            accessibilityLabel="Unpin task"
          >
            <Ionicons name="pin" size={15} color={tokens.actionPin} />
          </Pressable>
        ) : null}
      </View>
      <GestureDetector gesture={contentTapGesture}>
        <Animated.View style={styles.content}>
          {colorMark ? (
            <View style={[styles.colorMark, { backgroundColor: colorMark }]} />
          ) : null}
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
          {task.notes && !completed ? (
            <Text
              style={[typography.meta, styles.notePreview, { color: tokens.mutedText }]}
              numberOfLines={1}
            >
              {task.notes}
            </Text>
          ) : null}
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
        </Animated.View>
      </GestureDetector>
      {reorderMode && !completed ? (
        <View
          style={[styles.dragHandle, { opacity: canMoveUp || canMoveDown ? 1 : 0.35 }]}
          accessibilityRole="adjustable"
          accessibilityLabel="Drag to reorder task"
        >
          <Ionicons name="reorder-three-outline" size={19} color={tokens.mutedText} />
        </View>
      ) : null}
    </Animated.View>
  );

  return (
    <Animated.View
      renderToHardwareTextureAndroid
      shouldRasterizeIOS
      onLayout={handleLayout}
      style={[
        styles.outer,
        compact && styles.outerCompact,
        dragStyle,
      ]}
    >
      {reorderMode && !completed ? (
        <GestureDetector gesture={reorderGesture}>{row}</GestureDetector>
      ) : (
        <GestureDetector gesture={reorderGesture}>
          <Swipeable
            renderLeftActions={renderLeft}
            renderRightActions={renderRight}
            friction={2}
            overshootFriction={8}
            activeOffsetX={[-16, 16]}
            failOffsetY={[-12, 12]}
          >
            {row}
          </Swipeable>
        </GestureDetector>
      )}
    </Animated.View>
  );
}

export const TaskRow = React.memo(TaskRowInner);

const styles = StyleSheet.create({
  outer: {
    marginBottom: 0,
    overflow: 'visible',
    position: 'relative',
  },
  outerCompact: { marginBottom: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 45,
    paddingVertical: 7,
    paddingHorizontal: spacing.lg,
    gap: 10,
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
  pinColumn: {
    width: 38,
    minHeight: 28,
    paddingTop: 1,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  verticalRule: {
    position: 'absolute',
    right: 0,
    top: -7,
    bottom: -7,
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
    minWidth: 28,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1, justifyContent: 'center', minHeight: 28, paddingLeft: 10 },
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
    width: 42,
    marginRight: StyleSheet.hairlineWidth,
  },
  dragHandle: {
    width: 28,
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
