import React from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import { AdSlot } from '@/components/ads/AdSlot';
import { useBottomBarContentInset } from '@/components/layout/BottomBarInsetContext';
import { EmptyState } from '@/components/ui/EmptyState';
import type { AdPlacement } from '@/features/ads/types';
import { spacing } from '@/theme/spacing';
import { useSettingsStore } from '@/store/settingsStore';
import { useTheme } from '@/theme/ThemeProvider';
import type { Task } from '@/types/task';

import { CompletedSection } from './CompletedSection';
import { TaskRow } from './TaskRow';

interface Props {
  activeTasks: Task[];
  completedTasks: Task[];
  emptyMessage?: string;
  emptySubtitle?: string;
  listNames?: Record<string, string>;
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
}

export function TaskList({
  activeTasks,
  completedTasks,
  emptyMessage = 'Nothing for today. Nice.',
  emptySubtitle,
  listNames = {},
  loading = false,
  bottomInset = 0,
  adPlacement,
  hideAdWhenKeyboardOpen = false,
  ListFooterExtra,
  onComplete,
  onPress,
  onArchive,
  onMoveTomorrow,
}: Props) {
  const { tokens } = useTheme();
  const barInset = useBottomBarContentInset();
  const resolvedBottomInset = bottomInset ?? barInset;
  const behavior = useSettingsStore((s) => s.settings.completedTaskBehavior);

  const showCompletedInline = behavior === 'show';
  const hideCompleted = behavior === 'hide';
  const collapseCompleted = behavior === 'collapse';
  const showAd =
    adPlacement &&
    (activeTasks.length > 0 || completedTasks.length > 0);

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: tokens.background }]}>
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  if (activeTasks.length === 0 && completedTasks.length === 0) {
    return (
      <EmptyState message={emptyMessage} subtitle={emptySubtitle} />
    );
  }

  return (
    <FlatList
      data={activeTasks}
      keyExtractor={(item) => item.id}
      style={{ flex: 1, backgroundColor: tokens.background }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={[
        styles.list,
        resolvedBottomInset > 0 && { paddingBottom: resolvedBottomInset },
      ]}
      renderItem={({ item }) => (
        <TaskRow
          task={item}
          listName={item.listId ? listNames[item.listId] : undefined}
          onComplete={() => onComplete(item.id)}
          onPress={() => onPress(item.id)}
          onArchive={() => onArchive(item.id)}
          onMoveTomorrow={() => onMoveTomorrow(item.id)}
        />
      )}
      ListFooterComponent={
        <View>
          {showCompletedInline &&
            completedTasks.map((task, index) => (
              <TaskRow
                key={task.id}
                task={task}
                compact={index < completedTasks.length - 1}
                onComplete={() => onComplete(task.id)}
                onPress={() => onPress(task.id)}
                onArchive={() => onArchive(task.id)}
                onMoveTomorrow={() => onMoveTomorrow(task.id)}
              />
            ))}
          {collapseCompleted && !hideCompleted && (
            <CompletedSection
              tasks={completedTasks}
              onComplete={onComplete}
              onPress={onPress}
              onArchive={onArchive}
              onMoveTomorrow={onMoveTomorrow}
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
  );
}

const styles = StyleSheet.create({
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
