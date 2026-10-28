import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { searchTasks, type TaskSearchOptions } from '@/features/tasks/taskQueries';
import { useTaskStore } from '@/store/taskStore';
import type { Task, TaskStatus } from '@/types/task';
import { useAnnounceOnChange } from '@/utils/accessibility';

/** Long enough to skip a keystroke burst, short enough to feel live. */
const SEARCH_DEBOUNCE_MS = 120;

const NO_RESULTS: Task[] = [];

export interface TaskSearchState {
  /** Matches for the current query; empty while the query is blank. */
  results: Task[];
  /** True between a change and the results that reflect it. */
  pending: boolean;
  /** True once `results` reflect the query as currently typed. */
  active: boolean;
}

/**
 * Debounced SQL search that stays current. Re-runs when the query changes
 * and whenever the task store refetches, so completing or deleting a row
 * from the results drops it from the list. Typing is debounced; a store
 * refresh with the same query re-runs at once so a removed row does not
 * linger. Responses that arrive out of order are discarded. `statuses`
 * should be a stable reference (module constant) or the search would run
 * on every render; `scope` may be an inline literal, its fields are read
 * individually.
 */
export function useTaskSearch(
  query: string,
  statuses: readonly TaskStatus[],
  scope: Omit<TaskSearchOptions, 'statuses' | 'limit'> = {}
): TaskSearchState {
  const { listId, dueFrom, activeOrder } = scope;
  const trimmed = query.trim();
  // Only a live search needs to follow store refreshes; an idle screen
  // should not re-render four times per refreshAll for a bar it never opened.
  const revision = useTaskStore((s) => (trimmed ? s.revision : 0));
  const [results, setResults] = useState<Task[]>(NO_RESULTS);
  const [pending, setPending] = useState(false);
  const [settledQuery, setSettledQuery] = useState('');
  const requestId = useRef(0);
  const lastRequested = useRef('');

  useEffect(() => {
    const id = ++requestId.current;
    if (!trimmed || Platform.OS === 'web') {
      lastRequested.current = '';
      setResults(NO_RESULTS);
      setPending(false);
      // No database on web: an empty, settled result reads as "No matches"
      // rather than a search that never finishes.
      setSettledQuery(trimmed);
      return;
    }
    const sameQuery = lastRequested.current === trimmed;
    lastRequested.current = trimmed;
    setPending(true);
    const run = () => {
      searchTasks(trimmed, { statuses, listId, dueFrom, activeOrder })
        .then((rows) => {
          if (id !== requestId.current) return;
          setResults(rows);
          setSettledQuery(trimmed);
          setPending(false);
        })
        .catch((error: unknown) => {
          console.warn('Task search failed', error);
          if (id !== requestId.current) return;
          setResults(NO_RESULTS);
          setSettledQuery(trimmed);
          setPending(false);
        });
    };
    const timer = setTimeout(run, sameQuery ? 0 : SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed, statuses, listId, dueFrom, activeOrder, revision]);

  const active = trimmed.length > 0 && settledQuery === trimmed;

  // The result list sits below the field, so a screen reader hears nothing
  // when it changes; say the count once results settle for the typed text.
  // The last count is held through the pending gap so a pause in typing
  // that lands on the same number is not announced again.
  const spoken = useRef<string | undefined>(undefined);
  if (active) {
    spoken.current =
      results.length === 0
        ? 'No matches'
        : `${results.length} ${results.length === 1 ? 'match' : 'matches'}`;
  } else if (!trimmed) {
    spoken.current = undefined;
  }
  useAnnounceOnChange(spoken.current);

  return { results, pending, active };
}
