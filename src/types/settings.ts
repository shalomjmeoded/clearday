import { INBOX_LIST_ID } from '@/db/constants';

export type ThemeMode = 'system' | 'light' | 'dark';
export type CompletedTaskBehavior = 'collapse' | 'hide' | 'show';

export interface AppSettings {
  theme: ThemeMode;
  hapticsEnabled: boolean;
  completedTaskBehavior: CompletedTaskBehavior;
  defaultReminderTime: string;
  /** New tasks from Today and undated “today” tasks use this list. */
  defaultListId: string;
  isPro: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  hapticsEnabled: true,
  completedTaskBehavior: 'collapse',
  defaultReminderTime: '09:00',
  defaultListId: INBOX_LIST_ID,
  isPro: false,
};
