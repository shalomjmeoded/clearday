import { StyleSheet, Text, View } from 'react-native';

import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';

interface Props {
  message: string;
  subtitle?: string;
}

export function EmptyState({ message, subtitle }: Props) {
  const { tokens } = useTheme();

  return (
    <View style={[styles.wrap, { backgroundColor: tokens.background }]}>
      <Text style={[typography.empty, styles.message, { color: tokens.text }]}>
        {message}
      </Text>
      {subtitle && (
        <Text
          style={[typography.emptySub, { color: tokens.mutedText }]}
        >
          {subtitle}
        </Text>
      )}
    </View>
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
});
