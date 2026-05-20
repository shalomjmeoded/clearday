import { Platform } from 'react-native';

export const MIN_TOUCH_TARGET = 44;

/** Icon + label row inside the tab bar (excludes safe-area padding). */
export const TAB_BAR_ITEM_HEIGHT = 56;

/** Top padding inside `tabBarStyle` — keep in sync with app/(tabs)/_layout.tsx */
export const TAB_BAR_PADDING_TOP = 8;

/** Total tab bar height including the system bottom inset (nav bar / home indicator). */
export function getTabBarHeight(bottomInset: number): number {
  return TAB_BAR_ITEM_HEIGHT + TAB_BAR_PADDING_TOP + bottomInset;
}

/**
 * Legacy fixed height without safe area — do not use for layout math.
 * @deprecated Use getTabBarHeight(insets.bottom) instead.
 */
export const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 88 : 64;

/** Approximate height of BottomInputBar (padding + input). */
export const BOTTOM_INPUT_BAR_HEIGHT = 76;
