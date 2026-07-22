'use client';

/**
 * URL-backed `?sort=` for queue display order (Pending / Testing).
 * Default `priority` omits the param.
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  applyQueueDisplaySortParam,
  parseQueueDisplaySort,
  type QueueDisplaySort,
} from '@/utils/queue-display-sort';

export function useQueueDisplaySort(): {
  sort: QueueDisplaySort;
  setSort: (next: QueueDisplaySort) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sort = useMemo(
    () => parseQueueDisplaySort(searchParams.get('sort')),
    [searchParams],
  );

  const setSort = useCallback(
    (next: QueueDisplaySort) => {
      const params = new URLSearchParams(searchParams.toString());
      applyQueueDisplaySortParam(params, next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname || '/', { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return { sort, setSort };
}
