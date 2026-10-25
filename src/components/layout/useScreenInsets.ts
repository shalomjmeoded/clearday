import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getTabBarHeight } from '@/constants/layout';
import { spacing } from '@/theme/spacing';

export type ScreenVariant = 'tab' | 'stack';

export interface ScreenInsetsOptions {
  /** `tab` = inside bottom tabs; `stack` = modal or pushed stack screen. */
  variant?: ScreenVariant;
}

/**
 * Single source of truth for notch, home indicator, and tab bar spacing.
 * Tab bar height matches app/(tabs)/_layout.tsx (content + top padding + bottom inset).
 */
export function useScreenInsets(options: ScreenInsetsOptions = {}) {
  const { variant = 'stack' } = options;

  const insets = useSafeAreaInsets();
  const top = insets.top;
  const bottomSafe = insets.bottom;
  const tabBarHeight = getTabBarHeight(bottomSafe);
  const tabBar = variant === 'tab' ? tabBarHeight : 0;

  /** Padding for Screen frame bottom (tab bar OR home indicator). */
  const screenPaddingBottom =
    variant === 'tab' ? tabBarHeight : bottomSafe;

  /** Scroll content padding on tab screens (clears tab bar). */
  const scrollBottomPadding = tabBarHeight + spacing.lg;

  /** Form / modal scroll — keeps actions above keyboard + home indicator. */
  const formScrollBottomPadding = bottomSafe + spacing.xxl;

  return {
    insets,
    top,
    bottomSafe,
    tabBarHeight,
    tabBar,
    screenPaddingBottom,
    scrollBottomPadding,
    formScrollBottomPadding,
  };
}
