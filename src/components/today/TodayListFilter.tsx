import { useEffect } from 'react';
import { ScrollView, Pressable, StyleSheet } from 'react-native';
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
  active: boolean;
  tokens: ThemeTokens;
  onPress: () => void;
}

function FilterChip({ label, active, tokens, onPress }: ChipProps) {
  const progress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, { duration: 220 });
  }, [active, progress]);

  const chipStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [tokens.sectionBg, tokens.accentSoft]
    ),
    borderColor: interpolateColor(
      progress.value,
      [0, 1],
      [tokens.border, tokens.accent]
    ),
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, 1.02]) }],
  }));

  const textStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      progress.value,
      [0, 1],
      [tokens.mutedText, tokens.accent]
    ),
  }));

  return (
    <Pressable onPress={onPress}>
      <Animated.View style={[styles.chip, chipStyle]}>
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
    { id: TODAY_FILTER_ALL, label: 'All' },
    ...lists.map((l) => ({ id: l.id, label: l.name })),
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
  scroll: { flexGrow: 0, marginBottom: spacing.sm, overflow: 'visible' },
  row: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    paddingTop: spacing.xs + 2,
    paddingBottom: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 36,
    justifyContent: 'center',
  },
});
