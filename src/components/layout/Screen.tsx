import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { useScreenInsets, type ScreenVariant } from './useScreenInsets';

type Edge = 'top' | 'bottom';

function ScreenFrame({
  children,
  style,
  paddingTop,
  paddingBottom,
  ...props
}: ViewProps & { paddingTop: number; paddingBottom: number }) {
  const { tokens } = useTheme();

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: tokens.background,
          paddingTop,
          paddingBottom,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

export interface ScreenProps extends ViewProps {
  edges?: Edge[];
  /**
   * `tab` — reserves space for bottom tab bar.
   * `stack` — modal/stack; use edges `['top','bottom']` for home indicator when needed.
   */
  variant?: ScreenVariant;
  /** @deprecated Use variant="tab" */
  padTabBar?: boolean;
}

export function Screen({
  edges = ['top'],
  variant,
  padTabBar = false,
  style,
  children,
  ...props
}: ScreenProps) {
  const resolvedVariant: ScreenVariant =
    variant ?? (padTabBar ? 'tab' : 'stack');

  const { top, screenPaddingBottom, bottomSafe } = useScreenInsets({
    variant: resolvedVariant,
  });

  const paddingTop = edges.includes('top') ? top : 0;
  const paddingBottom =
    resolvedVariant === 'tab'
      ? screenPaddingBottom
      : edges.includes('bottom')
        ? bottomSafe
        : 0;

  return (
    <ScreenFrame
      paddingTop={paddingTop}
      paddingBottom={paddingBottom}
      style={style}
      {...props}
    >
      {children}
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
});
