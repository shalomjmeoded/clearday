/** What every user gets in the MVP. */
export const FREE_PLAN_FEATURES = [
  'Today list',
  'Tomorrow & Later',
  'Focus Mode',
  'Basic reminders',
  'One custom list (+ Inbox)',
  'Light, dark & system theme',
  'Local storage',
  'Done history',
  'Privacy-first: tasks stay on phone',
] as const;

/** Pro unlocks everything in Free, plus: */
export const PRO_INCLUDED_FEATURES = [
  'Unlimited lists',
  'Recurring tasks',
  'Advanced reminders',
  'Advanced widgets',
  'Premium themes',
  'Custom app icons',
  'Backup/export',
  'Future cloud sync',
  'Shared lists',
  'Voice capture',
  'Smarter task parsing',
  'Completion insights',
] as const;

/** @deprecated Pro screen uses PRO_INCLUDED_FEATURES only. */
export const PRO_COMING_SOON_FEATURES = [] as const;

/** @deprecated Use PRO_INCLUDED_FEATURES */
export const PRO_PAYWALL_FEATURES = [...PRO_INCLUDED_FEATURES] as const;
