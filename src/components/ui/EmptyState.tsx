import { Pressable, StyleSheet, Text } from 'react-native';

import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';

interface Props {
  message: string;
  subtitle?: string;
  actionLabel?: string;
  onPress?: () => void;
}

export function EmptyState({ message, subtitle, actionLabel, onPress }: Props) {
  const { tokens } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [
        styles.wrap,
        { backgroundColor: tokens.background },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[typography.empty, styles.message, { color: tokens.text }]}>
        {message}
      </Text>
      {subtitle && (
        <Text
          style={[typography.emptySub, styles.subtitle, { color: tokens.mutedText }]}
        >
          {subtitle}
        </Text>
      )}
      {actionLabel && onPress ? (
        <Text
          style={[
            typography.button,
            styles.action,
            { backgroundColor: tokens.accent, color: tokens.onAccent },
          ]}
        >
          {actionLabel}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl * 2,
    paddingBottom: spacing.xxl,
  },
  message: { textAlign: 'center', opacity: 0.85 },
  subtitle: { textAlign: 'center' },
  action: {
    marginTop: spacing.lg,
    minHeight: 40,
    borderRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    overflow: 'hidden',
    textAlign: 'center',
  },
  pressed: { opacity: 0.78 },
});
