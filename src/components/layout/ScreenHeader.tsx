import { StyleSheet, Text, View, type ViewProps } from 'react-native';

import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';

export function ScreenHeader({
  title,
  right,
  style,
}: ViewProps & { title: string; right?: React.ReactNode }) {
  const { tokens } = useTheme();

  return (
    <View style={[styles.wrap, style]}>
      <Text style={[typography.screenTitle, { color: tokens.text }]}>
        {title}
      </Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
});
