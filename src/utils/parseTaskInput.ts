import {
  addDays,
  nextFriday,
  nextMonday,
  nextSaturday,
  nextSunday,
  nextThursday,
  nextTuesday,
  nextWednesday,
  setHours,
  setMinutes,
  startOfDay,
} from 'date-fns';

import type { TaskPriority } from '@/types/task';

export interface ParsedTaskInput {
  title: string;
  priority: TaskPriority;
  dueDate?: string;
  reminderAt?: string;
}

const WEEKDAYS: Record<string, (date: Date) => Date> = {
  monday: nextMonday,
  tuesday: nextTuesday,
  wednesday: nextWednesday,
  thursday: nextThursday,
  friday: nextFriday,
  saturday: nextSaturday,
  sunday: nextSunday,
};

function parseTimeToken(
  token: string,
  baseDay: Date
): Date | undefined {
  const lower = token.toLowerCase();
  const match12 = lower.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (match12) {
    let hour = parseInt(match12[1], 10);
    const minute = match12[2] ? parseInt(match12[2], 10) : 0;
    const meridiem = match12[3];
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    return setMinutes(setHours(baseDay, hour), minute);
  }
  const match24 = lower.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const hour = parseInt(match24[1], 10);
    const minute = parseInt(match24[2], 10);
    return setMinutes(setHours(baseDay, hour), minute);
  }
  return undefined;
}

export function parseTaskInput(raw: string): ParsedTaskInput {
  let text = raw.trim();
  let priority: TaskPriority = 'normal';
  let dueDate: Date | undefined;
  let reminderAt: Date | undefined;

  if (text.startsWith('!!')) {
    priority = 'must_do_today';
    text = text.slice(2).trim();
  } else if (text.startsWith('!')) {
    priority = 'important';
    text = text.slice(1).trim();
  }

  const tokens = text.split(/\s+/);
  const kept: string[] = [];
  let baseDay = startOfDay(new Date());

  for (const token of tokens) {
    const lower = token.toLowerCase();

    if (lower === 'today') {
      baseDay = startOfDay(new Date());
      dueDate = baseDay;
      continue;
    }
    if (lower === 'tonight') {
      baseDay = startOfDay(new Date());
      dueDate = baseDay;
      reminderAt = setHours(setMinutes(baseDay, 0), 20);
      continue;
    }
    if (lower === 'tomorrow') {
      baseDay = startOfDay(addDays(new Date(), 1));
      dueDate = baseDay;
      continue;
    }
    const inMatch = lower.match(/^in(\d+)(d|days|w|weeks|m|months)$/);
    if (inMatch) {
      const n = parseInt(inMatch[1], 10);
      const unit = inMatch[2];
      let days = n;
      if (unit.startsWith('w')) days = n * 7;
      if (unit.startsWith('m')) days = n * 30;
      baseDay = startOfDay(addDays(new Date(), days));
      dueDate = baseDay;
      continue;
    }
    if (WEEKDAYS[lower]) {
      baseDay = startOfDay(WEEKDAYS[lower](new Date()));
      dueDate = baseDay;
      continue;
    }

    const time = parseTimeToken(token, baseDay);
    if (time) {
      reminderAt = time;
      if (!dueDate) dueDate = startOfDay(time);
      continue;
    }

    kept.push(token);
  }

  if (priority === 'must_do_today' && !dueDate) {
    dueDate = startOfDay(new Date());
  }

  return {
    title: kept.join(' ').trim() || raw.trim(),
    priority,
    dueDate: dueDate?.toISOString(),
    reminderAt: reminderAt?.toISOString(),
  };
}
