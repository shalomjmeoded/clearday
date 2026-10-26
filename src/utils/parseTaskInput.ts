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
  /**
   * When provided, a "#tag" is only consumed if it names one of these lists;
   * an unknown tag stays in the title instead of silently vanishing. Left
   * out, any tag is consumed (legacy behavior for callers without lists).
   */
  knownListNames?: string[];
  /** Injectable clock for tests. */
  now?: Date;
}

/**
 * A keyword is only consumed when it reads as a modifier rather than part of
 * the name. It qualifies as a modifier when it trails the phrase ("water
 * plants weekly", "call dentist monday") or when enough words remain to
 * still form a title ("review budget monthly with Sam"). A leading word on a
 * short phrase stays put, so "Daily standup" and "Monday standup" keep their
 * names. Applies to recurrence words and weekday names alike.
 */
const MIN_TITLE_WORDS_AFTER_KEYWORD = 2;

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

/**
 * Days per "in N <unit>" unit. Bare "m" is deliberately absent: it reads as
 * minutes to most people, and treating it as months silently deferred a task
 * by five months. Months need "mo"/"month"/"months".
 */
function inUnitDays(unit: string): number | undefined {
  if (unit === 'd' || unit === 'day' || unit === 'days') return 1;
  if (unit === 'w' || unit === 'week' || unit === 'weeks') return 7;
  if (unit === 'mo' || unit === 'month' || unit === 'months') return 30;
  return undefined;
}

/** Case-insensitive, with spaces in the list name optional ("#shoppinglist"). */
export function listNameMatchesHint(name: string, hint: string): boolean {
  const key = hint.toLowerCase();
  const lower = name.toLowerCase();
  return lower === key || lower.replace(/\s+/g, '') === key;
}

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
  let listHint: string | undefined;
  let recurrence: TaskRecurrence | undefined;

  const bangPrefix = text.match(/^(!+)\s*/);
  if (bangPrefix) {
    // "!!!" is at least as urgent as "!!" — extra marks never downgrade.
    priority = bangPrefix[1].length >= 2 ? 'must_do_today' : 'important';
    text = text.slice(bangPrefix[0].length).trim();
  }

  const tokens = text.length > 0 ? text.split(/\s+/) : [];
  const kept: string[] = [];
  let recurrenceCandidate:
    | { recurrence: TaskRecurrence; keptIndex: number }
    | undefined;
  let weekdayCandidate: { weekday: string; keptIndex: number } | undefined;
  const today = startOfDay(now);
  /** The calendar day named by an explicit day token, when one was given. */
  let dueDay: Date | undefined;
  /** Clock time named by a time token; anchored onto a day after the scan. */
  let pendingTime: { hours: number; minutes: number } | undefined;
  let tonight = false;

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const lower = token.toLowerCase();

    // Standalone priority marks work anywhere, not just as a leading prefix
    // ("buy milk !! today" used to keep the "!!" in the title).
    if (/^!{2,}$/.test(token) || lower === 'p1' || lower === 'p0') {
      priority = 'must_do_today';
      continue;
    }
    if (token === '!' || lower === 'p2' || lower === 'p!') {
      // A single mark raises a normal task but never downgrades a pin.
      if (priority === 'normal') priority = 'important';
      continue;
    }
    if (lower.startsWith('#') && lower.length > 1) {
      // Trailing punctuation belongs to the sentence, not the list name
      // ("buy milk #groceries, eggs").
      const hint = token.slice(1).replace(/[!,.;:?]+$/, '');
      if (
        hint.length > 0 &&
        (!options.knownListNames ||
          options.knownListNames.some((name) => listNameMatchesHint(name, hint)))
      ) {
        listHint = hint;
        continue;
      }
      // No such list — keep the text instead of losing it.
      kept.push(token);
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
      dueDay = today;
      continue;
    }
    if (lower === 'tonight') {
      // Resolved after the scan so an explicit time wins over the 8pm default
      // regardless of word order ("9pm tonight" vs "tonight 9pm").
      tonight = true;
      continue;
    }
    if (lower === 'tomorrow') {
      dueDay = startOfDay(addDays(now, 1));
      continue;
    }
    const inMatch = lower.match(/^in(\d+)(d|days?|w|weeks?|mo|months?)$/);
    if (inMatch) {
      const days = parseInt(inMatch[1], 10) * (inUnitDays(inMatch[2]) ?? 1);
      dueDay = startOfDay(addDays(now, days));
      continue;
    }
    // The spaced form: "in 3 days", "in 2 weeks". Only full unit words — a
    // bare "in 3 d" is more likely a title than a date.
    if (lower === 'in' && index + 2 < tokens.length) {
      const amount = tokens[index + 1].match(/^\d+$/);
      const unitDays = inUnitDays(tokens[index + 2].toLowerCase());
      if (amount && unitDays !== undefined && tokens[index + 2].length > 1) {
        dueDay = startOfDay(addDays(now, parseInt(amount[0], 10) * unitDays));
        index += 2;
        continue;
      }
    }
    if (WEEKDAYS[lower]) {
      if (index === tokens.length - 1) {
        dueDay = startOfDay(WEEKDAYS[lower](now));
        continue;
      }
      // Same rule as recurrence words: decide once the title is known, so
      // "Monday standup" keeps its name but "monday call the dentist" dates.
      weekdayCandidate = { weekday: lower, keptIndex: kept.length };
      kept.push(token);
      continue;
    }

    // "at" is part of the time phrase, not the title — but only when a valid
    // time actually follows ("lunch at noon-ish" keeps its "at").
    if (
      lower === 'at' &&
      index + 1 < tokens.length &&
      parseTimeToken(tokens[index + 1], today)
    ) {
      continue;
    }

    const time = parseTimeToken(token, today);
    if (time) {
      pendingTime = { hours: time.getHours(), minutes: time.getMinutes() };
      continue;
    }

    kept.push(token);
  }

  // Deferred keywords: consume when enough title survives without them, or
  // when the word ends the phrase once times and tags are set aside
  // ("standup friday 9am" — friday trails the name even though 9am follows).
  const pendingRemovals =
    (recurrenceCandidate ? 1 : 0) + (weekdayCandidate ? 1 : 0);
  const countOk =
    kept.length - pendingRemovals >= MIN_TITLE_WORDS_AFTER_KEYWORD;
  const trailsTitle = (keptIndex: number) =>
    kept.length >= 2 && keptIndex === kept.length - 1;
  const removals: number[] = [];
  if (weekdayCandidate && (countOk || trailsTitle(weekdayCandidate.keptIndex))) {
    dueDay = startOfDay(WEEKDAYS[weekdayCandidate.weekday](now));
    removals.push(weekdayCandidate.keptIndex);
  }
  if (
    recurrenceCandidate &&
    (countOk || trailsTitle(recurrenceCandidate.keptIndex))
  ) {
    recurrence = recurrenceCandidate.recurrence;
    removals.push(recurrenceCandidate.keptIndex);
  }
  removals
    .sort((a, b) => b - a)
    .forEach((keptIndex) => kept.splice(keptIndex, 1));

  // The reminder is anchored only now, once every day word has been seen, so
  // "call Bob 8am tomorrow" lands on tomorrow just like "tomorrow 8am".
  let dueDate: Date | undefined = dueDay;
  let reminderAt: Date | undefined;

  if (tonight && !dueDay) {
    // Past the chosen moment, "tonight" means tomorrow night — the same way
    // a bare passed time rolls forward.
    let evening = setMinutes(
      setHours(today, pendingTime?.hours ?? 20),
      pendingTime?.minutes ?? 0
    );
    if (evening.getTime() <= now.getTime()) evening = addDays(evening, 1);
    reminderAt = evening;
    dueDate = startOfDay(evening);
  } else if (tonight && dueDay) {
    reminderAt = setMinutes(
      setHours(dueDay, pendingTime?.hours ?? 20),
      pendingTime?.minutes ?? 0
    );
  } else if (pendingTime) {
    if (dueDay) {
      // An explicit day is respected as-is, even when already passed.
      reminderAt = setMinutes(
        setHours(dueDay, pendingTime.hours),
        pendingTime.minutes
      );
    } else {
      // A bare time that has already passed today means tomorrow
      // ("call Bob 8am" typed at 10am).
      let time = setMinutes(
        setHours(today, pendingTime.hours),
        pendingTime.minutes
      );
      if (time.getTime() <= now.getTime()) time = addDays(time, 1);
      reminderAt = time;
      dueDate = startOfDay(time);
    }
  }

  if (priority === 'must_do_today' && !dueDate) {
    dueDate = today;
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
