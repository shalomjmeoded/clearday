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
 * Scroll clearance for the floating add button (52pt button + 24pt bottom
 * offset + breathing room) so the last row can scroll above it.
 */
export const IDLE_ADD_BUTTON_CLEARANCE = 88;
