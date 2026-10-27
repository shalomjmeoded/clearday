import { Pressable, StyleSheet, Text, View } from 'react-native';

import { elevation } from '@/theme/elevation';
import { radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';
import { triggerSelectionHaptic } from '@/utils/haptics';

interface Segment {
  key: string;
  label: string;
}

interface Props {
  segments: Segment[];
  value: string;
  onChange: (key: string) => void;
}

export function SegmentedControl({ segments, value, onChange }: Props) {
  const { tokens } = useTheme();

  return (
    <View
      style={[styles.wrap, { backgroundColor: tokens.sectionBg }]}
      accessibilityRole="tablist"
    >
      {segments.map((seg) => {
        const active = seg.key === value;
        return (
          <Pressable
            key={seg.key}
            onPress={async () => {
              await triggerSelectionHaptic();
              onChange(seg.key);
            }}
            // Which segment is active is otherwise conveyed by fill colour and
            // font weight alone.
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[
              styles.segment,
              active && { backgroundColor: tokens.card },
              active && elevation.raised,
            ]}
          >
            <Text
              style={[
                typography.meta,
                {
                  color: active ? tokens.text : tokens.mutedText,
                  textTransform: 'none',
                  letterSpacing: 0,
                  fontWeight: active ? '600' : '500',
                },
              ]}
            >
              {seg.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    borderRadius: radius.md,
    padding: spacing.xs,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm + 4,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
  },
});
