'use client';

/**
 * URL-backed `?sort=` (+ optional `?dir=`) for the repair queue display order —
 * the twin of {@link useQueueDisplaySort} (Pending / Testing). `newest`
 * (created_at DESC, the server default) omits the param; column sorts may carry
 * `dir`. The workbench sort dropdown and the grid header clicks both drive it.
 *
 * Header clicks paint pending before App Router's soft-replace lands.
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useOptimisticUrlParams } from '@/hooks/useOptimisticUrlParam';
import { readLiveSearchParams } from '@/lib/routing/optimistic-url-param';
import {
  applyRepairDisplaySortParam,
  defaultDirForRepairDisplaySort,
  flipRepairDisplaySortDir,
  isRepairColumnSort,
  parseRepairDisplaySort,
  parseRepairDisplaySortDir,
  type RepairDisplaySort,
  type RepairDisplaySortColumn,
  type RepairDisplaySortDir,
} from '@/lib/repair/repair-display-sort';

type RepairSortPair = {
  sort: RepairDisplaySort;
  dir: RepairDisplaySortDir | null;
};

export function useRepairDisplaySort(): {
  sort: RepairDisplaySort;
  /** Null for composite modes; asc/desc for column sorts. */
  dir: RepairDisplaySortDir | null;
  setSort: (next: RepairDisplaySort, dir?: RepairDisplaySortDir | null) => void;
  /** Spreadsheet header click: same column flips dir; else activates with default. */
  toggleColumnSort: (column: RepairDisplaySortColumn) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlSort = useMemo(
    () => parseRepairDisplaySort(searchParams.get('sort')),
    [searchParams],
  );

  const urlDir = useMemo(
    () => parseRepairDisplaySortDir(searchParams.get('dir'), urlSort),
    [searchParams, urlSort],
  );

  const replace = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = readLiveSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname || '/repair', { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const write = useCallback((params: URLSearchParams, next: RepairSortPair) => {
    applyRepairDisplaySortParam(params, next.sort, next.dir);
  }, []);

  const { value, paint } = useOptimisticUrlParams<RepairSortPair>({
    urlValues: { sort: urlSort, dir: urlDir },
    replace,
    write,
  });

  const commit = useCallback(
    (next: RepairSortPair) => {
      paint(next);
      replace((params) => write(params, next));
    },
    [paint, replace, write],
  );

  const setSort = useCallback(
    (next: RepairDisplaySort, nextDir?: RepairDisplaySortDir | null) => {
      if (isRepairColumnSort(next)) {
        commit({
          sort: next,
          dir: nextDir ?? defaultDirForRepairDisplaySort(next),
        });
      } else {
        commit({ sort: next, dir: null });
      }
    },
    [commit],
  );

  const toggleColumnSort = useCallback(
    (column: RepairDisplaySortColumn) => {
      if (value.sort === column && value.dir) {
        commit({ sort: column, dir: flipRepairDisplaySortDir(value.dir) });
      } else {
        commit({ sort: column, dir: defaultDirForRepairDisplaySort(column) });
      }
    },
    [value.sort, value.dir, commit],
  );

  return { sort: value.sort, dir: value.dir, setSort, toggleColumnSort };
}
