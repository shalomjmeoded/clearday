import type { Task } from '@/types/task';
import { formatDisplayDate, formatTime, isToday } from '@/utils/dates';
import { formatRecurrenceLabel, isRecurring } from '@/utils/recurrence';
import {
  effectiveReminderAt,
  isReminderOnDifferentDay,
  isReminderPast,
} from '@/utils/reminderTime';

export interface ReminderDisplay {
  /** Empty when the task has no reminder. */
  label: string;
  /** True when the alert has already gone by, which the row strikes through. */
  isPast: boolean;
}

/**
 * How a task row presents its reminder, shared by the visible meta line and
 * the row's accessibility label so the two cannot drift apart.
 *
 * Uses the *effective* time, so a snoozed reminder reads as its pushed-out
 * time rather than as already passed, and names the day only when the time
 * alone would be ambiguous.
 */
export function taskReminderDisplay(task: Task): ReminderDisplay {
  const completed = task.status === 'completed';
  const reminderAt = effectiveReminderAt(task);
  if (!reminderAt) return { label: '', isPast: false };

  const needsDay = task.dueDate
    ? isReminderOnDifferentDay(reminderAt, task.dueDate)
    : !isToday(reminderAt);

  return {
    label: needsDay
      ? `${formatDisplayDate(reminderAt)} ${formatTime(reminderAt)}`
      : formatTime(reminderAt),
    isPast: !completed && isReminderPast(reminderAt),
  };
}

/**
 * Everything a task row shows visually, flattened into one spoken string.
 *
 * The row is a single accessibility element — its children collapse into this
 * label — so anything omitted here is invisible to a screen reader, including
 * the completed state that is otherwise conveyed by strikethrough alone.
 */
export function describeTaskRow(
  task: Task,
  {
    listName,
    restoreMode = false,
  }: { listName?: string; restoreMode?: boolean } = {}
): string {
  const completed = task.status === 'completed';
  const reminder = taskReminderDisplay(task);
  const parts: string[] = [task.title];

  if (restoreMode) parts.push('Archived');
  else if (completed) parts.push('Completed');

  if (task.dueDate) parts.push(`Due ${formatDisplayDate(task.dueDate)}`);

  if (reminder.label) {
    parts.push(
      reminder.isPast
        ? `Reminder ${reminder.label}, already passed`
        : `Reminder ${reminder.label}`
    );
  }

  // Matches the row: an open task names its cadence, a completed one only
  // notes that it came from a repeat.
  if (!completed && isRecurring(task.recurrence)) {
    parts.push(`Repeats ${formatRecurrenceLabel(task.recurrence).toLowerCase()}`);
  } else if (completed && task.recurringTaskId) {
    parts.push('Repeating task');
  }

  if (listName && !completed) parts.push(`List: ${listName}`);

  if (task.priority === 'important') parts.push('Starred');
  else if (task.priority === 'must_do_today') parts.push('Pinned to today');

  return parts.join('. ');
}
