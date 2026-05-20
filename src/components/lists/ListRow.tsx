import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { MIN_TOUCH_TARGET } from '@/constants/layout';
import { usePressHoldFeedback } from '@/hooks/usePressHoldFeedback';
import { radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';

interface Props {
  name: string;
  isTodayDefault: boolean;
  onPress: () => void;
  onSetToday: () => void;
  onLongPress: () => void;
}

export function ListRow({
  name,
  isTodayDefault,
  onPress,
  onSetToday,
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
        style={({ pressed }) => [
          styles.rowMain,
          pressed && styles.rowPressed,
        ]}
      >
        <Text style={[typography.body, { color: tokens.text }]}>{name}</Text>
      </Pressable>
      <View style={styles.rowActions}>
        {isTodayDefault ? (
          <Text
            style={[
              typography.meta,
              styles.actionLabel,
              { color: tokens.accent },
            ]}
          >
            Today
          </Text>
        ) : (
          <Pressable onPress={onSetToday} hitSlop={8} style={styles.actionBtn}>
            <Text style={[typography.meta, { color: tokens.mutedText }]}>
              Set Today
            </Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: MIN_TOUCH_TARGET + 8,
  },
  rowMain: {
    flex: 1,
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  rowPressed: { opacity: 0.92 },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  actionBtn: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
  },
  actionLabel: {
    minHeight: MIN_TOUCH_TARGET,
    textAlignVertical: 'center',
    lineHeight: MIN_TOUCH_TARGET,
  },
});
