/** What every user gets in the MVP. */
export const FREE_PLAN_FEATURES = [
  'Today list',
  'All list',
  'Tomorrow/Later',
  'Focus Mode',
  'Basic reminders',
  'One custom list',
  'Light/dark/system theme',
  'Local storage',
  'Finished tasks',
  'Private on-device task storage',
] as const;

/** Pro unlocks everything in Free, plus: */
export const PRO_INCLUDED_FEATURES = [
  'Unlimited lists',
  'Recurring tasks',
  'Premium themes',
] as const;

/** @deprecated Pro screen uses PRO_INCLUDED_FEATURES only. */
export const PRO_COMING_SOON_FEATURES = [] as const;

/** @deprecated Use PRO_INCLUDED_FEATURES */
export const PRO_PAYWALL_FEATURES = [...PRO_INCLUDED_FEATURES] as const;
