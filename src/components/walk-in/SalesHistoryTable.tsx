'use client';

/**
 * Sales mode table — Square walk-in charges as a PRODUCT_TABLES slot peer.
 *
 * Callers: `WalkInHistoryHub` / Sales board tabs. Existing file — replaces
 * `WalkInFeedPane` mount with `useWalkInSalesSpreadsheet` + `DataTable`.
 * Affected API: `/api/walk-in/sales`. Schemas: `SaleRow`.
 * User: "the completed visit appears as history on the Sales board slot table"
 * / "execute now"
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DataTable } from '@/components/tables/DataTable';
import { Button } from '@/design-system/primitives';
import { useWalkInSalesSpreadsheet } from '@/components/walk-in/grid/useWalkInSalesSpreadsheet';
import type { SaleRow } from '@/lib/walk-in/transactions';
import { getCurrentPSTDateKey, toPSTDateKey } from '@/utils/date';
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

  const rows = useMemo(() => {
    const all = data ?? [];
    if (tab === 'all') return all;
    const today = getCurrentPSTDateKey();
    return all.filter((row) => toPSTDateKey(row.created_at) === today);
  }, [data, tab]);

  const sheet = useWalkInSalesSpreadsheet({
    rows,
    loading: isLoading,
    emptyMessage: isError
      ? 'Could not load sales.'
      : tab === 'today'
        ? 'No sales yet today.'
        : 'No walk-in sales yet.',
    searchPlaceholder: tab === 'today' ? 'Search today’s sales…' : 'Search sales…',
  });

  return (
    <div
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      data-testid="walk-in-sales-history"
    >
      {isError ? (
        <Button
          type="button"
          variant="ghost"
          className="h-auto shrink-0 justify-start rounded-none border-b border-border-soft px-4 py-2 text-sm text-text-danger"
          onClick={() => void refetch()}
        >
          Failed to load — tap to retry
        </Button>
      ) : null}
      <DataTable {...sheet} totalCount={rows.length} />
    </div>
  );
}
