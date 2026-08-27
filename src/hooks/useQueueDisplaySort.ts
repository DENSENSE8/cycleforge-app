'use client';

/**
 * URL-backed `?sort=` (+ optional `?dir=`) for queue display order
 * (Pending / Testing). Default `priority` omits the param; column sorts may
 * carry `dir` (omitted when that column’s default).
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  applyQueueDisplaySortParam,
  defaultDirForQueueSort,
  flipQueueDisplaySortDir,
  isQueueColumnSort,
  parseQueueDisplaySort,
  parseQueueDisplaySortDir,
  type QueueDisplaySort,
  type QueueDisplaySortColumn,
  type QueueDisplaySortDir,
} from '@/utils/queue-display-sort';

export function useQueueDisplaySort(): {
  sort: QueueDisplaySort;
  /** Null for composite modes; asc/desc for column sorts. */
  dir: QueueDisplaySortDir | null;
  setSort: (next: QueueDisplaySort, dir?: QueueDisplaySortDir | null) => void;
  /** Spreadsheet header click: same column flips dir; else activates with default. */
  toggleColumnSort: (column: QueueDisplaySortColumn) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sort = useMemo(
    () => parseQueueDisplaySort(searchParams.get('sort')),
    [searchParams],
  );

  const dir = useMemo(
    () => parseQueueDisplaySortDir(searchParams.get('dir'), sort),
    [searchParams, sort],
  );

  const replaceParams = useCallback(
    (nextSort: QueueDisplaySort, nextDir?: QueueDisplaySortDir | null) => {
      const params = new URLSearchParams(searchParams.toString());
      applyQueueDisplaySortParam(params, nextSort, nextDir);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname || '/', { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setSort = useCallback(
    (next: QueueDisplaySort, nextDir?: QueueDisplaySortDir | null) => {
      if (isQueueColumnSort(next)) {
        replaceParams(next, nextDir ?? defaultDirForQueueSort(next));
      } else {
        replaceParams(next, null);
      }
    },
    [replaceParams],
  );

  const toggleColumnSort = useCallback(
    (column: QueueDisplaySortColumn) => {
      if (sort === column && dir) {
        replaceParams(column, flipQueueDisplaySortDir(dir));
      } else {
        replaceParams(column, defaultDirForQueueSort(column));
      }
    },
    [dir, replaceParams, sort],
  );

  return { sort, dir, setSort, toggleColumnSort };
}
