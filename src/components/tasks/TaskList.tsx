import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { AdSlot } from '@/components/ads/AdSlot';
import { useBottomBarContentInset } from '@/components/layout/BottomBarInsetContext';
import { EmptyState } from '@/components/ui/EmptyState';
import type { AdPlacement } from '@/features/ads/types';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useSettingsStore } from '@/store/settingsStore';
import { useTheme } from '@/theme/ThemeProvider';
import type { Task } from '@/types/task';

import { CompletedSection } from './CompletedSection';
import { TaskRow } from './TaskRow';

const ACTIVE_CELL_Z_INDEX = 1000;
const FALLBACK_ROW_HEIGHT = 46;

interface RowLayout {
  height: number;
  width: number;
  y: number;
}

interface DragGhost {
  colorMark?: string;
  height: number;
  task: Task;
  top: number;
  width: number;
}

interface DragSession {
  id: string;
  startCenterY: number;
  startIndex: number;
}

interface Props {
  activeTasks: Task[];
  completedTasks: Task[];
  emptyMessage?: string;
  emptySubtitle?: string;
  listNames?: Record<string, string>;
  listColors?: Record<string, string>;
  loading?: boolean;
  /** Override scroll padding; defaults to ScreenWithBottomBar inset when inside that layout. */
  bottomInset?: number;
  /** Mock ad after tasks (not between rows). */
  adPlacement?: AdPlacement;
  hideAdWhenKeyboardOpen?: boolean;
  ListFooterExtra?: React.ReactNode;
  onComplete: (id: string) => void;
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
}

export function TaskList({
  activeTasks,
  completedTasks,
  emptyMessage = 'Nothing for today. Nice.',
  emptySubtitle,
  listNames = {},
  listColors = {},
  loading = false,
  bottomInset = 0,
  adPlacement,
  hideAdWhenKeyboardOpen = false,
  ListFooterExtra,
  onComplete,
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
}: Props) {
  const { tokens } = useTheme();
  const barInset = useBottomBarContentInset();
  const resolvedBottomInset = bottomInset ?? barInset;
  const behavior = useSettingsStore((s) => s.settings.completedTaskBehavior);
  const [orderedTasks, setOrderedTasks] = useState(activeTasks);
  const [dragGhost, setDragGhost] = useState<DragGhost | null>(null);
  const [dropSettling, setDropSettling] = useState(false);
  const activeDragIndex = useSharedValue(-1);
  const hoverDragIndex = useSharedValue(-1);
  const dragTranslationY = useSharedValue(0);
  const dragRowHeight = useSharedValue(FALLBACK_ROW_HEIGHT);
  const reorderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropSettleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cellLayouts = useRef<Record<number, RowLayout>>({});
  const rowLayouts = useRef<Record<string, RowLayout>>({});
  const dragSession = useRef<DragSession | null>(null);
  const scrollOffset = useRef(0);

  const queueReorder = useCallback(
    (tasks: Task[]) => {
      if (!onReorder) return;
      if (reorderTimer.current) {
        clearTimeout(reorderTimer.current);
      }
      reorderTimer.current = setTimeout(() => {
        onReorder(tasks.map((task) => task.id));
      }, 160);
    },
    [onReorder]
  );

  useEffect(() => {
    setOrderedTasks((current) => {
      const currentIds = current.map((task) => task.id).join('|');
      const nextIds = activeTasks.map((task) => task.id).join('|');
      return currentIds === nextIds ? current : activeTasks;
    });
  }, [activeTasks]);

  useEffect(
    () => () => {
      if (reorderTimer.current) {
        clearTimeout(reorderTimer.current);
      }
      if (dropSettleTimer.current) {
        clearTimeout(dropSettleTimer.current);
      }
    },
    []
  );

  const showCompletedInline = behavior === 'show';
  const hideCompleted = behavior === 'hide';
  const collapseCompleted = behavior === 'collapse';
  const showAd =
    adPlacement &&
    (activeTasks.length > 0 || completedTasks.length > 0);

  const CellRenderer = useCallback(
    ({ children, index, onLayout, style, ...props }: any) => {
      const cellStyle = useAnimatedStyle(() => ({
        zIndex: activeDragIndex.value === index ? ACTIVE_CELL_Z_INDEX : 0,
        elevation: activeDragIndex.value === index ? 24 : 0,
      }));

      return (
        <Animated.View
          {...props}
          collapsable={false}
          onLayout={(event) => {
            cellLayouts.current[index] = event.nativeEvent.layout;
            onLayout?.(event);
          }}
          renderToHardwareTextureAndroid
          style={[style, styles.cell, cellStyle]}
        >
          {children}
        </Animated.View>
      );
    },
    [activeDragIndex]
  );

  const getHoverIndex = useCallback(
    (id: string, translationY: number, tasks: Task[]) => {
      const currentIndex = tasks.findIndex((task) => task.id === id);
      const session = dragSession.current;
      const startIndex =
        session?.id === id ? session.startIndex : currentIndex;
      const startLayout = cellLayouts.current[startIndex];
      const startCenterY =
        session?.id === id
          ? session.startCenterY
          : (startLayout?.y ?? startIndex * FALLBACK_ROW_HEIGHT) +
            (startLayout?.height ?? FALLBACK_ROW_HEIGHT) / 2;
      const draggedCenterY = startCenterY + translationY;

      if (currentIndex < 0 || startIndex < 0) {
        return -1;
      }

      let targetIndex = 0;
      tasks.forEach((task, index) => {
        if (task.id === id) return;
        const layout = cellLayouts.current[index];
        const centerY =
          (layout?.y ?? index * FALLBACK_ROW_HEIGHT) +
          (layout?.height ?? FALLBACK_ROW_HEIGHT) / 2;

        if (draggedCenterY > centerY) {
          targetIndex += 1;
        }
      });

      return Math.max(0, Math.min(tasks.length - 1, targetIndex));
    },
    []
  );

  const commitTaskMove = useCallback(
    (id: string, targetIndex: number) => {
      if (!onReorder) return;
      setOrderedTasks((current) => {
        if (targetIndex < 0) return current;
        const index = current.findIndex((task) => task.id === id);
        const target = Math.max(
          0,
          Math.min(current.length - 1, targetIndex)
        );
        if (index < 0 || target < 0 || target >= current.length) {
          return current;
        }
        if (index === target) {
          return current;
        }
        const reordered = [...current];
        const [task] = reordered.splice(index, 1);
        reordered.splice(target, 0, task);
        queueReorder(reordered);
        return reordered;
      });
    },
    [onReorder, queueReorder]
  );

  const ghostStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragTranslationY.value }],
  }));

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: tokens.background }]}>
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  if (orderedTasks.length === 0 && completedTasks.length === 0) {
    return (
      <EmptyState message={emptyMessage} subtitle={emptySubtitle} />
    );
  }

  return (
    <View style={styles.wrap}>
      <FlatList
        data={orderedTasks}
        keyExtractor={(item) => item.id}
        style={{ flex: 1, backgroundColor: tokens.background }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        removeClippedSubviews={false}
        CellRendererComponent={CellRenderer}
        onScroll={(event) => {
          scrollOffset.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        contentContainerStyle={[
          styles.list,
          resolvedBottomInset > 0 && { paddingBottom: resolvedBottomInset },
        ]}
        renderItem={({ item, index }) => {
          const colorMark =
            item.color ??
            (item.listId && listColors[item.listId]
              ? listColors[item.listId]
              : item.priority === 'important'
                ? tokens.actionPin
                : item.priority === 'must_do_today'
                  ? tokens.danger
                  : undefined);

          return (
            <TaskRow
              task={item}
              listName={item.listId ? listNames[item.listId] : undefined}
              colorMark={colorMark}
              onComplete={() => onComplete(item.id)}
              onPress={() => onPress(item.id)}
              onArchive={() => onArchive(item.id)}
              onDelete={() => onDelete(item.id)}
              onPin={() => onSetImportant(item.id)}
              onToggleRecurring={() => onToggleRecurring(item.id)}
              reorderMode={reorderMode}
              disableLayoutAnimation={Boolean(dragGhost) || dropSettling}
              hiddenPlaceholder={dragGhost?.task.id === item.id}
              rowIndex={index}
              activeDragIndex={activeDragIndex}
              hoverDragIndex={hoverDragIndex}
              dragTranslationY={dragTranslationY}
              dragRowHeight={dragRowHeight}
              canMoveUp={index > 0}
              canMoveDown={index < orderedTasks.length - 1}
              onRowLayout={(layout) => {
                rowLayouts.current[item.id] = layout;
              }}
              onDragStart={() => {
                const rowLayout = rowLayouts.current[item.id];
                const cellLayout = cellLayouts.current[index];
                activeDragIndex.value = index;
                hoverDragIndex.value = index;
                dragTranslationY.value = 0;
                dragRowHeight.value =
                  cellLayout?.height ?? rowLayout?.height ?? FALLBACK_ROW_HEIGHT;
                dragSession.current = {
                  id: item.id,
                  startCenterY:
                    (cellLayout?.y ?? index * FALLBACK_ROW_HEIGHT) +
                    (cellLayout?.height ?? rowLayout?.height ?? FALLBACK_ROW_HEIGHT) / 2,
                  startIndex: index,
                };
                if (rowLayout || cellLayout) {
                  setDragGhost({
                    colorMark,
                    height: rowLayout?.height ?? cellLayout.height,
                    task: item,
                    top: (cellLayout?.y ?? rowLayout?.y ?? 0) - scrollOffset.current,
                    width: rowLayout?.width ?? cellLayout.width,
                  });
                }
                onStartManualSort?.();
              }}
              onDragMove={(translationY) => {
                const hoverIndex = getHoverIndex(
                  item.id,
                  translationY,
                  orderedTasks
                );
                if (hoverIndex >= 0) {
                  hoverDragIndex.value = hoverIndex;
                }
              }}
              onDragEnd={(translationY) => {
                if (dropSettleTimer.current) {
                  clearTimeout(dropSettleTimer.current);
                }
                const targetIndex = getHoverIndex(
                  item.id,
                  translationY,
                  orderedTasks
                );
                setDropSettling(true);
                commitTaskMove(item.id, targetIndex);
                requestAnimationFrame(() => {
                  activeDragIndex.value = -1;
                  hoverDragIndex.value = -1;
                  dropSettleTimer.current = setTimeout(() => {
                    setDragGhost(null);
                    dragTranslationY.value = 0;
                    dragRowHeight.value = FALLBACK_ROW_HEIGHT;
                    dragSession.current = null;
                    setDropSettling(false);
                    onEndManualSort?.();
                  }, 120);
                });
              }}
            />
          );
        }}
        ListFooterComponent={
          <View>
            {showCompletedInline &&
              completedTasks.map((task, index) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  colorMark={
                    task.color ??
                    (task.listId && listColors[task.listId]
                      ? listColors[task.listId]
                      : undefined)
                  }
                  compact={index < completedTasks.length - 1}
                  onComplete={() => onComplete(task.id)}
                  onPress={() => onPress(task.id)}
                  onArchive={() => onArchive(task.id)}
                  onDelete={() => onDelete(task.id)}
                  onPin={() => onSetImportant(task.id)}
                  onToggleRecurring={() => onToggleRecurring(task.id)}
                />
              ))}
            {collapseCompleted && !hideCompleted && (
              <CompletedSection
                tasks={completedTasks}
                onComplete={onComplete}
                onPress={onPress}
                onArchive={onArchive}
                onMoveTomorrow={onMoveTomorrow}
                onDelete={onDelete}
                onSetImportant={onSetImportant}
                onToggleRecurring={onToggleRecurring}
              />
            )}
            {showAd && adPlacement ? (
              <AdSlot
                placement={adPlacement}
                hideWhenKeyboardOpen={hideAdWhenKeyboardOpen}
              />
            ) : null}
            {ListFooterExtra}
          </View>
        }
      />
      {dragGhost ? (
        <Animated.View
          pointerEvents="none"
          renderToHardwareTextureAndroid
          style={[
            styles.ghost,
            ghostStyle,
            {
              backgroundColor:
                dragGhost.task.priority === 'must_do_today'
                  ? tokens.card
                  : tokens.background,
              borderColor: tokens.paperLine,
              height: dragGhost.height,
              top: dragGhost.top,
              width: dragGhost.width,
            },
          ]}
        >
          <View style={styles.ghostPinColumn}>
            <View style={[styles.ghostVerticalRule, { backgroundColor: tokens.paperLine }]} />
          </View>
          <View style={styles.ghostContent}>
            {dragGhost.colorMark ? (
              <View style={[styles.ghostColorMark, { backgroundColor: dragGhost.colorMark }]} />
            ) : null}
            <Text
              style={[typography.taskTitle, { color: tokens.text }]}
              numberOfLines={3}
            >
              {dragGhost.task.title}
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    overflow: 'visible',
  },
  cell: {
    overflow: 'visible',
    position: 'relative',
  },
  ghost: {
    position: 'absolute',
    left: 0,
    zIndex: 10000,
    elevation: 40,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 7,
    paddingHorizontal: spacing.lg,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
  },
  ghostColorMark: {
    position: 'absolute',
    left: 0,
    top: 3,
    bottom: 3,
    width: 3,
    borderRadius: 3,
  },
  ghostContent: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 28,
    paddingLeft: 10,
  },
  ghostPinColumn: {
    width: 38,
    minHeight: 28,
    paddingTop: 1,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  ghostVerticalRule: {
    position: 'absolute',
    right: 0,
    top: -7,
    bottom: -7,
    width: StyleSheet.hairlineWidth,
  },
  list: {
    paddingBottom: spacing.md,
    paddingTop: spacing.xs,
    flexGrow: 1,
    overflow: 'visible',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xxl * 2,
  },
});
