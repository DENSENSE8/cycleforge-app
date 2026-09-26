'use client';

/**
 * Bins filter URL params + row filter helpers for Inventory › Locations › Bins.
 * Band 2 KPI + Band 3 triage consume these; the old chip-row UI was retired
 * when Bins remounted on the Receiving Sheets recipe.
 */

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type BinFilterStatus = 'all' | 'empty' | 'low' | 'over' | 'stale';

/**
 * Hook for URL-bound bin filter params. Reads ?status=, ?room=, ?q= and
 * returns a setter that updates a single key.
 */
export function useBinsFilterParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const status: BinFilterStatus = (() => {
    const raw = searchParams.get('status');
    if (raw === 'empty' || raw === 'low' || raw === 'over' || raw === 'stale') return raw;
    return 'all';
  })();
  const room = searchParams.get('room') ?? '';
  const q = searchParams.get('q') ?? '';

  const onParamChange = useCallback(
    (key: 'status' | 'room' | 'q', value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (!next.get('tab')) next.set('tab', 'bins');
      if (value) next.set(key, value);
      else next.delete(key);
      // Stay on the route the filter is mounted on (Locations path).
      router.replace(`${pathname}?${next.toString()}`);
    },
    [router, pathname, searchParams],
  );

  return { status, room, q, onParamChange };
}

/** Filter the table rows according to the active status chip. */
export function filterRowsByStatus<
  T extends {
    is_empty: boolean;
    has_low_stock: boolean;
    is_over_capacity: boolean;
    is_stale: boolean;
  },
>(rows: T[], status: BinFilterStatus): T[] {
  switch (status) {
    case 'all':
      return rows;
    case 'empty':
      return rows.filter((r) => r.is_empty);
    case 'low':
      return rows.filter((r) => r.has_low_stock);
    case 'over':
      return rows.filter((r) => r.is_over_capacity);
    case 'stale':
      return rows.filter((r) => r.is_stale);
  }
}
