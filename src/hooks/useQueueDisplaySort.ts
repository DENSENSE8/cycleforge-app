'use client';

/** URL-backed `?sort=` (+ optional `?dir=`) for queue display order (Pending / Testing). */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useOptimisticUrlParams } from '@/hooks/useOptimisticUrlParam';
import { readLiveSearchParams } from '@/lib/routing/optimistic-url-param';
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

type QueueSortPair = {
  sort: QueueDisplaySort;
  dir: QueueDisplaySortDir | null;
};

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

  const urlSort = useMemo(
    () => parseQueueDisplaySort(searchParams.get('sort')),
    [searchParams],
  );

  const urlDir = useMemo(
    () => parseQueueDisplaySortDir(searchParams.get('dir'), urlSort),
    [searchParams, urlSort],
  );

  const replace = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = readLiveSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname || '/', { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const write = useCallback((params: URLSearchParams, next: QueueSortPair) => {
    applyQueueDisplaySortParam(params, next.sort, next.dir);
  }, []);

  const { value, paint } = useOptimisticUrlParams<QueueSortPair>({
    urlValues: { sort: urlSort, dir: urlDir },
    replace,
    write,
  });

  const commit = useCallback(
    (next: QueueSortPair) => {
      paint(next);
      replace((params) => write(params, next));
    },
    [paint, replace, write],
  );

  const setSort = useCallback(
    (next: QueueDisplaySort, nextDir?: QueueDisplaySortDir | null) => {
      // `carrier:Amazon` is the Order-column pin (`channel:Amazon`) — rewrite
      // on write so the URL and the comparator cannot disagree.
      const resolved = parseQueueDisplaySort(next);
      if (isQueueColumnSort(resolved)) {
        commit({
          sort: resolved,
          dir: nextDir ?? defaultDirForQueueSort(resolved),
        });
      } else {
        commit({ sort: resolved, dir: null });
      }
    },
    [commit],
  );

  const toggleColumnSort = useCallback(
    (column: QueueDisplaySortColumn) => {
      if (value.sort === column && value.dir) {
        commit({ sort: column, dir: flipQueueDisplaySortDir(value.dir) });
      } else {
        commit({ sort: column, dir: defaultDirForQueueSort(column) });
      }
    },
    [value.sort, value.dir, commit],
  );

  return { sort: value.sort, dir: value.dir, setSort, toggleColumnSort };
}
