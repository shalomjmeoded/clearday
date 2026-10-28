import { INBOX_LIST_ID } from '@/db/constants';

export const THEME_MODES = ['system', 'light', 'dark'] as const;
export const COMPLETED_TASK_BEHAVIORS = ['collapse', 'hide', 'show'] as const;
export const TASK_SWIPE_ACTIONS = [
  'tomorrow',
  'important',
  'archive',
  'delete',
] as const;
export const TASK_SORT_MODES = [
  'manual',
  'scheduled',
  'created',
  'modified',
  'alpha',
  'color',
] as const;
export const COLOR_THEMES = [
  'classic',
  'yellow',
  'pink',
  'mint',
  'sky',
  'graphite',
] as const;

export type ThemeMode = (typeof THEME_MODES)[number];
export type CompletedTaskBehavior = (typeof COMPLETED_TASK_BEHAVIORS)[number];
export type TaskSwipeAction = (typeof TASK_SWIPE_ACTIONS)[number];
export type ColorTheme = (typeof COLOR_THEMES)[number];
export type TaskSortMode = (typeof TASK_SORT_MODES)[number];

export interface AppSettings {
  theme: ThemeMode;
  colorTheme: ColorTheme;
  hapticsEnabled: boolean;
  completedTaskBehavior: CompletedTaskBehavior;
  /** "HH:mm", 24-hour. */
  defaultReminderTime: string;
  swipeLeftAction: TaskSwipeAction;
  swipeRightAction: TaskSwipeAction;
  /** New tasks from Today and undated “today” tasks use this list. */
  defaultListId: string;
  /** How Today orders its rows; chosen from the sort pill and kept across launches. */
  todaySortMode: TaskSortMode;
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
  todaySortMode: 'manual',
};

export const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[];

const TIME_KEY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTimeKey(value: unknown): value is string {
  return typeof value === 'string' && TIME_KEY_PATTERN.test(value);
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

/**
 * Turns whatever is in the settings table or a backup file into a well-formed
 * AppSettings. Every value is checked against its allowed set; anything
 * missing or malformed falls back to the default so a bad row (or a
 * hand-edited backup) can never put the UI into a state it has no handling
 * for. `knownListIds`, when given, additionally repoints defaultListId at the
 * Inbox if the list does not exist.
 */
export function normalizeSettings(
  raw: Record<string, unknown> | null | undefined,
  knownListIds?: ReadonlySet<string>
): AppSettings {
  const map = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const defaultListId =
    typeof map.defaultListId === 'string' && map.defaultListId.length > 0
      ? map.defaultListId
      : DEFAULT_SETTINGS.defaultListId;
  return {
    theme: oneOf(map.theme, THEME_MODES, DEFAULT_SETTINGS.theme),
    colorTheme: oneOf(map.colorTheme, COLOR_THEMES, DEFAULT_SETTINGS.colorTheme),
    hapticsEnabled: asBoolean(map.hapticsEnabled, DEFAULT_SETTINGS.hapticsEnabled),
    completedTaskBehavior: oneOf(
      map.completedTaskBehavior,
      COMPLETED_TASK_BEHAVIORS,
      DEFAULT_SETTINGS.completedTaskBehavior
    ),
    defaultReminderTime: isValidTimeKey(map.defaultReminderTime)
      ? map.defaultReminderTime
      : DEFAULT_SETTINGS.defaultReminderTime,
    swipeLeftAction: oneOf(
      map.swipeLeftAction,
      TASK_SWIPE_ACTIONS,
      DEFAULT_SETTINGS.swipeLeftAction
    ),
    swipeRightAction: oneOf(
      map.swipeRightAction,
      TASK_SWIPE_ACTIONS,
      DEFAULT_SETTINGS.swipeRightAction
    ),
    defaultListId:
      knownListIds && !knownListIds.has(defaultListId)
        ? INBOX_LIST_ID
        : defaultListId,
    todaySortMode: oneOf(map.todaySortMode, TASK_SORT_MODES, DEFAULT_SETTINGS.todaySortMode),
  };
}

/** The string form each setting takes in the key/value table. */
export function serializeSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K]
): string {
  return String(value);
}
