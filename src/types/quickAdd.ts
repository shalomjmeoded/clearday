import type { TaskRecurrence } from '@/types/recurrence';
import type { TaskPriority } from '@/types/task';

/** Manual quick-add toolbar selections — override parsed input on submit. */
export interface QuickAddOptions {
  dueDate?: string;
  reminderAt?: string;
  color?: string | null;
  priority?: TaskPriority;
  recurrence?: TaskRecurrence;
}
