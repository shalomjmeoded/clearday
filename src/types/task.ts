import type { TaskRecurrence } from '@/types/recurrence';

export type TaskStatus = 'active' | 'completed' | 'archived';
export type TaskPriority = 'normal' | 'important' | 'must_do_today';

export interface Task {
  id: string;
  title: string;
  notes?: string;
  status: TaskStatus;
  priority: TaskPriority;
  color?: string;
  dueDate?: string;
  reminderAt?: string;
  recurrence: TaskRecurrence;
  /** Set on a logged completion of a repeating task: the id of the live task. */
  recurringTaskId?: string;
  listId?: string;
  sortOrder: number;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export type CreateTaskInput = Pick<Task, 'title'> &
  Partial<
    Pick<
      Task,
      | 'notes'
      | 'priority'
      | 'color'
      | 'dueDate'
      | 'reminderAt'
      | 'recurrence'
      | 'listId'
      | 'sortOrder'
    >
  >;

export type UpdateTaskInput = Partial<
  Omit<Task, 'id' | 'createdAt' | 'sortOrder'>
> & { sortOrder?: number };
