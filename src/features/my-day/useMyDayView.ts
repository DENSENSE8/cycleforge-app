'use client';

/**
 * URL ⇄ state for the Today workbench — the picked lane, task, and Watch rail.
 *
 * Workbench law: durable view state lives in the URL, so a reload or a shared
 * link reproduces the exact view (`display/workbench.md`). Selection used to be
 * a local `useState`, which meant a refresh silently dropped the operator's row.
 *
 * Keys are declared by the `/` spec (`scope`, `task`, `q`, `filter`, `watch`).
 * URLs are CONSTRUCTED, never copied (isolation rule 1): every write re-states
 * the keys Today keeps — including the carried column-sort pair, which the grid
 * owns and a naive rebuild would silently drop.
 *
 * `?task=` and `?watch=1` share the detail-priority right rail — opening one
 * clears the other so only one occupant seats.
 */

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { buildRouteUrl } from '@/lib/routing/route-params';
import { routeParamsFor } from '@/lib/routing/registry';
import {
  GRID_COLUMN_DIR_PARAM,
  GRID_COLUMN_SORT_PARAM,
} from '@/lib/tables/grid-column-sort-params';
import {
  parseMyDayDueHorizon,
  parseMyDayLane,
  type MyDayDueHorizon,
  type MyDayLaneFilter,
} from '@/lib/my-day/my-day-tasks';

export interface MyDayViewState {
  lane: MyDayLaneFilter;
  taskId: string | null;
  /** Chrome search text (`?q=`) — a refinement of the rows on screen. */
  query: string;
  /** KPI due-horizon refine (`?filter=`), or null when the band is not filtering. */
  horizon: MyDayDueHorizon | null;
  /** Watch intake rail open (`?watch=1`). */
  watchOpen: boolean;
  /** Swap the lane. Changing scope drops the selection — the row may not be in it. */
  setLane: (next: MyDayLaneFilter) => void;
  setTaskId: (next: string | null) => void;
  setQuery: (next: string) => void;
  /** Toggle a KPI tile — picking the active horizon clears the refine. */
  toggleHorizon: (next: MyDayDueHorizon) => void;
  openWatch: () => void;
  closeWatch: () => void;
}

export function useMyDayView(): MyDayViewState {
  const router = useRouter();
  const searchParams = useSearchParams();

  const lane = parseMyDayLane(searchParams.get('scope'));
  const taskId = searchParams.get('task');
  const query = searchParams.get('q') ?? '';
  const horizon = parseMyDayDueHorizon(searchParams.get('filter'));
  const watchRaw = searchParams.get('watch');
  const watchOpen = watchRaw === '1' || watchRaw === 'true';

  const push = useCallback(
    (next: {
      scope?: MyDayLaneFilter | null;
      task?: string | null;
      q?: string | null;
      filter?: MyDayDueHorizon | null;
      watch?: boolean | null;
    }) => {
      const spec = routeParamsFor('/')!;
      const nextLane = next.scope === undefined ? lane : next.scope;
      const nextQuery = next.q === undefined ? query : next.q;
      const nextHorizon = next.filter === undefined ? horizon : next.filter;
      // Mutual exclusion: task inspector and Watch rail share one detail slot.
      let nextTask = next.task === undefined ? taskId : next.task;
      let nextWatch = next.watch === undefined ? watchOpen : Boolean(next.watch);
      if (next.watch === true) nextTask = null;
      if (next.task != null && next.task !== '' && next.watch === undefined) {
        nextWatch = false;
      }

      router.replace(
        buildRouteUrl(spec, {
          filter: nextHorizon,
          // `today` is the default mode and `all` is the default lane — both
          // drop out of the URL rather than being restated on every write.
          scope: nextLane === 'all' ? null : nextLane,
          task: nextTask,
          // Empty search drops out too, so a cleared field leaves a clean URL
          // (and `hasActiveFilters` on a saved view stops counting `q=`).
          q: nextQuery ? nextQuery : null,
          watch: nextWatch ? '1' : null,
          staff: searchParams.get('staff') ?? searchParams.get('staffId'),
          [GRID_COLUMN_SORT_PARAM]: searchParams.get(GRID_COLUMN_SORT_PARAM),
          [GRID_COLUMN_DIR_PARAM]: searchParams.get(GRID_COLUMN_DIR_PARAM),
        }),
        { scroll: false },
      );
    },
    [router, searchParams, lane, taskId, query, horizon, watchOpen],
  );

  const setLane = useCallback(
    (next: MyDayLaneFilter) => push({ scope: next === 'all' ? null : next, task: null }),
    [push],
  );

  const setTaskId = useCallback((next: string | null) => push({ task: next }), [push]);

  // Deliberately does NOT clear `?task=` the way `setLane` does. A lane change
  // is one deliberate click, but a search commits per debounced keystroke — so
  // clearing there would destroy the operator's selection while they were still
  // typing. The workspace instead resolves the selection against the VISIBLE
  // rows, so a filtered-out row closes the inspector while its `?task=` survives
  // in the URL and comes back when the query clears.
  const setQuery = useCallback((next: string) => push({ q: next }), [push]);

  // A KPI tile is a TOGGLE: clicking the lit one clears the refine, so the band
  // is its own escape hatch and the operator never has to hunt for "show all".
  const toggleHorizon = useCallback(
    (next: MyDayDueHorizon) => push({ filter: next === horizon ? null : next }),
    [push, horizon],
  );

  const openWatch = useCallback(() => push({ watch: true, task: null }), [push]);
  const closeWatch = useCallback(() => push({ watch: false }), [push]);

  return {
    lane,
    taskId,
    query,
    horizon,
    watchOpen,
    setLane,
    setTaskId,
    setQuery,
    toggleHorizon,
    openWatch,
    closeWatch,
  };
}
