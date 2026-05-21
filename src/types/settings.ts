import { INBOX_LIST_ID } from '@/db/constants';

export type ThemeMode = 'system' | 'light' | 'dark';
export type CompletedTaskBehavior = 'collapse' | 'hide' | 'show';
export type TaskSwipeAction = 'tomorrow' | 'important' | 'archive' | 'delete';
export type ColorTheme = 'classic' | 'yellow' | 'pink' | 'mint' | 'sky' | 'graphite';

export interface AppSettings {
  theme: ThemeMode;
  colorTheme: ColorTheme;
  hapticsEnabled: boolean;
  completedTaskBehavior: CompletedTaskBehavior;
  defaultReminderTime: string;
  swipeLeftAction: TaskSwipeAction;
  swipeRightAction: TaskSwipeAction;
  /** New tasks from Today and undated “today” tasks use this list. */
  defaultListId: string;
  isPro: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  colorTheme: 'classic',
  hapticsEnabled: true,
  completedTaskBehavior: 'collapse',
  defaultReminderTime: '09:00',
  swipeLeftAction: 'tomorrow',
  swipeRightAction: 'archive',
  defaultListId: INBOX_LIST_ID,
  isPro: false,
};
