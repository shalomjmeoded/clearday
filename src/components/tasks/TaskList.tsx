import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, StyleSheet, View } from 'react-native';
import DraggableFlatList, {
  type RenderItemParams,
} from 'react-native-draggable-flatlist';

import { useBottomBarContentInset } from '@/components/layout/BottomBarInsetContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { spacing } from '@/theme/spacing';
import { useSettingsStore } from '@/store/settingsStore';
import { useTheme } from '@/theme/ThemeProvider';
import type { Task } from '@/types/task';
import { triggerLightHaptic } from '@/utils/haptics';
import { mergeTasksPreservingOrder, taskSyncKey } from '@/utils/taskSyncKey';
import { moveByOneSlot } from '@/utils/reorder';

import { CompletedSection } from './CompletedSection';
import { TaskRow } from './TaskRow';

const EMPTY_NAME_MAP: Record<string, string> = {};
const DRAG_AUTOSCROLL_THRESHOLD = 80;
const DRAG_AUTOSCROLL_SPEED = 80;
const DRAG_ANIMATION_CONFIG = {
  damping: 100,
  stiffness: 260,
  mass: 1,
  overshootClamping: true,
} as const;

interface Props {
  activeTasks: Task[];
  completedTasks: Task[];
  emptyMessage?: string;
  emptySubtitle?: string;
  emptyActionLabel?: string;
  onEmptyPress?: () => void;
  listNames?: Record<string, string>;
  listColors?: Record<string, string>;
  loading?: boolean;
  bottomInset?: number;
  ListFooterExtra?: React.ReactNode;
  onComplete: (id: string) => void;
  onUncomplete?: (id: string) => void;
  onPress: (id: string) => void;
  onArchive: (id: string) => void;
  onMoveTomorrow: (id: string) => void;
  onDelete: (id: string) => void;
  onSetImportant: (id: string) => void;
  onToggleRecurring: (id: string) => void;
  onStartManualSort?: () => void;
  onEndManualSort?: () => void;
  onReorder?: (orderedIds: string[]) => void;
  reorderMode?: boolean;
  /** Always show completed tasks inline (strikethrough) below active tasks. */
  inlineCompleted?: boolean;
}

function taskIds(tasks: Task[]): string {
  return tasks.map((task) => task.id).join(',');
}

function taskContentKeys(tasks: Task[]): string {
  return tasks.map(taskSyncKey).join('|');
}

export function TaskList({
  activeTasks,
  completedTasks,
  emptyMessage = 'Nothing for today. Nice.',
  emptySubtitle,
  emptyActionLabel,
  onEmptyPress,
  listNames,
  listColors,
  loading = false,
  bottomInset,
  ListFooterExtra,
  onComplete,
  onUncomplete,
  onPress,
  onArchive,
  onMoveTomorrow,
  onDelete,
  onSetImportant,
  onToggleRecurring,
  onStartManualSort,
  onEndManualSort,
  onReorder,
  reorderMode = false,
  inlineCompleted = false,
}: Props) {
  const { tokens } = useTheme();
  const barInset = useBottomBarContentInset();
  const resolvedBottomInset = bottomInset ?? barInset;
  const resolvedListNames = listNames ?? EMPTY_NAME_MAP;
  const resolvedListColors = listColors ?? EMPTY_NAME_MAP;
  const behavior = useSettingsStore((s) => s.settings.completedTaskBehavior);
  const [orderedTasks, setOrderedTasks] = useState(activeTasks);
  const [manualSortTasks, setManualSortTasks] = useState<Task[]>([]);
  const prevReorderModeRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const onUncompleteRef = useRef(onUncomplete);
  const onPressRef = useRef(onPress);
  const onArchiveRef = useRef(onArchive);
  const onDeleteRef = useRef(onDelete);
  const onSetImportantRef = useRef(onSetImportant);
  const onToggleRecurringRef = useRef(onToggleRecurring);
  const onReorderRef = useRef(onReorder);

  onCompleteRef.current = onComplete;
  onUncompleteRef.current = onUncomplete;
  onPressRef.current = onPress;
  onArchiveRef.current = onArchive;
  onDeleteRef.current = onDelete;
  onSetImportantRef.current = onSetImportant;
  onToggleRecurringRef.current = onToggleRecurring;
  onReorderRef.current = onReorder;

  const draggableTasks =
    manualSortTasks.length > 0
      ? manualSortTasks
      : orderedTasks.length > 0
        ? orderedTasks
        : activeTasks;

  // Read by the move-up/move-down accessibility actions, which fire outside
  // the render that produced the list.
  const draggableTasksRef = useRef(draggableTasks);
  draggableTasksRef.current = draggableTasks;

  useEffect(() => {
    if (reorderMode) {
      setOrderedTasks((current) => {
        const merged = mergeTasksPreservingOrder(current, activeTasks);
        if (taskContentKeys(current) === taskContentKeys(merged)) {
          return current;
        }
        return merged;
      });
      setManualSortTasks((current) => {
        const merged = mergeTasksPreservingOrder(current, activeTasks);
        if (taskContentKeys(current) === taskContentKeys(merged)) {
          return current;
        }
        return merged;
      });
      return;
    }
    setOrderedTasks((current) => {
      const merged = mergeTasksPreservingOrder(current, activeTasks);
      if (taskContentKeys(current) === taskContentKeys(merged)) {
        return current;
      }
      return merged;
    });
  }, [activeTasks, reorderMode]);

  useEffect(() => {
    const wasReorderMode = prevReorderModeRef.current;
    if (reorderMode && !wasReorderMode) {
      // Seed from the current task set, not the last on-screen order alone:
      // when reorder mode returns right as a search or filter clears, the
      // stale narrowed order would otherwise become the drag list and a
      // drop would renumber only that subset.
      setManualSortTasks(mergeTasksPreservingOrder(orderedTasks, activeTasks));
    }
    if (!reorderMode && wasReorderMode && manualSortTasks.length > 0) {
      setOrderedTasks(manualSortTasks);
    }
    prevReorderModeRef.current = reorderMode;
  }, [activeTasks, manualSortTasks, orderedTasks, reorderMode]);

  const hideCompleted = behavior === 'hide';
  const collapseCompleted = behavior === 'collapse';

  const showCompletedInline =
    !hideCompleted && !collapseCompleted && (inlineCompleted || behavior === 'show');
  const showCompletedSection = collapseCompleted && !hideCompleted;

  const activeTaskIds = useMemo(
    () => new Set(activeTasks.map((task) => task.id)),
    [activeTasks]
  );

  const visibleCompletedTasks = useMemo(
    () => completedTasks.filter((task) => !activeTaskIds.has(task.id)),
    [activeTaskIds, completedTasks]
  );

  const flatListData = reorderMode && onReorder ? draggableTasks : activeTasks;

  const resolveColorMark = useCallback(
    (item: Task) =>
      item.color ??
      (item.listId && resolvedListColors[item.listId]
        ? resolvedListColors[item.listId]
        : item.priority === 'important'
          ? tokens.actionPin
          : undefined),
    [resolvedListColors, tokens.actionPin]
  );

  const toggleCompleteByTask = useCallback((task: Task) => {
    if (task.status === 'completed') {
      (onUncompleteRef.current ?? onCompleteRef.current)(task.id);
    } else {
      onCompleteRef.current(task.id);
    }
  }, []);

  const pressTaskById = useCallback((id: string) => {
    onPressRef.current(id);
  }, []);

  const archiveTaskById = useCallback((id: string) => {
    onArchiveRef.current(id);
  }, []);

  const deleteTaskById = useCallback((id: string) => {
    onDeleteRef.current(id);
  }, []);

  const pinTaskById = useCallback((id: string) => {
    onSetImportantRef.current(id);
  }, []);

  const toggleRecurringById = useCallback((id: string) => {
    onToggleRecurringRef.current(id);
  }, []);

  const buildRowProps = useCallback(
    (item: Task, compact = false) => ({
      task: item,
      listName: item.listId ? resolvedListNames[item.listId] : undefined,
      colorMark: resolveColorMark(item),
      compact,
      onComplete: () => toggleCompleteByTask(item),
      onPress: () => pressTaskById(item.id),
      onArchive: () => archiveTaskById(item.id),
      onDelete: () => deleteTaskById(item.id),
      onPin: () => pinTaskById(item.id),
      onToggleRecurring: () => toggleRecurringById(item.id),
    }),
    [
      archiveTaskById,
      deleteTaskById,
      pinTaskById,
      pressTaskById,
      resolveColorMark,
      resolvedListNames,
      toggleCompleteByTask,
      toggleRecurringById,
    ]
  );

  const renderTaskRow = useCallback(
    (item: Task, compact = false) => <TaskRow {...buildRowProps(item, compact)} />,
    [buildRowProps]
  );

  /**
   * Reorder by one slot. Drag-and-drop is the only way to sort by touch, and
   * it is unreachable with a screen reader, so this backs the row's
   * "Move up"/"Move down" accessibility actions.
   */
  const moveTaskBy = useCallback((taskId: string, delta: number) => {
    const next = moveByOneSlot(draggableTasksRef.current, taskId, delta);
    if (!next) return;

    void triggerLightHaptic();
    setManualSortTasks(next);
    onReorderRef.current?.(next.map((task) => task.id));
  }, []);

  const completedFooter = useMemo(
    () => (
      <View>
        {showCompletedInline &&
          visibleCompletedTasks.map((task, index) => (
            <View key={task.id}>
              {renderTaskRow(task, index < visibleCompletedTasks.length - 1)}
            </View>
          ))}
        {showCompletedSection && (
          <CompletedSection
            tasks={visibleCompletedTasks}
            onComplete={(id) => (onUncomplete ?? onComplete)(id)}
            onPress={onPress}
            onArchive={onArchive}
            onMoveTomorrow={onMoveTomorrow}
            onDelete={onDelete}
            onSetImportant={onSetImportant}
            onToggleRecurring={onToggleRecurring}
          />
        )}
        {ListFooterExtra}
      </View>
    ),
    [
      ListFooterExtra,
      showCompletedSection,
      visibleCompletedTasks,
      onArchive,
      onComplete,
      onDelete,
      onMoveTomorrow,
      onPress,
      onSetImportant,
      onToggleRecurring,
      renderTaskRow,
      showCompletedInline,
      onUncomplete,
    ]
  );

  const listContentStyle = useMemo(
    () => [
      styles.list,
      { backgroundColor: tokens.background },
      resolvedBottomInset > 0 && { paddingBottom: resolvedBottomInset },
    ],
    [resolvedBottomInset, tokens.background]
  );

  const draggableListContentStyle = useMemo(
    () => [styles.list, { backgroundColor: tokens.background }],
    [tokens.background]
  );

  const renderDraggableItem = useCallback(
    ({ item, drag, isActive, getIndex }: RenderItemParams<Task>) => {
      const index = getIndex();
      const total = draggableTasksRef.current.length;
      return (
        <TaskRow
          {...buildRowProps(item)}
          onDragActivate={drag}
          isDragging={isActive}
          // Offered only where the move is possible, so the rotor never lists
          // an action that would do nothing.
          onMoveUp={
            index !== undefined && index > 0
              ? () => moveTaskBy(item.id, -1)
              : undefined
          }
          onMoveDown={
            index !== undefined && index < total - 1
              ? () => moveTaskBy(item.id, 1)
              : undefined
          }
        />
      );
    },
    [buildRowProps, moveTaskBy]
  );

  const handleDragEnd = useCallback(
    ({ data, from, to }: { data: Task[]; from: number; to: number }) => {
      if (from === to) {
        return;
      }
      // Closes the gesture: a tick on pickup already exists, so land with one too.
      void triggerLightHaptic();

      const nextIds = data.map((task) => task.id);
      setManualSortTasks((prev) => {
        if (taskIds(prev) === nextIds.join(',')) {
          return prev;
        }
        return data;
      });
      // Persist each drop as it happens. Screens whose reorder mode is always
      // on (Today) would otherwise never write the new order.
      onReorderRef.current?.(nextIds);
    },
    []
  );

  const renderFlatItem = useCallback(
    ({ item }: { item: Task }) => renderTaskRow(item),
    [renderTaskRow]
  );

  if (loading) {
    return (
      <View
        style={[styles.loading, { backgroundColor: tokens.background }]}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Loading tasks"
      >
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  const completedShown = !hideCompleted && visibleCompletedTasks.length > 0;
  if (flatListData.length === 0 && !completedShown) {
    return (
      <EmptyState
        message={emptyMessage}
        subtitle={emptySubtitle}
        actionLabel={emptyActionLabel}
        onPress={onEmptyPress}
      />
    );
  }

  if (reorderMode && onReorder) {
    return (
      <View style={[styles.wrap, { backgroundColor: tokens.background }]}>
        <DraggableFlatList
          data={draggableTasks}
          keyExtractor={(item) => item.id}
          style={{ flex: 1, backgroundColor: tokens.background }}
          containerStyle={{ flex: 1 }}
          animationConfig={DRAG_ANIMATION_CONFIG}
          activationDistance={0}
          autoscrollThreshold={DRAG_AUTOSCROLL_THRESHOLD}
          autoscrollSpeed={DRAG_AUTOSCROLL_SPEED}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[
            draggableListContentStyle,
            resolvedBottomInset > 0 && { paddingBottom: resolvedBottomInset },
          ]}
          onDragBegin={() => Keyboard.dismiss()}
          onDragEnd={handleDragEnd}
          renderItem={renderDraggableItem}
          ListFooterComponent={completedFooter}
        />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { backgroundColor: tokens.background }]}>
      <FlatList
        data={flatListData}
        keyExtractor={(item) => item.id}
        style={{ flex: 1, backgroundColor: tokens.background }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={listContentStyle}
        renderItem={renderFlatItem}
        ListFooterComponent={completedFooter}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  list: {
    paddingBottom: spacing.md,
    paddingTop: spacing.xs,
    flexGrow: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xxl * 2,
  },
});
