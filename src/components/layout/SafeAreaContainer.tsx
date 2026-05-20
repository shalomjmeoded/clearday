import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { useScreenInsets } from './useScreenInsets';

type Edge = 'top' | 'bottom';

interface Props extends ViewProps {
  edges?: Edge[];
}

/**
 * Lightweight safe-area wrapper for sections inside a screen.
 * Prefer Screen / ScrollScreen / FormScreen for full-screen layouts.
 */
export function SafeAreaContainer({
  edges = ['top', 'bottom'],
  style,
  children,
  ...props
}: Props) {
  const { tokens } = useTheme();
  const { top, bottomSafe } = useScreenInsets({ variant: 'stack' });

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: tokens.background,
          paddingTop: edges.includes('top') ? top : 0,
          paddingBottom: edges.includes('bottom') ? bottomSafe : 0,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
