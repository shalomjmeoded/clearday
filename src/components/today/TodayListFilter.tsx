import { useEffect } from 'react';
import { ScrollView, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';
import type { ThemeTokens } from '@/theme/tokens';
import type { TaskList } from '@/types/list';
import { triggerSelectionHaptic } from '@/utils/haptics';

export const TODAY_FILTER_ALL = 'all';

interface Props {
  lists: TaskList[];
  value: string;
  onChange: (listId: string) => void;
}

interface ChipProps {
  label: string;
  color?: string;
  active: boolean;
  tokens: ThemeTokens;
  onPress: () => void;
}

function FilterChip({ label, color, active, tokens, onPress }: ChipProps) {
  const progress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    progress.set(withTiming(active ? 1 : 0, { duration: 220 }));
  }, [active, progress]);

  const chipStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.get(),
      [0, 1],
      [tokens.sectionBg, tokens.accentSoft]
    ),
    borderColor: interpolateColor(
      progress.get(),
      [0, 1],
      [tokens.border, tokens.accent]
    ),
    transform: [{ scale: interpolate(progress.get(), [0, 1], [1, 1.02]) }],
  }));

  const textStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      progress.get(),
      [0, 1],
      [tokens.mutedText, tokens.accent]
    ),
  }));

  return (
    <Pressable onPress={onPress}>
      <Animated.View style={[styles.chip, chipStyle]}>
        {color ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
        <Animated.Text
          style={[
            typography.meta,
            textStyle,
            { fontWeight: active ? '600' : '500', letterSpacing: 0 },
          ]}
        >
          {label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

export function TodayListFilter({ lists, value, onChange }: Props) {
  const { tokens } = useTheme();

  const segments = [
    { id: TODAY_FILTER_ALL, label: 'All', color: undefined },
    ...lists.map((l) => ({ id: l.id, label: l.name, color: l.color })),
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.scroll}
    >
      {segments.map((seg) => (
        <FilterChip
          key={seg.id}
          label={seg.label}
          color={seg.color}
          active={value === seg.id}
          tokens={tokens}
          onPress={async () => {
            if (value !== seg.id) {
              await triggerSelectionHaptic();
            }
            onChange(seg.id);
          }}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, marginBottom: spacing.xs, overflow: 'visible' },
  row: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 32,
    justifyContent: 'center',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
