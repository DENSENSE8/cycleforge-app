'use client';

/**
 * `useUrlColumnSort<K>` — the shared engine for URL-durable spreadsheet column
 * sort (**`?colsort=` + `?coldir=`** — the constants in
 * `@/lib/tables/grid-column-sort-params`, deliberately NOT `?sort=`/`?dir=`,
 * which the station routes already use for SERVER ordering).
 *
 * Workbench law: durable view state
 * lives in the URL, so a reload or a shared link reproduces the exact view.
 * Station grids used to hold sort in `useState`, which meant a column sort
 * silently died on reload and could not be sent to a colleague.
 *
 * This exists because the house already had TWO byte-for-byte copies of the
 * same read → replace → toggle logic ({@link useQueueDisplaySort},
 * {@link useRepairDisplaySort}); Incoming and Receiving would have made four.
 * Per `AGENTS.md` (compose → grow the SoT → compound), the shared half is
 * extracted here and the surface-specific vocabularies stay in their own
 * modules. Surfaces with composite modes (Pending's `priority`/`newest`, Repair's
 * `newest`) keep their own wrapper — this engine covers the column-only case.
 *
 * `null` sort = "no column sort" — the surface's server/mode default order,
 * with the param absent from the URL entirely.
 *
 * Header clicks paint **pending** before App Router's soft-replace lands, so
 * the arrow and the row order update in the same tick as the click rather than
 * waiting on `useSearchParams`.
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useOptimisticUrlParams } from '@/hooks/useOptimisticUrlParam';
import { readLiveSearchParams } from '@/lib/routing/optimistic-url-param';
import {
  GRID_COLUMN_DIR_PARAM,
  GRID_COLUMN_SORT_PARAM,
} from '@/lib/tables/grid-column-sort-params';

type UrlColumnSortDir = 'asc' | 'desc';

type UrlColumnSortPair<K extends string> = {
  sort: K | null;
  dir: UrlColumnSortDir | null;
};

interface UrlColumnSortResult<K extends string> {
  /** Active column sort, or `null` for the surface's default order. */
  sort: K | null;
  dir: UrlColumnSortDir | null;
  /** Activate a column sort at an explicit or default direction. */
  setSort: (key: K, dir?: UrlColumnSortDir) => void;
  /** Header click: same column flips direction; a new column activates at its default. */
  toggleColumnSort: (key: K) => void;
  /** Drop back to the surface's default order (both params removed). */
  clear: () => void;
}

interface UrlColumnSortOptions<K extends string> {
  /** Is this raw string a sortable column key on this surface? */
  isColumn: (raw: string) => boolean;
  /** First-activation direction for a column (e.g. Date → desc). */
  defaultDir: (key: K) => UrlColumnSortDir;
  /** Param names — default to the collision-free column-sort pair. */
  sortParam?: string;
  dirParam?: string;
}

export function useUrlColumnSort<K extends string>({
  isColumn,
  defaultDir,
  sortParam = GRID_COLUMN_SORT_PARAM,
  dirParam = GRID_COLUMN_DIR_PARAM,
}: UrlColumnSortOptions<K>): UrlColumnSortResult<K> {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlSort = useMemo<K | null>(() => {
    const raw = searchParams.get(sortParam);
    return raw && isColumn(raw) ? (raw as K) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isColumn is a stable module fn
  }, [searchParams, sortParam]);

  const urlDir = useMemo<UrlColumnSortDir | null>(() => {
    if (!urlSort) return null;
    const raw = searchParams.get(dirParam);
    return raw === 'asc' || raw === 'desc' ? raw : defaultDir(urlSort);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaultDir is a stable module fn
  }, [searchParams, dirParam, urlSort]);

  const replace = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = readLiveSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname || '/', { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const write = useCallback(
    (params: URLSearchParams, next: UrlColumnSortPair<K>) => {
      if (!next.sort) {
        params.delete(sortParam);
        params.delete(dirParam);
        return;
      }
      params.set(sortParam, next.sort);
      // Omit the default direction so shared links stay clean and the
      // "pristine" URL is unambiguous.
      if (next.dir && next.dir !== defaultDir(next.sort)) params.set(dirParam, next.dir);
      else params.delete(dirParam);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaultDir is a stable module fn
    [sortParam, dirParam],
  );

  const { value, paint } = useOptimisticUrlParams<UrlColumnSortPair<K>>({
    urlValues: { sort: urlSort, dir: urlDir },
    replace,
    write,
  });

  const commit = useCallback(
    (next: UrlColumnSortPair<K>) => {
      // Paint first, then replace on this tick — `setValue`'s startTransition
      // can lose the router.write behind a click, so the header looks sorted
      // while the address bar (and a reload) still show the old order.
      paint(next);
      replace((params) => write(params, next));
    },
    [paint, replace, write],
  );

  const setSort = useCallback(
    (key: K, nextDir?: UrlColumnSortDir) =>
      commit({ sort: key, dir: nextDir ?? defaultDir(key) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaultDir is a stable module fn
    [commit],
  );

  const toggleColumnSort = useCallback(
    (key: K) => {
      // asc ↔ desc only — never a third "remove sort" state. Mirrors
      // `enableSortingRemoval: false` in useGridSurface so the header click and
      // the TanStack state engine can never disagree about the cycle.
      if (value.sort === key && value.dir) {
        commit({ sort: key, dir: value.dir === 'asc' ? 'desc' : 'asc' });
      } else {
        commit({ sort: key, dir: defaultDir(key) });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaultDir is a stable module fn
    [value.sort, value.dir, commit],
  );

  const clear = useCallback(
    () => commit({ sort: null, dir: null }),
    [commit],
  );

  return {
    sort: value.sort,
    dir: value.dir,
    setSort,
    toggleColumnSort,
    clear,
  };
}
