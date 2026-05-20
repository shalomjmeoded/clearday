/** What every user gets in the MVP. */
export const FREE_PLAN_FEATURES = [
  'Today, Tomorrow & Later',
  'Focus Mode',
  'Reminders with custom time',
  'Recurring tasks',
  'Export & import backup',
  'One custom list (+ Inbox)',
  'Light, dark & system theme',
  'Tasks stored on your device',
  'Done history',
  'Subtle ads',
] as const;

/** Unlocked when isPro is true today. */
export const PRO_INCLUDED_FEATURES = [
  'No ads',
  'Unlimited lists',
  'Choose any due date (calendar picker)',
  'Export & import backup',
] as const;

/** Planned — not in the app yet; shown separately on the paywall. */
export const PRO_COMING_SOON_FEATURES = [
  'Advanced reminders',
  'Home screen widgets',
  'Premium themes',
  'Custom app icons',
  'Cloud sync',
  'Shared lists',
  'Voice capture',
  'Smarter task parsing',
  'Completion insights',
] as const;

/** @deprecated Use PRO_INCLUDED_FEATURES + PRO_COMING_SOON_FEATURES */
export const PRO_PAYWALL_FEATURES = [
  ...PRO_INCLUDED_FEATURES,
  ...PRO_COMING_SOON_FEATURES,
] as const;
