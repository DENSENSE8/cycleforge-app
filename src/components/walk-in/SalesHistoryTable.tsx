'use client';

/**
 * Sales mode table — Square walk-in charges. One spine (`/api/walk-in/sales`)
 * mapped via the `saleToTransaction` adapter; the Today/All tab is a pure
 * client-side day filter over the SAME fetch (no refetch on tab flip), so the
 * query key is tab-independent. Rendered through the shared boxed `WalkInFeedPane`.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { WalkInFeedPane } from '@/components/walk-in/WalkInFeedPane';
import { saleToTransaction, type SaleRow } from '@/lib/walk-in/transactions';
import { getCurrentPSTDateKey } from '@/utils/date';
import type { SalesTab } from '@/lib/walk-in/history-modes';

export function SalesHistoryTable({ tab }: { tab: SalesTab }) {
  const { data, isLoading, isError, refetch } = useQuery<SaleRow[]>({
    queryKey: ['walk-in-sales'],
    queryFn: async () => {
      const res = await fetch('/api/walk-in/sales?orderSource=walk_in_sale&limit=100', {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Failed to load sales');
      const json = (await res.json()) as { rows?: SaleRow[] };
      return json.rows ?? [];
    },
    staleTime: 60_000,
  });

  const allRows = useMemo(() => (data ?? []).map(saleToTransaction), [data]);
  const rows = useMemo(() => {
    if (tab === 'all') return allRows;
    const today = getCurrentPSTDateKey();
    return allRows.filter((row) => row.dateKey === today);
  }, [allRows, tab]);

  return (
    <WalkInFeedPane
      rows={rows}
      isLoading={isLoading}
      isError={isError}
      refetch={refetch}
      label={tab === 'today' ? 'Sales · Today' : 'Sales · All'}
      emptyMessage={tab === 'today' ? 'No sales yet today.' : 'No walk-in sales yet.'}
    />
  );
}
