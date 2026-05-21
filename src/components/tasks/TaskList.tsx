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
import { debugLog } from '@/utils/debugLog';
import { mergeTasksPreservingOrder } from '@/utils/taskSyncKey';

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

export function TaskList({
  activeTasks,
  completedTasks,
  emptyMessage = 'Nothing for today. Nice.',
  emptySubtitle,
  listNames,
  listColors,
  loading = false,
  bottomInset = 0,
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
  const [draggableListRevision, setDraggableListRevision] = useState(0);
  const prevReorderModeRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const onUncompleteRef = useRef(onUncomplete);
  const onPressRef = useRef(onPress);
  const onArchiveRef = useRef(onArchive);
  const onDeleteRef = useRef(onDelete);
  const onSetImportantRef = useRef(onSetImportant);
  const onToggleRecurringRef = useRef(onToggleRecurring);
  const onReorderRef = useRef(onReorder);
  const latestDropIdsRef = useRef<string | null>(null);
  const dragLifecycleRef = useRef({
    beginAt: 0,
    releaseAt: 0,
    placeholderChanges: 0,
  });

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

  useEffect(() => {
    if (reorderMode) {
      if (orderedTasks.length === 0 && activeTasks.length > 0) {
        setOrderedTasks(activeTasks);
      }
      if (manualSortTasks.length === 0 && draggableTasks.length > 0) {
        setManualSortTasks(draggableTasks);
      }
      return;
    }
    setOrderedTasks((current) => {
      const merged = mergeTasksPreservingOrder(current, activeTasks);
      if (taskIds(current) === taskIds(merged)) {
        return current;
      }
      return merged;
    });
  }, [activeTasks, reorderMode]);

  useEffect(() => {
    const wasReorderMode = prevReorderModeRef.current;
    if (reorderMode && !wasReorderMode) {
      setManualSortTasks(orderedTasks);
    }
    if (!reorderMode && wasReorderMode && manualSortTasks.length > 0) {
      setOrderedTasks(manualSortTasks);
    }
    if (!reorderMode && wasReorderMode) {
      if (manualSortTasks.length > 0 && onReorderRef.current) {
        const orderedIds = manualSortTasks.map((task) => task.id);
        // #region agent log
        debugLog(
          'TaskList.tsx:useEffect(reorderMode)',
          'persist reorder when exiting manual mode',
          { count: orderedIds.length, topIds: orderedIds.slice(0, 5) },
          'H28',
          'probe-v11'
        );
        // #endregion agent log
        onReorderRef.current(orderedIds);
      }
    }
    prevReorderModeRef.current = reorderMode;
  }, [manualSortTasks, orderedTasks, reorderMode]);

  useEffect(() => {
    if (!reorderMode) return;
    const activeIds = taskIds(activeTasks);
    const orderedIds = taskIds(orderedTasks);
    const manualIds = taskIds(manualSortTasks);
    // #region agent log
    debugLog(
      'TaskList.tsx:useEffect(reorderSnapshot)',
      'manual mode snapshot',
      {
        activeCount: activeTasks.length,
        orderedCount: orderedTasks.length,
        manualCount: manualSortTasks.length,
        activeIds,
        orderedIds,
        manualIds,
      },
      'H27',
      'probe-v11'
    );
    // #endregion agent log
  }, [reorderMode, activeTasks, orderedTasks, manualSortTasks]);

  useEffect(() => {
    if (!reorderMode || !latestDropIdsRef.current) return;
    const currentIds = taskIds(draggableTasks);
    if (currentIds !== latestDropIdsRef.current) {
      // #region agent log
      debugLog(
        'TaskList.tsx:useEffect(postDrop)',
        'manual data diverged after drop',
        {
          expectedIds: latestDropIdsRef.current,
          actualIds: currentIds,
        },
        'H28',
        'probe-v11'
      );
      // #endregion agent log
    }
  }, [draggableTasks, reorderMode]);

  const hideCompleted = behavior === 'hide';
  const collapseCompleted = behavior === 'collapse';

  const showCompletedInline = inlineCompleted || behavior === 'show';
  const showCompletedSection =
    !inlineCompleted && collapseCompleted && !hideCompleted;

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
    (
      item: Task,
      compact = false,
      drag?: () => void,
      isDragging = false,
      swipeEnabled = true
    ) => (
      <TaskRow
        {...buildRowProps(item, compact)}
        onDragActivate={drag}
        isDragging={isDragging}
        swipeEnabled={swipeEnabled}
      />
    ),
    [buildRowProps]
  );

  const completedFooter = useMemo(
    () => (
      <View>
        {showCompletedInline &&
          completedTasks.map((task, index) => (
            <View key={task.id}>
              {renderTaskRow(task, index < completedTasks.length - 1)}
            </View>
          ))}
        {showCompletedSection && (
          <CompletedSection
            tasks={completedTasks}
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
      completedTasks,
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
    ({ item, drag, isActive }: RenderItemParams<Task>) =>
      renderTaskRow(item, false, drag, isActive, true),
    [renderTaskRow]
  );

  const handleDragEnd = useCallback(
    ({ data, from, to }: { data: Task[]; from: number; to: number }) => {
      const nextIds = data.map((task) => task.id);
      debugLog(
        'TaskList.tsx:handleDragEnd',
        'drag end received',
        {
          from,
          to,
          count: nextIds.length,
          topIds: nextIds.slice(0, 5),
        },
        'H3',
        'arch-v1'
      );

      if (from === to) {
        debugLog(
          'TaskList.tsx:handleDragEnd',
          'skip drop update, same index',
          { from, to },
          'H3',
          'arch-v1'
        );
        return;
      }
      latestDropIdsRef.current = nextIds.join(',');
      // #region agent log
      debugLog(
        'TaskList.tsx:handleDragEnd',
        'drag lifecycle completed',
        {
          from,
          to,
          placeholderChanges: dragLifecycleRef.current.placeholderChanges,
          releaseToEndMs: dragLifecycleRef.current.releaseAt
            ? Date.now() - dragLifecycleRef.current.releaseAt
            : null,
        },
        'H30',
        'probe-v12'
      );
      // #endregion agent log

      setManualSortTasks((prev) => {
        if (taskIds(prev) === nextIds.join(',')) {
          return prev;
        }
        // #region agent log
        debugLog(
          'TaskList.tsx:handleDragEnd',
          'apply draggable order to manual state',
          {
            previousTopIds: prev.slice(0, 5).map((task) => task.id),
            nextTopIds: data.slice(0, 5).map((task) => task.id),
          },
          'H28',
          'probe-v11'
        );
        // #endregion agent log
        return data;
      });
      setDraggableListRevision((revision) => {
        const nextRevision = revision + 1;
        // #region agent log
        debugLog(
          'TaskList.tsx:handleDragEnd',
          'remount draggable list after drop',
          { previousRevision: revision, nextRevision },
          'H31',
          'probe-v12'
        );
        // #endregion agent log
        return nextRevision;
      });
    },
    []
  );

  const handleDragBegin = useCallback((index: number) => {
    Keyboard.dismiss();
    dragLifecycleRef.current = {
      beginAt: Date.now(),
      releaseAt: 0,
      placeholderChanges: 0,
    };
    // #region agent log
    debugLog(
      'TaskList.tsx:handleDragBegin',
      'drag begin',
      { index, revision: draggableListRevision },
      'H30',
      'probe-v12'
    );
    // #endregion agent log
  }, [draggableListRevision]);

  const handleDragRelease = useCallback((index: number) => {
    dragLifecycleRef.current.releaseAt = Date.now();
    // #region agent log
    debugLog(
      'TaskList.tsx:handleDragRelease',
      'drag release',
      {
        index,
        placeholderChanges: dragLifecycleRef.current.placeholderChanges,
        dragDurationMs: dragLifecycleRef.current.beginAt
          ? Date.now() - dragLifecycleRef.current.beginAt
          : null,
      },
      'H30',
      'probe-v12'
    );
    // #endregion agent log
  }, []);

  const handlePlaceholderIndexChange = useCallback((index: number) => {
    dragLifecycleRef.current.placeholderChanges += 1;
    // #region agent log
    debugLog(
      'TaskList.tsx:handlePlaceholderIndexChange',
      'placeholder moved',
      {
        index,
        placeholderChanges: dragLifecycleRef.current.placeholderChanges,
      },
      'H30',
      'probe-v12'
    );
    // #endregion agent log
  }, []);

  const renderFlatItem = useCallback(
    ({ item }: { item: Task }) => renderTaskRow(item),
    [renderTaskRow]
  );

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: tokens.background }]}>
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  if (orderedTasks.length === 0 && completedTasks.length === 0) {
    return <EmptyState message={emptyMessage} subtitle={emptySubtitle} />;
  }

  if (reorderMode && onReorder) {
    return (
      <View style={[styles.wrap, { backgroundColor: tokens.background }]}>
        <DraggableFlatList
          key={`manual-sort-${draggableListRevision}`}
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
          onDragBegin={handleDragBegin}
          onRelease={handleDragRelease}
          onPlaceholderIndexChange={handlePlaceholderIndexChange}
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
        data={orderedTasks}
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
