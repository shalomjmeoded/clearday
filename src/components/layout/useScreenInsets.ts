import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BOTTOM_INPUT_BAR_HEIGHT, getTabBarHeight } from '@/constants/layout';
import { spacing } from '@/theme/spacing';

export type ScreenVariant = 'tab' | 'stack';

export interface ScreenInsetsOptions {
  /** `tab` = inside bottom tabs; `stack` = modal or pushed stack screen. */
  variant?: ScreenVariant;
  /** Screen has a fixed BottomInputBar — computes scroll/list inset. */
  hasBottomBar?: boolean;
  /** Bottom bar sits on a tab screen (lifts above tab bar when keyboard closed). */
  aboveTabBar?: boolean;
}

/**
 * Single source of truth for notch, home indicator, tab bar, and bottom input bar spacing.
 * Tab bar height matches app/(tabs)/_layout.tsx (content + top padding + bottom inset).
 */
export function useScreenInsets(options: ScreenInsetsOptions = {}) {
  const {
    variant = 'stack',
    hasBottomBar = false,
    aboveTabBar = false,
  } = options;

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

  /** FlatList / scroll area above BottomInputBar. */
  const listBottomInset = hasBottomBar
    ? BOTTOM_INPUT_BAR_HEIGHT +
      (aboveTabBar ? tabBarHeight : bottomSafe) +
      spacing.sm
    : 0;

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
    listBottomInset,
    formScrollBottomPadding,
    bottomInputBarHeight: BOTTOM_INPUT_BAR_HEIGHT,
  };
}
