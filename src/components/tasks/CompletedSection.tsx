import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';
import type { Task } from '@/types/task';
import { triggerSoftHaptic } from '@/utils/haptics';

import { TaskRow } from './TaskRow';

interface Props {
  tasks: Task[];
  onComplete: (id: string) => void;
  onPress: (id: string) => void;
  onArchive: (id: string) => void;
  onMoveTomorrow: (id: string) => void;
  onDelete?: (id: string) => void;
  onSetImportant?: (id: string) => void;
  onToggleRecurring?: (id: string) => void;
}

export function CompletedSection({
  tasks,
  onComplete,
  onPress,
  onArchive,
  onMoveTomorrow,
  onDelete,
  onSetImportant,
  onToggleRecurring,
}: Props) {
  const { tokens } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.set(withTiming(expanded ? 1 : 0, { duration: 160 }));
  }, [expanded, rotation]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.get() * 90}deg` }],
  }));

  if (tasks.length === 0) return null;

  const toggle = async () => {
    await triggerSoftHaptic();
    setExpanded((e) => !e);
  };

  return (
    <View style={[styles.wrap, { borderTopColor: tokens.border }]}>
      <Pressable
        onPress={toggle}
        style={[styles.header, { backgroundColor: tokens.sectionBg }]}
      >
        <Text style={[typography.meta, { color: tokens.mutedText }]}>
          Completed · {tasks.length}
        </Text>
        <Animated.View style={chevronStyle}>
          <Ionicons name="chevron-forward" size={16} color={tokens.mutedText} />
        </Animated.View>
      </Pressable>
      {expanded && (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)}>
          {tasks.map((task, index) => (
            <TaskRow
              key={task.id}
              task={task}
              compact={index < tasks.length - 1}
              onComplete={() => onComplete(task.id)}
              onPress={() => onPress(task.id)}
              onArchive={() => onArchive(task.id)}
              onMoveTomorrow={() => onMoveTomorrow(task.id)}
              onDelete={() => (onDelete ? onDelete(task.id) : onArchive(task.id))}
              onPin={() => (onSetImportant ? onSetImportant(task.id) : undefined)}
              onToggleRecurring={() =>
                onToggleRecurring ? onToggleRecurring(task.id) : undefined
              }
            />
          ))}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
  },
});
