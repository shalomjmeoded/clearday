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
import type { TaskRecurrence } from '@/types/recurrence';
import { toDueDateIso } from '@/utils/dates';

export interface ParsedTaskInput {
  title: string;
  priority: TaskPriority;
  dueDate?: string;
  reminderAt?: string;
  listHint?: string;
  recurrence?: TaskRecurrence;
}

export interface ParseTaskInputOptions {
  /**
   * When false, recurrence words ("daily", "weekly", …) stay in the title
   * instead of being consumed. Used for free users so "Daily standup" is
   * not silently turned into "standup".
   */
  allowRecurrence?: boolean;
  /** Injectable clock for tests. */
  now?: Date;
}

/**
 * A recurrence word is only consumed when it reads as a modifier rather than
 * part of the name. It qualifies as a modifier when it trails the phrase
 * ("water plants weekly") or when enough words remain to still form a title
 * ("review budget monthly with Sam"). A leading word on a short phrase stays
 * put, so "Daily standup" keeps its name.
 */
const MIN_TITLE_WORDS_AFTER_RECURRENCE = 2;

const RECURRENCE_KEYWORDS: Record<string, TaskRecurrence> = {
  daily: 'daily',
  everyday: 'daily',
  weekly: 'weekly',
  biweekly: 'biweekly',
  fortnightly: 'biweekly',
  monthly: 'monthly',
  yearly: 'yearly',
  annually: 'yearly',
};

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
    // "17pm" is redundant but unambiguous; "15am" and "25pm" are not times
    // and stay in the title rather than rolling into the wrong day.
    if (hour < 1 || hour > 23 || minute > 59) return undefined;
    if (meridiem === 'am' && hour > 12) return undefined;
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    return setMinutes(setHours(baseDay, hour), minute);
  }
  const match24 = lower.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const hour = parseInt(match24[1], 10);
    const minute = parseInt(match24[2], 10);
    // JS Date would roll "25:99" into the next day; an invalid clock time
    // is not a time at all and stays in the title.
    if (hour > 23 || minute > 59) return undefined;
    return setMinutes(setHours(baseDay, hour), minute);
  }
  return undefined;
}

export function parseTaskInput(
  raw: string,
  options: ParseTaskInputOptions = {}
): ParsedTaskInput {
  const allowRecurrence = options.allowRecurrence ?? true;
  const now = options.now ?? new Date();
  let text = raw.trim();
  let priority: TaskPriority = 'normal';
  let dueDate: Date | undefined;
  let reminderAt: Date | undefined;
  let listHint: string | undefined;
  let recurrence: TaskRecurrence | undefined;

  if (text.startsWith('!!')) {
    priority = 'must_do_today';
    text = text.slice(2).trim();
  } else if (text.startsWith('!')) {
    priority = 'important';
    text = text.slice(1).trim();
  }

  const tokens = text.split(/\s+/);
  const kept: string[] = [];
  let recurrenceCandidate:
    | { recurrence: TaskRecurrence; keptIndex: number }
    | undefined;
  let baseDay = startOfDay(now);
  let explicitDay = false;

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const lower = token.toLowerCase();

    // Standalone priority marks work anywhere, not just as a leading prefix
    // ("buy milk !! today" used to keep the "!!" in the title).
    if (token === '!!' || lower === 'p1' || lower === 'p0') {
      priority = 'must_do_today';
      continue;
    }
    if (token === '!' || lower === 'p2' || lower === 'p!') {
      priority = 'important';
      continue;
    }
    if (lower.startsWith('#') && lower.length > 1) {
      listHint = token.slice(1);
      continue;
    }
    if (allowRecurrence && RECURRENCE_KEYWORDS[lower]) {
      if (index === tokens.length - 1) {
        recurrence = RECURRENCE_KEYWORDS[lower];
        continue;
      }
      // Decide once the rest of the title is known.
      recurrenceCandidate = {
        recurrence: RECURRENCE_KEYWORDS[lower],
        keptIndex: kept.length,
      };
      kept.push(token);
      continue;
    }

    if (lower === 'today') {
      baseDay = startOfDay(now);
      dueDate = baseDay;
      explicitDay = true;
      continue;
    }
    if (lower === 'tonight') {
      // Past 8pm, "tonight" would ring immediately; treat it as tomorrow
      // night, the same way a bare passed time rolls forward.
      let evening = setHours(setMinutes(startOfDay(now), 0), 20);
      if (evening.getTime() <= now.getTime()) evening = addDays(evening, 1);
      baseDay = startOfDay(evening);
      dueDate = baseDay;
      explicitDay = true;
      reminderAt = evening;
      continue;
    }
    if (lower === 'tomorrow') {
      baseDay = startOfDay(addDays(now, 1));
      dueDate = baseDay;
      explicitDay = true;
      continue;
    }
    const inMatch = lower.match(/^in(\d+)(d|days|w|weeks|m|months)$/);
    if (inMatch) {
      const n = parseInt(inMatch[1], 10);
      const unit = inMatch[2];
      let days = n;
      if (unit.startsWith('w')) days = n * 7;
      if (unit.startsWith('m')) days = n * 30;
      baseDay = startOfDay(addDays(now, days));
      dueDate = baseDay;
      explicitDay = true;
      continue;
    }
    if (WEEKDAYS[lower]) {
      baseDay = startOfDay(WEEKDAYS[lower](now));
      dueDate = baseDay;
      explicitDay = true;
      continue;
    }

    // "at" is part of the time phrase, not the title — but only when a valid
    // time actually follows ("lunch at noon-ish" keeps its "at").
    if (
      lower === 'at' &&
      index + 1 < tokens.length &&
      parseTimeToken(tokens[index + 1], baseDay)
    ) {
      continue;
    }

    let time = parseTimeToken(token, baseDay);
    if (time) {
      // A bare time that has already passed today means tomorrow
      // ("call Bob 8am" typed at 10am). An explicit day is respected as-is.
      if (!explicitDay && time.getTime() <= now.getTime()) {
        time = addDays(time, 1);
      }
      reminderAt = time;
      if (!dueDate || !explicitDay) dueDate = startOfDay(time);
      continue;
    }

    kept.push(token);
  }

  if (
    recurrenceCandidate &&
    kept.length - 1 >= MIN_TITLE_WORDS_AFTER_RECURRENCE
  ) {
    kept.splice(recurrenceCandidate.keptIndex, 1);
    recurrence = recurrenceCandidate.recurrence;
  }

  if (priority === 'must_do_today' && !dueDate) {
    dueDate = startOfDay(now);
  }

  return {
    title: kept.join(' ').trim() || raw.trim(),
    priority,
    dueDate: dueDate ? toDueDateIso(dueDate) : undefined,
    reminderAt: reminderAt?.toISOString(),
    listHint,
    recurrence,
  };
}
