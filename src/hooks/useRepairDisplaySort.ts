'use client';

/**
 * URL-backed `?sort=` (+ optional `?dir=`) for the repair queue display order —
 * the twin of {@link useQueueDisplaySort} (Pending / Testing). `newest`
 * (created_at DESC, the server default) omits the param; column sorts may carry
 * `dir`. The workbench sort dropdown and the grid header clicks both drive it.
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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

  const sort = useMemo(
    () => parseRepairDisplaySort(searchParams.get('sort')),
    [searchParams],
  );

  const dir = useMemo(
    () => parseRepairDisplaySortDir(searchParams.get('dir'), sort),
    [searchParams, sort],
  );

  const replaceParams = useCallback(
    (nextSort: RepairDisplaySort, nextDir?: RepairDisplaySortDir | null) => {
      const params = new URLSearchParams(searchParams.toString());
      applyRepairDisplaySortParam(params, nextSort, nextDir);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname || '/repair', { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setSort = useCallback(
    (next: RepairDisplaySort, nextDir?: RepairDisplaySortDir | null) => {
      if (isRepairColumnSort(next)) {
        replaceParams(next, nextDir ?? defaultDirForRepairDisplaySort(next));
      } else {
        replaceParams(next, null);
      }
    },
    [replaceParams],
  );

  const toggleColumnSort = useCallback(
    (column: RepairDisplaySortColumn) => {
      if (sort === column && dir) {
        replaceParams(column, flipRepairDisplaySortDir(dir));
      } else {
        replaceParams(column, defaultDirForRepairDisplaySort(column));
      }
    },
    [dir, replaceParams, sort],
  );

  return { sort, dir, setSort, toggleColumnSort };
}
