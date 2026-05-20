import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

/** Fills the tree with the active paper background (prevents default white gaps). */
export function ThemedRoot({ children, style, ...props }: ViewProps) {
  const { tokens } = useTheme();

  return (
    <View
      style={[styles.root, { backgroundColor: tokens.background }, style]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
