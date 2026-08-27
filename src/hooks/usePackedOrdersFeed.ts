'use client';

import { useDeferredValue } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { packedOrdersQuery } from '@/lib/queries/dashboard-queries';
import { parsePackedDateKey } from '@/lib/packed/packed-filters';
import { parseStaffParam } from '@/hooks/useStaffFilter';
import type { ShippedOrder } from '@/types/orders';

const EMPTY: ShippedOrder[] = [];

/** Same Packed query the sheet, KPI strip, and Band-1 export share. */
export function usePackedOrdersFeed() {
  const searchParams = useSearchParams();
  const searchQuery = String(searchParams.get('search') || '').trim();
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const staffId = parseStaffParam(searchParams.get('staff')) ?? undefined;
  const dateFrom = parsePackedDateKey(searchParams.get('dateFrom')) ?? undefined;
  const dateTo = parsePackedDateKey(searchParams.get('dateTo')) ?? undefined;

  const query = useQuery({
    ...packedOrdersQuery({
      searchQuery: deferredSearchQuery,
      staffId,
      dateFrom,
      dateTo,
    }),
    placeholderData: (prev, prevQuery) => {
      const prevKey = prevQuery?.queryKey?.[2] as {
        staffId?: number | null;
        dateFrom?: string | null;
        dateTo?: string | null;
      } | undefined;
      if ((prevKey?.staffId ?? null) !== (staffId ?? null)) return undefined;
      if ((prevKey?.dateFrom ?? null) !== (dateFrom ?? null)) return undefined;
      if ((prevKey?.dateTo ?? null) !== (dateTo ?? null)) return undefined;
      return prev;
    },
  });

  return {
    records: query.data ?? EMPTY,
    searchQuery,
    staffId,
    dateFrom,
    dateTo,
    query,
  };
}
