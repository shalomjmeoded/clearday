import { StyleSheet, Text, View, type ViewProps } from 'react-native';

import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';

export function ScreenHeader({
  title,
  subtitle,
  right,
  style,
}: ViewProps & { title: string; subtitle?: string; right?: React.ReactNode }) {
  const { tokens } = useTheme();

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.text}>
        <Text
          style={[typography.screenTitle, { color: tokens.text }]}
          accessibilityRole="header"
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={[typography.caption, styles.subtitle, { color: tokens.mutedText }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
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
  text: { flexShrink: 1, gap: spacing.xs },
  subtitle: { textTransform: 'none', letterSpacing: 0 },
});
