import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { MIN_TOUCH_TARGET } from '@/constants/layout';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import type { ThemeTokens } from '@/theme/tokens';

interface HeaderBackButtonProps {
  tokens: ThemeTokens;
}

export function HeaderBackButton({ tokens }: HeaderBackButtonProps) {
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={8}
      onPress={goBack}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Ionicons name="chevron-back" size={23} color={tokens.accent} />
      <Text style={[typography.button, styles.label, { color: tokens.accent }]}>
        Back
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingRight: spacing.md,
  },
  label: {
    fontSize: 16,
  },
  pressed: {
    opacity: 0.7,
  },
});
