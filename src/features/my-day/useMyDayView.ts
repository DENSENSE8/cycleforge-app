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
 *
 * Paint-pending: compound `{ taskId, watchOpen }` via `useOptimisticUrlParams`
 * so the mutual-exclusion swap paints in the click commit.
 */

import { startTransition, useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOptimisticUrlParams } from '@/hooks/useOptimisticUrlParam';
import { readLiveSearchParams } from '@/lib/routing/optimistic-url-param';
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

type DetailSnap = { taskId: string | null; watchOpen: boolean };

function detailEquals(a: DetailSnap, b: DetailSnap): boolean {
  return a.taskId === b.taskId && a.watchOpen === b.watchOpen;
}

export interface MyDayViewState {
  lane: MyDayLaneFilter;
  taskId: string | null;
  /** Chrome search text — local refinement of the rows on screen. */
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
  const [query, setQueryState] = useState('');

  const lane = parseMyDayLane(searchParams.get('scope'));
  const urlTaskId = searchParams.get('task');
  const horizon = parseMyDayDueHorizon(searchParams.get('filter'));
  const watchRaw = searchParams.get('watch');
  const urlWatchOpen = watchRaw === '1' || watchRaw === 'true';

  const urlDetail = useMemo<DetailSnap>(
    () => ({ taskId: urlTaskId, watchOpen: urlWatchOpen }),
    [urlTaskId, urlWatchOpen],
  );

  const replaceDetail = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = readLiveSearchParams(searchParams.toString());
      mutate(params);
      const spec = routeParamsFor('/')!;
      router.replace(
        buildRouteUrl(spec, {
          filter: horizon,
          scope: lane === 'all' ? null : lane,
          task: params.get('task'),
          watch: params.get('watch'),
          staff: searchParams.get('staff') ?? searchParams.get('staffId'),
          [GRID_COLUMN_SORT_PARAM]: searchParams.get(GRID_COLUMN_SORT_PARAM),
          [GRID_COLUMN_DIR_PARAM]: searchParams.get(GRID_COLUMN_DIR_PARAM),
        }),
        { scroll: false },
      );
    },
    [router, searchParams, lane, horizon],
  );

  const writeDetail = useCallback((params: URLSearchParams, next: DetailSnap) => {
    if (next.taskId) params.set('task', next.taskId);
    else params.delete('task');
    if (next.watchOpen) params.set('watch', '1');
    else params.delete('watch');
  }, []);

  const {
    value: detail,
    setValue: setDetail,
    paint: paintDetail,
  } = useOptimisticUrlParams<DetailSnap>({
    urlValues: urlDetail,
    equals: detailEquals,
    replace: replaceDetail,
    write: writeDetail,
  });

  const taskId = detail.taskId;
  const watchOpen = detail.watchOpen;

  const push = useCallback(
    (next: {
      scope?: MyDayLaneFilter | null;
      task?: string | null;
      filter?: MyDayDueHorizon | null;
      watch?: boolean | null;
    }) => {
      const nextLane = next.scope === undefined ? lane : next.scope;

      const nextHorizon = next.filter === undefined ? horizon : next.filter;
      // Mutual exclusion: task inspector and Watch rail share one detail slot.
      let nextTask = next.task === undefined ? taskId : next.task;
      let nextWatch = next.watch === undefined ? watchOpen : Boolean(next.watch);
      if (next.watch === true) nextTask = null;
      if (next.task != null && next.task !== '' && next.watch === undefined) {
        nextWatch = false;
      }

      const snap: DetailSnap = { taskId: nextTask, watchOpen: nextWatch };
      const onlyDetail =
        next.scope === undefined &&
        next.filter === undefined;

      if (onlyDetail) {
        setDetail(snap);
        return;
      }

      // Multi-field construct: paint detail, then one replace for the full URL.
      paintDetail(snap);
      const spec = routeParamsFor('/')!;
      startTransition(() => {
        router.replace(
          buildRouteUrl(spec, {
            filter: nextHorizon,
            scope: nextLane === 'all' ? null : nextLane,
            task: nextTask,
            watch: nextWatch ? '1' : null,
            staff: searchParams.get('staff') ?? searchParams.get('staffId'),
            [GRID_COLUMN_SORT_PARAM]: searchParams.get(GRID_COLUMN_SORT_PARAM),
            [GRID_COLUMN_DIR_PARAM]: searchParams.get(GRID_COLUMN_DIR_PARAM),
          }),
          { scroll: false },
        );
      });
    },
    [
      router,
      searchParams,
      lane,
      taskId,
      horizon,
      watchOpen,
      setDetail,
      paintDetail,
    ],
  );

  const setLane = useCallback(
    (next: MyDayLaneFilter) => push({ scope: next === 'all' ? null : next, task: null }),
    [push],
  );

  const setTaskId = useCallback((next: string | null) => push({ task: next }), [push]);

  // Search is local and never participates in URL writes. This keeps every
  // keystroke in the mounted table instead of causing a route refresh.
  const setQuery = useCallback((next: string) => setQueryState(next), []);

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
