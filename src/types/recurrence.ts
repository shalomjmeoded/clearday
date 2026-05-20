export type TaskRecurrence =
  | 'none'
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'yearly';

export const DEFAULT_RECURRENCE: TaskRecurrence = 'none';
