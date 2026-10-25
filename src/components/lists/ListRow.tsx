import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';

import { MIN_TOUCH_TARGET } from '@/constants/layout';
import { usePressHoldFeedback } from '@/hooks/usePressHoldFeedback';
import { radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';

interface Props {
  name: string;
  color?: string;
  taskCount?: number;
  isTodayDefault: boolean;
  onPress: () => void;
  onLongPress: () => void;
}

function describe(taskCount: number | undefined, isTodayDefault: boolean): string {
  const parts: string[] = [];
  if (taskCount === undefined || taskCount === 0) parts.push('No open tasks');
  else parts.push(`${taskCount} open ${taskCount === 1 ? 'task' : 'tasks'}`);
  if (isTodayDefault) parts.push('Shown on Today');
  return parts.join(' · ');
}

export function ListRow({
  name,
  color,
  taskCount,
  isTodayDefault,
  onPress,
  onLongPress,
}: Props) {
  const { tokens } = useTheme();
  const { animatedStyle, pressIn, pressOut } = usePressHoldFeedback();

  return (
    <Animated.View
      style={[
        styles.row,
        animatedStyle,
        { backgroundColor: tokens.card, borderColor: tokens.border },
      ]}
    >
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={420}
        onPressIn={pressIn}
        onPressOut={pressOut}
        accessibilityRole="button"
        accessibilityLabel={`Open list ${name}. ${describe(taskCount, isTodayDefault)}`}
        style={({ pressed }) => [
          styles.rowMain,
          pressed && styles.rowPressed,
        ]}
      >
        <View style={[styles.colorDot, { backgroundColor: color ?? tokens.border }]} />
        <View style={styles.text}>
          <Text style={[typography.body, { color: tokens.text }]} numberOfLines={1}>
            {name}
          </Text>
          <Text
            style={[
              typography.meta,
              styles.subtitle,
              { color: isTodayDefault ? tokens.accent : tokens.mutedText },
            ]}
            numberOfLines={1}
          >
            {describe(taskCount, isTodayDefault)}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={tokens.mutedText} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: MIN_TOUCH_TARGET + 16,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 4,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  rowPressed: { opacity: 0.92 },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  text: { flex: 1, gap: 2 },
  subtitle: { fontWeight: '400', letterSpacing: 0 },
});
