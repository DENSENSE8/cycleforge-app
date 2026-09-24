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

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DataTable } from '@/components/tables/DataTable';
import { Button } from '@/design-system/primitives';
import { useWalkInSalesSpreadsheet } from '@/components/walk-in/grid/useWalkInSalesSpreadsheet';
import type { SaleRow } from '@/lib/walk-in/transactions';
import { getCurrentPSTDateKey, toPSTDateKey } from '@/utils/date';
import type { SalesTab } from '@/lib/walk-in/history-modes';

export function SalesHistoryTable({ tab }: { tab: SalesTab }) {
  /*
   * The find text is SESSION-LOCAL and rides the FETCH KEY. It is not a URL
   * param (the Sales board's tabs own the URL here), and it is not a client
   * substring pass either: `/api/walk-in/sales` answers `?q=` over the whole
   * merged feed, and re-filtering that answer against the five painted facts
   * would drop a sale the server matched on its phone number or a line item
   * beyond the two the detail cell summarises.
   *
   * `SearchField` already debounces at 320ms, so the raw value is the key.
   */
  const [query, setQuery] = useState('');
  const q = query.trim();

  const { data, isLoading, isFetching, isError, refetch } = useQuery<SaleRow[]>({
    queryKey: ['walk-in-sales', q],
    queryFn: async () => {
      const params = new URLSearchParams({ orderSource: 'walk_in_sale' });
      // A searching read drops the page bound — the route opens to its ceiling
      // when `q` is present, so a `limit` here would only be ignored.
      if (q) params.set('q', q);
      else params.set('limit', '100');
      const res = await fetch(`/api/walk-in/sales?${params}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load sales');
      const json = (await res.json()) as { rows?: SaleRow[] };
      return json.rows ?? [];
    },
    placeholderData: (prev) => prev,
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
    searchValue: query,
    onSearchChange: setQuery,
    searchPending: isFetching,
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
