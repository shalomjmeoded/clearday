import { Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

import { MIN_TOUCH_TARGET } from '@/constants/layout';
import { radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';

export function PrimaryButton({
  label,
  onPress,
  disabled,
  variant = 'primary',
  ...props
}: PressableProps & {
  label: string;
  variant?: 'primary' | 'ghost' | 'danger';
}) {
  const { tokens } = useTheme();

  const bg =
    variant === 'primary'
      ? tokens.accent
      : variant === 'danger'
        ? 'transparent'
        : 'transparent';

  const textColor =
    variant === 'primary'
      ? tokens.onAccent
      : variant === 'danger'
        ? tokens.danger
        : tokens.mutedText;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.88 : 1 },
        variant === 'ghost' && styles.ghost,
      ]}
      {...props}
    >
      <Text style={[typography.button, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  ghost: { marginTop: spacing.lg },
});
