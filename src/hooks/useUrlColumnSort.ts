'use client';

/**
 * `useUrlColumnSort<K>` — the shared engine for URL-durable spreadsheet column
 * sort (**`?colsort=` + `?coldir=`** — the constants in
 * `@/lib/tables/grid-column-sort-params`, deliberately NOT `?sort=`/`?dir=`,
 * which the station routes already use for SERVER ordering).
 *
 * Workbench law (`.claude/rules/display/workbench.md`): durable view state
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
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  GRID_COLUMN_DIR_PARAM,
  GRID_COLUMN_SORT_PARAM,
} from '@/lib/tables/grid-column-sort-params';

type UrlColumnSortDir = 'asc' | 'desc';

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

  const sort = useMemo<K | null>(() => {
    const raw = searchParams.get(sortParam);
    return raw && isColumn(raw) ? (raw as K) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isColumn is a stable module fn
  }, [searchParams, sortParam]);

  const dir = useMemo<UrlColumnSortDir | null>(() => {
    if (!sort) return null;
    const raw = searchParams.get(dirParam);
    return raw === 'asc' || raw === 'desc' ? raw : defaultDir(sort);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaultDir is a stable module fn
  }, [searchParams, dirParam, sort]);

  const replaceParams = useCallback(
    (nextSort: K | null, nextDir: UrlColumnSortDir | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (!nextSort) {
        params.delete(sortParam);
        params.delete(dirParam);
      } else {
        params.set(sortParam, nextSort);
        // Omit the default direction so shared links stay clean and the
        // "pristine" URL is unambiguous.
        if (nextDir && nextDir !== defaultDir(nextSort)) params.set(dirParam, nextDir);
        else params.delete(dirParam);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname || '/', { scroll: false });
      // eslint-disable-next-line react-hooks/exhaustive-deps -- defaultDir is a stable module fn
    },
    [pathname, router, searchParams, sortParam, dirParam],
  );

  const setSort = useCallback(
    (key: K, nextDir?: UrlColumnSortDir) => replaceParams(key, nextDir ?? defaultDir(key)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaultDir is a stable module fn
    [replaceParams],
  );

  const toggleColumnSort = useCallback(
    (key: K) => {
      // asc ↔ desc only — never a third "remove sort" state. Mirrors
      // `enableSortingRemoval: false` in useGridSurface so the header click and
      // the TanStack state engine can never disagree about the cycle.
      if (sort === key && dir) replaceParams(key, dir === 'asc' ? 'desc' : 'asc');
      else replaceParams(key, defaultDir(key));
      // eslint-disable-next-line react-hooks/exhaustive-deps -- defaultDir is a stable module fn
    },
    [sort, dir, replaceParams],
  );

  const clear = useCallback(() => replaceParams(null, null), [replaceParams]);

  return { sort, dir, setSort, toggleColumnSort, clear };
}
