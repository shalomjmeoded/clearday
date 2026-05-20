import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { typography } from '@/theme/typography';
import { useTheme } from '@/theme/ThemeProvider';

export function BootstrapScreen() {
  const { tokens } = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: tokens.background }]}>
      <ActivityIndicator color={tokens.accent} />
      <Text style={[typography.body, styles.label, { color: tokens.mutedText }]}>
        Loading your tasks…
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  label: {
    fontSize: 15,
    letterSpacing: 0.2,
  },
});
